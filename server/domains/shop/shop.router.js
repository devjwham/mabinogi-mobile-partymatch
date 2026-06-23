const express = require('express');
const router = express.Router();
const shopController = require('./shop.controller');
const { checkLogin } = require('../../middlewares/auth.middleware');

// 모든 상점 API는 로그인 검증 미들웨어를 거침
router.use(checkLogin);

router.get('/', shopController.getShopList);
router.post('/purchase', shopController.purchaseItem);
router.patch('/toggle-equip', shopController.toggleEquipItem);

module.exports = router;