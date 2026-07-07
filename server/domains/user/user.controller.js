const userService = require('./user.service');
const bcrypt = require('bcrypt');

const getCharacters = async (req, res) => {
  try {
    const { userId } = req.user; // auth.middleware에서 주입된 정보
    const characters = await userService.getCharactersByUserId(userId);
    return res.status(200).json({ success: true, data: characters });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const createCharacter = async (req, res) => {
  try {
    const { userId } = req.user;
    // 1. req.body에서 power를 추가로 구조 분해 할당합니다.
    const { nickname, characterClass, power } = req.body;

    // 2. 닉네임과 전투력(power)이 모두 존재하는지 체크 (power가 0일 수도 있으므로 엄격하게 검사)
    if (!nickname || power === undefined) {
      return res.status(400).json({ success: false, message: '닉네임과 전투력(power)은 필수입니다.' });
    }

    // 3. 넘어온 power가 올바른 숫자인지 검증
    if (isNaN(power) || Number(power) < 0) {
      return res.status(400).json({ success: false, message: '올바른 전투력 수치를 입력해주세요.' });
    }

    // 4. 서비스 레이어로 power를 함께 넘겨줍니다.
    const newCharacter = await userService.createCharacter(userId, nickname, characterClass, Number(power));
    return res.status(201).json({ success: true, data: newCharacter });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateCharacterMetadata = async (req, res) => {
  try {
    const { userId } = req.user;
    const { characterId } = req.params;
    const { nickname, power } = req.body;

    if (!nickname || power === undefined) {
      return res.status(400).json({ success: false, message: '닉네임과 전투력 정보가 필요합니다.' });
    }

    const updatedCharacter = await userService.updateMetadata(userId, characterId, nickname, power);
    return res.status(200).json({ success: true, data: updatedCharacter });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const updateCharacterClass = async (req, res) => {
  try {
    const { userId } = req.user;
    const { characterId } = req.params;
    const { characterClass } = req.body;

    if (!['attack', 'support'].includes(characterClass)) {
      return res.status(400).json({ success: false, message: '클래스는 attack 또는 support만 가능합니다.' });
    }

    const updatedCharacter = await userService.updateClass(userId, characterId, characterClass);
    return res.status(200).json({ success: true, data: updatedCharacter });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

const deleteCharacter = async (req, res) => {
  try {
    const { userId } = req.user;
    const { characterId } = req.params;

    const result = await userService.removeCharacter(userId, characterId);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};
const updatePassword = async (req, res) => {
  try {
    const { userId } = req.user; // 토큰에서 추출된 유저 고유 ID
    const { oldPassword, newPassword } = req.body;

    // 1. 필수 파라미터 검증
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '기존 비밀번호와 새 비밀번호를 모두 입력해주세요.' });
    }

    // 2. 최소한의 글자 수나 조건 검증 (필요시 조절)
    if (newPassword.length < 4) {
      return res.status(400).json({ success: false, message: '새 비밀번호는 4자리 이상이어야 합니다.' });
    }

    // 3. 서비스 레이어 호출
    await userService.changePassword(userId, oldPassword, newPassword);

    return res.status(200).json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getCharacters,
  createCharacter,
  updateCharacterMetadata,
  updateCharacterClass,
  deleteCharacter,
  updatePassword
};