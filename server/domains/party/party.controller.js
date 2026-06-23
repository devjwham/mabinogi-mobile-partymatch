const partyService = require('./party.service');

const getPartyMeta = async (req, res) => {
  try {
    const metaData = await partyService.getPartyMeta();
    return res.status(200).json({ success: true, data: metaData });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const getActiveParties = async (req, res) => {
  try {
    const activeParties = await partyService.getActiveParties();
    return res.status(200).json({ success: true, data: activeParties });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const createParty = async (req, res) => {
  try {
    const { userId } = req.user; // 미들웨어 주입 정보 (user.id 매핑 데이터)
    const { typeDifficultyId, title, characterId } = req.body;

    if (!typeDifficultyId || !title || !characterId) {
      return res.status(400).json({ success: false, message: '파티 속성, 제목 및 참가할 대표 캐릭터 선택은 필수 사항입니다.' });
    }

    const newParty = await partyService.createParty(userId, typeDifficultyId, title, characterId);
    return res.status(201).json({ success: true, data: newParty });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const startParty = async (req, res) => {
  try {
    const { userId } = req.user;
    const { partyId } = req.params;

    const result = await partyService.startParty(userId, Number(partyId));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const backParty = async (req, res) => {
  try {
    const { userId } = req.user;
    const { partyId } = req.params;

    const result = await partyService.backParty(userId, Number(partyId));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const joinParty = async (req, res) => {
  try {
    const { userId } = req.user;
    const { partyId } = req.params;
    const { characterId } = req.body;

    if (!characterId) {
      return res.status(400).json({ success: false, message: '파티에 참여할 캐릭터를 선택해야 합니다.' });
    }

    const result = await partyService.joinParty(userId, Number(partyId), characterId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const leaveParty = async (req, res) => {
  try {
    const { userId } = req.user;
    const { partyId } = req.params;

    const result = await partyService.leaveParty(userId, Number(partyId));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const kickMember = async (req, res) => {
  try {
    const { userId } = req.user;
    const { partyId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: '추방할 유저의 고유 ID가 누락되었습니다.' });
    }

    const result = await partyService.kickMember(userId, Number(partyId), Number(targetUserId));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const deleteParty = async (req, res) => {
  try {
    const { userId } = req.user;
    const { partyId } = req.params;

    const result = await partyService.deleteParty(userId, Number(partyId));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const changePartyTitle = async (req, res) => {
  try {
    const { userId } = req.user;
    const { partyId } = req.params;
    const { title } = req.body;

    const result = await partyService.changePartyTitle(userId, Number(partyId), title);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const promoteParty = async (req, res) => {
  try {
    const { userId } = req.user;
    const { partyId } = req.params;

    const result = await partyService.promoteParty(userId, Number(partyId));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getPartyMeta,
  getActiveParties,
  createParty,
  startParty,
  backParty,
  joinParty,
  leaveParty,
  kickMember,
  deleteParty,
  changePartyTitle,
  promoteParty
};