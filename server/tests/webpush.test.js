// tests/webpush.test.js
const webpushModule = require("web-push");

// web-push 모듈 모킹
jest.mock("web-push");

describe("🔔 웹푸시(Web Push) 인프라 단위 테스트", () => {
  const originalEnv = process.env;
  let webpushInfra;

  beforeEach(() => {
    // 💡 테스트마다 모듈 캐시를 완전히 격리해서 파일 스코프 변수(isInitialized) 초기화
    jest.isolateModules(() => {
      webpushInfra = require("../infra/webpush");
    });
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("1. init() 초기화 테스트", () => {
    test("✅ VAPID 환경 변수가 모두 존재하면 정상적으로 초기화되어야 한다", () => {
      process.env.VAPID_SUBJECT = "mailto:test@example.com";
      process.env.VAPID_PUBLIC_KEY = "test_public_key";
      process.env.VAPID_PRIVATE_KEY = "test_private_key";

      webpushModule.setVapidDetails = jest.fn();

      webpushInfra.init();

      expect(webpushModule.setVapidDetails).toHaveBeenCalledWith(
        "mailto:test@example.com",
        "test_public_key",
        "test_private_key"
      );
    });

    test("⚠️ VAPID 환경 변수가 하나라도 누락되면 경고를 띄우고 초기화를 건너뛴다", () => {
      process.env.VAPID_SUBJECT = ""; 
      webpushModule.setVapidDetails = jest.fn();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      webpushInfra.init();

      expect(webpushModule.setVapidDetails).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("VAPID 환경 변수가 누락되었습니다")
      );
      warnSpy.mockRestore();
    });
  });

  describe("2. sendNotification() 발송 테스트", () => {
    const dummySubscription = {
      id: 7,
      endpoint: "https://fcm.googleapis.com/fcm/send/dummy_endpoint_123",
      p256dh: "dummy_p256dh_value",
      auth: "dummy_auth_value"
    };
    const dummyPayload = { title: "파티 매칭 완료!", body: "지금 확인해보세요." };

    test("❌ 초기화(init) 없이 발송을 시도하면 에러를 던져야 한다", async () => {
      // 일부러 init()을 안 부른 격리된 상태에서 바로 호출
      await expect(
        webpushInfra.sendNotification(dummySubscription, dummyPayload)
      ).rejects.toThrow("웹푸시 인프라가 초기화되지 않았습니다");
    });

    test("✅ 정상적인 구독 정보와 페이로드로 발송 성공 시 success: true를 반환한다", async () => {
      process.env.VAPID_SUBJECT = "mailto:test@example.com";
      process.env.VAPID_PUBLIC_KEY = "pub";
      process.env.VAPID_PRIVATE_KEY = "priv";
      webpushInfra.init();

      webpushModule.sendNotification.mockResolvedValue({ statusCode: 201, body: "success" });

      const response = await webpushInfra.sendNotification(dummySubscription, dummyPayload);

      expect(response.success).toBe(true);
      expect(webpushModule.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: dummySubscription.endpoint,
          keys: { p256dh: dummySubscription.p256dh, auth: dummySubscription.auth }
        },
        JSON.stringify(dummyPayload)
      );
    });

    test("⚠️ 구독이 만료되거나 차단(410 Gone 등)된 경우 success: false와 statusCode를 반환한다", async () => {
      process.env.VAPID_SUBJECT = "mailto:test@example.com";
      process.env.VAPID_PUBLIC_KEY = "pub";
      process.env.VAPID_PRIVATE_KEY = "priv";
      webpushInfra.init();

      const mockError = new Error("WebPushError: Push subscription has expired.");
      mockError.statusCode = 410;
      webpushModule.sendNotification.mockRejectedValue(mockError);

      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const response = await webpushInfra.sendNotification(dummySubscription, dummyPayload);

      expect(response.success).toBe(false);
      expect(response.statusCode).toBe(410);
      
      errorSpy.mockRestore();
    });
  });
});