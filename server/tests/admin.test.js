const request = require('supertest');
const express = require('express');

// 라우터 및 서비스/리포지토리 레이어 가져오기
const adminRouter = require('../domains/admin/admin.router');
const adminService = require('../domains/admin/admin.service');
const partyService = require('../domains/party/party.service');
const partyRepository = require('../domains/party/party.repository');
const userRepository = require('../domains/user/user.repository');
const shopRepository = require('../domains/shop/shop.repository');
const db = require('../config/db');

// ==========================================
// 1. 공통 인증 미들웨어 모킹 (ADMIN 권한 통과)
// ==========================================
jest.mock('../middlewares/auth.middleware', () => ({
    checkLogin: (req, res, next) => {
        req.user = { id: 999, username: 'admin_master', role: 'ADMIN' };
        next();
    },
    checkAdmin: (req, res, next) => {
        next();
    }
}));

// ==========================================
// 2. 내부 의존성 레이어 전체 모킹 풀 구성
// ==========================================
jest.mock('../domains/admin/admin.service');
jest.mock('../domains/party/party.service');
jest.mock('../domains/party/party.repository');
jest.mock('../domains/user/user.repository');
jest.mock('../domains/shop/shop.repository');
jest.mock('../config/db');

describe('🎮 Admin 도메인 API 라우터 및 컨트롤러 계층 테스트', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/admin', adminRouter); // 단수형 /party 엔드포인트 바인딩 확인
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/admin/users (유저 생성 및 복구)', () => {
        it('성공 시 201 코드와 생성된 유저 데이터를 반환해야 한다', async () => {
            const mockUser = { userId: 10, username: 'tester', status: 'ACTIVE' };
            adminService.createUser.mockResolvedValue(mockUser);

            const res = await request(app)
                .post('/api/admin/users')
                .send({ username: 'tester' });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ success: true, data: mockUser });
        });

        it('username이 공백이거나 누락되면 400 에러를 뱉어야 한다', async () => {
            const res = await request(app)
                .post('/api/admin/users')
                .send({ username: '   ' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('입력해 주세요.');
        });
    });

    describe('DELETE /api/admin/party/:partyId (단수형 파티 강제 삭제)', () => {
        it('성공 시 어드민 전용 서비스로 위임되어 200 코드를 반환해야 한다', async () => {
            const mockOutput = { message: '강제 종료 완료', data: { partyId: 5, status: 'EXPIRED' } };
            adminService.forceDeleteParty.mockResolvedValue(mockOutput);

            const res = await request(app).delete('/api/admin/party/5');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, message: '강제 종료 완료', data: { partyId: 5, status: 'EXPIRED' } });
            expect(adminService.forceDeleteParty).toHaveBeenCalledWith(5);
        });
    });

    describe('PATCH /api/admin/users/:userId/username (유저네임 변경)', () => {
        it('username 변경 성공 시 200 코드를 반환해야 한다', async () => {
            const mockOutput = { userId: 1, updatedUsername: 'newname' };
            adminService.changeUsername.mockResolvedValue(mockOutput);

            const res = await request(app)
                .patch('/api/admin/users/1/username')
                .send({ username: 'newname' });

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(mockOutput);
        });
    });

    describe('🛠️ Admin 도메인 - 파티 마스터 메타데이터 CRUD 테스트', () => {
        describe('POST /api/admin/meta-mappings (매핑 등록)', () => {
            it('중복된 조합 등록 시 400 에러를 반환해야 한다', async () => {
                // 서비스 레이어가 가짜로 모킹되어 있으므로, 
                // 컨트롤러가 에러 핸들링을 잘하는지 보려면 status를 명시한 에러를 주입해야 합니다.
                const dbError = new Error('이미 존재하는 파티 종류와 난이도 조합입니다.');
                dbError.status = 400; // 🌟 status 추가
                adminService.addTypeDifficultyMapping.mockRejectedValue(dbError);

                const res = await request(app)
                    .post('/api/admin/meta-mappings')
                    .send({ partyTypeId: 1, difficultyId: 2, baseScore: 100 });

                expect(res.status).toBe(400);
                expect(res.body.message).toContain('이미 존재하는');
            });
        });

        describe('DELETE /api/admin/party-types/:id (타입 마스터 삭제)', () => {
            it('외래키 무결성 제약조건 위배 시 안전하게 400 에러로 핸들링되어야 한다', async () => {
                const fkError = new Error('해당 타입을 참조하고 있는 매핑 데이터가 존재하여 삭제할 수 없습니다.');
                fkError.status = 400; // 🌟 status 추가
                adminService.removePartyType.mockRejectedValue(fkError);

                const res = await request(app).delete('/api/admin/party-types/1');

                expect(res.status).toBe(400);
                expect(res.body.message).toContain('참조하고 있는 매핑 데이터가 존재');
            });
        });
    });
});


