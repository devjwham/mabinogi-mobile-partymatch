const express = require('express');
const { login } = require('./auth.controller');

const router = express.Router();

// 리소스 경로 설정 (로그인 인증 요청)
router.post('/login', login);

module.exports = router;