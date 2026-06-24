const partyRepository = require('./party.repository');
const userCharacterRepository = require('../user/user.repository');
const shopRepository = require('../shop/shop.repository');
const db = require('../../config/db');

// 메모리 내 타이머 관리 풀 구조
const partyTimers = new Map();

const getPartyMeta = async () => {
    return await partyRepository.findPartyMeta();
};

const getActiveParties = async () => {
    const rawRows = await partyRepository.findAllActiveParties();

    const partyMap = new Map();

    for (const row of rawRows) {
        if (!partyMap.has(row.party_id)) {
            partyMap.set(row.party_id, {
                id: row.party_id,
                creatorId: row.creator_id,
                title: row.title,
                status: row.status,
                partyScore: row.party_score,
                createdAt: row.created_at,
                members: []
            });
        }

        if (row.member_user_id) {
            // 🌟 결합 포인트: 멤버별 장착 아이템 목록 비동기 조회
            const equippedItems = await shopRepository.findEquippedItemsByUserId(row.member_user_id);

            partyMap.get(row.party_id).members.push({
                userId: row.member_user_id,
                characterId: row.member_character_id,
                nickname: row.character_nickname || '',
                power: row.character_power ? Number(row.character_power) : 0,
                // 🌟 응답 객체에 유저별 착용 중인 아이템 배열 주입
                decorations: equippedItems // 예: [{ name: 'dragon-slayer', itemType: 'TITLE' }]
            });
        }
    }

    return Array.from(partyMap.values());
};

const createParty = async (userId, typeDifficultyId, title, characterId) => {
    if (!title || title.trim() === '') {
        const err = new Error('파티 제목을 정확히 입력해 주세요.');
        err.status = 400;
        throw err;
    }
    // 1. 메타 데이터 검증
    const meta = await partyRepository.findMetaById(typeDifficultyId);
    if (!meta) {
        const err = new Error('올바르지 않은 파티 종류 또는 난이도 정보입니다.');
        err.status = 400;
        throw err;
    }

    // 2. 캐릭터 소유권 검증 (제공된 파일 메서드 참고)
    const character = await userCharacterRepository.findByIdAndUserId(characterId, userId);
    if (!character) {
        const err = new Error('선택한 캐릭터 정보가 올바르지 않거나 소유권이 없습니다.');
        err.status = 400;
        throw err;
    }

    // 3. 파티 테이블 생성
    const partyId = await partyRepository.create(userId, typeDifficultyId, title, meta.base_score);

    // 4. 요구사항 구현: 파티장이 방 생성 시 첫 번째 파티원으로 자동 등록
    await partyRepository.addMember(partyId, userId, characterId);

    // 만약 1인 제한 파티일 경우 인원 체크 후 상태 변경
    if (meta.max_members <= 1) {
        await partyRepository.updateStatus(partyId, 'COMPLETED');
    }

    return { partyId, title, status: 'RECRUITING' };
};

const startParty = async (userId, partyId) => {
    const party = await partyRepository.findById(partyId);
    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    if (party.creator_id !== userId) {
        const err = new Error('파티장만 파티를 출발시킬 수 있습니다.');
        err.status = 403;
        throw err;
    }

    const memberCount = await partyRepository.getMemberCount(partyId);
    // 🌟 요구사항 구현: 파티원이 파티장 제외 1명이라도 있을 시 출발 가능
    if (memberCount < 2) {
        const err = new Error('파티장을 제외한 파티원이 최소 1명 이상 존재해야 출발할 수 있습니다.');
        err.status = 400;
        throw err;
    }

    // 상태값 변경
    await partyRepository.updateStatus(partyId, 'STARTED');

    // 🌟 요구사항 구현: 5분 뒤 파티 삭제(EXPIRED) 및 점수적립 (출발 취소 대응용 예약 기능)
    if (partyTimers.has(partyId)) {
        clearTimeout(partyTimers.get(partyId));
    }

    const timerId = setTimeout(async () => {
        try {
            // 1. 상태 만료 처리
            await partyRepository.updateStatus(partyId, 'EXPIRED');

            // 2. 파티원 조회 후 MAIN 캐릭터 점수 적립
            const members = await partyRepository.findMembersByPartyId(partyId);
            for (const member of members) {
                await partyRepository.addScoreToMainCharacter(member.user_id, party.party_score);
            }

            partyTimers.delete(partyId);
        } catch (error) {
            console.error(`[Party Dynamic Timer Error] Party ID ${partyId}:`, error);
        }
    }, 5 * 60 * 1000); // 5분 시간

    partyTimers.set(partyId, timerId);
    return { partyId, status: 'STARTED' };
};

