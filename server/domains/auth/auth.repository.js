const pool = require('../../config/db');

// 로그인 시 username으로 유저 조회
const findUserByUsername = async (username) => {
  const query = "SELECT * FROM users WHERE username = ?";
  const [rows] = await pool.query(query, [username]);
  return rows[0];
};

// 미들웨어 검증용: ID로 유저 조회
const findUserById = async (userId) => {
  const query = "SELECT * FROM users WHERE id = ?";
  const [rows] = await pool.query(query, [userId]);
  return rows[0];
};

// 비밀번호 변경 등 토큰 무효화용: 현재 시간으로 갱신
const updateTokenIssuedAt = async (userId) => {
  const query = "UPDATE users SET token_issued_at = CURRENT_TIMESTAMP WHERE id = ?";
  await pool.query(query, [userId]);
};

module.exports = { 
  findUserByUsername,
  findUserById,
  updateTokenIssuedAt
};