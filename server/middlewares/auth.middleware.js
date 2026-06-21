const authService = require('../domains/auth/auth.service');

const checkLogin = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    
    // 🚀 서비스 계층의 공통 인증 로직 호출
    const verifiedUser = await authService.verifyUserByToken(token);

    // 검증 완료된 유저 정보 req.user에 담기
    req.user = verifiedUser;

    next();
  } catch (err) {
    // 서비스에서 throw된 에러 메시지를 그대로 응답형식에 맞춰 반환
    return res.status(401).json({ success: false, message: err.message });
  }
};

module.exports = { checkLogin };