const db = require('../../config/db');

// 생성 가능한 마스터 정보 (종류 및 난이도 조합) 조회
const findPartyMeta = async () => {
  const query = `
    SELECT 
      ptd.id AS type_difficulty_id,
      pt.name AS party_type_name,
      pt.max_members,
      d.name AS difficulty_name,
      ptd.base_score
    FROM party_type_difficulties ptd
    JOIN party_types pt ON ptd.party_type_id = pt.id
    JOIN difficulties d ON ptd.difficulty_id = d.id
  `;
  const [rows] = await db.query(query);
  return rows;
};

// 매핑 ID 기반 단건 마스터 정보 확인
const findMetaById = async (typeDifficultyId) => {
  const query = `
    SELECT pt.max_members, ptd.base_score
    FROM party_type_difficulties ptd
    JOIN party_types pt ON ptd.party_type_id = pt.id
    WHERE ptd.id = ?
  `;
  const [rows] = await db.query(query, [typeDifficultyId]);
  return rows[0];
};

// EXPIRED가 아닌 모든 파티와 파티원 상세 정보 일괄 조회 (유지)
const findAllActiveParties = async () => {
  const query = `
    SELECT 
      p.id AS party_id, p.creator_id, p.title, p.status, p.party_score, p.created_at,
      pt.name AS party_type_name, d.name AS difficulty_name,     
      m.user_id AS member_user_id, m.character_id AS member_character_id,
      c.nickname AS character_nickname, c.character_class,         
      c.power AS character_power
    FROM table_parties p
    INNER JOIN party_type_difficulties ptd ON p.type_difficulty_id = ptd.id
    INNER JOIN party_types pt ON ptd.party_type_id = pt.id
    INNER JOIN difficulties d ON ptd.difficulty_id = d.id
    LEFT JOIN party_members m ON p.id = m.party_id
    LEFT JOIN user_characters c ON m.character_id = c.id
    WHERE p.status != 'EXPIRED'
    ORDER BY p.id DESC, m.joined_at ASC
  `;
  const [rows] = await db.query(query);
  return rows;
};
// 파티 단건 상세 조회
const findDetailById = async (partyId) => {
  const query = `
    SELECT 
      p.id AS party_id, p.creator_id, p.title, p.status, p.party_score, p.created_at,
      pt.name AS party_type_name, d.name AS difficulty_name,     
      m.user_id AS member_user_id, m.character_id AS member_character_id,
      c.nickname AS character_nickname, c.character_class,         
      c.power AS character_power
    FROM table_parties p
    INNER JOIN party_type_difficulties ptd ON p.type_difficulty_id = ptd.id
    INNER JOIN party_types pt ON ptd.party_type_id = pt.id
    INNER JOIN difficulties d ON ptd.difficulty_id = d.id
    LEFT JOIN party_members m ON p.id = m.party_id
    LEFT JOIN user_characters c ON m.character_id = c.id
    WHERE p.id = ? -- 👈 특정 파티 ID만 조회하도록 변경
    ORDER BY m.joined_at ASC
  `;
  const [rows] = await db.query(query, [partyId]);
  return rows;
};

// 파티 단건 조회 (상태 변경 및 권한 검증용)
const findById = async (partyId) => {
  const [rows] = await db.query('SELECT * FROM table_parties WHERE id = ?', [partyId]);
  return rows[0];
};

// 파티 생성
const create = async (creatorId, typeDifficultyId, title, baseScore) => {
  const [result] = await db.query(
    'INSERT INTO table_parties (creator_id, type_difficulty_id, title, party_score) VALUES (?, ?, ?, ?)',
    [creatorId, typeDifficultyId, title, baseScore]
  );
  return result.insertId;
};

// 파티 상태 업데이트
const updateStatus = async (partyId, status) => {
  await db.query('UPDATE table_parties SET status = ? WHERE id = ?', [status, partyId]);
};

// 파티 제목 업데이트
const updateTitle = async (partyId, title) => {
  await db.query('UPDATE table_parties SET title = ? WHERE id = ?', [title, partyId]);
};

// 파티 홍보 시간 업데이트
const updatePromoteTime = async (partyId) => {
  await db.query('UPDATE table_parties SET last_promote_time = CURRENT_TIMESTAMP WHERE id = ?', [partyId]);
};

// 파티 멤버 추가
const addMember = async (partyId, userId, characterId) => {
  await db.query(
    'INSERT INTO party_members (party_id, user_id, character_id) VALUES (?, ?, ?)',
    [partyId, userId, characterId]
  );
};

// 파티 멤버 수 조회
const getMemberCount = async (partyId) => {
  const [rows] = await db.query('SELECT COUNT(*) AS count FROM party_members WHERE party_id = ?', [partyId]);
  return rows[0].count;
};