const backParty = async (userId, partyId) => {
    const party = await partyRepository.findById(partyId);
    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    if (party.creator_id !== userId) {
        const err = new Error('파티장만 출발 취소를 할 수 있습니다.');
        err.status = 403;
        throw err;
    }

    if (party.status !== 'STARTED') {
        const err = new Error('현재 출발 상태인 파티만 대기 상태로 변경할 수 있습니다.');
        err.status = 400;
        throw err;
    }

    // 🌟 요구사항 구현: 예약된 타이머가 있다면 클리어하여 5분 뒤 삭제+적립 로직 무효화
    if (partyTimers.has(partyId)) {
        clearTimeout(partyTimers.get(partyId));
        partyTimers.delete(partyId);
    }

    // 현재 멤버 스펙 재연산 후 인원 꽉 차 있다면 COMPLETED, 아니면 RECRUITING 보정
    const memberCount = await partyRepository.getMemberCount(partyId);
    const meta = await partyRepository.findMetaById(party.type_difficulty_id);
    const nextStatus = memberCount >= meta.max_members ? 'COMPLETED' : 'RECRUITING';

    await partyRepository.updateStatus(partyId, nextStatus);
    return { partyId, status: nextStatus };
};

const joinParty = async (userId, partyId, characterId) => {
    const party = await partyRepository.findById(partyId);
    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    // 🌟 요구사항 구현: RECRUITING 상태만 가입 가능
    if (party.status !== 'RECRUITING') {
        const err = new Error('현재 모집 중인 파티가 아닙니다.');
        err.status = 400;
        throw err;
    }

    const existingMember = await partyRepository.findMember(partyId, userId);
    if (existingMember) {
        const err = new Error('이미 해당 파티에 가입되어 있습니다.');
        err.status = 400;
        throw err;
    }

    const character = await userCharacterRepository.findByIdAndUserId(characterId, userId);
    if (!character) {
        const err = new Error('선택한 캐릭터 정보가 없거나 권한이 없습니다.');
        err.status = 400;
        throw err;
    }

    const meta = await partyRepository.findMetaById(party.type_difficulty_id);
    const currentCount = await partyRepository.getMemberCount(partyId);

    if (currentCount >= meta.max_members) {
        const err = new Error('파티 정원이 가득 찼습니다.');
        err.status = 400;
        throw err;
    }

    // 멤버 가입 처리
    await partyRepository.addMember(partyId, userId, characterId);

    // 🌟 요구사항 구현: 멤버 가득 차면 COMPLETED 상태 변경
    if (currentCount + 1 >= meta.max_members) {
        await partyRepository.updateStatus(partyId, 'COMPLETED');
    }

    return { partyId, userId, characterId };
};

const leaveParty = async (userId, partyId) => {
    const party = await partyRepository.findById(partyId);
    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    if (party.creator_id === userId) {
        const err = new Error('파티장은 파티를 나갈 수 없습니다. 필요시 파티를 완전히 삭제해야 합니다.');
        err.status = 400;
        throw err;
    }

    const member = await partyRepository.findMember(partyId, userId);
    if (!member) {
        const err = new Error('해당 파티의 소속 멤버가 아닙니다.');
        err.status = 400;
        throw err;
    }

    await partyRepository.removeMember(partyId, userId);

    // 정원이 빌 테니 STARTED 나 EXPIRED 상태가 아니라면 RECRUITING으로 롤백 복구
    if (party.status === 'COMPLETED') {
        await partyRepository.updateStatus(partyId, 'RECRUITING');
    }

    return { partyId, leftUserId: userId };
};

const kickMember = async (userId, partyId, targetUserId) => {
    const party = await partyRepository.findById(partyId);
    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    // 🌟 요구사항 구현: 파티장일 때만 추방 가능
    if (party.creator_id !== userId) {
        const err = new Error('파티장만 파티원을 추방할 수 있습니다.');
        err.status = 403;
        throw err;
    }

    if (userId === targetUserId) {
        const err = new Error('자기 자신은 추방할 수 없습니다.');
        err.status = 400;
        throw err;
    }

    const member = await partyRepository.findMember(partyId, targetUserId);
    if (!member) {
        const err = new Error('해당 유저는 파티원이 아닙니다.');
        err.status = 400;
        throw err;
    }

    await partyRepository.removeMember(partyId, targetUserId);

    if (party.status === 'COMPLETED') {
        await partyRepository.updateStatus(partyId, 'RECRUITING');
    }

    return { partyId, kickedUserId: targetUserId };
};

const deleteParty = async (userId, partyId) => {
    const party = await partyRepository.findById(partyId);
    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    // 🌟 요구사항 구현: 파티장만 파티 삭제 가능
    if (party.creator_id !== userId) {
        const err = new Error('파티장만 파티를 관리할 권한이 있습니다.');
        err.status = 403;
        throw err;
    }

    // 🌟 요구사항 구현: RECRUITING, COMPLETED 상태까지만 삭제 가능
    if (!['RECRUITING', 'COMPLETED'].includes(party.status)) {
        const err = new Error('이미 출발했거나 만료된 파티는 상태를 변경할 수 없습니다.');
        err.status = 400;
        throw err;
    }

    // 🌟 요구사항 구현: 삭제 매커니즘을 물리 삭제가 아닌 EXPIRED 상태 변경으로 적용
    await partyRepository.updateStatus(partyId, 'EXPIRED');
    return { partyId, status: 'EXPIRED' };
};

