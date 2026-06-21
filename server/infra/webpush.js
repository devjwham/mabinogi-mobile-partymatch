// infra/webpush.js
const webpush = require("web-push");

let isInitialized = false;

module.exports = {
  /**
   * 서버 시작 시 VAPID 키를 설정하여 웹푸시 모듈을 초기화합니다.
   */
  init: () => {
    const subject = process.env.VAPID_SUBJECT;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    // 환경 변수 누락 체크 (안전망)
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
   * 특정 유저의 구독 정보로 푸시 알림을 발송합니다.
   * @param {Object} subscription - DB에서 조회한 subscriptions 테이블 레코드
   * @param {Object} payload - 알림 내용 (title, body, url 등)
   */
  sendNotification: async (subscription, payload) => {
    if (!isInitialized) {
      throw new Error("❌ 웹푸시 인프라가 초기화되지 않았습니다. server.js를 확인하세요.");
    }

    // 💡 DB 테이블 구조(endpoint, p256dh, auth)를 web-push 라이브러리 규격에 맞게 매핑
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
      // ⚠️ 만약 사용자가 알림을 차단했거나 만료된 구독인 경우 (HTTP 410 Gone 등)
      // 이 에러 객체를 리턴해서 서비스 레이어에서 테이블의 status를 'FAILED'나 'UNSUBSCRIBED'로 바꾸게 유도
      console.error(`❌ 푸시 발송 실패 (구독 ID: ${subscription.id}):`, err.statusCode || err.message);
      return { success: false, statusCode: err.statusCode, error: err.message };
    }
  }
};