// 특정 유저가 특정 파티에 가입되어 있는지 확인
const findMember = async (partyId, userId) => {
  const [rows] = await db.query('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, userId]);
  return rows[0];
};

// 파티 멤버 전원 조회 (유저 및 캐릭터 포함)
const findMembersByPartyId = async (partyId) => {
  const query = `
    SELECT m.user_id, c.id AS character_id, c.character_type
    FROM party_members m
    LEFT JOIN user_characters c ON m.character_id = c.id
    WHERE m.party_id = ?
  `;
  const [rows] = await db.query(query, [partyId]);
  return rows;
};

// 파티 멤버 제거 (탈퇴 및 추방)
const removeMember = async (partyId, userId) => {
  await db.query('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, userId]);
};

// 유저의 메인 캐릭터에 점수 적립
const addScoreToMainCharacter = async (userId, score) => {
  await db.query(
    `UPDATE user_characters SET power = power + ? WHERE user_id = ? AND character_type = 'MAIN'`,
    [score, userId]
  );
  await db.query(
    `UPDATE users SET score = score + ?, total_score = total_score + ? WHERE id = ?`,
    [score, score, userId]
  );
};

// [트랜잭션용 추가] 커넥션을 이용한 파티 상태 업데이트
const updateStatusWithConnection = async (connection, partyId, status) => {
  await connection.query('UPDATE table_parties SET status = ? WHERE id = ?', [status, partyId]);
};

// [트랜잭션용 추가] 커넥션을 이용한 메인 캐릭터 및 유저 점수 적립
const addScoreToMainCharacterWithConnection = async (connection, userId, score) => {
  await connection.query(
    `UPDATE user_characters SET power = power + ? WHERE user_id = ? AND character_type = 'MAIN'`,
    [score, userId]
  );
  await connection.query(
    `UPDATE users SET score = score + ?, total_score = total_score + ? WHERE id = ?`,
    [score, score, userId]
  );
};

// ==========================================
// [어드민 마스터 데이터 관리 - CRUD]
// ==========================================

// 1. 파티 타입 (party_types) CRUD
const createPartyType = async (name, maxMembers) => {
  const [result] = await db.query(
    'INSERT INTO party_types (name, max_members) VALUES (?, ?)',
    [name, maxMembers]
  );
  return result.insertId;
};

const updatePartyType = async (id, name, maxMembers) => {
  await db.query(
    'UPDATE party_types SET name = ?, max_members = ? WHERE id = ?',
    [name, maxMembers, id]
  );
};

const deletePartyType = async (id) => {
  await db.query('DELETE FROM party_types WHERE id = ?', [id]);
};

// 2. 난이도 (difficulties) CRUD
const createDifficulty = async (name) => {
  const [result] = await db.query('INSERT INTO difficulties (name) VALUES (?)', [name]);
  return result.insertId;
};

const updateDifficulty = async (id, name) => {
  await db.query('UPDATE difficulties SET name = ? WHERE id = ?', [name, id]);
};

const deleteDifficulty = async (id) => {
  await db.query('DELETE FROM difficulties WHERE id = ?', [id]);
};

// 3. 타입-난이도 매핑 및 기본 점수 (party_type_difficulties) CRUD
const createTypeDifficultyMapping = async (partyTypeId, difficultyId, baseScore) => {
  const [result] = await db.query(
    'INSERT INTO party_type_difficulties (party_type_id, difficulty_id, base_score) VALUES (?, ?, ?)',
    [partyTypeId, difficultyId, baseScore]
  );
  return result.insertId;
};

const updateTypeDifficultyMapping = async (id, baseScore) => {
  // 주로 매핑 관계 자체를 바꾸기보다는 해당 조합의 '기본 점수'를 수정하므로 score 업데이트 기준
  await db.query(
    'UPDATE party_type_difficulties SET base_score = ? WHERE id = ?',
    [baseScore, id]
  );
};

const deleteTypeDifficultyMapping = async (id) => {
  await db.query('DELETE FROM party_type_difficulties WHERE id = ?', [id]);
};

/**
 * 특정 파티에 참여 중인 모든 멤버의 웹푸시 구독(디바이스) 및 캐릭터 닉네임 목록을 한방에 조회 (N+1 방지)
 * @param {number} partyId 
 */
const findSubscribersByPartyId = async (partyId) => {
  const query = `
    SELECT 
      s.id,
      s.user_id,
      s.endpoint,
      s.p256dh,
      s.auth,
      s.status,
      uc.nickname
    FROM party_members pm
    INNER JOIN subscriptions s ON pm.user_id = s.user_id
    LEFT JOIN user_characters uc ON pm.character_id = uc.id
    WHERE pm.party_id = ? AND s.status IN ('ACTIVE', 'UNSUBSCRIBED')
  `;
  const [rows] = await db.query(query, [partyId]);
  return rows;
};


module.exports = {
  findPartyMeta,
  findMetaById,
  findAllActiveParties,
  findDetailById,
  findById,
  create,
  updateStatus,
  updateTitle,
  updatePromoteTime,
  addMember,
  getMemberCount,
  findMember,
  findMembersByPartyId,
  removeMember,
  addScoreToMainCharacter,
  updateStatusWithConnection,
  addScoreToMainCharacterWithConnection,
  createPartyType,
  updatePartyType,
  deletePartyType,
  createDifficulty,
  updateDifficulty,
  deleteDifficulty,
  createTypeDifficultyMapping,
  updateTypeDifficultyMapping,
  deleteTypeDifficultyMapping
};