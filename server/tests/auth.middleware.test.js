const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { checkLogin } = require('../middlewares/auth.middleware');
const authRepository = require('../domains/auth/auth.repository');

// [1] 가짜 Express 앱 및 테스트용 라우터 생성
const app = express();
app.use(express.json());

// 쿠키 파서가 없으면 req.cookies를 읽을 수 없으므로 간단히 미들웨어용 모의 객체 주입
app.use((req, res, next) => {
  // 테스트에서 임의로 req.cookies에 토큰을 넣을 수 있도록 설정
  req.cookies = { token: req.headers['x-test-token'] };
  next();
});

// 보호된 테스트 라우터 엔드포인트
app.get('/api/protected', checkLogin, (req, res) => {
  return res.status(200).json({ success: true, user: req.user });
});

// [2] 외부 모듈 Mocking
jest.mock('jsonwebtoken');
jest.mock('../domains/auth/auth.repository');

describe('인증 미들웨어 (checkLogin) 테스트', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('성공: 유효한 토큰과 정상적인 DB 유저 정보일 경우 통과', async () => {
    const mockDecoded = { userId: 1, username: 'testuser', role: 'USER', iat: 1700000000 };
    const mockUser = { id: 1, username: 'testuser', role: 'USER', status: 'ACTIVE', token_issued_at: new Date(1700000000 * 1000) };

    jwt.verify.mockReturnValue(mockDecoded);
    authRepository.findUserById.mockResolvedValue(mockUser);

    const res = await request(app)
      .get('/api/protected')
      .set('x-test-token', 'valid.jwt.token'); // 쿠키 대신 헤더로 토큰 전달 시뮬레이션

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.username).toBe('testuser');
  });

  it('실패: 쿠키에 토큰이 없는 경우 401 에러 반환', async () => {
    const res = await request(app)
      .get('/api/protected'); // 토큰 설정 안 함

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('인증 토큰이 존재하지 않습니다.');
  });

  it('실패: JWT 검증 실패 시(변조 등) 401 에러 반환', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const res = await request(app)
      .get('/api/protected')
      .set('x-test-token', 'invalid.jwt.token');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('유효하지 않은 토큰입니다.');
  });

  it('실패: 토큰 만료 시 401 에러 및 만료 메시지 반환', async () => {
    const expiredError = new Error('jwt expired');
    expiredError.name = 'TokenExpiredError';
    
    jwt.verify.mockImplementation(() => {
      throw expiredError;
    });

    const res = await request(app)
      .get('/api/protected')
      .set('x-test-token', 'expired.jwt.token');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('토큰이 만료되었습니다.');
  });

  it('실패: DB에 유저가 없거나 BANNED 상태인 경우 401 에러 반환', async () => {
    const mockDecoded = { userId: 99, username: 'banneduser', role: 'USER', iat: 1700000000 };
    
    jwt.verify.mockReturnValue(mockDecoded);
    authRepository.findUserById.mockResolvedValue(undefined); // 유저 못 찾음 가정

    const res = await request(app)
      .get('/api/protected')
      .set('x-test-token', 'banned.user.token');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('유효하지 않은 사용자입니다.');
  });

  it('실패: 토큰 발급 시점이 DB 갱신 시점보다 이전인 경우 (비밀번호 변경 등으로 무효화된 토큰) 401 에러 반환', async () => {
    // 토큰 발급 시간: 초 단위 1700000500 -> 밀리초 1700000500000
    const mockDecoded = { userId: 1, username: 'testuser', role: 'USER', iat: 1700000500 };
    
    // DB 갱신 시간: 1700000600초 (토큰 발급 후 비밀번호 변경 등으로 인해 갱신됨을 가정)
    const mockUser = { 
      id: 1, 
      username: 'testuser', 
      role: 'USER', 
      status: 'ACTIVE', 
      token_issued_at: new Date(1700000600 * 1000) 
    };

    jwt.verify.mockReturnValue(mockDecoded);
    authRepository.findUserById.mockResolvedValue(mockUser);

    const res = await request(app)
      .get('/api/protected')
      .set('x-test-token', 'old.jwt.token');

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('로그인 정보가 갱신되었습니다. 다시 로그인해 주세요.');
  });

});