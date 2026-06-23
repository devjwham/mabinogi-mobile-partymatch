const express = require('express');
const router = express.Router();
const partyController = require('./party.controller');
const { checkLogin } = require('../../middlewares/auth.middleware');

// 🌟 요구사항 반영: 모든 엔드포인트에 전역 로그인 상태 체크 강제 적용
router.use(checkLogin);

/**
 * 🛣️ RESTful 명세 규격에 맞춤 라우팅 구조
 */

// 마스터 메타 정보 조회 및 전체 활성 파티 목록 가져오기
router.get('/meta', partyController.getPartyMeta);
router.get('/', partyController.getActiveParties);

// 파티 기본 CRUD 연동 및 제어 명령군
router.post('/', partyController.createParty);
router.delete('/:partyId', partyController.deleteParty); // Soft delete (EXPIRED 상태 전이)
router.patch('/:partyId/title', partyController.changePartyTitle);
router.post('/:partyId/promote', partyController.promoteParty);

// 파티 룸 트랜잭션 흐름 (출발 / 출발복구)
router.post('/:partyId/start', partyController.startParty);
router.post('/:partyId/back', partyController.backParty);

// 파티 멤버쉽 매칭 기능군
router.post('/:partyId/join', partyController.joinParty);
router.delete('/:partyId/leave', partyController.leaveParty);
router.delete('/:partyId/kick', partyController.kickMember); // 원칙적 매핑 리소스 해제는 delete

module.exports = router;