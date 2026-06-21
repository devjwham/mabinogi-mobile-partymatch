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

module.exports = { checkAdmin };