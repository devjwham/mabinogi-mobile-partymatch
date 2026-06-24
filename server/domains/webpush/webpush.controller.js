const webpushService = require('./webpush.service');

// 1. 로그인한 유저의 기기 구독 리스트 가져오기
const getMySubscriptions = async (req, res) => {
  try {
    const { userId } = req.user;
    const data = await webpushService.getSubscriptions(userId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 2. 현재 브라우저 기기가 등록되어 있는지 체크
const checkCurrentDevice = async (req, res) => {
  try {
    const { userId } = req.user;
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ success: false, message: 'endpoint 식별 정보가 필요합니다.' });
    }

    const result = await webpushService.checkDeviceRegistration(userId, endpoint);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 3. 신규 구독 등록 및 갱신 (ACTIVE 복구)
const createOrUpdateSubscription = async (req, res) => {
  try {
    const { userId } = req.user;
    const { subscription, browserName, osName, userAgent } = req.body;

    // 기본 Web Schema 검증
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ success: false, message: '올바른 웹푸시 구독(Subscription) 객체 규격이 아닙니다.' });
    }

    const subscriptionData = {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      browserName: browserName || 'Unknown',
      osName: osName || 'Unknown',
      userAgent: userAgent || null
    };

    const result = await webpushService.registerSubscription(userId, subscriptionData);
    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// 4. 구독 알림 활성화 토글 (마이페이지 ON/OFF 버튼 연동용)
const toggleSubscription = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params; // subscription ID

    const result = await webpushService.toggleSubscriptionStatus(userId, Number(id));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// 5. 구독 정보 삭제
const deleteSubscription = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;

    const result = await webpushService.removeSubscription(userId, Number(id));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getMySubscriptions,
  checkCurrentDevice,
  createOrUpdateSubscription,
  toggleSubscription,
  deleteSubscription
};