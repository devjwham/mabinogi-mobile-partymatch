const db = require('../../config/db');

// 특정 유저의 전체 구독 정보 조회 (FAILED 제외 혹은 전체 조회 후 서비스에서 필터링 가능)
const findAllByUserId = async (userId) => {
  const [rows] = await db.query(
    'SELECT id, endpoint, browser_name, os_name, status, created_at FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows;
};

// 엔드포인트 고유 단건 조회 (기기 중복 체크 및 계정 이전 확인용)
const findByEndpoint = async (endpoint) => {
  const [rows] = await db.query('SELECT * FROM subscriptions WHERE endpoint = ?', [endpoint]);
  return rows[0];
};

// [트랜잭션용] 타 계정에 선점된 엔드포인트 물리 삭제 (소유권 이전)
const deleteByEndpointWithConnection = async (connection, endpoint) => {
  await connection.query('DELETE FROM subscriptions WHERE endpoint = ?', [endpoint]);
};

// [트랜잭션용] 구독 생성 또는 갱신 (Upsert)
const upsertSubscriptionWithConnection = async (connection, { userId, endpoint, p256dh, auth, browserName, osName, userAgent }) => {
  const query = `
    INSERT INTO subscriptions (user_id, endpoint, p256dh, auth, browser_name, os_name, user_agent, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      p256dh = VALUES(p256dh),
      auth = VALUES(auth),
      browser_name = VALUES(browser_name),
      os_name = VALUES(os_name),
      user_agent = VALUES(user_agent),
      status = 'ACTIVE'
  `;
  const [result] = await connection.query(query, [userId, endpoint, p256dh, auth, browserName, osName, userAgent]);
  return result.insertId;
};

// 구독 상태 업데이트 (토글용 및 발송 실패 실패처리용)
const updateStatus = async (id, userId, status) => {
  const [result] = await db.query(
    'UPDATE subscriptions SET status = ? WHERE id = ? AND user_id = ?',
    [status, id, userId]
  );
  return result.affectedRows > 0;
};

// 구독 정보 단건 물리 삭제
const deleteByIdAndUserId = async (id, userId) => {
  const [result] = await db.query(
    'DELETE FROM subscriptions WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.affectedRows > 0;
};

module.exports = {
  findAllByUserId,
  findByEndpoint,
  deleteByEndpointWithConnection,
  upsertSubscriptionWithConnection,
  updateStatus,
  deleteByIdAndUserId
};