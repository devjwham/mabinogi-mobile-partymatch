const webpushRepository = require('./webpush.repository');
const webpushInfra = require('../../infra/webpush'); // 인프라 파일 경로에 맞게 수정
const db = require('../../config/db');

// [내부 헬퍼 함수] 단건 발송 결과에 따른 FAILED 상태 자동 변경 추적기
const handleSendResult = async (subscription, payload) => {
  const res = await webpushInfra.sendNotification(subscription, payload);
  
  // 구글/애플 서버단에서 구독이 완전히 짤린 상태(410 Gone, 404 Not Found 등) 감지 시
  if (!res.success && (res.statusCode === 410 || res.statusCode === 404)) {
    console.warn(`[🚨 구독 유효성 만료] 구독 ID ${subscription.id} 번을 FAILED 상태로 강제 전환합니다.`);
    // 레포지토리의 updateStatus 연동
    await webpushRepository.updateStatus(subscription.id, subscription.user_id, 'FAILED');
  }
  return res;
};

// 1. 유저의 구독 리스트 전체 가져오기
const getSubscriptions = async (userId) => {
  return await webpushRepository.findAllByUserId(userId);
};

// 2. 현재 기기(Endpoint) 등록 상태 확인
const checkDeviceRegistration = async (userId, endpoint) => {
  const subscription = await webpushRepository.findByEndpoint(endpoint);
  if (!subscription) return { registered: false, status: null };
  if (subscription.user_id === userId) return { registered: true, status: subscription.status };
  return { registered: false, status: 'OWNED_BY_OTHER' };
};

// 3. 구독 정보 등록 및 첫 환영 푸시 발송 (Upsert)
const registerSubscription = async (userId, subscriptionData) => {
  const { endpoint } = subscriptionData;
  const existing = await webpushRepository.findByEndpoint(endpoint);
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    if (existing && existing.user_id !== userId) {
      await webpushRepository.deleteByEndpointWithConnection(connection, endpoint);
    }

    await webpushRepository.upsertSubscriptionWithConnection(connection, {
      userId,
      ...subscriptionData
    });

    await connection.commit();

    // 🌟 성공 즉시 기기에 첫 환영 푸시 동기 발송 처리
    const newlyCreated = await webpushRepository.findByEndpoint(endpoint);
    if (newlyCreated) {
      await handleSendResult(newlyCreated, {
        title: "알림 등록 완료 🔔",
        body: "푸시 알림 등록이 정상적으로 이루어졌습니다. 이제부터 푸시 알림을 받습니다.",
        url: "/mypage" // 실제 서비스 메인 또는 마이페이지 경로 지정
      });
    }

    return { message: '구독 정보가 성공적으로 등록/갱신 되었습니다.' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 4. 알림 상태 토글 및 ON 복구 시 알림 재발송
const toggleSubscriptionStatus = async (userId, subscriptionId) => {
  const userSubs = await webpushRepository.findAllByUserId(userId);
  // 엔드포인트 조회를 위해 원본 레코드를 탐색 (레포지토리가 상태값을 포함해 반환하므로 가능)
  const target = userSubs.find(sub => sub.id === subscriptionId);

  if (!target) {
    const err = new Error('해당 구독 정보를 찾을 수 없거나 권한이 없습니다.');
    err.status = 404;
    throw err;
  }

  const nextStatus = (target.status === 'ACTIVE') ? 'UNSUBSCRIBED' : 'ACTIVE';
  await webpushRepository.updateStatus(subscriptionId, userId, nextStatus);

  // 🌟 사용자가 알림을 끈 상태에서 다시 켰을(ACTIVE) 때 확인 알림 발송
  if (nextStatus === 'ACTIVE') {
    // 갱신된 완벽한 규격 조회를 위해 단건 재확보
    const updatedTarget = await webpushRepository.findByEndpoint(target.endpoint);
    if (updatedTarget) {
      await handleSendResult(updatedTarget, {
        title: "알림 재활성화 완료 🟢",
        body: "푸시 알림 등록이 정상적으로 이루어졌습니다. 이제부터 푸시 알림을 받습니다."
      });
    }
  }

  return { id: subscriptionId, newState: nextStatus };
};

// 5. 알림 영구 삭제
const removeSubscription = async (userId, subscriptionId) => {
  const isDeleted = await webpushRepository.deleteByIdAndUserId(subscriptionId, userId);
  if (!isDeleted) {
    const err = new Error('삭제할 구독 정보가 없거나 권한이 없습니다.');
    err.status = 404;
    throw err;
  }
  return { id: subscriptionId, message: '구독 정보가 완전히 삭제되었습니다.' };
};


/* ==========================================================================
   📢 비즈니스 도메인 확장용 글로벌 발송 엔진 인터페이스 (파티 등에서 가져다 쓸 기능)
   ========================================================================== */

/**
 * [기능 A] ACTIVE(알림이 켜진 유저)에게만 보내는 일반 알림 발송 함수
 * @param {number} userId - 수신 대상자 ID
 * @param {Object} payload - { title, body, url }
 */
const sendNotificationToActiveOnly = async (userId, payload) => {
  const subscriptions = await webpushRepository.findAllByUserId(userId);
  const activeSubs = subscriptions.filter(sub => sub.status === 'ACTIVE');

  // 병렬 구조로 안전하게 처리하되 각 결과 루프에서 FAILED 핸들러 가동
  await Promise.all(activeSubs.map(sub => handleSendResult(sub, payload)));
};

/**
 * [기능 B] UNSUBSCRIBED(알림 거부) 상태여도 무시하고 강제로 전송하는 파티 필수 알림 함수
 * (단, FAILED 상태인 만료된 기기는 하드웨어 차단 상태이므로 제외)
 * @param {number} userId - 수신 대상자 ID
 * @param {Object} payload - { title, body, url }
 */
const sendNotificationForce = async (userId, payload) => {
  const subscriptions = await webpushRepository.findAllByUserId(userId);
  // ACTIVE 및 UNSUBSCRIBED 둘 다 포함
  const validSubs = subscriptions.filter(sub => sub.status === 'ACTIVE' || sub.status === 'UNSUBSCRIBED');

  await Promise.all(validSubs.map(sub => handleSendResult(sub, payload)));
};


module.exports = {
  getSubscriptions,
  checkDeviceRegistration,
  registerSubscription,
  toggleSubscriptionStatus,
  removeSubscription,
  sendNotificationToActiveOnly,
  sendNotificationForce
};