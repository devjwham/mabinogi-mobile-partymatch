const webpush = require("web-push");

let isInitialized = false;

module.exports = {
  init: () => {
    const subject = process.env.VAPID_SUBJECT;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!subject || !publicKey || !privateKey) {
      console.warn("⚠️ VAPID 환경 변수가 누락되었습니다. 웹푸시 발송이 제한될 수 있습니다.");
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      isInitialized = true;
      console.log("🔔 웹푸시(web-push) 인프라 초기화 완료");
    } catch (err) {
      console.error("❌ 웹푸시 초기화 실패:", err.message);
    }
  },

  /**
   * 특정 유저의 구독 정보 레코드로 실제 웹 서버에 푸시 알림을 발송합니다.
   * @param {Object} subscription - DB 'subscriptions' 테이블 행 개체 (id, endpoint, p256dh, auth 포함)
   * @param {Object} payload - { title, body, icon, url } 형태의 알림 오브젝트
   */
  sendNotification: async (subscription, payload) => {
    if (!isInitialized) {
      throw new Error("❌ 웹푸시 인프라가 초기화되지 않았습니다. server.js를 확인하세요.");
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    const payloadString = JSON.stringify(payload);

    try {
      const result = await webpush.sendNotification(pushSubscription, payloadString);
      return { success: true, result };
    } catch (err) {
      // 410 (Gone) 혹은 404 등 브라우저 만료/권한 차단 상태 코드를 상위 서비스로 리턴
      console.error(`❌ 푸시 발송 실패 (구독 ID: ${subscription.id}):`, err.statusCode || err.message);
      return { success: false, statusCode: err.statusCode, error: err.message };
    }
  }
};