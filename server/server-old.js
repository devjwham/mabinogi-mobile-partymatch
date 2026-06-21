const http = require("http");
const fs = require("fs");
const express = require("express");

const Database = require("better-sqlite3");
const db = new Database("./bossdb.sqlite");
const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const path = require("path");
const { Server } = require("socket.io");
const webpush = require("web-push");


const allowedHost = "xn--om2bo5af0e.com";
const HTTP_PORT = 3001;

const app = express();


app.use(express.json());
app.use(cookieParser());


//점수세팅
const lesspower = 9.9; //점수 전투력 제한
let abyss_count = 4; //어비스던전 개수
let abyss_score = 1; //어비스 개당
let glas_score = 1; //글라스기브넨
let succubus_score = 1; //서큐버스


const partyDeleteTimers = new Map();

// 파티 삭제 예약
function schedulePartyDelete(party_id, partyData) {
  // 기존 예약 있으면 취소
  const oldTimer = partyDeleteTimers.get(party_id);
  if (oldTimer) clearTimeout(oldTimer);

  const timerId = setTimeout(() => {
    try {
      deleteParty(party_id, partyData, (delErr) => {
        if (delErr) {
          console.error(`파티 삭제 실패 (id: ${party_id}):`, delErr);
        } else {
          console.log(`파티 삭제 완료 (id: ${party_id})`);
          broadcastPartyDelete(party_id);
        }
        partyDeleteTimers.delete(party_id);
      });
    } catch (err) {
      console.error(`파티 삭제 중 예외 발생 (id: ${party_id}):`, err);
    }
  }, 5 * 60 * 1000);

  partyDeleteTimers.set(party_id, timerId);
}

// 파티 삭제 예약 취소
function cancelPartyDelete(party_id) {
  const timerId = partyDeleteTimers.get(party_id);
  if (timerId) {
    clearTimeout(timerId); // 예약 취소
    partyDeleteTimers.delete(party_id); // 맵에서 제거
    console.log(`파티 삭제 예약 취소됨 (id: ${party_id})`);
  } else {
    console.log(`취소할 예약이 없음 (id: ${party_id})`);
  }
}

//어비스 데이터 종류 바뀔때 아래에서 점수 어비스 수정해주는거 잊지말기
// 초기 데이터 (파티 종류 및 난이도)
const partyTypes = [
  {
    name: "글라스기브넨",
    max_members: 8,
    difficulties: ["입문", "어려움", "매어", "붉은눈"],
  },
  { name: "서큐", max_members: 4, difficulties: ["어려움","매어"] },
  {
    name: "어비스",
    max_members: 4,
    difficulties: [
      "입문",
      "어려움",
      "매어",
      "지옥1",
      "지옥2",
      "지옥3",
      "지옥4",
      "지옥5",
      "지옥6",
      "지옥7",
      "지옥8",
      "지옥9",
      "지옥10",
      "지옥11",
      "지옥12",
      "지옥13",
      "지옥14",
      "지옥15",
    ],
  },
  { name: "기타", max_members: 4, difficulties: ["기타"] },
  { name: "타바르타스", max_members: 8, difficulties: ["입문","어려움","매어"] },
{ name: "에이렐", max_members: 4, difficulties: ["어려움"] },
];


function updatePartyTypes() {
  try {
    // 1. 먼저 자식 테이블부터 삭제 (외래키 참조 대상)
    db.prepare("DELETE FROM difficulties").run();

    // 2. 그런 다음 부모 테이블 삭제
    db.prepare("DELETE FROM party_types").run();

    let difficultyId = 1;
    for (let i = 0; i < partyTypes.length; i++) {
      const pt = partyTypes[i];
      const fixedPartyTypeId = i + 1;

      db.prepare(
        "INSERT INTO party_types (id, name, max_members) VALUES (?, ?, ?)"
      ).run(fixedPartyTypeId, pt.name, pt.max_members);

      for (const diff of pt.difficulties) {
        db.prepare(
          "INSERT INTO difficulties (id, party_type_id, name) VALUES (?, ?, ?)"
        ).run(difficultyId++, fixedPartyTypeId, diff);
      }
    }

    console.log("✅ 파티 타입 및 난이도 갱신 완료");
  } catch (err) {
    console.error("❌ updatePartyTypes 오류:", err);
  }
}

// 인증 미들웨어
function checkLogin(req, res, next) {
  const token = req.cookies.token;
  if (!token)
    return res.status(401).json({ success: false, message: "로그인 필요" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);

    // DB에서 사용자 정보 조회
    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, message: "사용자 없음" });
    }

    if (user.isBanned) {
      return res
        .status(403)
        .json({ success: false, message: "차단된 사용자입니다." });
    }

    // DB의 DATETIME -> ISO 8601 UTC 포맷 변환 (예: "2025-07-01 00:00:00" → "2025-07-01T00:00:00Z")
    const dbIatIso = user.iat.replace(" ", "T") + "Z";
    const dbIatUnix = Math.floor(new Date(dbIatIso).getTime() / 1000);

    // JWT iat는 숫자 타입이므로 그냥 비교
    if (decoded.iat < dbIatUnix) {
      return res.status(401).json({ success: false, message: "만료된 토큰" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "유효하지 않은 토큰" });
  }
}

app.use((req, res, next) => {
  if (req.hostname !== allowedHost) {
    return res.redirect(301, `https://${allowedHost}${req.originalUrl}`);
  }
  next();
});


