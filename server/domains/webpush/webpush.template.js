// webpush.template.js

module.exports = {
    // [규칙 2] 전체 홍보 알림 (ACTIVE 대상)
    PARTY_PROMOTE: (partyTitle, partyId) => ({
        title: '🔥파티 모집 알림!',
        body: `"${partyTitle}" 파티원을 모집 중입니다. 지금 참여해 보세요!`,
        url: `/lobby`
    }),

    // [규칙 1] 파티원 가입 알림 (FORCE 대상)
    MEMBER_JOINED: (partyTitle, partyId, nickname) => ({
        title: '👥 새로운 파티원 합류!',
        body: `[${partyTitle}]에 ${nickname}님이 가입했습니다.`,
        url: `/lobby`
    }),

    // [규칙 1] 파티원 자진 탈퇴 알림 (FORCE 대상)
    MEMBER_LEFT: (partyTitle, nickname) => ({
        title: '🏃 파티원 탈퇴 알림',
        body: `[${partyTitle}]에서 ${nickname}님이 탈퇴하셨습니다.`,
        url: `/lobby`
    }),

    // [규칙 1] 파티원 추방 알림 (FORCE 대상)
    MEMBER_KICKED: (partyTitle) => ({
        title: '🚨 파티 추방 알림',
        body: `[${partyTitle}] 파티에서 추방당하셨습니다.`,
        url: '/lobby'
    }),

    // [규칙 1] 파티 출발 알림 (FORCE 대상)
    PARTY_STARTED: (partyTitle, partyId) => ({
        title: '⚔️ 파티 출발!',
        body: `[${partyTitle}]가 출발하였습니다`,
        url: `/lobby`
    })
};