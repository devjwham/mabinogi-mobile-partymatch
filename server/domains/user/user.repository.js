const db = require('../../config/db');

const findAllByUserId = async (userId) => {
  const [rows] = await db.query('SELECT * FROM user_characters WHERE user_id = ?', [userId]);
  return rows;
};

const findByIdAndUserId = async (id, userId) => {
  const [rows] = await db.query('SELECT * FROM user_characters WHERE id = ? AND user_id = ?', [id, userId]);
  return rows[0];
};

const create = async (userId, nickname, characterClass, power) => {
  const [result] = await db.query(
    'INSERT INTO user_characters (user_id, nickname, character_class, power) VALUES (?, ?, ?, ?)',
    [userId, nickname, characterClass, power]
  );
  return { id: result.insertId, userId, nickname, characterClass, power };
};

const updateMetadata = async (id, nickname, power) => {
  await db.query('UPDATE user_characters SET nickname = ?, power = ? WHERE id = ?', [nickname, power, id]);
};

const updateClass = async (id, characterClass) => {
  await db.query('UPDATE user_characters SET character_class = ? WHERE id = ?', [characterClass, id]);
};

const deleteById = async (id) => {
  await db.query('DELETE FROM user_characters WHERE id = ?', [id]);
};

// Username으로 유저 단건 조회 (BANNED 상태 포함 전체)
const findByUsername = async (username) => {
  const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0];
};

// ID로 유저 단건 조회
const findById = async (id) => {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
};

// ACTIVE 상태인 일반 유저 목록 조회
const findAllActiveUsers = async () => {
  const [rows] = await db.query(
    'SELECT id, role, username, created_at, score, total_score FROM users WHERE status = "ACTIVE" ORDER BY created_at DESC'
  );
  return rows;
};

// [트랜잭션용] 신규 유저 생성
const createWithConnection = async (connection, username, passwordHash) => {
  const [result] = await connection.query(
    'INSERT INTO users (username, password_hash, role, status) VALUES (?, ?, "USER", "ACTIVE")',
    [username, passwordHash]
  );
  return result.insertId;
};

// [트랜잭션용] 신규 MAIN 캐릭터 생성
const createMainCharacterWithConnection = async (connection, userId, nickname) => {
  await connection.query(
    'INSERT INTO user_characters (user_id, nickname, character_class, power, character_type) VALUES (?, ?, "attack", 0.00, "MAIN")',
    [userId, nickname]
  );
};

// [트랜잭션용] BANNED 유저를 ACTIVE로 재활성화 및 비번/iat 초기화
const reactivateUserWithConnection = async (connection, id, passwordHash) => {
  await connection.query(
    'UPDATE users SET status = "ACTIVE", password_hash = ?, iat = NOW() WHERE id = ?',
    [passwordHash, id]
  );
};

// 유저 비밀번호 초기화 및 iat 갱신
const updatePasswordAndIat = async (id, passwordHash) => {
  await db.query(
    'UPDATE users SET password_hash = ?, iat = NOW() WHERE id = ?',
    [passwordHash, id]
  );
};

// 유저 상태 BANNED로 변경
const updateStatusToBanned = async (id) => {
  await db.query('UPDATE users SET status = "BANNED" WHERE id = ?', [id]);
};

// 유저 웹푸시 구독 정보 전체 물리 삭제
const deleteSubscriptionsByUserId = async (userId) => {
  await db.query('DELETE FROM subscriptions WHERE user_id = ?', [userId]);
};

// [트랜잭션용] 유저네임 변경
const updateUsernameWithConnection = async (connection, id, newUsername) => {
  await connection.query(
    'UPDATE users SET username = ? WHERE id = ?', 
    [newUsername, id]
  );
};

// [트랜잭션용] MAIN 캐릭터 닉네임 변경
const updateMainCharacterNicknameWithConnection = async (connection, userId, newNickname) => {
  await connection.query(
    'UPDATE user_characters SET nickname = ? WHERE user_id = ? AND character_type = "MAIN"',
    [newNickname, userId]
  );
};

module.exports = {
  findAllByUserId,
  findByIdAndUserId,
  create,
  updateMetadata,
  updateClass,
  deleteById,
  findByUsername,
  findById,
  findAllActiveUsers,
  createWithConnection,
  createMainCharacterWithConnection,
  reactivateUserWithConnection,
  updatePasswordAndIat,
  updateStatusToBanned,
  deleteSubscriptionsByUserId,
  updateUsernameWithConnection,
  updateMainCharacterNicknameWithConnection
};