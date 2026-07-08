const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const { checkLogin } = require('../../middlewares/auth.middleware');

// 모든 캐릭터 관련 API는 로그인 검증(checkLogin)을 거칩니다.
router.use(checkLogin);

router.get('/characters', userController.getCharacters);
router.post('/characters', userController.createCharacter);
router.put('/characters/:characterId/metadata', userController.updateCharacterMetadata);
router.patch('/characters/:characterId/class', userController.updateCharacterClass);
router.delete('/characters/:characterId', userController.deleteCharacter);
router.patch('/password', userController.updatePassword);
router.get('/rankings/monthly', userController.getMonthlyRankings);

module.exports = router;