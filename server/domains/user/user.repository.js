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

module.exports = {
  findAllByUserId,
  findByIdAndUserId,
  create,
  updateMetadata,
  updateClass,
  deleteById
};