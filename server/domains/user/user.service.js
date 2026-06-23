const userRepository = require('./user.repository');

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


module.exports = {
    getCharactersByUserId,
    createCharacter,
    updateMetadata,
    updateClass,
    removeCharacter
};