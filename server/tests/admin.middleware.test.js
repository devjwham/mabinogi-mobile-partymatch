const request = require('supertest');
const express = require('express');
const { checkAdmin } = require('../middlewares/auth.middleware');

// [1] 가짜 Express 앱 및 테스트용 라우터 생성
const app = express();
app.use(express.json());

// req.user를 임의로 주입해주기 위한 모의(Mock) 미들웨어
const injectUser = (role) => (req, res, next) => {
  if (role) {
    req.user = { id: 1, username: 'testuser', role };
  }
  next();
};

// 보호된 관리자 전용 테스트 엔드포인트
app.get('/api/admin-only', injectUser('ADMIN'), checkAdmin, (req, res) => {
  return res.status(200).json({ success: true, message: "관리자 페이지 접근 성공" });
});

describe('관리자 권한 미들웨어 (checkAdmin) 테스트', () => {

  it('성공: ADMIN 권한 유저 접근 시 통과', async () => {
    const res = await request(app)
      .get('/api/admin-only');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('관리자 페이지 접근 성공');
  });

  it('실패: 로그인 정보(req.user)가 없는 경우 401 에러 반환', async () => {
    const unauthenticatedApp = express();
    unauthenticatedApp.use(express.json());
    unauthenticatedApp.get('/api/admin-only', (req, res, next) => {
      req.user = undefined; // 명시적 누락
      next();
    }, checkAdmin);

    const res = await request(unauthenticatedApp).get('/api/admin-only');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('로그인이 필요한 서비스입니다.');
  });

  it('실패: 일반 유저(USER) 권한 접근 시 403 에러 반환', async () => {
    const unauthorizedApp = express();
    unauthorizedApp.use(express.json());
    unauthorizedApp.get('/api/admin-only', (req, res, next) => {
      req.user = { id: 2, username: 'normaluser', role: 'USER' }; // 일반 유저 role 주입
      next();
    }, checkAdmin);

    const res = await request(unauthorizedApp).get('/api/admin-only');

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('관리자 권한이 없습니다.');
  });

});