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

app.use((req, res, next) => {
  if (req.hostname !== allowedHost) {
    return res.redirect(301, `https://${allowedHost}${req.originalUrl}`);
  }
  next();
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


// HTTP 서버 (80번) - HTTPS 리다이렉트
const httpServer = http.createServer(app);

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP 서버 실행 중 - 포트 ${HTTP_PORT}`);
});

httpServer.on("error", (err) => {
  console.error("HTTP 서버 에러:", err);
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
