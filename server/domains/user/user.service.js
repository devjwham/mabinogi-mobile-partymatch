const userRepository = require('./user.repository');
const bcrypt = require('bcrypt');

const getCharactersByUserId = async (userId) => {
    return await userRepository.findAllByUserId(userId);
};

const createCharacter = async (userId, nickname, characterClass, power) => {
    const finalClass = characterClass || 'attack';
    return await userRepository.create(userId, nickname, finalClass, power);
};

const updateMetadata = async (userId, characterId, nickname, power) => {
    const character = await userRepository.findByIdAndUserId(characterId, userId);
    if (!character) {
        const err = new Error('해당 캐릭터를 찾을 수 없거나 권한이 없습니다.');
        err.status = 404;
        throw err;
    }

    await userRepository.updateMetadata(characterId, nickname, power);
    return { id: characterId, nickname, power };
};

const updateClass = async (userId, characterId, characterClass) => {
    const character = await userRepository.findByIdAndUserId(characterId, userId);
    if (!character) {
        const err = new Error('해당 캐릭터를 찾을 수 없거나 권한이 없습니다.');
        err.status = 404;
        throw err;
    }

    await userRepository.updateClass(characterId, characterClass);
    return { id: characterId, character_class: characterClass };
};

const removeCharacter = async (userId, characterId) => {
    const character = await userRepository.findByIdAndUserId(characterId, userId);
    if (!character) {
        const err = new Error('해당 캐릭터를 찾을 수 없거나 권한이 없습니다.');
        err.status = 404;
        throw err;
    }

    // 대표 캐릭터('MAIN')는 삭제 불가능하도록 검증
    if (character.character_type === 'MAIN') {
        const err = new Error('메인 캐릭터는 삭제할 수 없습니다. 부캐릭터만 삭제 가능합니다.');
        err.status = 400;
        throw err;
    }

    await userRepository.deleteById(characterId);
    return { id: characterId, message: '캐릭터가 성공적으로 삭제되었습니다.' };
};

const changePassword = async (userId, oldPassword, newPassword) => {
    // 1. 유저 정보 조회 (비밀번호 해시값을 가져오기 위함)
    const user = await userRepository.findById(userId);
    if (!user) {
        const err = new Error('존재하지 않는 유저입니다.');
        err.status = 404;
        throw err;
    }

    // 2. 기존 비밀번호 일치 여부 검증
    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
        const err = new Error('기존 비밀번호가 일치하지 않습니다.');
        err.status = 400;
        throw err;
    }

    // 3. 기존 비밀번호와 새 비밀번호가 동일한지 검증 (선택 사항)
    if (oldPassword === newPassword) {
        const err = new Error('기존 비밀번호와 다른 새 비밀번호를 입력해주세요.');
        err.status = 400;
        throw err;
    }

    // 4. 새 비밀번호 해싱 및 저장 (Salt 10 기준)
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await userRepository.updatePasswordAndIat(userId, newPasswordHash);

    return true;
};

const getMonthlyRankings = async () => {
    // 리포지토리에서 ACTIVE 유저들의 스코어 내림차순 데이터를 받아옵니다.
    const rankings = await userRepository.findMonthlyRankings();
    return rankings;
};

module.exports = {
    getCharactersByUserId,
    createCharacter,
    updateMetadata,
    updateClass,
    removeCharacter,
    changePassword,
    getMonthlyRankings,
};