app.post("/api/login", async (req, res) => {
  const { username, code } = req.body;

  try {
    // [1] 값 유효성 검사 (비어있지만 않으면 됨)
    if (!username || !code) {
      return res.json({
        success: false,
        message: "사용자명과 코드를 입력하세요.",
      });
    }

    // [2] username 으로 유저 조회
    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(username);

    // [3] 유저 없음 / 밴 / 코드 불일치 -> 동일한 에러 메시지
    if (!user || user.isBanned === 1) {
      return res.json({ success: false, message: "코드가 일치하지 않습니다." });
    }

    const isMatch = await bcrypt.compare(code, user.code);
    if (!isMatch) {
      return res.json({ success: false, message: "코드가 일치하지 않습니다." });
    }

    // [4] JWT 토큰 발급
    const token = jwt.sign(
      { userId: user.id, username: user.username, nickname: user.nickname },
      SECRET_KEY,
      { expiresIn: "7d" }
    );

    // [5] 쿠키에 저장
    res.cookie("token", token, {
      httpOnly: false, //임시
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
    });

    // [6] 성공 응답
    res.json({ success: true, username: user.username });
  } catch (err) {
    console.error("Login Error:", err);
    res
      .status(500)
      .json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

app.get("/api/profile", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const username = req.user.username;
  const endpoint = req.query.endpoint;

  try {
    // class 컬럼 포함
    const row = db
      .prepare(`SELECT nickname, class FROM users WHERE id = ?`)
      .get(userId);

    const nickname = row?.nickname || "";
    const userClass = row?.class || ""; // "attack" / "support" 또는 빈 문자열

    if (!endpoint) {
      return res.json({
        success: true,
        user: {
          userId,
          username,
          nickname,
          class: userClass, // 추가
          isPushEnabled: false,
        },
      });
    }

    const subRow = db
      .prepare(
        `SELECT is_enabled FROM subscriptions WHERE user_id = ? AND endpoint = ?`
      )
      .get(userId, endpoint);

    const isPushEnabled = subRow ? !!subRow.is_enabled : false;

    res.json({
      success: true,
      user: {
        userId,
        username,
        nickname,
        class: userClass, // 추가
        isPushEnabled,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/check-push", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { endpoint } = req.body;

  if (!endpoint) {
    return res.status(400).json({ success: false, message: "No endpoint" });
  }

  try {
    const row = db
      .prepare(`SELECT 1 FROM subscriptions WHERE user_id = ? AND endpoint = ?`)
      .get(userId, endpoint);

    const registered = !!row; // row가 있으면 true

    res.json({ success: true, registered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/toggle-push", checkLogin, (req, res) => {
  console.log("토글요청");
  const userId = req.user.userId;
  const { endpoint } = req.body;

  if (!endpoint)
    return res.status(400).json({ success: false, message: "No endpoint" });

  try {
    const row = db
      .prepare(
        `SELECT is_enabled FROM subscriptions WHERE user_id = ? AND endpoint = ?`
      )
      .get(userId, endpoint);

    const newState = row?.is_enabled ? 0 : 1;

    const info = db
      .prepare(
        `UPDATE subscriptions SET is_enabled = ? WHERE user_id = ? AND endpoint = ?`
      )
      .run(newState, userId, endpoint);

    // 변경된 행이 없는 경우는 별도 처리 가능
    if (info.changes === 0) {
      // 예: 구독이 없을 때
      return res
        .status(404)
        .json({ success: false, message: "구독 정보 없음" });
    }

    res.json({ success: true, newState });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/unsubscribe", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { endpoint } = req.body;

  if (!endpoint) {
    return res
      .status(400)
      .json({ success: false, message: "endpoint가 필요합니다." });
  }

  try {
    const stmt = db.prepare(`
      DELETE FROM subscriptions
      WHERE endpoint = ? AND user_id = ?
    `);
    const result = stmt.run(endpoint, userId);

    if (result.changes > 0) {
      res.json({ success: true, deleted: result.changes });
    } else {
      res
        .status(404)
        .json({ success: false, message: "삭제할 구독 정보가 없습니다." });
    }
  } catch (err) {
    console.error("구독 삭제 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});


//임시로 추가했던 기능, 현재 사용X
app.get("/api/rankings", checkLogin, (req, res) => {
  try {
    const adminUsernames = ["관리자", "행운상상", "라때는말이야", "소희", "엔히크"];
    const placeholders = adminUsernames.map(() => "?").join(",");

    // 1. 관리자 ID 목록 먼저 조회
    const adminResult = db.prepare(`
      SELECT id FROM users WHERE username IN (${placeholders})
    `).all(...adminUsernames);
    
    const adminIds = adminResult.map(user => user.id);

    // 2. 관리자를 제외한 last_month_score 상위 3명 조회
    // WHERE id NOT IN (...) 을 추가하여 관리자 ID들을 제외합니다.
    const adminIdPlaceholders = adminIds.length > 0 ? adminIds.map(() => "?").join(",") : "'NONE'";
    
    const rankingQuery = `
      SELECT id FROM users 
      WHERE last_month_score IS NOT NULL 
      AND id NOT IN (${adminIdPlaceholders})
      ORDER BY last_month_score DESC 
      LIMIT 3
    `;

    const top3 = db.prepare(rankingQuery).all(...adminIds);

    // 3. 결과 가공
    const rankings = {
      rank1: top3[0]?.id || null,
      rank2: top3[1]?.id || null,
      rank3: top3[2]?.id || null,
    };

    res.status(200).json({
      success: true,
      rankings: rankings,
      admins: adminIds
    });

  } catch (error) {
    console.error("데이터 조회 실패:", error.message);
    res.status(500).json({ success: false, message: "데이터 조회 중 오류 발생" });
  }
});


//칭호관련
//칭호목록과 보유중  정보 보냄 
app.get("/api/inventory-data", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const today = new Date().toISOString().split('T')[0]; 

  try {
    const processInventory = db.transaction(() => {
      
      // 1. 만료일이 오늘보다 이전인 경우에만 장착 해제
      db.prepare(`
        UPDATE users_inventory 
        SET is_equipped = 0 
        WHERE owner_id = ? 
        AND expiry_date IS NOT NULL 
        AND expiry_date < ? 
        AND is_equipped = 1
      `).run(userId, today);

      // 2. 전체 아이템 목록 조회
      const allItems = db.prepare(`
        SELECT id, name, type, price, min_refine_level 
        FROM decoration_items
      `).all();

      // 3. 만료되지 않은 아이템 + 만료일이 NULL인(영구) 아이템 조회
      const userInventory = db.prepare(`
        SELECT id, item_id, purchase_date, expiry_date, is_equipped 
        FROM users_inventory 
        WHERE owner_id = ? 
        AND (expiry_date >= ? OR expiry_date IS NULL)
      `).all(userId, today);
      
      // 4. 유저의 total_score 조회 (users 테이블에서 가져옴)
      const user = db.prepare(`
        SELECT total_score 
        FROM users 
        WHERE id = ?
      `).get(userId);

      return { allItems, userInventory, totalScore: user ? user.total_score : 0 };
    });

    const result = processInventory();

    res.status(200).json({
      success: true,
      allItems: result.allItems,
      myInventory: result.userInventory,
      total_score: result.totalScore // 클라이언트에서 이 값을 받아 사용하면 됩니다.
    });

  } catch (error) {
    console.error("인벤토리 갱신 및 조회 실패:", error.message);
    res.status(500).json({ success: false, message: "데이터 처리 중 오류 발생" });
  }
});

//첫로드시 전체 칭호 착용관련 보냄
app.get("/api/active-decorations", checkLogin, (req, res) => {
  try {
    // 1. 유저(isBanned=0) + 인벤토리(is_equipped=1) + 아이템 조인
    // 필요한 데이터만 SELECT하여 효율적으로 조회합니다.
    const query = `
      SELECT 
        u.id AS user_id,
        di.name AS item_name,
        di.type AS item_type
      FROM users u
      JOIN users_inventory ui ON u.id = ui.owner_id
      JOIN decoration_items di ON ui.item_id = di.id
      WHERE u.isBanned = 0 
      AND ui.is_equipped = 1
    `;

    const activeDecorations = db.prepare(query).all();

    // 2. 결과를 유저별로 그룹화하여 전달 (클라이언트에서 쓰기 편하게)
    // 예: { 105: [{name: 'rank-1', type: 'event'}], ... }
    const groupedData = activeDecorations.reduce((acc, row) => {
      if (!acc[row.user_id]) {
        acc[row.user_id] = [];
      }
      acc[row.user_id].push({
        name: row.item_name,
        type: row.item_type
      });
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: groupedData
    });

  } catch (error) {
    console.error("장착 아이템 조회 실패:", error.message);
    res.status(500).json({ success: false, message: "데이터 조회 중 오류 발생" });
  }
});


//칭호 변경 io.emit
function emitUserEquippedItems(userId) {
  try {
    // 1. 해당 유저가 장착 중인 아이템들만 조회
    const equippedItems = db.prepare(`
      SELECT di.name, di.type 
      FROM users_inventory ui
      JOIN decoration_items di ON ui.item_id = di.id
      WHERE ui.owner_id = ? AND ui.is_equipped = 1
    `).all(userId);

    // 2. 닉네임과 아이템 정보를 묶어서 실시간 전송
    const userinfo = db.prepare("SELECT nickname FROM users WHERE id = ?").get(userId);
    
    io.emit("useritems:update", {
      userId,
      nickname: userinfo?.nickname || "알 수 없음",
      items: equippedItems 
    });
    
  } catch (err) {
    console.error("아이템 정보 브로드캐스팅 실패:", err);
  }
}



// 장착해제 api
app.post("/api/shop/toggle-equip", checkLogin, (req, res) => {
  const { itemId } = req.body;
  const userId = req.user.userId;

  try {
    const result = db.transaction(() => {
      // 1. 타겟 아이템 및 타입 정보 가져오기
      const itemInfo = db.prepare(`
        SELECT ui.is_equipped, di.type 
        FROM users_inventory ui
        JOIN decoration_items di ON ui.item_id = di.id
        WHERE ui.owner_id = ? AND ui.item_id = ?
      `).get(userId, itemId);

      if (!itemInfo) throw new Error("보유하지 않은 아이템입니다.");

      // 2. 이미 장착 중이라면 해제 (기존 토글 로직)
      if (itemInfo.is_equipped === 1) {
        db.prepare(`UPDATE users_inventory SET is_equipped = 0 WHERE owner_id = ? AND item_id = ?`)
          .run(userId, itemId);
        return { success: true, newStatus: 0 };
      }

      // 3. 새로 장착하려는 경우 (상호 배타적 처리)
      // A. 동일 타입의 다른 장착 중인 아이템들을 모두 해제
      db.prepare(`
        UPDATE users_inventory 
        SET is_equipped = 0 
        WHERE owner_id = ? 
        AND item_id IN (SELECT id FROM decoration_items WHERE type = ?)
      `).run(userId, itemInfo.type);

      // B. 선택한 아이템 장착
      db.prepare(`UPDATE users_inventory SET is_equipped = 1 WHERE owner_id = ? AND item_id = ?`)
        .run(userId, itemId);

      return { success: true, newStatus: 1 };
    })();

    // 4. 실시간 브로드캐스팅
    emitUserEquippedItems(userId);

    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

//구매 api
app.post("/api/shop/purchase", checkLogin, (req, res) => {
  const { itemId } = req.body;
  const userId = req.user.userId;

  try {
    const result = db.transaction(() => {
      // 1. 아이템 정보 조회
      const item = db.prepare("SELECT price FROM decoration_items WHERE id = ?").get(itemId);
      if (!item) throw new Error("존재하지 않는 아이템입니다.");

      // 2. 유저 total_score 확인
      const user = db.prepare("SELECT total_score FROM users WHERE id = ?").get(userId);
      if (user.total_score < item.price) throw new Error("포인트(total_score)가 부족합니다.");

      // 3. 포인트 차감
      db.prepare("UPDATE users SET total_score = total_score - ? WHERE id = ?").run(item.price, userId);

      // 4. 인벤토리 추가 (7일 기간 설정)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7); // 7일로 변경
      const expiryStr = expiryDate.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO users_inventory (owner_id, item_id, purchase_date, expiry_date, is_equipped)
        VALUES (?, ?, date('now'), ?, 0)
      `).run(userId, itemId, expiryStr);

      return { success: true, message: "구매가 완료되었습니다." };
    })();

    res.json(result);
  } catch (error) {
    console.error("구매 오류:", error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});



//요구사항 변경으로, 현재는 본캐릭터 제외 적립불가처리해놓음, 전투력상수로 관리중

// 🔹 점수 적립 가능 여부 판단 함수 (true/false만 반환)
// 전투력 앞/뒤 붙어도 지원, 한글 포함
// 단, 소수점(.) 없는 숫자는 적립 불가
function canEarnScore(rawInput, username, minPower) {
  const match = rawInput.match(
    /^\s*(\d+(\.\d+)?)\s*(.+)$|^(.+?)\s*(\d+(\.\d+)?)\s*$/
  );

  let power = null;
  let nickname = rawInput.trim().slice(0, 30);

  // username과 nickname이 같으면 무조건 적립 가능
  if (username === nickname || nickname === "마법사") return true;

  if (match) {
    const rawPower = match[1] || match[5];

    // 소수점 없으면 적립 불가
    if (!rawPower.includes(".")) return false;

    power = parseFloat(rawPower);

    // 🔹 전투력이 10 이상이면 무조건 탈락
    if (power >= 10) { console.log("a"); return false; }

    // 닉네임 분리
    nickname = match[1]
      ? match[3].trim().slice(0, 30)
      : match[4].trim().slice(0, 30);
  }

  // 전투력 없으면 X
  if (power === null) return false;

  // minPower 이상이면 적립 가능
  return power >= minPower;
}

// API
app.post("/api/change-nickname", checkLogin, (req, res) => {
  const rawInput = req.body.nickname?.trim();
  if (!rawInput)
    return res
      .status(400)
      .json({ success: false, message: "닉네임을 입력하세요." });

  const userId = req.user.userId;
  const username = req.user.username;

  // 🔹 점수 적립 여부 판단
  const canEarn = canEarnScore(rawInput, username, lesspower);

  try {
    // 중복 닉네임 체크
    const row = db
      .prepare("SELECT * FROM users WHERE nickname = ? AND id != ?")
      .get(rawInput, userId);
    if (row)
      return res.json({
        success: false,
        message: "이미 사용 중인 닉네임입니다.",
      });

    // 기존 닉네임 정보
    const oldRow = db
      .prepare("SELECT nickname, `class` FROM users WHERE id = ?")
      .get(userId);
    const oldNickname = oldRow?.nickname || "알 수 없음";
    const userClass = oldRow?.class;

    // 닉네임 업데이트 (DB에는 입력 그대로 저장)
    db.prepare("UPDATE users SET nickname = ? WHERE id = ?").run(
      rawInput,
      userId
    );

    // connectedUsers 갱신
    if (connectedUsers.has(userId)) {
      connectedUsers.get(userId).user.nickname = rawInput;
    }

    // JWT 갱신
    const newToken = jwt.sign(
      { userId, username, nickname: rawInput },
      SECRET_KEY,
      { expiresIn: "7d" }
    );
    res.cookie("token", newToken, {
      httpOnly: false,
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 닉네임 변경 알림
    io.emit("userinfo:update", {
      userId,
      username,
      newNickname: rawInput,
      userclass: userClass,
    });
    io.emit(
      "users:update",
      Array.from(connectedUsers.values()).map((u) => u.user)
    );

    // 가입한 파티의 파티장 알림
    const joinedParties = db
      .prepare(
        `
      SELECT p.id, p.creator_id
      FROM parties p
      JOIN party_members pm ON pm.party_id = p.id
      WHERE pm.user_id = ? AND p.creator_id != ?
    `
      )
      .all(userId, userId);

    const title = "파티 멤버 닉네임 변경";
    const message = `${oldNickname}님이 닉네임을 '${rawInput}'(으)로 변경했습니다.`;
    const leaderIds = joinedParties.map((p) => p.creator_id);
    if (leaderIds.length > 0)
      sendNotificationToUsers(title, message, leaderIds);

    // 점수 적립 여부 반환
    res.json({ success: true, message: canEarn ? "점수O" : "점수X" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

//클래스변경
app.post("/api/updateClass", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { userClass } = req.body;

  try {
    if (userClass !== "attack" && userClass !== "support") {
      return res.json({ success: false, message: "비정상 클래스" });
    }
    db.prepare("UPDATE users SET class = ? WHERE id = ?").run(
      userClass,
      userId
    );
    const userinfo = db
      .prepare("SELECT nickname, class FROM users WHERE id = ?")
      .get(userId);
    const newNickname = escapeHtml(userinfo?.nickname || "알 수 없음");
    const userclass = userinfo?.class;

    const username = req.user.username;
    io.emit("userinfo:update", {
      userId,
      username,
      newNickname,
      userclass,
    });
    return res.json({ success: true, message: "클래스가 변경되었습니다." });
  } catch (err) {
    return res.json({ success: false, message: "변경 실패" });
  }
});

app.post("/api/create-party", checkLogin, (req, res) => {
  const creatorId = req.user.userId;
  const { party_type_id, difficulty_id, title, max_members, ...abyssData } =
    req.body;

  try {
    const diff = db
      .prepare(`SELECT * FROM difficulties WHERE id = ? AND party_type_id = ?`)
      .get(difficulty_id, party_type_id);
    if (!diff)
      return res
        .status(400)
        .json({ success: false, message: "유효하지 않은 난이도입니다." });

    // ===== 점수계산 로직 =====
    let score = 0;
    if (party_type_id === 1 || party_type_id === 5 || party_type_id === 6) {
      score = glas_score;
    } else if (party_type_id === 2) {
      score = succubus_score;
    } else if (party_type_id === 3) {
      // abyssData 기본 검증
      if (typeof abyssData !== "object" || abyssData === null) {
        abyssData = {};
      }

      const three = abyssData.three === true;
      const subTypes = Array.isArray(abyssData.subTypes)
        ? abyssData.subTypes
        : [];

      // 유효성 검사: 아무 것도 선택 안 한 경우
      if (!three && subTypes.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "어비스 종류를 선택하세요." });
      }

      // 점수 계산
      if (three) {
        score = abyss_score * abyss_count;
      } else {
        score = Math.min(
          subTypes.length * abyss_score,
          abyss_score * abyss_count
        );
      }
    }
    function insertParty(finalMaxMembers) {
      const info = db
        .prepare(
          `INSERT INTO parties (creator_id, party_type_id, difficulty_id, title, max_members, status, party_score)
           VALUES (?, ?, ?, ?, ?, '구인중', ?)`
        )
        .run(
          creatorId,
          party_type_id,
          difficulty_id,
          title || null,
          finalMaxMembers,
          score
        );

      const newPartyId = info.lastInsertRowid;

      db.prepare(
        `INSERT INTO party_members (party_id, user_id) VALUES (?, ?)`
      ).run(newPartyId, creatorId);

      // ✅ 파티 생성 후 소켓 이벤트 전송
      broadcastNewParty(newPartyId);
      // 알림메세지 생성
      // 유저 정보 조회
      const userRow = db
        .prepare(`SELECT username, nickname FROM users WHERE id = ?`)
        .get(creatorId);

      // 종류, 난이도 정보 조회
      const partyTypeRow = db
        .prepare(`SELECT name FROM party_types WHERE id = ?`)
        .get(party_type_id);

      const difficultyRow = db
        .prepare(`SELECT name FROM difficulties WHERE id = ?`)
        .get(difficulty_id);

      const safeTitle = title || "";
      const safeUsername = userRow?.username ? userRow.username : null;
      const safeNickname = userRow?.nickname ? userRow.nickname : null;
      const partyTypeName = partyTypeRow?.name || "";
      const difficultyName = difficultyRow?.name || "";

      const displayName =
        safeNickname && safeUsername && safeNickname !== safeUsername
          ? `${safeNickname}(${safeUsername})`
          : safeNickname || safeUsername || "알 수 없음";

      const notifyTitle = `${displayName}님의 파티가 등록되었습니다`;

      let notifyMessage = "";
      if (partyTypeName === "기타") {
        notifyMessage = `${safeTitle} / ${partyTypeName} (${finalMaxMembers}인)`;
      } else {
        notifyMessage = `${safeTitle} / ${partyTypeName} (${difficultyName})`;
      }

      //테스트면 생성한사람한테만
      if (title === "테스트") {
        sendNotificationToUsers(notifyTitle, notifyMessage, creatorId);
      } else {
        sendNotificationToEnabled(notifyTitle, notifyMessage);
      }

      res.json({ success: true, partyId: newPartyId });
    }

    if (!max_members || typeof max_members !== "number" || max_members <= 0) {
      const pt = db
        .prepare(`SELECT max_members FROM party_types WHERE id = ?`)
        .get(party_type_id);
      if (!pt)
        return res
          .status(400)
          .json({ success: false, message: "유효하지 않은 파티 종류입니다." });

      insertParty(pt.max_members);
    } else {
      insertParty(max_members);
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/join-party", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { party_id } = req.body;

  if (!party_id)
    return res
      .status(400)
      .json({ success: false, message: "파티 ID가 필요합니다." });

  try {
    const party = db
      .prepare(
        `SELECT id, max_members, status, creator_id FROM parties WHERE id = ?`
      )
      .get(party_id);

    if (!party)
      return res
        .status(404)
        .json({ success: false, message: "파티가 존재하지 않습니다." });
    if (party.status !== "구인중")
      return res
        .status(400)
        .json({ success: false, message: "이미 모집이 끝났습니다." });

    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM party_members WHERE party_id = ?`)
      .get(party_id);
    if (row.count >= party.max_members)
      return res
        .status(400)
        .json({ success: false, message: "파티원이 가득 찼습니다." });

    const existing = db
      .prepare(`SELECT * FROM party_members WHERE party_id = ? AND user_id = ?`)
      .get(party_id, userId);
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "이미 파티에 가입되어 있습니다." });

    db.prepare(
      `INSERT INTO party_members (party_id, user_id) VALUES (?, ?)`
    ).run(party_id, userId);

    // 상태 업데이트 함수가 콜백형이면 동기 호출에 맞게 수정하거나 Promise로 감싸야 합니다.
    updatePartyStatusIfFull(party_id, (err) => {
      if (err) {
        console.error("파티 상태 업데이트 실패:", err);
        // 필요 시 에러처리
      }
      broadcastPartyUpdate(party_id);
    });

    // ✅ 푸시 알림: 파티장에게 가입 알림 전송
    const joiner = db
      .prepare(`SELECT nickname, username FROM users WHERE id = ?`)
      .get(userId);

    const nickname = joiner?.nickname ? joiner.nickname : null;
    const username = joiner?.username ? joiner.username : null;

    const safeNickname =
      nickname && username && nickname !== username
        ? `${nickname}(${username})`
        : nickname || username || "알 수 없음";

    const title = "파티에 새 멤버가 가입했습니다";
    const message = `"${safeNickname}"님이 파티에 가입했어요.`;

    if (party.creator_id && party.creator_id !== userId) {
      sendNotificationToUsers(title, message, party.creator_id);
    }
    res.json({ success: true, message: "파티에 가입되었습니다." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/leave-party", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { party_id } = req.body;

  if (!party_id)
    return res
      .status(400)
      .json({ success: false, message: "파티 ID가 필요합니다." });

  try {
    // 파티장, 파티 제목 같이 조회 (파티 삭제 전 미리 읽기)
    const party = db
      .prepare(`SELECT creator_id, title, status FROM parties WHERE id = ?`)
      .get(party_id);

    if (!party)
      return res
        .status(404)
        .json({ success: false, message: "파티가 존재하지 않습니다." });

    // 🚫 출발 상태인 경우 탈퇴/삭제 금지
    if (party.status === "출발") {
      return res.status(400).json({
        success: false,
        message: "출발상태에서는 할 수 없습니다.",
      });
    }

    const joiner = db
      .prepare(`SELECT nickname FROM users WHERE id = ?`)
      .get(userId);
    const safeNickname = joiner?.nickname || "알 수 없음";
    const safePartyTitle = party.title || "알 수 없는 파티";

    if (party.creator_id === userId) {
      // 파티장인 경우 트랜잭션으로 멤버 삭제 후 파티 삭제
      // 삭제 전 멤버 목록 조회 (user_id 리스트)
      const party = db
        .prepare(`SELECT * FROM parties WHERE id = ?`)
        .get(party_id);
      logParty(party.status, party.party_score, getPartyWithMembers(party_id));

      const members = db
        .prepare(`SELECT user_id FROM party_members WHERE party_id = ?`)
        .all(party_id)
        .map((row) => row.user_id);

      const deleteTransaction = db.transaction((partyId) => {
        db.prepare(`DELETE FROM party_members WHERE party_id = ?`).run(partyId);
        db.prepare(`DELETE FROM parties WHERE id = ?`).run(partyId);
      });

      deleteTransaction(party_id);

      broadcastPartyDelete(party_id);

      // 파티 삭제 시 가입된 모든 유저에게 알림 전송 (파티 이름 포함)
      const title = "가입한 파티가 삭제되었습니다";
      const message = `삭제된 파티: ${safePartyTitle}`;

      if (members.length > 0) {
        sendNotificationToUsers(title, message, members);
      }

      return res.json({ success: true, message: "파티가 삭제되었습니다." });
    } else {
      // 일반 멤버 탈퇴
      db.prepare(
        `DELETE FROM party_members WHERE party_id = ? AND user_id = ?`
      ).run(party_id, userId);

      updatePartyStatusIfFull(party_id, (err) => {
        if (err) {
          console.error("파티 상태 업데이트 실패:", err);
        }
        broadcastPartyUpdate(party_id);
      });

      // 일반 멤버 탈퇴 시 파티장에게 알림 전송
      const title = "파티 멤버가 탈퇴했습니다";
      const message = `${safeNickname}님이 파티에서 탈퇴했습니다.`;

      if (party.creator_id && party.creator_id !== userId) {
        sendNotificationToUsers(title, message, party.creator_id);
      }

      return res.json({ success: true, message: "파티에서 탈퇴했습니다." });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

function updatePartyStatusIfFull(party_id, callback) {
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM party_members WHERE party_id = ?`)
      .get(party_id);
    const partyInfo = db
      .prepare(`SELECT max_members, status FROM parties WHERE id = ?`)
      .get(party_id);

    if (!partyInfo) {
      if (callback) callback(new Error("파티 정보를 찾을 수 없습니다."));
      return;
    }

    const memberCount = row.count;
    const maxMembers = partyInfo.max_members;
    const currentStatus = partyInfo.status;

    let newStatus = null;
    if (memberCount >= maxMembers && currentStatus === "구인중") {
      newStatus = "출발대기";

      //파티 풀일때 알림 보내는 부분 
      const members = db
        .prepare(`SELECT user_id FROM party_members WHERE party_id = ?`)
        .all(party_id)
        .map((row) => row.user_id);
      const partytitle = db.prepare("SELECT title FROM parties WHERE id = ?").get(party_id)?.title || null;

      const title = "파티가 가득찼습니다";
      const message = `파티제목 : ${partytitle}`;

      if (members.length > 0) {
        setTimeout(() => {
          sendNotificationToUsers(title, message, members);
        }, 3000);
      }
    } else if (
      memberCount < maxMembers &&
      (currentStatus === "출발대기" || currentStatus === "출발")
    ) {
      newStatus = "구인중";
    }

    if (newStatus) {
      db.prepare(`UPDATE parties SET status = ? WHERE id = ?`).run(
        newStatus,
        party_id
      );
    }

    if (callback) callback(null);
  } catch (err) {
    if (callback) callback(err);
  }
}

// ⭐ 전체 유저 랭킹 API (isBanned = 0)
app.get("/api/ranking", checkLogin, (req, res) => {
  try {
    const query = `
      SELECT username AS name, score
      FROM users
      WHERE isBanned = 0
      ORDER BY score DESC
    `;
    
    const ranking = db.prepare(query).all();

    const rankingWithRank = ranking.map((u, index) => ({
      rank: index + 1,
      name: u.name,
      score: u.score,
    }));

    res.json({ success: true, ranking: rankingWithRank });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/start-party", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { party_id } = req.body;

  if (!party_id)
    return res
      .status(400)
      .json({ success: false, message: "파티 ID가 필요합니다." });

  try {
    const party = db
      .prepare(`SELECT * FROM parties WHERE id = ?`)
      .get(party_id);

    if (!party)
      return res
        .status(404)
        .json({ success: false, message: "파티가 존재하지 않습니다." });
    if (party.creator_id !== userId)
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });

    db.prepare(
      `UPDATE parties SET status = '출발', time = strftime('%s','now') WHERE id = ?`
    ).run(party_id);

    //삭제예약
    const partyData = getPartyWithMembers(party_id);
    schedulePartyDelete(party_id, partyData);

    // 공통 함수 호출로 소켓 알림
    broadcastPartyUpdate(party_id);

    res.json({
      success: true,
      message: "파티가 출발했습니다. 15분 후 자동 삭제됩니다.",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

//출발취소 api
app.post("/api/back-party", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { party_id } = req.body;

  if (!party_id) {
    return res
      .status(400)
      .json({ success: false, message: "❌ 파티 ID가 필요합니다." });
  }

  try {
    // 파티 정보 조회
    const party = db
      .prepare(`SELECT * FROM parties WHERE id = ?`)
      .get(party_id);

    if (!party) {
      return res
        .status(404)
        .json({ success: false, message: "❌ 파티가 존재하지 않습니다." });
    }

    // 권한 체크
    if (party.creator_id !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "❌ 권한이 없습니다." });
    }

    // 출발 상태가 아닌 경우
    if (party.status !== "출발") {
      return res.status(400).json({
        success: false,
        message: "❌ 출발 상태인 파티만 되돌릴 수 있습니다.",
      });
    }

    // 상태를 '구인중'으로 되돌리기 (time은 건드리지 않음)
    db.prepare(
      `UPDATE parties 
       SET status = '구인중'
       WHERE id = ?`
    ).run(party_id);

    // 삭제 예약 취소
    cancelPartyDelete(party_id);

    // 인원수에 따라 상태 재갱신
    updatePartyStatusIfFull(party_id, (err) => {
      if (err) console.error("상태 갱신 오류:", err);
    });

    // 소켓 알림
    broadcastPartyUpdate(party_id);

    // 로그 기록은 하지 않음 (취소는 로깅 제외)

    return res.json({
      success: true,
      message: "✅ 파티 출발이 취소되어 구인중 상태로 되돌렸습니다.",
    });
  } catch (err) {
    console.error("파티 출발 취소 오류:", err);
    return res
      .status(500)
      .json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

//파티제목변경
app.post("/api/change-party-title", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { party_id, title } = req.body;

  if (!party_id || !title) {
    return res.status(400).json({
      success: false,
      message: "❌ 파티 ID와 새로운 제목이 필요합니다.",
    });
  }

  try {
    // 파티 조회
    const party = db
      .prepare(`SELECT * FROM parties WHERE id = ?`)
      .get(party_id);

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "❌ 파티가 존재하지 않습니다.",
      });
    }

    // 권한 체크
    if (party.creator_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "❌ 권한이 없습니다.",
      });
    }

    // 제목 변경
    db.prepare(
      `UPDATE parties
       SET title = ?
       WHERE id = ?`
    ).run(title, party_id);

    // 소켓 알림
    broadcastPartyUpdate(party_id);

    return res.json({
      success: true,
      message: "✅ 파티 제목이 변경되었습니다.",
    });
  } catch (err) {
    console.error("파티 제목 변경 오류:", err);
    return res
      .status(500)
      .json({ success: false, message: "서버 오류가 발생했습니다." });
  }
});

// ✅ 파티 홍보 API
app.post("/api/promote-party", checkLogin, (req, res) => {
  const userId = req.user.userId;
  const { party_id } = req.body;

  if (!party_id) {
    return res
      .status(400)
      .json({ success: false, message: "파티 ID가 필요합니다." });
  }

  try {
    // 파티 정보 조회
    const party = db
      .prepare(`SELECT * FROM parties WHERE id = ?`)
      .get(party_id);

    if (!party) {
      return res
        .status(404)
        .json({ success: false, message: "파티가 존재하지 않습니다." });
    }

    if (party.creator_id !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "권한이 없습니다." });
    }

    const now = Math.floor(Date.now() / 1000); // 현재 Unix timestamp
    const lastPromote = party.promote_time || 0;
    const diff = now - lastPromote;

    if (diff < 15 * 60) {
      const remain = 15 * 60 - diff;
      const min = Math.floor(remain / 60);
      const sec = remain % 60;
      return res.json({
        success: false,
        message: `홍보는 ${min}분 ${sec}초 후에 가능합니다.`,
      });
    }

    // ✅ promote_time 갱신
    db.prepare(
      `UPDATE parties SET promote_time = strftime('%s','now') WHERE id = ?`
    ).run(party_id);

    // ✅ 알림 메시지 만들기
    const userRow = db
      .prepare(`SELECT username, nickname FROM users WHERE id = ?`)
      .get(userId);

    const partyTypeRow = db
      .prepare(`SELECT name FROM party_types WHERE id = ?`)
      .get(party.party_type_id);

    const difficultyRow = db
      .prepare(`SELECT name FROM difficulties WHERE id = ?`)
      .get(party.difficulty_id);

    const safeTitle = party.title || "";
    const safeUsername = userRow?.username ? userRow.username : null;
    const safeNickname = userRow?.nickname ? userRow.nickname : null;
    const partyTypeName = partyTypeRow?.name || "";
    const difficultyName = difficultyRow?.name || "";

    const displayName =
      safeNickname && safeUsername && safeNickname !== safeUsername
        ? `${safeNickname}(${safeUsername})`
        : safeNickname || safeUsername || "알 수 없음";

    const notifyTitle = `${displayName}님이 애타게 파티원을 찾고있습니다!`;
    let notifyMessage = "";
    if (partyTypeName === "기타") {
      notifyMessage = `${safeTitle} / ${partyTypeName} (${party.max_members}인)`;
    } else {
      notifyMessage = `${safeTitle} / ${partyTypeName} (${difficultyName})`;
    }

    // ✅ 알림 전송
    if (safeTitle === "테스트") {
      sendNotificationToUsers(notifyTitle, notifyMessage, userId);
    } else {
      sendNotificationToEnabled(notifyTitle, notifyMessage);
    }

    // ✅ 성공 응답
    res.json({
      success: true,
      message: "홍보 성공!",
    });
  } catch (err) {
    console.error("홍보 처리 오류:", err.message);
    res
      .status(500)
      .json({ success: false, message: "홍보 처리 중 오류가 발생했습니다." });
  }
});

app.get("/api/parties", checkLogin, (req, res) => {
  try {
    const partiesQuery = `
      SELECT id
      FROM parties
    `;
    const partyIds = db
      .prepare(partiesQuery)
      .all()
      .map((p) => p.id);

    if (!partyIds.length) {
      return res.json({ success: true, parties: [] });
    }

    const isAdmin = adminUsernames.includes(req.user.username);

    const partiesWithMembers = partyIds
      .map((partyId) => getPartyWithMembers(partyId, isAdmin))
      .filter(Boolean); // 조회 실패 파티 제외

    res.json({ success: true, parties: partiesWithMembers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/subscribe", checkLogin, (req, res) => {
  try {
    const subscription = req.body;
    const userId = req.user.userId;

    saveSubscription(userId, subscription); // 동기 함수라고 가정

    res.status(200).json({ success: true, message: "구독 정보 저장 완료" });
  } catch (error) {
    console.error("저장 실패:", error.message);
    res.status(400).json({ success: false, message: "구독 정보 저장 실패" });
  }
});

// 루트 및 페이지 라우팅
app.get("/", (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.redirect("/login.html");

  try {
    jwt.verify(token, SECRET_KEY);
    return res.redirect("/party.html");
  } catch {
    return res.redirect("/login.html");
  }
});

app.get("/party.html", (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.redirect("/");

  try {
    jwt.verify(token, SECRET_KEY);
    return res.redirect("/party.html");
  } catch {
    return res.redirect("/");
  }
});

// 로그아웃
app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

// HTTP 서버 (80번) - HTTPS 리다이렉트
const httpServer = http.createServer(app);

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP 서버 실행 중 - 포트 ${HTTP_PORT}`);
});

httpServer.on("error", (err) => {
  console.error("HTTP 서버 에러:", err);
});

// 소켓 서버 생성 및 설정
const io = new Server(httpServer, {
  cors: {
    origin: [
      "https://xn--om2bo5af0e.com",
      "https://보레링.com",
    ],
    methods: ["GET", "POST"],
  },
  pingInterval: 10000, // 10초마다 ping 전송
  pingTimeout: 5000, // 5초 내 pong 응답 없으면 끊김 처리
});

// JWT 인증 미들웨어 (Socket.IO)
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) {
    return next(new Error("인증 토큰이 없습니다."));
  }

  try {
    const userData = jwt.verify(token, SECRET_KEY);
    const { userId, username, nickname, iat } = userData;

    // DB에서 사용자 정보 조회
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

    if (!user) {
      return next(new Error("사용자를 찾을 수 없습니다."));
    }

    if (user.isBanned) {
      return next(new Error("차단된 사용자입니다."));
    }

    if (!user.iat) {
      return next(new Error("만료된 토큰입니다."));
    }

    // user.iat (DATETIME) → ISO 8601 UTC 변환
    const dbIatIso = user.iat.replace(" ", "T") + "Z";
    const dbIatUnix = Math.floor(new Date(dbIatIso).getTime() / 1000);

    if (isNaN(dbIatUnix)) {
      return next(new Error("만료된 토큰입니다."));
    }

    if (iat < dbIatUnix) {
      return next(new Error("만료된 토큰입니다."));
    }

    socket.user = { userId, username, nickname };
    next();
  } catch (err) {
    return next(new Error("유효하지 않은 토큰입니다."));
  }
});

//채팅 보관용 변수
const chatHistory = []; // 최근 채팅 1000개 저장
const MAX_CHAT_HISTORY = 500; //보관할 채팅개수 설정

// 동접자 저장 변수 (userId -> { user, sockets: Set<socketId> })
const connectedUsers = new Map();

// 클라이언트 연결 이벤트
io.on("connection", (socket) => {
  const { userId, username, nickname } = socket.user;

  // 접속자 기록 추가
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, {
      user: { userId, username, nickname },
      sockets: new Set(),
    });
  }
  connectedUsers.get(userId).sockets.add(socket.id);

  // 접속자 목록 갱신 방송
  io.emit(
    "users:update",
    Array.from(connectedUsers.values()).map((u) => u.user)
  );

  console.log(`✅ [${username}] 접속 (소켓 ID: ${socket.id})`);
  console.log(
    "현재 접속자 목록:",
    Array.from(connectedUsers.entries()).map(([key, val]) => ({
      userId: key,
      username: val.user.username,
      socketsCount: val.sockets.size,
    }))
  );
  socket.emit("chat:history", chatHistory);

  function handleAdminCommand(
    command,
    { userId, username: adminName, nickname }
  ) {
    const parts = command.trim().split(/\s+/); // 공백 기준으로 나눔
    const cmd = parts[0];

    let cmdlist = [
      "/명령어",
      "/사용자추가",
      "/사용자삭제",
      "/사용자리스트",
      "/코드변경",
      "/파티삭제",
      "/점수확인",
    ];

    if (cmd === "/명령어" || !cmdlist.includes(cmd)) {
      socket.emit("chat:system", {
        message:
          "/사용자추가 [username] [code] , /사용자삭제 [username] , /사용자리스트 (*모든인원점수확인 기능), /코드변경 [username] [code], /파티삭제 [party_code], /점수확인",
      });
      return;
    }
    const bcrypt = require("bcrypt");

    // /사용자추가 username code
    if (cmd === "/사용자추가") {
      if (parts.length < 3) {
        socket.emit("chat:system", {
          message: "❗사용법: /사용자추가 [username] [code]",
        });
        return true;
      }

      const newUsername = parts[1];
      const newCode = parts[2];
      const newNickname = newUsername; // nickname은 username과 동일하게 설정

      (async () => {
        try {
          const existingUser = db
            .prepare("SELECT * FROM users WHERE username = ?")
            .get(newUsername);

          // 새 코드 bcrypt 해시 생성
          const hashedCode = await bcrypt.hash(newCode, 10);

          if (existingUser) {
            if (existingUser.isBanned === 1) {
              db.prepare(
                `
              UPDATE users
              SET isBanned = 0, code = ?, nickname = ?, iat = CURRENT_TIMESTAMP
              WHERE username = ?
            `
              ).run(hashedCode, newNickname, newUsername);

              socket.emit("chat:system", {
                message: `✅ '${newUsername}'의 차단이 해제되었고, 코드가 갱신되었습니다.`,
              });
            } else {
              socket.emit("chat:system", {
                message: `⚠️ '${newUsername}'은 이미 존재합니다.`,
              });
            }
          } else {
            db.prepare(
              "INSERT INTO users (username, nickname, code, iat) VALUES (?, ?, ?, CURRENT_TIMESTAMP)"
            ).run(newUsername, newNickname, hashedCode);

            socket.emit("chat:system", {
              message: `✅ 사용자 '${newUsername}' 추가 완료`,
            });
          }

          return true;
        } catch (err) {
          console.error("사용자 추가 실패:", err.message);
          socket.emit("chat:system", {
            message: `❌ 사용자 추가 실패: ${err.message}`,
          });
          return true;
        }
      })();
    }

    // /사용자삭제 username
    if (cmd === "/사용자삭제") {
      if (parts.length < 2) {
        socket.emit("chat:system", {
          message: "❗사용법: /사용자삭제 [username]",
        });
        return true;
      }

      const delUsername = parts[1];

      try {
        const user = db
          .prepare("SELECT id FROM users WHERE username = ?")
          .get(delUsername);

        if (!user) {
          socket.emit("chat:system", {
            message: `❗사용자 '${delUsername}'를 찾을 수 없습니다.`,
          });
          return true;
        }

        // 연결된 소켓 강제 끊기
        const targetUserId = user.id;
        const connected = connectedUsers.get(targetUserId);
        if (connected) {
          connected.sockets.forEach((socketId) => {
            const sock = io.sockets.sockets.get(socketId);
            if (sock) {
              sock.disconnect(true);
            }
          });
          connectedUsers.delete(targetUserId);
        }

        // 차단 + code를 userid로 덮어쓰기 + 삭제시각 기록
        const result = db
          .prepare(
            `
      UPDATE users
      SET isBanned = 1,
          code = ?,
          iat = CURRENT_TIMESTAMP
      WHERE id = ?
    `
          )
          .run(String(user.id), user.id);

        // 구독 정보 삭제
        db.prepare("DELETE FROM subscriptions WHERE user_id = ?").run(user.id);

        if (result.changes > 0) {
          socket.emit("chat:system", {
            message: `🚫 사용자 '${delUsername}'가 삭제(차단)되고 알림구독 정보가 삭제되었습니다.`,
          });
        } else {
          socket.emit("chat:system", {
            message: `❗사용자 '${delUsername}'를 찾을 수 없습니다.`,
          });
        }
      } catch (err) {
        console.error("사용자 삭제 실패:", err.message);
        socket.emit("chat:system", {
          message: `❌ 사용자 삭제 실패: ${err.message}`,
        });
      }

      return true;
    }
    // 사용자 리스트
    if (cmd === "/사용자리스트") {
  try {
    // 7점 이상 사용자
    const highUsers = db
      .prepare(
        "SELECT username, score FROM users WHERE isBanned = 0 AND score >= 7 ORDER BY score DESC"
      )
      .all();

    // 7점 미만 사용자
    const lowUsers = db
      .prepare(
        "SELECT username, score FROM users WHERE isBanned = 0 AND score < 7 ORDER BY score DESC"
      )
      .all();

    if (highUsers.length === 0 && lowUsers.length === 0) {
      socket.emit("chat:system", {
        message: "📭 등록된 사용자가 없습니다.",
      });
    } else {
      if (highUsers.length > 0) {
        const highList = highUsers
          .map((u) => `(${u.username} : ${u.score})`)
          .join("\n");

        socket.emit("chat:system", {
          message: `👥 7점 이상 사용자 목록:\n${highList}`,
        });
      }

      if (lowUsers.length > 0) {
        const lowList = lowUsers
          .map((u) => `(${u.username} : ${u.score})`)
          .join("\n");

        socket.emit("chat:system", {
          message: `📉 7점 미만 사용자 목록:\n${lowList}`,
        });
      }
    }

    return true;
  } catch (err) {
    console.error("사용자 리스트 조회 실패:", err.message);
    socket.emit("chat:system", {
      message: `❌ 사용자 리스트 조회 실패: ${err.message}`,
    });
    return true;
  }
}    if (cmd === "/코드변경") {
      if (parts.length < 3) {
        socket.emit("chat:system", {
          message: "❗사용법: /코드변경 [username] [code]",
        });
        return true;
      }

      const targetUsername = parts[1];
      const newCode = parts[2];

      try {
        const user = db
          .prepare("SELECT * FROM users WHERE username = ? AND isBanned = 0")
          .get(targetUsername);

        if (!user) {
          socket.emit("chat:system", {
            message: `⚠️ '${targetUsername}'는 존재하지 않거나 차단된 사용자입니다.`,
          });
          return true;
        }

        // bcrypt 해시 생성 (비동기 → Promise를 쓰려면 async 필요)
        bcrypt.hash(newCode, 10).then((hashedCode) => {
          // 현재 시간 DATETIME 포맷 (YYYY-MM-DD HH:mm:ss)
          const nowDatetime = new Date()
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");

          // code(해시값) + iat 함께 갱신
          db.prepare(
            "UPDATE users SET code = ?, iat = ? WHERE username = ?"
          ).run(hashedCode, nowDatetime, targetUsername);

          // 연결된 소켓 강제 끊기
          const targetUserId = user.id;
          const connected = connectedUsers.get(targetUserId);
          if (connected) {
            connected.sockets.forEach((socketId) => {
              const sock = io.sockets.sockets.get(socketId);
              if (sock) {
                sock.disconnect(true);
              }
            });
            connectedUsers.delete(targetUserId);
          }

          // 구독 정보 삭제
          db.prepare("DELETE FROM subscriptions WHERE user_id = ?").run(
            user.id
          );

          socket.emit("chat:system", {
            message: `🔑 '${targetUsername}'의 코드가 성공적으로 변경되었습니다.`,
          });
        });
      } catch (err) {
        console.error("코드 변경 실패:", err.message);
        socket.emit("chat:system", {
          message: `❌ 코드 변경 실패: ${err.message}`,
        });
      }

      return true;
    }
    if (cmd === "/파티삭제") {
      if (parts.length < 2) {
        socket.emit("chat:system", {
          message: "❗사용법: /파티삭제 [partyId]",
        });
        return true;
      }

      const partyId = parts[1];

      try {
        // 먼저 파티 존재 여부 확인
        const party = db
          .prepare("SELECT * FROM parties WHERE id = ?")
          .get(partyId);
        if (!party) {
          socket.emit("chat:system", {
            message: `⚠️ ID '${partyId}'에 해당하는 파티가 존재하지 않습니다.`,
          });
          return true;
        }

        const partyData = getPartyWithMembers(partyId);
        // 파티 삭제
        deleteParty(partyId, partyData, (err) => {
          if (err) {
            console.error("파티 삭제 실패:", err.message);
            socket.emit("chat:system", {
              message: `❌ 파티 삭제 실패: ${err.message}`,
            });
            return;
          }

          // 삭제 알림
          broadcastPartyDelete(partyId);

          // 전체 사용자 목록 갱신
          io.emit(
            "users:update",
            Array.from(connectedUsers.values()).map((u) => ({ ...u.user }))
          );

          socket.emit("chat:system", {
            message: `✅ 파티 ID '${partyId}'가 성공적으로 삭제되었습니다.`,
          });
        });

        return true;
      } catch (err) {
        console.error("파티 삭제 명령 실패:", err.message);
        socket.emit("chat:system", {
          message: `❌ 파티 삭제 명령 실패: ${err.message}`,
        });
        return true;
      }
    }
    // 내 점수 확인
    if (cmd === "/점수확인") {
      try {
        const user = db
          .prepare(
            "SELECT username, score, total_score FROM users WHERE id = ? AND isBanned = 0"
          )
          .get(userId);

        if (!user) {
          socket.emit("chat:system", {
            message: "🚫 존재하지 않거나 차단된 사용자입니다.",
          });
          return true;
        }

        socket.emit("chat:system", {
          message: `🎯 ${user.username}님의 이번달 점수는 ${user.score}점, 누적 점수는 ${user.total_score}점 입니다.`,
        });

        return true;
      } catch (err) {
        console.error("점수 조회 실패:", err.message);
        socket.emit("chat:system", {
          message: `❌점수 조회 실패: ${err.message}`,
        });
        return true;
      }
    }

    // 기타 명령어들 추가 가능...

    return false; // 해당 명령어가 처리되지 않음
  }
  function handleUserCommand(command, { userId, username, nickname }) {
    const parts = command.trim().split(/\s+/); // 공백 기준으로 나눔
    const cmd = parts[0];

    let cmdlist = ["/코드변경", "/점수확인"];

    if (cmd === "/명령어" || !cmdlist.includes(cmd)) {
      socket.emit("chat:system", {
        message:
          "/코드변경 [새 코드] [새 코드 확인]\n(예: /코드변경 abcd1234 abcd1234), /점수확인",
      });
      return;
    }
    if (cmd === "/코드변경") {
      if (parts.length < 3) {
        socket.emit("chat:system", {
          message:
            "❗ 사용법: /코드변경 [새 코드] [새 코드 확인]\n(예: /코드변경 abcd1234 abcd1234)",
        });
        return true;
      }

      const newCode1 = parts[1];
      const newCode2 = parts[2];

      if (newCode1 !== newCode2) {
        socket.emit("chat:system", {
          message: "⚠️ 입력한 두 코드가 일치하지 않습니다. 다시 입력해주세요.",
        });
        return true;
      }

      try {
        const user = db
          .prepare("SELECT * FROM users WHERE id = ? AND isBanned = 0")
          .get(userId);

        if (!user) {
          socket.emit("chat:system", {
            message: "🚫 존재하지 않거나 차단된 사용자입니다.",
          });
          return true;
        }

        const hashedCode = bcrypt.hashSync(newCode1, 10);

        const nowDatetime = new Date()
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");

        db.prepare("UPDATE users SET code = ?, iat = ? WHERE id = ?").run(
          hashedCode,
          nowDatetime,
          userId
        );

        socket.emit("chat:system", {
          message:
            "✅ 코드가 성공적으로 변경되었습니다.(모든기기)새로 로그인, 알림등록 해주세요!",
        });
        socket.emit("changecode:refresh", {});

        const connected = connectedUsers.get(userId);
        if (connected) {
          connected.sockets.forEach((socketId) => {
            const sock = io.sockets.sockets.get(socketId);
            if (sock) {
              sock.disconnect(true);
            }
          });
          connectedUsers.delete(userId);
        }

        db.prepare("DELETE FROM subscriptions WHERE user_id = ?").run(userId);

        return true;
      } catch (err) {
        console.error("코드 변경 실패:", err.message);
        socket.emit("chat:system", {
          message: `❌ 코드 변경 실패: ${err.message}`,
        });
        return true;
      }
    }
    // 내 점수 확인
    if (cmd === "/점수확인") {
      try {
        const user = db
          .prepare(
            "SELECT username, score, total_score FROM users WHERE id = ? AND isBanned = 0"
          )
          .get(userId);

        if (!user) {
          socket.emit("chat:system", {
            message: "🚫 존재하지 않거나 차단된 사용자입니다.",
          });
          return true;
        }

        socket.emit("chat:system", {
          message: `🎯 ${user.username}님의 이번달 점수는 ${user.score}점, 누적 점수는 ${user.total_score}점 입니다.`,
        });

        return true;
      } catch (err) {
        console.error("점수 조회 실패:", err.message);
        socket.emit("chat:system", {
          message: `❌점수 조회 실패: ${err.message}`,
        });
        return true;
      }
    }

    // 기타 명령어들 추가 가능...

    return false; // 해당 명령어가 처리되지 않음
  }

  // 클라이언트 메시지 처리
  socket.on("chat:message", (msg) => {
    if (typeof msg !== "string") return;

    const trimmed = msg.trim();

    // 명령어 처리 (추후 업데이트 예정)
    if (trimmed.length === 0 || trimmed.length > 300) return;

    // 항상 최신 유저 정보에서 닉네임 가져오기
    const userInfo = connectedUsers.get(userId);
    const latestUsername = userInfo?.user.username || username;
    const latestNickname = userInfo?.user.nickname || nickname;
    const isAdmin = adminUsernames.includes(latestUsername);

    if (trimmed.startsWith("/")) {
      if (isAdmin) {
        //명령어처리
        handleAdminCommand(trimmed, {
          userId,
          username: latestUsername,
          nickname: latestNickname,
        });
        return; //채팅은안보냄
      } else {
        handleUserCommand(trimmed, {
          userId,
          username: latestUsername,
          nickname: latestNickname,
        });

        return;
      }
    }

    console.log(
      `Message from userId: ${userId}, username: ${latestUsername}, nickname: ${latestNickname}`
    );
    console.log(`[${latestUsername}] 채팅: ${trimmed}`);

    // 현재 시각 (초 단위 Unix timestamp)
    const timestamp = Math.floor(Date.now() / 1000);

    // 💬 실시간 전송 (최소 정보 + timestamp 추가)
    io.emit("chat:message", {
      userId,
      message: trimmed,
      timestamp, // 👈 클라이언트가 채팅 정렬에 쓸 수 있음
    });

    // 💾 서버 내 저장용 (풀 정보 + timestamp 추가)
    const chatData = {
      userId,
      username: latestUsername,
      nickname: latestNickname,
      message: trimmed,
      timestamp,
    };

    chatHistory.push(chatData);
    if (chatHistory.length > MAX_CHAT_HISTORY) {
      chatHistory.shift();
    }
  });

  // 소켓 연결 해제 처리
  socket.on("disconnect", () => {
    const data = connectedUsers.get(userId);
    if (data) {
      data.sockets.delete(socket.id);
      if (data.sockets.size === 0) {
        connectedUsers.delete(userId);
      }
    }

    console.log(`❌ [${username}] 연결 해제 (소켓 ID: ${socket.id})`);

    io.emit(
      "users:update",
      Array.from(connectedUsers.values()).map((u) => u.user)
    );
    console.log(
      "현재 접속자 목록:",
      Array.from(connectedUsers.entries()).map(([key, val]) => ({
        userId: key,
        username: val.user.username,
        socketsCount: val.sockets.size,
      }))
    );
  });
  socket.on("error", (err) => {
    console.error("Socket.IO 에러:", err);
  });
});

//실시간 업데이트 소켓 기준
// 파티 생성이 완료된 직후에 실행되는 로직
/**
 * 파티 정보 + 멤버 조회 후 객체 생성
 * @param {number} partyId
 * @param {boolean} forAdmin 제목에 ID 붙일지 여부
 */
function getPartyWithMembers(partyId, forAdmin = false) {
  const partyQuery = `
    SELECT p.*, pt.name AS party_type_name, d.name AS difficulty_name
    FROM parties p
    LEFT JOIN party_types pt ON p.party_type_id = pt.id
    LEFT JOIN difficulties d ON p.difficulty_id = d.id
    WHERE p.id = ?
  `;
  const party = db.prepare(partyQuery).get(partyId);
  if (!party) return null;

  const membersQuery = `
    SELECT u.id, u.username, u.nickname, u.class
    FROM party_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.party_id = ?
    ORDER BY pm.id ASC
  `;
  const members = db.prepare(membersQuery).all(partyId);

  const title = forAdmin ? `${party.title}(${party.id})` : party.title;

  return {
    id: party.id,
    title,
    status: party.status,
    max_members: party.max_members,
    party_type_name: party.party_type_name,
    difficulty_name: party.difficulty_name,
    creator_id: party.creator_id,
    time: party.time,
    members: members.map((m) => ({
      id: m.id,
      username: m.username,
      nickname: m.nickname,
      class: m.class,
    })),
  };
}

/**
 * 파티 생성 브로드캐스트
 */
function broadcastNewParty(partyId) {
  try {
    connectedUsers.forEach(({ user, sockets }) => {
      const isAdmin = adminUsernames.includes(user.username);
      const data = getPartyWithMembers(partyId, isAdmin);

      if (!data) return;

      sockets.forEach((socketId) => {
        io.to(socketId).emit("new-party", data);
      });
    });
  } catch (err) {
    console.error("파티 생성 브로드캐스트 실패:", err.message);
  }
}

/**
 * 파티 업데이트 브로드캐스트
 */
function broadcastPartyUpdate(partyId) {
  try {
    connectedUsers.forEach(({ user, sockets }) => {
      const isAdmin = adminUsernames.includes(user.username);
      const data = getPartyWithMembers(partyId, isAdmin);

      if (!data) return;

      sockets.forEach((socketId) => {
        io.to(socketId).emit("party-update", data);
      });
    });
  } catch (err) {
    console.error("파티 업데이트 브로드캐스트 실패:", err.message);
  }
}

function broadcastPartyDelete(partyId) {
  io.emit("party-delete", { id: partyId });
}

function deleteParty(partyId, partyData, callback) {
  try {
    const party = db.prepare(`SELECT * FROM parties WHERE id = ?`).get(partyId);
    if (!party) return callback(new Error("존재하지 않는 파티입니다."));

    if (party.status === "출발" && party.title !== "테스트") {
      // 로깅: 출발 시점 기준
      logParty(party.status, party.party_score, partyData);

      const updateScore = db.prepare(`UPDATE users SET score = score + ?, total_score = total_score + ? WHERE id = ?`);

      // partyData.members 기준으로 점수 지급 여부 판단
      for (const member of partyData.members) {
        // rawInput: 멤버의 닉네임 혹은 전투력 문자열, username: DB username
        if (canEarnScore(member.nickname, member.username, lesspower)) {
          updateScore.run(party.party_score, party.party_score, member.id);
        }
      }
    }

    // 삭제 로직 그대로
    db.prepare(`DELETE FROM party_members WHERE party_id = ?`).run(partyId);
    db.prepare(`DELETE FROM parties WHERE id = ?`).run(partyId);

    callback(null);
  } catch (err) {
    callback(err);
  }
}

function saveSubscription(userId, subscription) {
  if (
    typeof userId !== "number" ||
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.keys ||
    typeof subscription.keys.p256dh !== "string" ||
    typeof subscription.keys.auth !== "string"
  ) {
    console.error("잘못된 구독 정보 또는 사용자 ID");
    return;
  }

  const { endpoint, keys } = subscription;

  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(userId, endpoint, keys.p256dh, keys.auth);
    console.log("구독 정보 저장 완료");
  } catch (err) {
    console.error("구독 정보 저장 오류:", err.message);
  }
}

//전체공지 푸시
function sendNotificationToAll(title, message, userId = null) {
  try {
    let query = `SELECT * FROM subscriptions`;
    let params = [];

    if (typeof userId === "number") {
      query += ` WHERE user_id = ?`;
      params = [userId];
    } else if (Array.isArray(userId) && userId.length > 0) {
      const placeholders = userId.map(() => "?").join(", ");
      query += ` WHERE user_id IN (${placeholders})`;
      params = userId;
    }

    const rows = db.prepare(query).all(...params);

    if (!rows.length) {
      console.log("푸시 대상 없음");
      return;
    }

    const payload = JSON.stringify({
      title,
      body: message,
      timestamp: Date.now(),
    });

    rows.forEach((row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      webpush
        .sendNotification(subscription, payload)
        .then(() => {
          console.log(`✅ 전송 성공: user ${row.user_id}`);
        })
        .catch((error) => {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // 삭제 함수 호출
            deleteSubscriptionFromDB(row.endpoint);
          }
        });
    });
  } catch (err) {
    console.error("DB 조회 오류:", err.message);
  }
}

//알림허용 푸시
// is_enabled = 1 인 구독자에게만 푸시 보내기
function sendNotificationToEnabled(title, message, userId = null) {
  try {
    let query = `SELECT * FROM subscriptions WHERE is_enabled = 1`;
    let params = [];

    if (typeof userId === "number") {
      query += ` AND user_id = ?`;
      params = [userId];
    } else if (Array.isArray(userId) && userId.length > 0) {
      const placeholders = userId.map(() => "?").join(", ");
      query += ` AND user_id IN (${placeholders})`;
      params = userId;
    }

    const rows = db.prepare(query).all(...params);

    if (!rows.length) {
      console.log("활성화된 푸시 대상 없음");
      return;
    }

    const payload = JSON.stringify({
      title,
      body: message,
      timestamp: Date.now(),
    });

    rows.forEach((row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      webpush
        .sendNotification(subscription, payload)
        .then(() => {
          console.log(`✅ 전송 성공: user ${row.user_id}`);
        })
        .catch((error) => {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // 삭제 함수 호출
            deleteSubscriptionFromDB(row.endpoint);
          }
        });
    });
  } catch (err) {
    console.error("DB 조회 오류:", err.message);
  }
}

//알림꺼져도 푸시
// is_enabled 상관없이 특정 userId(들)에게만 푸시 보내기
function sendNotificationToUsers(title, message, userId = null) {
  try {
    if (!userId || (Array.isArray(userId) && userId.length === 0)) {
      console.log("userId가 지정되지 않아 대상이 없습니다.");
      return;
    }

    let query = `SELECT * FROM subscriptions WHERE `;
    let params = [];

    if (typeof userId === "number") {
      query += `user_id = ?`;
      params = [userId];
    } else if (Array.isArray(userId)) {
      const placeholders = userId.map(() => "?").join(", ");
      query += `user_id IN (${placeholders})`;
      params = userId;
    }

    const rows = db.prepare(query).all(...params);

    if (!rows.length) {
      console.log("대상 구독자 없음");
      return;
    }

    const payload = JSON.stringify({
      title,
      body: message,
      timestamp: Date.now(),
    });

    rows.forEach((row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      webpush
        .sendNotification(subscription, payload)
        .then(() => {
          console.log(`✅ 전송 성공: user ${row.user_id}`);
        })
        .catch((error) => {
          console.error(`❌ 전송 실패 (user ${row.user_id}):`, error.message);
          if (error.statusCode === 410 || error.statusCode === 404) {
            // 삭제 함수 호출
            deleteSubscriptionFromDB(row.endpoint);
          }
        });
    });
  } catch (err) {
    console.error("DB 조회 오류:", err.message);
  }
}
function deleteSubscriptionFromDB(endpoint) {
  try {
    const stmt = db.prepare("DELETE FROM subscriptions WHERE endpoint = ?");
    const result = stmt.run(endpoint);
    if (result.changes > 0) {
      console.log(`🗑️ 구독 정보 삭제 완료: ${endpoint}`);
    } else {
      console.log(`⚠️ 삭제할 구독 정보가 없습니다: ${endpoint}`);
    }
  } catch (err) {
    console.error("구독 정보 삭제 실패:", err.message);
  }
}

function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (match) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[match])
  );
}
//testPush();

process.on("uncaughtException", (err) => {
  console.error("❌ 처리되지 않은 예외 발생:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ 처리되지 않은 프로미스 거부:", reason);
});

//로그
function logParty(party_status, party_score, party) {
  const logDir = path.join(__dirname, "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  const logPath = path.join(logDir, "party.jsonl");

  const logEntry = {
    timestamp: new Date().toISOString(),
    party_status,
    party_score,
    ...party,
  };

  fs.appendFile(logPath, JSON.stringify(logEntry) + "\n", (err) => {
    if (err) {
      console.error("로그 저장 중 오류 발생:", err);
    }
  });
}

//updatePartyTypes();
