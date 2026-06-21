const authService = require('./auth.service');

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    // [1] 필수값 유효성 검사 (RESTful 관점에서 잘못된 요청은 400 Bad Request)
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "사용자명과 비밀번호를 입력하세요.",
      });
    }

    // [2] 서비스 계층 호출
    const { token, user } = await authService.login(username, password);

    // [3] 쿠키에 토큰 저장
    res.cookie("token", token, {
      httpOnly: false, // 필요에 따라 true로 변경 권장
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });

    // [4] 성공 응답 (RESTful 표준에 맞춰 리소스 반환)
    return res.status(200).json({ 
      success: true, 
      data: {
        username: user.username,
        nickname: user.nickname,
        role: user.role
      }
    });
    
  } catch (err) {
    // [5] 에러 핸들링
    if (err.message === "INVALID_CREDENTIALS") {
      return res.status(401).json({ 
        success: false, 
        message: "아이디 또는 비밀번호가 일치하지 않습니다." 
      });
    }

    console.error("Login Controller Error:", err);
    return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

module.exports = { login };