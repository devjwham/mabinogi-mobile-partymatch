const pool = require('../../config/db');

const findUserByUsername = async (username) => {
  const query = "SELECT * FROM users WHERE username = ?";
  const [rows] = await pool.query(query, [username]);
  return rows[0];
};

module.exports = { findUserByUsername };