// app.js
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const http = require("http");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const server = http.createServer(app);

// 기본 파싱 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 요청 정보 출력용 콘솔 로그 미들웨어
app.use((req, res, next) => {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl} | Host: ${req.hostname}`);
  next();
});

// 개발 환경 안전장치 (로컬 테스트 프리패스)
app.use((req, res, next) => {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev && (req.hostname === "localhost" || req.hostname === "127.0.0.1")) {
    return next();
  }
  next();
});

// 헬스체크 라우터
app.get('/api/status', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Mabinogi Party Match API Server' });
});

module.exports = { app, server };