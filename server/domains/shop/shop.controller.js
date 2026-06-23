const shopService = require('./shop.service');

const getShopList = async (req, res, next) => {
    try {
        const userId = req.user.id; // 미들웨어에서 넣어준 정보 (user.id)
        const shopList = await shopService.getShopList(userId);
        return res.status(200).json(shopList);
    } catch (error) {
        next(error);
    }
};

const purchaseItem = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { itemId } = req.body;

        if (!itemId) return res.status(400).json({ message: 'itemId가 필요합니다.' });

        const result = await shopService.purchaseItem(userId, itemId);
        return res.status(201).json({ message: '구매가 완료되었습니다.', data: result });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
};

const toggleEquipItem = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { inventoryId } = req.body;

        if (!inventoryId) return res.status(400).json({ message: 'inventoryId가 필요합니다.' });

        const result = await shopService.toggleEquipItem(userId, inventoryId);
        return res.status(200).json({ message: '장착 상태가 변경되었습니다.', data: result });
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.message });
    }
};

module.exports = {
    getShopList,
    purchaseItem,
    toggleEquipItem
};