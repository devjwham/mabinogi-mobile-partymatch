const mysql = require('mysql2/promise');
require('dotenv').config();

// 매번 연결을 새로 맺지 않고, 효율적으로 돌려쓰는 Connection Pool 생성
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10, // 커넥션 개수
  queueLimit: 0
});

module.exports = pool;