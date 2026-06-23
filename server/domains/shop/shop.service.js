const shopRepository = require('./shop.repository');
const userRepository = require('../user/user.repository');
const db = require('../../config/db');

const getShopList = async (userId) => {
    // 1. 해당 유저의 만료된 아이템 먼저 제거 (지연 평가 로직)
    await shopRepository.deleteExpiredItemsByUserId(userId);

    // 2. 전체 상점 아이템 리스트 + 유저의 보유 및 장착 현황 통합 조회
    return await shopRepository.findShopListWithUserStatus(userId);
};

const purchaseItem = async (userId, itemId) => {
    // 1. 아이템 정보 검증 (상점 판매용인지 체크)
    const item = await shopRepository.findItemById(itemId);
    if (!item) {
        const err = new Error('존재하지 않는 아이템입니다.');
        err.status = 404;
        throw err;
    }
    if (item.is_shop_item !== 1) {
        const err = new Error('상점에서 판매하는 아이템이 아닙니다.');
        err.status = 403;
        throw err;
    }

    // 2. 이미 보유 중인지 체크
    const isOwned = await shopRepository.checkUserOwnsItem(userId, itemId);
    if (isOwned) {
        const err = new Error('이미 보유 중인 아이템입니다.');
        err.status = 400;
        throw err;
    }

    // 3. 유저의 total_score 조회 및 차감 검증
    const user = await userRepository.findAllByUserId(userId); // 기존 유저 리포지토리 메서드 활용 가정
    if (!user || user.total_score < item.price) {
        const err = new Error('누적 점수(total_score)가 부족합니다.');
        err.status = 400;
        throw err;
    }

    // 4. 구매 트랜잭션 진행 (재화 차감 & 인벤토리 추가)
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // total_score 차감 (score는 건들지 않음)
        await connection.query('UPDATE users SET total_score = total_score - ? WHERE id = ?', [item.price, userId]);

        // 만료일 계산
        let expiryDate = null;
        if (item.default_duration_days !== null) {
            const now = new Date();
            now.setDate(now.getDate() + item.default_duration_days);
            expiryDate = now;
        }

        // 인벤토리 발급
        const insertId = await shopRepository.insertInventoryTx(connection, userId, itemId, expiryDate);

        await connection.commit();
        return { inventoryId: insertId, itemId, expiryDate };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

const toggleEquipItem = async (userId, inventoryId) => {
    const inventory = await shopRepository.findInventoryByIdAndUserId(inventoryId, userId);
    if (!inventory) {
        const err = new Error('보유하고 있지 않거나 만료된 아이템입니다.');
        err.status = 404;
        throw err;
    }

    const currentStatus = inventory.is_equipped;
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        if (currentStatus === 1) {
            // 현재 장착 중이면 -> 단순 해제
            await shopRepository.updateEquipStatusTx(connection, inventoryId, 0);
        } else {
            // 현재 미장착 중이면 -> 같은 타입 아이템 전부 해제 후 장착
            await shopRepository.clearEquipStatusByTypeTx(connection, userId, inventory.item_type_id);
            await shopRepository.updateEquipStatusTx(connection, inventoryId, 1);
        }

        await connection.commit();
        return { inventoryId, isEquipped: currentStatus === 1 ? 0 : 1 };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    getShopList,
    purchaseItem,
    toggleEquipItem
};