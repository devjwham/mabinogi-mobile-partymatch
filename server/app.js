// app.js
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const http = require("http");
const dotenv = require("dotenv");

const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');

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

// auth관련 마운트
const authRouter = require("./domains/auth/auth.router");
app.use('/api/auth', authRouter);

// user관련 마운트
const userRouter = require('./domains/user/user.router');
app.use('/api/user', userRouter);

// party관련 마운트
const partyRouter = require('./domains/party/party.router');
app.use('/api/party', partyRouter);

// shop관련 마운트
const shopRouter = require('./domains/shop/shop.router');
app.use('/api/shop', shopRouter);

// admin관련 마운트
const adminRouter = require('./domains/admin/admin.router');
app.use('/api/admin', adminRouter);

// webpush관련 마운트
const webpushRouter = require('./domains/webpush/webpush.router');
app.use('/api/webpush', webpushRouter);


//스웨거 관련
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '마비노기모바일 파티매칭 API 명세서 📚',
      version: '1.0.0',
    },
    servers: [{ url: 'http://localhost:12345' }],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },

      schemas: {
        CommonSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              description: '실제 반환 데이터 객체 또는 배열'
            }
          }
        },

        CommonError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: {
              type: 'string',
              example: '에러 원인 메시지'
            }
          }
        }
      }
    }
  },

  apis: ['./domains/**/*.swagger.js']
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);
// Swagger UI 라우터 연결
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

module.exports = { app, server };