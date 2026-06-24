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
const checkAdmin = (req, res, next) => {
  // checkLogin 미들웨어에서 req.user를 정상적으로 주입받았다고 가정
  if (!req.user) {
    return res.status(401).json({ success: false, message: "로그인이 필요한 서비스입니다." });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: "관리자 권한이 없습니다." });
  }

  next(); // ADMIN이 맞으면 다음 컨트롤러로 진행
};

module.exports = { checkLogin,checkAdmin };