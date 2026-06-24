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