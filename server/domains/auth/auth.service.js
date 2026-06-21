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
      role: user.role
    },
    SECRET_KEY,
    { expiresIn: "7d" }
  );

  return { token, user };
};

const verifyUserByToken = async (token) => {
  if (!token) {
    throw new Error("인증 토큰이 존재하지 않습니다.");
  }

  try {
    // JWT 토큰 복호화 및 검증
    const decoded = jwt.verify(token, SECRET_KEY);

    // DB에서 최신 유저 정보 조회
    const user = await authRepository.findUserById(decoded.userId);
    if (!user || user.status === 'BANNED') {
      throw new Error("유효하지 않은 사용자입니다.");
    }

    // 토큰 발급 시점 검증 (비밀번호 변경/갱신 대응)
    const tokenIssuedAtMs = decoded.iat * 1000;
    const dbIssuedAtMs = new Date(user.token_issued_at).getTime();

    if (tokenIssuedAtMs < dbIssuedAtMs) {
      throw new Error("로그인 정보가 갱신되었습니다. 다시 로그인해 주세요.");
    }

    // 검증 성공 시 반환할 데이터 규격화
    return {
      userId: user.id,
      username: user.username,
      role: user.role
    };
  } catch (err) {
    // 1. JWT 라이브러리의 만료 에러 처리
    if (err.name === 'TokenExpiredError') {
      throw new Error("토큰이 만료되었습니다.");
    }

    // 2. 위에서 우리가 직접 손으로 적어서 던진 에러 메시지들 목록
    const myErrors = [
      "인증 토큰이 존재하지 않습니다.",
      "유효하지 않은 사용자입니다.",
      "로그인 정보가 갱신되었습니다. 다시 로그인해 주세요."
    ];

    // 만약 내가 던진 에러라면 수정하지 말고 그대로 위로 토스!
    if (myErrors.includes(err.message)) {
      throw err;
    }

    // 3. 그 외에 잡히는 모든 에러(JWT 서명 오류, 변조 등)는 안전하게 통일
    throw new Error("유효하지 않은 토큰입니다.");
  }
};

module.exports = {
  login,
  verifyUserByToken
};