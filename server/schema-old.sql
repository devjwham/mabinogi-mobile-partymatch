-- decoration_items definition

CREATE TABLE decoration_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('event', 'bg', 'text', 'border', 'effect1', 'effect2', 'effect3')) NOT NULL,
            price INTEGER NOT NULL,
            min_refine_level INTEGER DEFAULT 0
        );


-- party_types definition

CREATE TABLE party_types (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    max_members INTEGER NOT NULL
  );


-- users definition

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    nickname TEXT UNIQUE,
    code TEXT UNIQUE,
    isBanned INTEGER DEFAULT 0,
    iat DATETIME DEFAULT CURRENT_TIMESTAMP,
    class TEXT DEFAULT 'attack',
    score INTEGER DEFAULT 0  -- 유저 점수
  , total_score INTEGER NOT NULL DEFAULT 0, last_month_score INTEGER, refine_level INTEGER DEFAULT 0);


-- difficulties definition

CREATE TABLE difficulties (
    id INTEGER PRIMARY KEY,
    party_type_id INTEGER,
    name TEXT,
    FOREIGN KEY (party_type_id) REFERENCES party_types(id) ON DELETE CASCADE
  );


-- parties definition

CREATE TABLE parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER,
    party_type_id INTEGER,
    difficulty_id INTEGER,
    title TEXT,
    max_members INTEGER,
    status TEXT DEFAULT '구인중',
    time INTEGER DEFAULT (strftime('%s','now')), -- 생성 시각 (초 단위)
    promote_time INTEGER DEFAULT (strftime('%s','now')), -- 알림홍보용 시각 (초 단위)
    party_score INTEGER DEFAULT 0, -- 파티 점수

    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (party_type_id) REFERENCES party_types(id) ON DELETE CASCADE,
    FOREIGN KEY (difficulty_id) REFERENCES difficulties(id) ON DELETE CASCADE
  );


-- party_members definition

CREATE TABLE party_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_id INTEGER,
    user_id INTEGER,
    UNIQUE(party_id, user_id),
    FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );


-- subscriptions definition

CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    endpoint TEXT UNIQUE,
    p256dh TEXT,
    auth TEXT,
    is_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );


-- users_inventory definition

CREATE TABLE users_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            purchase_date DATE DEFAULT (DATE('now')),
            expiry_date DATE, is_equipped INTEGER DEFAULT 0,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
            FOREIGN KEY (item_id) REFERENCES decoration_items(id) ON DELETE CASCADE ON UPDATE CASCADE
        );

CREATE INDEX idx_user_equipped ON users_inventory(owner_id, is_equipped);
CREATE INDEX idx_inventory_owner ON users_inventory(owner_id);