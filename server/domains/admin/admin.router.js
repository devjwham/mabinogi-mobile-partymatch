const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const { checkLogin, checkAdmin } = require('../../middlewares/auth.middleware');

// 관리자 도메인의 모든 엔드포인트는 로그인 및 ADMIN 권한 검증을 전역 바인딩
router.use(checkLogin, checkAdmin);

router.post('/users', adminController.createUser);                 // 사용자 추가 (또는 복구)
router.patch('/users/:userId/password', adminController.resetPassword); // 사용자 비밀번호 초기화
router.delete('/users/:userId', adminController.banUser);           // 사용자 제재(삭제) 및 구독 해제
router.get('/users', adminController.getActiveUsers);              // 사용자 리스트 조회
router.patch('/users/:userId/username', adminController.changeUsername); // 사용자 아이디 및 닉네임 변경

router.delete('/party/:partyId', adminController.forceDeleteParty);

//파티 종류, 난이도 관리
// 1. 파티 종류 마스터 (ex: 보스 레이드, 인던, 전장 등)
router.post('/party-types', adminController.createPartyType);
router.put('/party-types/:id', adminController.updatePartyType);
router.delete('/party-types/:id', adminController.deletePartyType);

// 2. 난이도 마스터 (ex: Easy, Normal, Hard, Hell)
router.post('/difficulties', adminController.createDifficulty);
router.put('/difficulties/:id', adminController.updateDifficulty);
router.delete('/difficulties/:id', adminController.deleteDifficulty);

// 3. 파티 타입-난이도 결합 및 지급 점수 설정 매핑
router.post('/meta-mappings', adminController.createMetaMapping);
router.patch('/meta-mappings/:id', adminController.updateMetaMapping); // 점수 위주 변경이므로 PATCH 활용
router.delete('/meta-mappings/:id', adminController.deleteMetaMapping);

module.exports = router;