const request = require('supertest');
const express = require('express');
const partyRouter = require('../domains/party/party.router');
const partyService = require('../domains/party/party.service');

// 1. 외부 의존성인 auth.middleware와 party.service를 모킹합니다.
jest.mock('../middlewares/auth.middleware', () => ({
  checkLogin: (req, res, next) => {
    req.user = { userId: 1, username: 'testuser', role: 'USER' };
    next();
  },
}));

jest.mock('../domains/party/party.service');

describe('Party API 통합 테스트 (Supertest - Mocking 방식)', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/party', partyRouter);

    // 🌟 에러 핸들러 미들웨어 주입 (catch 블록 전파 확인용)
    app.use((err, req, res, next) => {
      const status = err.status || 500;
      res.status(status).json({ success: false, message: err.message });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* ==============================================
     1. GET /api/party/meta
     ============================================== */
  describe('GET /api/party/meta', () => {
    it('성공 시 200 상태코드와 메타 데이터를 반환해야 한다', async () => {
      const mockMeta = [{ type_difficulty_id: 1, party_type_name: '하드던전', max_members: 4 }];
      partyService.getPartyMeta.mockResolvedValue(mockMeta);

      const response = await request(app).get('/api/party/meta');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockMeta });
    });

    it('🔥 에러 발생 시 catch 블록이 연동되어 500 에러 응답을 반환해야 한다', async () => {
      partyService.getPartyMeta.mockRejectedValue(new Error('DB 연결 실패'));
      
      const response = await request(app).get('/api/party/meta');
      
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  /* ==============================================
     2. GET /api/party
     ============================================== */
  describe('GET /api/party', () => {
    it('성공 시 200 상태코드와 파티 목록 어레이를 반환해야 한다', async () => {
      const mockParties = [{ id: 1, title: '파티구함', members: [] }];
      partyService.getActiveParties.mockResolvedValue(mockParties);

      const response = await request(app).get('/api/party');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockParties });
    });

    it('🔥 조회 에러 발생 시 catch 블록이 연동되어야 한다', async () => {
      partyService.getActiveParties.mockRejectedValue(new Error('조회 실패'));
      const response = await request(app).get('/api/party');
      expect(response.status).toBe(500);
    });
  });

  /* ==============================================
     3. POST /api/party (파티 생성)
     ============================================== */
  describe('POST /api/party', () => {
    it('파티 정보 정상 바디 입력 시 201 상태코드와 생성 내역을 응답해야 한다', async () => {
      const resultMock = { partyId: 10, title: '새로운파티', status: 'RECRUITING' };
      partyService.createParty.mockResolvedValue(resultMock);

      const response = await request(app)
        .post('/api/party')
        .send({ typeDifficultyId: 1, title: '새로운파티', characterId: 5 });

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual(resultMock);
    });

    it('필수 데이터인 파티 타이틀이나 캐릭터 식별값이 누락되면 400을 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/party')
        .send({ typeDifficultyId: 1 }); // title, characterId 누락

      expect(response.status).toBe(400);
    });

    it('🔥 서비스단 보완 반영: 제목이 빈 공백문자열일 때 서비스에서 발생한 400 에러를 전파해야 한다', async () => {
      const err = new Error('파티 제목을 정확히 입력해 주세요.');
      err.status = 400;
      partyService.createParty.mockRejectedValue(err);

      const response = await request(app)
        .post('/api/party')
        .send({ typeDifficultyId: 1, title: '   ', characterId: 5 });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(err.message);
    });

    it('🔥 캐릭터 소유권 부재 등으로 서비스에서 400 에러를 던질 때 올바르게 전파되어야 한다', async () => {
      const err = new Error('선택한 캐릭터 정보가 올바르지 않거나 소유권이 없습니다.');
      err.status = 400;
      partyService.createParty.mockRejectedValue(err);

      const response = await request(app)
        .post('/api/party')
        .send({ typeDifficultyId: 1, title: '실패방', characterId: 999 });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(err.message);
    });
  });

  /* ==============================================
     4. POST /api/party/:partyId/start (파티 출발)
     ============================================== */
  describe('POST /api/party/:partyId/start', () => {
    it('파티 출발 조건 부합 시 200 상태코드를 반환해야 한다', async () => {
      partyService.startParty.mockResolvedValue({ partyId: 1, status: 'STARTED' });

      const response = await request(app).post('/api/party/1/start');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('STARTED');
    });

    it('🔥 파티장 권한 오류(403) 발생 시 올바르게 응답해야 한다', async () => {
      const err = new Error('파티장만 파티를 출발시킬 수 있습니다.');
      err.status = 403;
      partyService.startParty.mockRejectedValue(err);

      const response = await request(app).post('/api/party/1/start');
      expect(response.status).toBe(403);
    });

    it('🔥 인원 부족 등 서비스 레이어 예외(400) 발생 시 400을 반환해야 한다', async () => {
      const err = new Error('파티장을 제외한 파티원이 최소 1명 이상 존재해야 출발할 수 있습니다.');
      err.status = 400;
      partyService.startParty.mockRejectedValue(err);

      const response = await request(app).post('/api/party/1/start');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(err.message);
    });
  });

  /* ==============================================
     5. POST /api/party/:partyId/back (출발 취소)
     ============================================== */
  describe('POST /api/party/:partyId/back', () => {
    it('출발 대기 복구 정상 연동 시 200 상태코드를 반환해야 한다', async () => {
      partyService.backParty.mockResolvedValue({ partyId: 1, status: 'RECRUITING' });

      const response = await request(app).post('/api/party/1/back');

      expect(response.status).toBe(200);
    });

    it('🔥 권한 없는 유저가 취소 요청 시 403 에러를 반환해야 한다', async () => {
      const err = new Error('파티장만 출발 취소를 할 수 있습니다.');
      err.status = 403;
      partyService.backParty.mockRejectedValue(err);

      const response = await request(app).post('/api/party/1/back');

      expect(response.status).toBe(403);
    });

    it('🔥 현재 출발 상태가 아닐 때(400)의 에러 핸들링을 검증해야 한다', async () => {
      const err = new Error('현재 출발 상태인 파티만 대기 상태로 변경할 수 있습니다.');
      err.status = 400;
      partyService.backParty.mockRejectedValue(err);

      const response = await request(app).post('/api/party/1/back');
      expect(response.status).toBe(400);
    });
  });

  /* ==============================================
     6. POST /api/party/:partyId/join (파티 참가)
     ============================================== */
  describe('POST /api/party/:partyId/join', () => {
    it('정상 가입 트랜잭션 성공 시 200 상태코드를 응답해야 한다', async () => {
      partyService.joinParty.mockResolvedValue({ partyId: 1, userId: 1, characterId: 3 });

      const response = await request(app)
        .post('/api/party/1/join')
        .send({ characterId: 3 });

      expect(response.status).toBe(200);
    });

    it('참가할 캐릭터 고유 ID 정보가 바디에 누락된 경우 400을 리턴해야 한다', async () => {
      const response = await request(app)
        .post('/api/party/1/join')
        .send({});

      expect(response.status).toBe(400);
    });

    it('🔥 모집 중이 아님 / 정원 초과 등 서비스 예외 발생 시 상태코드가 연동되어야 한다', async () => {
      const err = new Error('파티 정원이 가득 찼습니다.');
      err.status = 400;
      partyService.joinParty.mockRejectedValue(err);

      const response = await request(app).post('/api/party/1/join').send({ characterId: 3 });
      expect(response.status).toBe(400);
    });
  });

  /* ==============================================
     7. DELETE /api/party/:partyId/leave (파티 탈퇴)
     ============================================== */
  describe('DELETE /api/party/:partyId/leave', () => {
    it('정상적인 파티 탈퇴 요청 처리 시 200 코드를 내뱉어야 한다', async () => {
      partyService.leaveParty.mockResolvedValue({ partyId: 1, leftUserId: 1 });

      const response = await request(app).delete('/api/party/1/leave');

      expect(response.status).toBe(200);
    });

    it('🔥 파티장이 탈퇴 시도 시 발생하는 400 예외를 핸들링해야 한다', async () => {
      const err = new Error('파티장은 파티를 나갈 수 없습니다.');
      err.status = 400;
      partyService.leaveParty.mockRejectedValue(err);

      const response = await request(app).delete('/api/party/1/leave');
      expect(response.status).toBe(400);
    });
  });

  /* ==============================================
     8. DELETE /api/party/:partyId/kick (파티원 추방)
     ============================================== */
  describe('DELETE /api/party/:partyId/kick', () => {
    it('파티원의 고유 유저 ID 전달 시 성공 200을 마크해야 한다', async () => {
      partyService.kickMember.mockResolvedValue({ partyId: 1, kickedUserId: 2 });

      const response = await request(app)
        .delete('/api/party/1/kick')
        .send({ targetUserId: 2 });

      expect(response.status).toBe(200);
    });

    it('추방 대상 유저 식별 데이터(targetUserId)가 누락되면 400을 마크한다', async () => {
      const response = await request(app)
        .delete('/api/party/1/kick')
        .send({});

      expect(response.status).toBe(400);
    });

    it('🔥 파티장이 아닌 유저가 추방을 시도할 때 403 에러를 검증한다', async () => {
      const err = new Error('파티장만 파티원을 추방할 수 있습니다.');
      err.status = 403;
      partyService.kickMember.mockRejectedValue(err);

      const response = await request(app).delete('/api/party/1/kick').send({ targetUserId: 2 });
      expect(response.status).toBe(403);
    });
  });

  /* ==============================================
     9. DELETE /api/party/:partyId (파티 취소/삭제)
     ============================================== */
  describe('DELETE /api/party/:partyId', () => {
    it('파티장 조건 충족 및 상태 가용 범위 시 EXPIRED 변환 처리 200 상태코드를 리턴한다', async () => {
      partyService.deleteParty.mockResolvedValue({ partyId: 1, status: 'EXPIRED' });

      const response = await request(app).delete('/api/party/1');

      expect(response.status).toBe(200);
    });

    it('🔥 이미 출발했거나 만료된 파티 삭제 시도(400) 처리를 검증한다', async () => {
      const err = new Error('이미 출발했거나 만료된 파티는 상태를 변경할 수 없습니다.');
      err.status = 400;
      partyService.deleteParty.mockRejectedValue(err);

      const response = await request(app).delete('/api/party/1');
      expect(response.status).toBe(400);
    });

    it('🔥 존재하지 않는 파티 삭제 시 404 예외 처리를 검증한다', async () => {
      const err = new Error('해당 파티를 찾을 수 없습니다.');
      err.status = 404;
      partyService.deleteParty.mockRejectedValue(err);

      const response = await request(app).delete('/api/party/999');
      expect(response.status).toBe(404);
    });
  });

  /* ==============================================
     10. PATCH /api/party/:partyId/title (제목 변경)
     ============================================== */
  describe('PATCH /api/party/:partyId/title', () => {
    it('정상적인 타이틀 문자열 전달 시 변경 성공 200을 리턴한다', async () => {
      partyService.changePartyTitle.mockResolvedValue({ partyId: 1, updatedTitle: '테스트용수정제목' });

      const response = await request(app)
        .patch('/api/party/1/title')
        .send({ title: '테스트용수정제목' });

      expect(response.status).toBe(200);
    });

    it('🔥 빈 제목 공백을 입력으로 보냈을 때 서비스 단의 400 에러 모킹을 통해 검증한다', async () => {
      // 🌟 의도적인 가짜 에러 주입을 통해 예외 블록 100% 처리 가능하도록 유도
      const err = new Error('변경할 파티 제목을 입력해 주세요.');
      err.status = 400;
      partyService.changePartyTitle.mockRejectedValue(err);

      const response = await request(app)
        .patch('/api/party/1/title')
        .send({ title: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(err.message);
    });
  });

  /* ==============================================
     11. POST /api/party/:partyId/promote (파티 홍보)
     ============================================== */
  describe('POST /api/party/:partyId/promote', () => {
    it('쿨타임 미보류 가용 상태 시 홍보 전송 완료 200 상태코드를 반환한다', async () => {
      partyService.promoteParty.mockResolvedValue({ partyId: 1, msg: '성공' });

      const response = await request(app).post('/api/party/1/promote');

      expect(response.status).toBe(200);
    });

    it('만약 서비스단에서 쿨타임(429 Too Many Requests) 예외를 발생시키면 전파되어 처리되어야 한다', async () => {
      const coolDownError = new Error('아직 홍보 쿨타임 중입니다. (10분 남음)');
      coolDownError.status = 429;
      partyService.promoteParty.mockRejectedValue(coolDownError);

      const response = await request(app).post('/api/party/1/promote');

      expect(response.status).toBe(429);
      expect(response.body.message).toBe(coolDownError.message);
    });
  });
});