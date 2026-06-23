const db = require('../../config/db');

// 1번 기능: 상점 리스트 전용 쿼리 (타입 텍스트 포함, 보유/장착 여부 같이보내기)
const findShopListWithUserStatus = async (userId) => {
    const query = `
        SELECT 
            di.id AS itemId,
            di.name,
            di.price,
            di.is_shop_item AS isShopItem,
            di.default_duration_days AS defaultDurationDays,
            dit.type AS itemType,
            IF(ui.id IS NOT NULL, 1, 0) AS isOwned,
            IFNULL(ui.is_equipped, 0) AS isEquipped,
            ui.id AS inventoryId,
            ui.expiry_date AS expiryDate
        FROM decoration_items di
        JOIN decoration_item_types dit ON di.item_type_id = dit.id
        LEFT JOIN users_inventory ui ON di.id = ui.item_id AND ui.user_id = ?
    `;
    const [rows] = await db.query(query, [userId]);
    return rows;
};

const findItemById = async (id) => {
    const [rows] = await db.query('SELECT * FROM decoration_items WHERE id = ?', [id]);
    return rows[0];
};

const checkUserOwnsItem = async (userId, itemId) => {
    const [rows] = await db.query('SELECT id FROM users_inventory WHERE user_id = ? AND item_id = ?', [userId, itemId]);
    return rows.length > 0;
};

const findInventoryByIdAndUserId = async (id, userId) => {
    const query = `
        SELECT ui.*, di.item_type_id 
        FROM users_inventory ui
        JOIN decoration_items di ON ui.item_id = di.id
        WHERE ui.id = ? AND ui.user_id = ?
    `;
    const [rows] = await db.query(query, [id, userId]);
    return rows[0];
};

// 트랜잭션용 인벤토리 추가
const insertInventoryTx = async (connection, userId, itemId, expiryDate) => {
    const [result] = await connection.query(
        'INSERT INTO users_inventory (user_id, item_id, expiry_date) VALUES (?, ?, ?)',
        [userId, itemId, expiryDate]
    );
    return result.insertId;
};

// 트랜잭션용 장착 상태 업데이트
const updateEquipStatusTx = async (connection, inventoryId, status) => {
    await connection.query('UPDATE users_inventory SET is_equipped = ? WHERE id = ?', [status, inventoryId]);
};

// 트랜잭션용 특정 타입 아이템 전체 해제
const clearEquipStatusByTypeTx = async (connection, userId, itemTypeId) => {
    const query = `
        UPDATE users_inventory ui
        JOIN decoration_items di ON ui.item_id = di.id
        SET ui.is_equipped = 0
        WHERE ui.user_id = ? AND di.item_type_id = ?
    `;
    await connection.query(query, [userId, itemTypeId]);
};

// 지연 평가용: 특정 유저의 만료 아이템 삭제
const deleteExpiredItemsByUserId = async (userId) => {
    await db.query('DELETE FROM users_inventory WHERE user_id = ? AND expiry_date < NOW()', [userId]);
};

// 서버 스케줄러용: 전체 테이블에서 만료 아이템 삭제
const deleteAllExpiredItems = async () => {
    const [result] = await db.query('DELETE FROM users_inventory WHERE expiry_date < NOW()');
    return result.affectedRows;
};

//  파티 정보 보내줄 때 같이보낼 유저별 장착 템 조회 함수
const findEquippedItemsByUserId = async (userId) => {
    const query = `
        SELECT di.name, dit.type AS itemType
        FROM users_inventory ui
        JOIN decoration_items di ON ui.item_id = di.id
        JOIN decoration_item_types dit ON di.item_type_id = dit.id
        WHERE ui.user_id = ? AND ui.is_equipped = 1
    `;
    const [rows] = await db.query(query, [userId]);
    return rows; // 예: [{ name: 'dragon-slayer', itemType: 'TITLE' }, ...]
};

module.exports = {
    findShopListWithUserStatus,
    findItemById,
    checkUserOwnsItem,
    findInventoryByIdAndUserId,
    insertInventoryTx,
    updateEquipStatusTx,
    clearEquipStatusByTypeTx,
    deleteExpiredItemsByUserId,
    deleteAllExpiredItems,
    findEquippedItemsByUserId
};