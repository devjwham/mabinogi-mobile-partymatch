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