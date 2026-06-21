// infra/socket.js
const { Server } = require("socket.io");
const authService = require("../domains/auth/auth.service"); 

let io;

module.exports = {
  init: (httpServer) => {
    // .env에서 허용할 오리진(CORS) 목록을 읽어와 배열로 변환
    // 만약 .env에 값이 없으면 기본값으로 로컬 호스트 등을 지정해 안전망 확보
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(",") 
      : ["http://localhost:3000"];

    io = new Server(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
      },
      pingInterval: 10000,
      pingTimeout: 5000,
    });

    // Socket.io 인증 미들웨어
    io.use(async (socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      try {
        const verifiedUser = await authService.verifyUserByToken(token);
        socket.user = verifiedUser; 
        next();
      } catch (err) {
        return next(new Error(err.message));
      }
    });

    // 소켓 연결 이벤트 처리
    io.on("connection", (socket) => {
      console.log(`⚡ 인증된 유저 소켓 접속: ${socket.user.username} (${socket.id})`);

      // 테스트용
      socket.on("join_party", (partyId) => {
        socket.join(`party-${partyId}`);
        console.log(`👤 유저(${socket.user.username})가 파티 룸 [party-${partyId}] 에 입장함`);
      });

      socket.on("disconnect", () => {
        console.log(`🔌 유저 소켓 접속 해제: ${socket.user.username} (${socket.id})`);
      });
    });

    return io;
  },

  getIo: () => {
    if (!io) {
      throw new Error("❌ 소켓 서버가 초기화되지 않았습니다. server.js를 확인하세요.");
    }
    return io;
  }
};