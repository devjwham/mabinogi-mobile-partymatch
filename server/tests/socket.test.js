// tests/infra/socket.test.js
const http = require("http");
const express = require("express");
const { io: Client } = require("socket.io-client");
const socketInfra = require("../infra/socket");
const authService = require("../domains/auth/auth.service");

// [1] AuthService 모킹
jest.mock("../domains/auth/auth.service");

describe("소켓 인프라 (infra/socket.js) 테스트", () => {
  let httpServer;
  let ioServer;
  let port;

  // 각 테스트 시작 전에 실제 가벼운 HTTP 서버와 소켓 서버를 띄움
  beforeEach((done) => {
    const app = express();
    httpServer = http.createServer(app);
    
    // 소켓 인프라 초기화
    ioServer = socketInfra.init(httpServer);

    // 랜덤 포트로 서버 리슨 시작
    httpServer.listen(() => {
      port = httpServer.address().port;
      done();
    });
  });

  // 각 테스트가 끝나면 서버 및 클라이언트 소켓 연결을 깔끔하게 닫음
  afterEach((done) => {
    ioServer.close();
    httpServer.close(done);
    jest.clearAllMocks();
  });

  it("성공: 유효한 토큰을 제공하면 소켓 연결이 성공하고 socket.user가 주입된다", (done) => {
    const mockUser = { userId: 1, username: "testuser", role: "USER" };
    // 공통 검증 함수가 정상적인 유저를 반환하도록 설정
    authService.verifyUserByToken.mockResolvedValue(mockUser);

    // 가짜 클라이언트 소켓 생성 (auth 객체에 토큰 주입)
    const clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: "valid-token" },
    });

    clientSocket.on("connect", () => {
      // 연결 성공 시 클라이언트 측에서 연결이 유효한지 확인
      expect(clientSocket.connected).toBe(true);
      clientSocket.disconnect();
      done();
    });
  });

  it("성공: join_party 이벤트를 보내면 지정된 파티 룸에 정상적으로 입장한다", (done) => {
    const mockUser = { userId: 1, username: "partyking", role: "USER" };
    authService.verifyUserByToken.mockResolvedValue(mockUser);

    const clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: "valid-token" },
    });

    clientSocket.on("connect", () => {
      const partyId = "party-123";
      
      // join_party 이벤트 송신
      clientSocket.emit("join_party", partyId);

      // 서버 측에서 룸에 잘 들어갔는지 서버 객체를 통해 검증하기 위해 약간의 딜레이를 줌
      setTimeout(() => {
        // ioServer 내부의 해당 소켓 객체를 찾아 룸 목록 확인
        const serverSockets = ioServer.sockets.sockets;
        const serverSocket = Array.from(serverSockets.values())[0];

        expect(serverSocket.rooms.has(`party-${partyId}`)).toBe(true);
        expect(serverSocket.user.username).toBe("partyking");
        
        clientSocket.disconnect();
        done();
      }, 50);
    });
  });

  it("실패: 유효하지 않거나 만료된 토큰이면 소켓 연결이 거부(connect_error)된다", (done) => {
    // 공통 검증 함수에서 에러를 throw하도록 설정
    authService.verifyUserByToken.mockRejectedValue(new Error("토큰이 만료되었습니다."));

    const clientSocket = Client(`http://localhost:${port}`, {
      auth: { token: "expired-token" },
    });

    // io.use 미들웨어에서 next(Error)를 던지면 클라이언트는 connect_error 이벤트를 받음
    clientSocket.on("connect_error", (err) => {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("토큰이 만료되었습니다.");
      expect(clientSocket.connected).toBe(false);
      
      clientSocket.disconnect();
      done();
    });
  });
});