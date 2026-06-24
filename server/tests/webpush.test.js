const webpushModule = require("web-push");
const webpushInfra = require("../infra/webpush");
const webpushService = require("../domains/webpush/webpush.service");
const webpushRepository = require("../domains/webpush/webpush.repository");
const db = require("../config/db");

// 의존성 레이어 전체 모킹
jest.mock("web-push");
jest.mock("../domains/webpush/webpush.repository");
jest.mock("../config/db");

describe("🔔 웹푸시 도메인 통합 및 인프라 단위 테스트", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    
    // 콘솔 경고/에러 로그 테스트 출력 방지 및 스파이 설정
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    // 💡 중요: 서비스 레이어가 참조하는 인프라를 항상 강제 초기화 상태로 세팅 (에러 방지)
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    process.env.VAPID_PUBLIC_KEY = "pub_key";
    process.env.VAPID_PRIVATE_KEY = "priv_key";
    webpushInfra.init(); 
  });

  afterEach(() => {
    console.warn.mockRestore();
    console.error.mockRestore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  /* ==========================================================================
     1. 인프라 계층 테스트 (infra/webpush.js)
     ========================================================================== */
  describe("1. 인프라 계층 (infra/webpush.js)", () => {
    describe("init()", () => {
      test("⚠️ 환경 변수 누락 시 초기화를 건너뛰고 경고를 남겨야 한다", () => {
        process.env.VAPID_SUBJECT = "";
        // 변수가 누락된 상태에서 init을 다시 호출해 분기 커버
        webpushInfra.init();
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("VAPID 환경 변수가 누락되었습니다"));
      });

      test("❌ 초기화 도중 라이브러리 내부 에러 발생 시 캐치해야 한다", () => {
        webpushModule.setVapidDetails.mockImplementationOnce(() => {
          throw new Error("Library Internal Crash");
        });

        webpushInfra.init();
        expect(console.error).toHaveBeenCalledWith("❌ 웹푸시 초기화 실패:", "Library Internal Crash");
      });
    });

    describe("sendNotification()", () => {
      const sub = { id: 1, endpoint: "https://ep.com", p256dh: "p", auth: "a" };
      const payload = { title: "테스트" };

      test("✅ 발송 성공 시 success: true와 결과 데이터객체를 반환한다", async () => {
        webpushModule.sendNotification.mockResolvedValueOnce({ statusCode: 201, body: "OK" });

        const res = await webpushInfra.sendNotification(sub, payload);
        expect(res.success).toBe(true);
        expect(res.result.statusCode).toBe(201);
      });
    });
  });

  /* ==========================================================================
     2. 서비스 계층 테스트 (webpush.service.js)
     ========================================================================== */
  describe("2. 서비스 계층 (webpush.service.js)", () => {
    const dummySub = { id: 99, user_id: 10, endpoint: "https://google.com/abc", p256dh: "p256", auth: "auth_key", status: "ACTIVE" };
    const mockPayload = { title: "공지", body: "내용" };

    describe("checkDeviceRegistration()", () => {
      test("✅ 등록된 엔드포인트가 전혀 없으면 registered: false를 반환한다", async () => {
        webpushRepository.findByEndpoint.mockResolvedValueOnce(null);

        const res = await webpushService.checkDeviceRegistration(10, "https://none.com");
        expect(res).toEqual({ registered: false, status: null });
      });

      test("✅ 본인의 기기인 경우 현재 상태값(status)을 정확히 매핑하여 반환한다", async () => {
        webpushRepository.findByEndpoint.mockResolvedValueOnce(dummySub);

        const res = await webpushService.checkDeviceRegistration(10, dummySub.endpoint);
        expect(res).toEqual({ registered: true, status: "ACTIVE" });
      });

      test("✅ 타 계정으로 선점된 엔드포인트인 경우 'OWNED_BY_OTHER' 전용 상태를 출력한다", async () => {
        webpushRepository.findByEndpoint.mockResolvedValueOnce(dummySub); // 소유자 ID: 10

        const res = await webpushService.checkDeviceRegistration(20, dummySub.endpoint); // 다른 유저 20이 조회
        expect(res).toEqual({ registered: false, status: "OWNED_BY_OTHER" });
      });
    });

    describe("registerSubscription() [Upsert & 소유권 이전 트랜잭션]", () => {
      let mockConnection;

      beforeEach(() => {
        mockConnection = {
          beginTransaction: jest.fn(),
          commit: jest.fn(),
          rollback: jest.fn(),
          release: jest.fn(),
          query: jest.fn().mockResolvedValue([{ insertId: 99 }])
        };
        db.getConnection.mockResolvedValue(mockConnection);
        // 기본 발송 모킹 (인프라가 정상 발송 승인 상태로 리턴되도록 세팅)
        webpushModule.sendNotification.mockResolvedValue({ statusCode: 201 });
      });

      test("✅ 타인에게 선점된 기기일 경우 기존 소유권을 무효화(DELETE)하고 신규 등록한 뒤 환영 알림을 쏜다", async () => {
        const otherUserSub = { ...dummySub, user_id: 20 }; // 타인 소유 기기
        webpushRepository.findByEndpoint
          .mockResolvedValueOnce(otherUserSub) // 소유권 검증용 조회
          .mockResolvedValueOnce(dummySub);    // 등록 후 환영알림용 단건 재조회

        const res = await webpushService.registerSubscription(10, { endpoint: dummySub.endpoint });

        expect(mockConnection.beginTransaction).toHaveBeenCalled();
        expect(webpushRepository.deleteByEndpointWithConnection).toHaveBeenCalledWith(mockConnection, dummySub.endpoint);
        expect(webpushRepository.upsertSubscriptionWithConnection).toHaveBeenCalled();
        expect(mockConnection.commit).toHaveBeenCalled();
        expect(res.message).toContain("성공적으로 등록");
      });

      test("❌ 트랜잭션 도중 에러가 터지면 완전하게 롤백(rollback)을 수행하고 예외를 격리해야 한다", async () => {
        // 커넥션을 얻어온 뒤 내부 비즈니스 쿼리 실행 도중 에러가 터져야 catch 분기로 진입해서 rollback이 실행됨
        webpushRepository.findByEndpoint.mockResolvedValueOnce(null); // 검증 통과
        webpushRepository.upsertSubscriptionWithConnection.mockRejectedValueOnce(new Error("DB Deadlock"));

        await expect(webpushService.registerSubscription(10, { endpoint: "https://err.com" })).rejects.toThrow("DB Deadlock");
        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalled();
      });
    });

    describe("toggleSubscriptionStatus() [토글 및 ACTIVE 복구 알림]", () => {
      test("❌ 권한이 없거나 존재하지 않는 구독 ID에 대한 토글은 404 예외를 던진다", async () => {
        webpushRepository.findAllByUserId.mockResolvedValueOnce([]); // 검색 결과 없음

        await expect(webpushService.toggleSubscriptionStatus(10, 999)).rejects.toThrow(
          expect.objectContaining({ status: 404 })
        );
      });

      test("✅ ACTIVE 상태에서 토글 시 UNSUBSCRIBED로 변경된다 (알림 발송 없음)", async () => {
        webpushRepository.findAllByUserId.mockResolvedValueOnce([dummySub]); // 원래 ACTIVE

        const res = await webpushService.toggleSubscriptionStatus(10, dummySub.id);
        expect(webpushRepository.updateStatus).toHaveBeenCalledWith(dummySub.id, 10, "UNSUBSCRIBED");
        expect(res.newState).toBe("UNSUBSCRIBED");
      });

      test("✅ UNSUBSCRIBED에서 토글 시 ACTIVE로 변환되며 재활성화 확인 푸시를 연동 전송한다", async () => {
        const unSub = { ...dummySub, status: "UNSUBSCRIBED" };
        webpushRepository.findAllByUserId.mockResolvedValueOnce([unSub]);
        webpushRepository.findByEndpoint.mockResolvedValueOnce(dummySub); // 재발송용 조회
        webpushModule.sendNotification.mockResolvedValueOnce({ statusCode: 201 });

        const res = await webpushService.toggleSubscriptionStatus(10, dummySub.id);
        expect(webpushRepository.updateStatus).toHaveBeenCalledWith(dummySub.id, 10, "ACTIVE");
        expect(res.newState).toBe("ACTIVE");
      });
    });

    describe("📢 글로벌 발송 인터페이스 및 만료 기기 FAILED 자동 격리 테스트", () => {
      test("✅ sendNotificationToActiveOnly는 오직 ACTIVE 기기에만 푸시를 발행한다", async () => {
        const subList = [
          { ...dummySub, id: 101, status: "ACTIVE" },
          { ...dummySub, id: 102, status: "UNSUBSCRIBED" },
          { ...dummySub, id: 103, status: "FAILED" }
        ];
        webpushRepository.findAllByUserId.mockResolvedValueOnce(subList);
        webpushModule.sendNotification.mockResolvedValue({ statusCode: 201 });

        await webpushService.sendNotificationToActiveOnly(10, mockPayload);
        
        expect(webpushModule.sendNotification).toHaveBeenCalledTimes(1);
      });

      test("✅ sendNotificationForce는 UNSUBSCRIBED 기기도 무시하고 발송하되 FAILED 기기는 원천 필터링한다", async () => {
        const subList = [
          { ...dummySub, id: 201, status: "ACTIVE" },
          { ...dummySub, id: 202, status: "UNSUBSCRIBED" },
          { ...dummySub, id: 203, status: "FAILED" }
        ];
        webpushRepository.findAllByUserId.mockResolvedValueOnce(subList);
        webpushModule.sendNotification.mockResolvedValue({ statusCode: 201 });

        await webpushService.sendNotificationForce(10, mockPayload);
        
        expect(webpushModule.sendNotification).toHaveBeenCalledTimes(2);
      });

      test("🚨 [핵심 보안 규칙] 푸시 발송 도중 브라우저 파기(410 Gone) 에러 적발 시, 레포지토리를 트리거해 즉시 FAILED 상태로 강제 전환한다", async () => {
        webpushRepository.findAllByUserId.mockResolvedValueOnce([dummySub]); // ACTIVE 기기 1대
        
        const expiredError = new Error("Subscription Expired");
        expiredError.statusCode = 410;
        webpushModule.sendNotification.mockRejectedValueOnce(expiredError);

        await webpushService.sendNotificationToActiveOnly(10, mockPayload);

        expect(webpushRepository.updateStatus).toHaveBeenCalledWith(dummySub.id, dummySub.user_id, "FAILED");
      });
    });
  });
});