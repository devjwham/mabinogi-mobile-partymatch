const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authRepository = require('./auth.repository');

const SECRET_KEY = process.env.SECRET_KEY || "your-secret-key";

const login = async (username, password) => {
  // [1] username으로 유저 조회
  const user = await authRepository.findUserByUsername(username);

  // [2] 유저 존재 여부 및 벤 상태 체크 (보안상 구체적 사유 숨김 처리 유지)
  if (!user || user.status === 'BANNED') {
    throw new Error("INVALID_CREDENTIALS");
  }

  // [3] 비밀번호 해시 일치 여부 확인 (password_hash 필드 사용)
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // [4] JWT 토큰 발급 (Payload에 필요한 정보 구성)
  const token = jwt.sign(
    { 
      userId: user.id, 
      username: user.username, 
      nickname: user.nickname,
      role: user.role 
    },
    SECRET_KEY,
    { expiresIn: "7d" }
  );

  return { token, user };
};

module.exports = { login };