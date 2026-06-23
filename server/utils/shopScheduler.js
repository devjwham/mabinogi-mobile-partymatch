const shopRepository = require('../domains/shop/shop.repository');

const initShopScheduler = () => {
    const cronJob = async () => {
        try {
            console.log('[Scheduler] 자정 정기 점검: 만료된 치장 아이템 일괄 삭제 시작...');
            const deletedCount = await shopRepository.deleteAllExpiredItems();
            console.log(`[Scheduler] 자정 정기 점검 완료. 총 ${deletedCount}개의 아이템이 삭제되었습니다.`);
        } catch (error) {
            console.error('[Scheduler Error] 자정 점검 중 에러 발생:', error);
        }
    };

    const now = new Date();
    // 다음 자정 시간 계산
    const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // 내일
        0, 0, 0, 0         // 00시 00분 00초
    );

    const timeToMidnight = nextMidnight.getTime() - now.getTime();

    // 1. 첫 자정까지 기다렸다가 실행
    setTimeout(() => {
        cronJob();
        // 2. 그 이후에는 24시간(86400000ms) 주기로 매일 자정마다 반복 실행
        setInterval(cronJob, 24 * 60 * 60 * 1000);
    }, timeToMidnight);

    console.log(`[Scheduler Registered] 첫 자정까지 남은 시간: ${(timeToMidnight / 1000 / 60).toFixed(1)}분`);
};

module.exports = { initShopScheduler };