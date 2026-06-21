// server.js
const http = require("http");
const { app, server } = require("./app"); // 조립된 Express 앱 인스턴스 가져오기

// DB 연결 설정 파일 가져오기
const pool = require("./config/db"); 
// 소켓 설정 파일 가져오기
const socketInfra = require('./infra/socket');
// 웹푸시 설정 파일 가져오기
const webpushInfra = require("./infra/webpush");

// 포트 설정
const PORT = process.env.PORT;


// 인프라 일괄 초기화 (socket, web-push)
socketInfra.init(server);
webpushInfra.init();

// DB 연결 테스트 후 성공 시 서버 리스닝 시작
pool.getConnection()
  .then(connection => {
    console.log("데이터베이스 연결 확인 완료");
    connection.release(); // 사용 후 즉시 풀에 반납

    server.listen(PORT, () => {
      console.log(`API 및 소켓 서버가 포트 ${PORT} 에서 정상 가동 중입니다.`);
    });
  })
  .catch(err => {
    console.error("데이터베이스 연결 실패, 서버 구동 중단:", err.message);
    process.exit(1);
  });