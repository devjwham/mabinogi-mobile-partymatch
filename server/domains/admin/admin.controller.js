const adminService = require('./admin.service');

const createUser = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || username.trim() === '') {
      return res.status(400).json({ success: false, message: '생성할 username을 입력해 주세요.' });
    }

    const result = await adminService.createUser(username.trim());
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await adminService.resetPassword(Number(userId));
    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await adminService.banUser(Number(userId));
    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const getActiveUsers = async (req, res) => {
  try {
    const users = await adminService.getActiveUsers();
    return res.status(200).json({ success: true, data: users });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const changeUsername = async (req, res) => {
  try {
    const { userId } = req.params;
    const { username } = req.body;

    if (!username || username.trim() === '') {
      return res.status(400).json({ success: false, message: '변경할 username을 입력해 주세요.' });
    }

    const result = await adminService.changeUsername(Number(userId), username.trim());
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const forceDeleteParty = async (req, res) => {
  try {
    const { partyId } = req.params;
    
    // 파티 서비스의 강제 삭제 로직 호출
    const result = await adminService.forceDeleteParty(Number(partyId));
    return res.status(200).json({ success: true, message: result.message, data: result.data });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// 1. 파티 타입 CRUD
const createPartyType = async (req, res) => {
  try {
    const { name, maxMembers } = req.body;
    const result = await adminService.addPartyType(name, Number(maxMembers));
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const updatePartyType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, maxMembers } = req.body;
    const result = await adminService.modifyPartyType(Number(id), name, Number(maxMembers));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const deletePartyType = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.removePartyType(Number(id));
    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// 2. 난이도 CRUD
const createDifficulty = async (req, res) => {
  try {
    const { name } = req.body;
    const result = await adminService.addDifficulty(name);
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const updateDifficulty = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const result = await adminService.modifyDifficulty(Number(id), name);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const deleteDifficulty = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.removeDifficulty(Number(id));
    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// 3. 타입-난이도 매핑 및 점수 설정 CRUD
const createMetaMapping = async (req, res) => {
  try {
    const { partyTypeId, difficultyId, baseScore } = req.body;
    const result = await adminService.addTypeDifficultyMapping(Number(partyTypeId), Number(difficultyId), Number(baseScore));
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const updateMetaMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const { baseScore } = req.body;
    const result = await adminService.modifyTypeDifficultyMapping(Number(id), Number(baseScore));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const deleteMetaMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.removeTypeDifficultyMapping(Number(id));
    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createUser,
  resetPassword,
  banUser,
  getActiveUsers,
  changeUsername,
  forceDeleteParty,
  createPartyType,
  updatePartyType,
  deletePartyType,
  createDifficulty,
  updateDifficulty,
  deleteDifficulty,
  createMetaMapping,
  updateMetaMapping,
  deleteMetaMapping
};