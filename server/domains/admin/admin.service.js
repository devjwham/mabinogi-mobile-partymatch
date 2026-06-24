const bcrypt = require('bcrypt');
const db = require('../../config/db');
const userRepository = require('../user/user.repository');
const partyRepository = require('../party/party.repository');

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = '1234';

// 1. 사용자 추가 (또는 BANNED 유저 복구)
const createUser = async (username) => {
  const existingUser = await userRepository.findByUsername(username);
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

  // 이미 존재하는데 BANNED 상태인 경우 -> 활성화 상태로 전환 후 비밀번호 및 iat 초기화
  if (existingUser) {
    if (existingUser.status === 'BANNED') {
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        
        await userRepository.reactivateUserWithConnection(connection, existingUser.id, hashedPassword);
        
        await connection.commit();
        return { userId: existingUser.id, username, status: 'ACTIVE', message: '차단된 계정을 복구 및 초기화했습니다.' };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } else {
      const err = new Error('이미 사용 중인 아이디입니다.');
      err.status = 400;
      throw err;
    }
  }

  // 완전 신규 유저 생성 흐름 (트랜잭션)
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 유저 생성
    const newUserId = await userRepository.createWithConnection(connection, username, hashedPassword);
    // 동일한 닉네임으로 MAIN 캐릭터 생성 (attack, power 0.00 기본값)
    await userRepository.createMainCharacterWithConnection(connection, newUserId, username);

    await connection.commit();
    return { userId: newUserId, username, status: 'ACTIVE' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 2. 사용자 비밀번호 초기화 ('1234' 변환 및 iat 갱신)
const resetPassword = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) {
    const err = new Error('존재하지 않는 유저입니다.');
    err.status = 404;
    throw err;
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
  await userRepository.updatePasswordAndIat(userId, hashedPassword);

  return { message: '비밀번호를 1234로 초기화했으며 iat를 갱신했습니다.' };
};

// 3. 사용자 삭제 (BANNED 상태 변경 및 구독 정보 제거)
const banUser = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) {
    const err = new Error('존재하지 않는 유저입니다.');
    err.status = 404;
    throw err;
  }

  // 상태 BANNED 처리 및 구독 테이블 연동 데이터 완전 삭제
  await userRepository.updateStatusToBanned(userId);
  await userRepository.deleteSubscriptionsByUserId(userId);

  return { message: '유저를 차단 처리하고 푸시 구독 정보를 전량 삭제했습니다.' };
};

// 4. 사용자 리스트 (ACTIVE 유저만 추출)
const getActiveUsers = async () => {
  return await userRepository.findAllActiveUsers();
};

// 5. 아이디 변경 (유저네임 수정 및 MAIN 캐릭터 닉네임 동기화)
const changeUsername = async (userId, newUsername) => {
  const user = await userRepository.findById(userId);
  if (!user) {
    const err = new Error('존재하지 않는 유저입니다.');
    err.status = 404;
    throw err;
  }

  // 변경하려는 아이디가 중복되는지 검증
  const duplicateUser = await userRepository.findByUsername(newUsername);
  if (duplicateUser && duplicateUser.id !== userId) {
    const err = new Error('이미 사용 중인 아이디입니다.');
    err.status = 400;
    throw err;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1) Users 테이블 username 업데이트
    await userRepository.updateUsernameWithConnection(connection, userId, newUsername);
    // 2) User_characters 테이블 MAIN 캐릭터 nickname 업데이트
    await userRepository.updateMainCharacterNicknameWithConnection(connection, userId, newUsername);

    await connection.commit();
    return { userId, updatedUsername: newUsername };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 6. 관리자 전용 파티 강제 삭제 (STARTED 상태 대응 포함)
const forceDeleteParty = async (partyId) => {
  // 컴포넌트 간 비즈니스 정합성을 위해 partyService에 위임하여 처리
  return await partyService.forceDeletePartyByAdmin(partyId);
};

// 파티 종류,난이도 관리
// 1. 파티 타입 관리
const addPartyType = async (name, maxMembers) => {
  if (!name || !maxMembers) {
    const err = new Error('파티 종류명과 최대 정원을 정확히 입력해 주세요.');
    err.status = 400;
    throw err;
  }
  const id = await partyRepository.createPartyType(name, maxMembers);
  return { id, name, maxMembers };
};

const modifyPartyType = async (id, name, maxMembers) => {
  await partyRepository.updatePartyType(id, name, maxMembers);
  return { id, name, maxMembers };
};

const removePartyType = async (id) => {
  try {
    await partyRepository.deletePartyType(id);
    return { message: '파티 종류 마스터 데이터를 삭제했습니다.' };
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      const err = new Error('해당 타입을 참조하고 있는 매핑 데이터가 존재하여 삭제할 수 없습니다.');
      err.status = 400;
      throw err;
    }
    throw error;
  }
};

// 2. 난이도 관리
const addDifficulty = async (name) => {
  if (!name) {
    const err = new Error('난이도명을 입력해 주세요.');
    err.status = 400;
    throw err;
  }
  const id = await partyRepository.createDifficulty(name);
  return { id, name };
};

const modifyDifficulty = async (id, name) => {
  await partyRepository.updateDifficulty(id, name);
  return { id, name };
};

const removeDifficulty = async (id) => {
  try {
    await partyRepository.deleteDifficulty(id);
    return { message: '난이도 마스터 데이터를 삭제했습니다.' };
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      const err = new Error('해당 난이도를 참조하고 있는 매핑 데이터가 존재하여 삭제할 수 없습니다.');
      err.status = 400;
      throw err;
    }
    throw error;
  }
};

// 3. 매핑 및 기본 점수 관리
const addTypeDifficultyMapping = async (partyTypeId, difficultyId, baseScore) => {
  if (!partyTypeId || !difficultyId || baseScore === undefined) {
    const err = new Error('파티타입 ID, 난이도 ID, 기본 점수를 모두 입력해 주세요.');
    err.status = 400;
    throw err;
  }
  
  try {
    const id = await partyRepository.createTypeDifficultyMapping(partyTypeId, difficultyId, baseScore);
    return { id, partyTypeId, difficultyId, baseScore };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const err = new Error('이미 존재하는 파티 종류와 난이도 조합입니다.');
      err.status = 400;
      throw err;
    }
    throw error;
  }
};

const modifyTypeDifficultyMapping = async (id, baseScore) => {
  if (baseScore === undefined) {
    const err = new Error('수정할 기본 점수를 입력해 주세요.');
    err.status = 400;
    throw err;
  }
  await partyRepository.updateTypeDifficultyMapping(id, baseScore);
  return { id, updatedBaseScore: baseScore };
};

const removeTypeDifficultyMapping = async (id) => {
  await partyRepository.deleteTypeDifficultyMapping(id);
  return { message: '파티 메타 매핑 데이터를 삭제했습니다.' };
};

module.exports = {
  createUser,
  resetPassword,
  banUser,
  getActiveUsers,
  changeUsername,
  forceDeleteParty,
  addPartyType,
  modifyPartyType,
  removePartyType,
  addDifficulty,
  modifyDifficulty,
  removeDifficulty,
  addTypeDifficultyMapping,
  modifyTypeDifficultyMapping,
  removeTypeDifficultyMapping
};