const changePartyTitle = async (userId, partyId, title) => {
    if (!title || title.trim() === '') {
        const err = new Error('변경할 파티 제목을 입력해 주세요.');
        err.status = 400;
        throw err;
    }

    const party = await partyRepository.findById(partyId);
    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    // 🌟 요구사항 구현: 파티장만 변경 기능 가능
    if (party.creator_id !== userId) {
        const err = new Error('파티장만 제목을 변경할 권한이 있습니다.');
        err.status = 403;
        throw err;
    }

    await partyRepository.updateTitle(partyId, title);
    return { partyId, updatedTitle: title };
};

const promoteParty = async (userId, partyId) => {
    const party = await partyRepository.findById(partyId);
    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    if (party.creator_id !== userId) {
        const err = new Error('파티장만 홍보를 진행할 수 있습니다.');
        err.status = 403;
        throw err;
    }

    // 🌟 요구사항 구현: 10분마다 홍보 쿨타임 검증
    const lastPromote = new Date(party.last_promote_time).getTime();
    const now = Date.now();
    const diffMinutes = (now - lastPromote) / (1000 * 60);

    if (diffMinutes < 10) {
        const err = new Error(`아직 홍보 쿨타임 중입니다. (${Math.ceil(10 - diffMinutes)}분 남음)`);
        err.status = 429;
        throw err;
    }

    await partyRepository.updatePromoteTime(partyId);

    // 🌟 요구사항 구현: 웹푸시 연동은 TODO처리
    // TODO: infra/webpush.js 모듈을 활용하여 전체 혹은 타겟 구독 유저들에게 브로드캐스팅 웹알림 구현 예정

    return { partyId, msg: '파티가 성공적으로 홍보되었습니다.' };
};


const forceDeletePartyByAdmin = async (partyId) => {
    let party;
    try {
        party = await partyRepository.findById(partyId);
    } catch (dbError) {
        const err = new Error('파티 정보를 조회하는 중 데이터베이스 오류가 발생했습니다.');
        err.status = 500;
        throw err;
    }

    if (!party) {
        const err = new Error('해당 파티를 찾을 수 없습니다.');
        err.status = 404;
        throw err;
    }

    if (party.status === 'EXPIRED') {
        const err = new Error('이미 만료되었거나 삭제 처리된 파티입니다.');
        err.status = 400;
        throw err;
    }

    // 2️⃣ 출발 상태(STARTED)인 경우 처리 로직
    if (party.status === 'STARTED') {
        if (partyTimers.has(partyId)) {
            clearTimeout(partyTimers.get(partyId));
            partyTimers.delete(partyId);
        }

        // 🌟 트랜잭션 커넥션 획득
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 🛠️ 수정: 전역 db가 아닌 획득한 커넥션(connection)을 명시적으로 주입
            await partyRepository.updateStatusWithConnection(connection, partyId, 'EXPIRED');

            // 파티원 조회의 경우 데이터를 변경하는 작업이 아니므로 기존 구조 유지 가능
            const members = await partyRepository.findMembersByPartyId(partyId);
            
            // 🛠️ 수정: 점수 누적 작업도 커넥션(connection)을 주입하여 동일 트랜잭션으로 묶음
            for (const member of members) {
                await partyRepository.addScoreToMainCharacterWithConnection(connection, member.user_id, party.party_score);
            }

            await connection.commit();
            return {
                message: '출발 상태인 파티를 강제 종료했습니다. 파티원 점수 적립 및 예약 타이머를 취소했습니다.',
                data: { partyId, status: 'EXPIRED', pointDistributed: true }
            };
        } catch (error) {
            // 이제 어느 한 곳에서 에러가 터져도 원자적으로 완벽하게 롤백됩니다.
            await connection.rollback();
            
            const err = new Error(`출발된 파티 강제 종료 중 오류가 발생하여 롤백되었습니다: ${error.message}`);
            err.status = 500;
            throw err;
        } finally {
            connection.release(); // 커넥션 반납
        }
    }

    // 3️⃣ 그 외의 대기/모집 상태 (RECRUITING, COMPLETED 등) 처리 로직 (트랜잭션 미필요 분기)
    try {
        await partyRepository.updateStatus(partyId, 'EXPIRED');
        
        return {
            message: '모집 중인 파티를 강제 삭제 처리했습니다.',
            data: { partyId, status: 'EXPIRED', pointDistributed: false }
        };
    } catch (error) {
        const err = new Error('파티 삭제 상태 변경 중 오류가 발생했습니다.');
        err.status = 500;
        throw err;
    }
};

module.exports = {
    getPartyMeta,
    getActiveParties,
    createParty,
    startParty,
    backParty,
    joinParty,
    leaveParty,
    kickMember,
    deleteParty,
    changePartyTitle,
    promoteParty,
    forceDeletePartyByAdmin
};