const request = require('supertest');
const express = require('express');
// 루트 서버 폴더(server) 기준 domains 경로 설정
const authRouter = require('../domains/auth/auth.router'); 
const authRepository = require('../domains/auth/auth.repository'); 
const bcrypt = require('bcrypt');

// [1] Express 앱 인스턴스 생성 및 라우터 연결
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

// [2] Repository 및 외부 라이브러리 Mocking 처리
jest.mock('../domains/auth/auth.repository');
jest.mock('bcrypt');

describe('POST /api/auth/login 계층형 테스트', () => {
  
  beforeEach(() => {
    // 각 테스트 실행 전 모킹 데이터 초기화
    jest.clearAllMocks();
  });

  it('성공: 올바른 사용자명과 비밀번호 입력 시 200 상태코드와 토큰 반환', async () => {
    // 가상의 DB 조회 결과 설정
    const mockUser = {
      id: 1,
      username: 'testuser',
      nickname: '테스트유저',
      password_hash: '$b...h', // 가짜 해시 비밀번호
      role: 'USER',
      status: 'ACTIVE'
    };

    authRepository.findUserByUsername.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(true); // 비밀번호 일치 가정

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser',
        password: 'password123!'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe('testuser');
    expect(res.headers['set-cookie']).toBeDefined(); // 쿠키 설정 확인
  });

  it('실패: 필수값 누락 시 400 상태코드와 에러 메시지 반환', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser' // password 누락
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('사용자명과 비밀번호를 입력하세요.');
  });

  it('실패: 비밀번호가 일치하지 않는 경우 401 에러 반환', async () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      nickname: '테스트유저',
      password_hash: '$b...h',
      role: 'USER',
      status: 'ACTIVE'
    };

    authRepository.findUserByUsername.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(false); // 비밀번호 불일치 가정

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testuser',
        password: 'wrongpassword'
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('아이디 또는 비밀번호가 일치하지 않습니다.');
  });

  it('실패: 존재하지 않는 유저인 경우 401 에러 반환', async () => {
    // 유저 조회 결과 없음(undefined) 가정
    authRepository.findUserByUsername.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'unknown',
        password: 'password123!'
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('아이디 또는 비밀번호가 일치하지 않습니다.');
  });

  it('실패: 벤(BANNED) 상태 유저인 경우 401 에러 반환', async () => {
    const mockBannedUser = {
      id: 2,
      username: 'banneduser',
      nickname: '제재유저',
      password_hash: '$b...h',
      role: 'USER',
      status: 'BANNED' // 벤 상태
    };

    authRepository.findUserByUsername.mockResolvedValue(mockBannedUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'banneduser',
        password: 'password123!'
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('아이디 또는 비밀번호가 일치하지 않습니다.');
  });

});