describe('⚡ Party Service - forceDeletePartyByAdmin 핵심 단위 비즈니스 로직 테스트', () => {
    const originalPartyService = jest.requireActual('../domains/party/party.service');

    let mockConnection;

    beforeEach(() => {
        // 트랜잭션 Mock 커넥션 풀 기본 정의
        mockConnection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        db.getConnection.mockResolvedValue(mockConnection);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ----------------------------------------------------
    // 예외 분기 1: 데이터 없음 검증
    // ----------------------------------------------------
    it('조회된 파티 정보가 없을 경우 404 에러를 발생시켜야 한다', async () => {
        partyRepository.findById.mockResolvedValue(null);

        await expect(originalPartyService.forceDeletePartyByAdmin(999))
            .rejects.toThrow('해당 파티를 찾을 수 없습니다.');
    });

    // ----------------------------------------------------
    // 예외 분기 2: 상태값 검증 (경경계값 체크)
    // ----------------------------------------------------
    it('이미 EXPIRED 상태인 파티를 삭제하려고 하면 400 에러를 던져야 한다', async () => {
        partyRepository.findById.mockResolvedValue({ id: 10, status: 'EXPIRED' });

        await expect(originalPartyService.forceDeletePartyByAdmin(10))
            .rejects.toThrow('이미 만료되었거나 삭제 처리된 파티입니다.');
    });

    // ----------------------------------------------------
    // 정상 흐름 분기 3: RECRUITING / COMPLETED (일반 대기) 상태 분기
    // ----------------------------------------------------
    it('RECRUITING 상태의 파티는 트랜잭션 없이 단건 상태 업데이트 후 반환되어야 한다', async () => {
        partyRepository.findById.mockResolvedValue({ id: 12, status: 'RECRUITING' });
        partyRepository.updateStatus.mockResolvedValue();

        const result = await originalPartyService.forceDeletePartyByAdmin(12);

        expect(partyRepository.updateStatus).toHaveBeenCalledWith(12, 'EXPIRED');
        expect(db.getConnection).not.toHaveBeenCalled(); // 대기 파티는 무거운 트랜잭션 미진행 검증
        expect(result.data.pointDistributed).toBe(false);
    });

    // ----------------------------------------------------
    // 정상 흐름 분기 4: STARTED (진행 중) 상태 분기 - 트랜잭션 정합성 검증
    // ----------------------------------------------------
    it('STARTED 상태의 파티 삭제 시 트랜잭션을 시작하고, 전용 커넥션 메서드로 점수 적립을 안전하게 마쳐야 한다', async () => {
        // Given
        partyRepository.findById.mockResolvedValue({ id: 77, status: 'STARTED', party_score: 250 });
        partyRepository.findMembersByPartyId.mockResolvedValue([
            { user_id: 101 },
            { user_id: 102 }
        ]);

        // When
        const result = await originalPartyService.forceDeletePartyByAdmin(77);

        // Then
        expect(db.getConnection).toHaveBeenCalled();
        expect(mockConnection.beginTransaction).toHaveBeenCalled();

        // 🛠️ 중요 포인트: 새로 보완된 WithConnection 전용 메서드와 커넥션 인자 매핑 체킹
        expect(partyRepository.updateStatusWithConnection).toHaveBeenCalledWith(mockConnection, 77, 'EXPIRED');
        expect(partyRepository.addScoreToMainCharacterWithConnection).toHaveBeenCalledWith(mockConnection, 101, 250);
        expect(partyRepository.addScoreToMainCharacterWithConnection).toHaveBeenCalledWith(mockConnection, 102, 250);

        expect(mockConnection.commit).toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
        expect(result.data.pointDistributed).toBe(true);
    });

    // ----------------------------------------------------
    // 예외 분기 5: 트랜잭션 도중 실패 케이스 원자성(Rollback) 검증
    // ----------------------------------------------------
    it('STARTED 파티 처리 도중 특정 유저 점수 적립 오류 발생 시 전체 작업을 Rollback 처리해야 한다', async () => {
        // Given
        partyRepository.findById.mockResolvedValue({ id: 88, status: 'STARTED', party_score: 500 });
        partyRepository.findMembersByPartyId.mockResolvedValue([{ user_id: 201 }]);

        // 상태 업데이트는 성공했으나, 루프 내부 작업 중 에러 유도
        partyRepository.updateStatusWithConnection.mockResolvedValue();
        partyRepository.addScoreToMainCharacterWithConnection.mockRejectedValue(new Error('Deadlock 또는 커넥션 끊김'));

        // When & Then
        await expect(originalPartyService.forceDeletePartyByAdmin(88))
            .rejects.toThrow('출발된 파티 강제 종료 중 오류가 발생하여 롤백되었습니다');

        expect(mockConnection.rollback).toHaveBeenCalled(); // 롤백 성공 여부 체크
        expect(mockConnection.release).toHaveBeenCalled();  // 자원 반납 여부 체크
    });
});