const express = require('express');
const router = express.Router();
const webpushController = require('./webpush.controller');
const { checkLogin } = require('../../middlewares/auth.middleware');

// 모든 웹푸시 관련 API는 로그인 검증(checkLogin)을 거치도록 설계
router.use(checkLogin);

router.get('/subscriptions', webpushController.getMySubscriptions);      // 내 구독 기기 목록 조회
router.post('/check-device', webpushController.checkCurrentDevice);      // 현재 기기 등록 여부 체크
router.post('/register', webpushController.createOrUpdateSubscription);  // 신규 구독 등록 및 갱신 (Upsert)
router.patch('/toggle/:id', webpushController.toggleSubscription);       // 알림 On/Off 토글
router.delete('/subscriptions/:id', webpushController.deleteSubscription); // 구독 정보 삭제

module.exports = router;