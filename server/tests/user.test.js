const request = require('supertest');
const express = require('express');
const userRouter = require('../domains/user/user.router');
const userService = require('../domains/user/user.service');

// 1. 외부 의존성인 auth.middleware와 user.service를 Mocking합니다.
jest.mock('../middlewares/auth.middleware', () => ({
  checkLogin: (req, res, next) => {
    // 테스트용 임의의 유저 정보를 주입합니다.
    req.user = { userId: 1, username: 'testuser', role: 'USER' };
    next();
  },
}));

jest.mock('../domains/user/user.service');

describe('User Character API 통합 테스트 (Supertest)', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // 라우터 마운트
    app.use('/api/user', userRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* ==============================================
     1. GET /api/user/characters (캐릭터 리스트 조회)
     ============================================== */
  describe('GET /api/user/characters', () => {
    it('성공 시 200 상태코드와 캐릭터 리스트를 반환해야 한다', async () => {
      const mockCharacters = [
        { id: 1, user_id: 1, nickname: '캐릭터1', character_class: 'attack', power: 10.5 },
        { id: 2, user_id: 1, nickname: '캐릭터2', character_class: 'support', power: 5.2 },
      ];
      userService.getCharactersByUserId.mockResolvedValue(mockCharacters);

      const response = await request(app).get('/api/user/characters');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockCharacters });
      expect(userService.getCharactersByUserId).toHaveBeenCalledWith(1);
    });
  });

  /* ==============================================
     2. POST /api/user/characters (캐릭터 생성)
     ============================================== */
  describe('POST /api/user/characters', () => {
    it('올바른 데이터 입력 시 201 상태코드와 생성된 데이터를 반환해야 한다', async () => {
      const mockNewCharacter = { id: 3, userId: 1, nickname: '신규캐릭', characterClass: 'attack', power: 6.45 };
      userService.createCharacter.mockResolvedValue(mockNewCharacter);

      const response = await request(app)
        .post('/api/user/characters')
        .send({ nickname: '신규캐릭', characterClass: 'attack', power: 6.45 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: mockNewCharacter });
    });

    it('닉네임이나 전투력(power)이 누락된 경우 400 상태코드를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/user/characters')
        .send({ characterClass: 'attack' }); // nickname, power 누락

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('필수입니다');
    });

    it('전투력(power)이 음수이거나 숫자가 아닌 경우 400 상태코드를 반환해야 한다', async () => {
      const response = await request(app)
        .post('/api/user/characters')
        .send({ nickname: '잘못된파워', characterClass: 'attack', power: -10 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('올바른 전투력 수치');
    });
  });

  /* ==============================================
     3. PUT /api/user/characters/:characterId/metadata (닉네임/전투력 수정)
     ============================================== */
  describe('PUT /api/user/characters/:characterId/metadata', () => {
    it('성공 시 200 상태코드와 수정된 데이터를 반환해야 한다', async () => {
      const updatedMock = { id: '1', nickname: '바뀐닉네임', power: 12.34 };
      userService.updateMetadata.mockResolvedValue(updatedMock);

      const response = await request(app)
        .put('/api/user/characters/1/metadata')
        .send({ nickname: '바뀐닉네임', power: 12.34 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: updatedMock });
    });

    it('수정 시 닉네임이나 파워가 누락되면 400 상태코드를 반환해야 한다', async () => {
      const response = await request(app)
        .put('/api/user/characters/1/metadata')
        .send({ nickname: '닉네임만보냄' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('정보가 필요합니다');
    });

    it('해당 캐릭터 권한이 없거나 존재하지 않는 경우 서비스에서 에러를 던지면 적절한 상태코드를 반환해야 한다', async () => {
      const err = new Error('해당 캐릭터를 찾을 수 없거나 권한이 없습니다.');
      err.status = 404;
      userService.updateMetadata.mockRejectedValue(err);

      const response = await request(app)
        .put('/api/user/characters/999/metadata')
        .send({ nickname: '유령캐릭', power: 0 });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(err.message);
    });
  });

  /* ==============================================
     4. PATCH /api/user/characters/:characterId/class (클래스 수정)
     ============================================== */
  describe('PATCH /api/user/characters/:characterId/class', () => {
    it('올바른 클래스(attack/support)로 수정 요청 시 200 상태코드를 반환해야 한다', async () => {
      const updatedMock = { id: '1', character_class: 'support' };
      userService.updateClass.mockResolvedValue(updatedMock);

      const response = await request(app)
        .patch('/api/user/characters/1/class')
        .send({ characterClass: 'support' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: updatedMock });
    });

    it('허용되지 않는 클래스 명을 보낼 경우 400 상태코드를 반환해야 한다', async () => {
      const response = await request(app)
        .patch('/api/user/characters/1/class')
        .send({ characterClass: 'wizard' }); // 잘못된 클래스

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('attack 또는 support만 가능');
    });
  });

  /* ==============================================
      5. DELETE /api/user/characters/:characterId (캐릭터 삭제)
     ============================================== */
  describe('DELETE /api/user/characters/:characterId', () => {
    it('서브 캐릭터 삭제 성공 시 200 상태코드와 성공 메시지를 반환해야 한다', async () => {
      const mockDeleteResult = { id: '2', message: '캐릭터가 성공적으로 삭제되었습니다.' };
      userService.removeCharacter.mockResolvedValue(mockDeleteResult);

      const response = await request(app).delete('/api/user/characters/2');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: mockDeleteResult });
      expect(userService.removeCharacter).toHaveBeenCalledWith(1, '2');
    });

    it('메인 캐릭터 삭제 시 서비스 레이어에서 400 에러를 던지면 400 상태코드를 반환해야 한다', async () => {
      const err = new Error('메인 캐릭터는 삭제할 수 없습니다. 서브(SUB) 캐릭터만 삭제 가능합니다.');
      err.status = 400;
      userService.removeCharacter.mockRejectedValue(err);

      const response = await request(app).delete('/api/user/characters/1');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(err.message);
    });

    it('캐릭터가 존재하지 않거나 권한이 없는 경우 서비스 레이어에서 404 에러를 던지면 404 상태코드를 반환해야 한다', async () => {
      const err = new Error('해당 캐릭터를 찾을 수 없거나 권한이 없습니다.');
      err.status = 404;
      userService.removeCharacter.mockRejectedValue(err);

      const response = await request(app).delete('/api/user/characters/999');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe(err.message);
    });
  });
});