-- =========================================================================
-- 데이터베이스 스키마 구성안 (SQLite -> MySQL Modernization)
-- =========================================================================

-- ==========================================
-- 1. 유저 (Users) 및 권한 도메인
-- ==========================================

-- [유저 테이블] : 핵심 계정 정보 및 활성 상태 관리
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,                       -- 로그인용 고유 ID
    nickname VARCHAR(100) NOT NULL,                              -- 닉네임 (중복 허용, UX 개선)
    password_hash VARCHAR(255) NOT NULL,                         -- 암호화된 비밀번호 해시
    role ENUM('USER', 'ADMIN') DEFAULT 'USER',                  -- 접근 제어 권한 단계
    status ENUM('ACTIVE', 'BANNED') DEFAULT 'ACTIVE',            -- 유저 제재 상태 상태값
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    class VARCHAR(50) DEFAULT 'attack',                          -- 유저 클래스 구분
    score INT DEFAULT 0,                                         -- 현 시즌 스코어
    total_score INT NOT NULL DEFAULT 0                           -- 누적 전체 스코어
);

-- [월별 스코어 스냅샷 테이블] : 통계 분석용
CREATE TABLE user_monthly_scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    ym CHAR(7) NOT NULL,                                 -- 'YYYY-MM' 형식 관리
    score INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_month (user_id, ym)              -- 동일 유저의 해당 월 중복 데이터 방지
);


-- ==========================================
-- 2. 파티 (Parties) 매칭 및 마스터 데이터 도메인
-- ==========================================

-- [파티 타입 마스터 테이블]
CREATE TABLE party_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,                           -- 파티 종류명
    max_members INT NOT NULL                                     -- 타입별 최대 정원
);

-- [난이도 마스터 테이블]
CREATE TABLE difficulties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL                            -- 난이도명 (Easy, Hard 등)
);

-- [파티 타입-난이도 매핑 테이블] (마스터 테이블 ON DELETE CASCADE 제거)
CREATE TABLE party_type_difficulties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    party_type_id INT NOT NULL,
    difficulty_id INT NOT NULL,
    base_score INT NOT NULL DEFAULT 0,                           -- 파티별 기본 지급 점수
    UNIQUE KEY uk_type_difficulty (party_type_id, difficulty_id),
    FOREIGN KEY (party_type_id) REFERENCES party_types(id),
    FOREIGN KEY (difficulty_id) REFERENCES difficulties(id)
);

-- [파티 테이블] : 실시간 모집 중인 활성 파티 정보
CREATE TABLE table_parties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    creator_id INT NOT NULL,                                     -- 파티 생성자 FK
    type_difficulty_id INT NOT NULL,                             -- 파티 속성 매핑 FK
    title VARCHAR(255) NOT NULL,
    status ENUM('RECRUITING', 'COMPLETED', 'STARTED', 'EXPIRED') DEFAULT 'RECRUITING', 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    last_promote_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,       -- 최근 홍보/알림 전송 시간
    party_score INT DEFAULT 0,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (type_difficulty_id) REFERENCES party_type_difficulties(id) ON DELETE CASCADE
);

-- [실시간 파티 멤버 매핑 테이블] : 현재 참여 상태값 관리
CREATE TABLE party_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    party_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_party_user (party_id, user_id),                -- 현재 참여 중인 파티 내 중복 입실 방지
    FOREIGN KEY (party_id) REFERENCES table_parties(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- ==========================================
-- 3. 치장 아이템, 인벤토리 및 알림 도메인
-- ==========================================

-- [아이템 카테고리 테이블]
CREATE TABLE decoration_item_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) UNIQUE NOT NULL                             -- 'EVENT', 'BG', 'TEXT', 'BORDER', 'TITLE' 등
);

-- [치장 아이템 테이블]
CREATE TABLE decoration_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    item_type_id INT NOT NULL,
    price INT NOT NULL,
    is_shop_item TINYINT NOT NULL DEFAULT 1,                      -- 1: 상점 판매 템, 0: 비매품(이벤트 등)
    FOREIGN KEY (item_type_id) REFERENCES decoration_item_types(id)
);

-- [인벤토리 테이블] : 실시간 소유 및 착용 정보
CREATE TABLE users_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_id INT NOT NULL,
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date DATETIME DEFAULT NULL,                           -- 기간제 아이템 고려 (영구는 NULL)
    is_equipped TINYINT DEFAULT 0,                               -- 1: 착용 중, 0: 미착용
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES decoration_items(id)
);

-- [웹푸시 구독 테이블]
CREATE TABLE subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint VARCHAR(512) UNIQUE NOT NULL,                       -- 알림 고유 엔드포인트 수집
    p256dh VARCHAR(255),
    auth VARCHAR(255),
    browser_name VARCHAR(100) DEFAULT 'Unknown',                 -- 트러블슈팅용 브라우저 식별 정보
    os_name VARCHAR(100) DEFAULT 'Unknown',                      -- 트러블슈팅용 OS 식별 정보
    user_agent VARCHAR(500),                                     
    status ENUM('ACTIVE', 'UNSUBSCRIBED', 'FAILED') DEFAULT 'ACTIVE', -- 구독 및 발송 실패 추적
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);