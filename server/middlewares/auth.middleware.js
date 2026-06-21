const jwt = require('jsonwebtoken');
const authRepository = require('../domains/auth/auth.repository');

const SECRET_KEY = process.env.SECRET_KEY || "your-secret-key";

const checkLogin = async (req, res, next) => {
  try {
    // [1] 쿠키에서 토큰 추출
    const token = req.cookies.token;
    
    if (!token) {
      return res.status(401).json({ success: false, message: "인증 토큰이 존재하지 않습니다." });
    }

    // [2] JWT 토큰 복호화 및 검증
    const decoded = jwt.verify(token, SECRET_KEY);
    
    // [3] DB에서 최신 유저 정보 조회 (BANNED 상태 및 갱신된 token_issued_at 확인)
    const user = await authRepository.findUserById(decoded.userId);
    if (!user || user.status === 'BANNED') {
      return res.status(401).json({ success: false, message: "유효하지 않은 사용자입니다." });
    }

    // [4] 토큰의 iat(발급 시간, 초 단위)를 밀리초로 변환
    const tokenIssuedAtMs = decoded.iat * 1000;

    // DB에 저장된 token_issued_at (TIMESTAMP)의 밀리초 값 계산
    const dbIssuedAtMs = new Date(user.token_issued_at).getTime();

    // [5] 토큰 발급 시점이 DB에 기록된 갱신 시점보다 이전인 경우 (비밀번호 변경 등으로 인해 무효화된 토큰)
    if (tokenIssuedAtMs < dbIssuedAtMs) {
      return res.status(401).json({ success: false, message: "로그인 정보가 갱신되었습니다. 다시 로그인해 주세요." });
    }

    // [6] 검증 완료된 유저 정보 req.user에 담기
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: "토큰이 만료되었습니다." });
    }
    return res.status(401).json({ success: false, message: "유효하지 않은 토큰입니다." });
  }
};

module.exports = { checkLogin };