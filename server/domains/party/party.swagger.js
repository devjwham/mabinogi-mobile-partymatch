/**
 * @swagger
 * /api/party/meta:
 *   get:
 *     summary: 파티 메타 정보(종류/난이도) 조회
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type_difficulty_id:
 *                             type: integer
 *                             example: 1
 *                           party_type_name:
 *                             type: string
 *                             example: "던전"
 *                           max_members:
 *                             type: integer
 *                             example: 4
 *                           difficulty_name:
 *                             type: string
 *                             example: "Normal"
 *                           base_score:
 *                             type: integer
 *                             example: 100
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/:
 *   get:
 *     summary: 활성 파티 목록 조회
 *     description: EXPIRED가 아닌 모든 파티와 파티원 정보, 장착 중인 decorations(아이템)까지 함께 조회합니다.
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 42
 *                           creatorId:
 *                             type: integer
 *                             example: 100
 *                           title:
 *                             type: string
 *                             example: "노말 던전 파티 구합니다"
 *                           status:
 *                             type: string
 *                             example: "RECRUITING"
 *                           partyScore:
 *                             type: integer
 *                             example: 1250
 *                           partyTypeName:
 *                             type: string
 *                             example: "던전"
 *                           difficultyName:
 *                             type: string
 *                             example: "NORMAL"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-07-07T15:30:00.000Z"
 *                           members:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 userId:
 *                                   type: integer
 *                                   example: 100
 *                                 characterId:
 *                                   type: integer
 *                                   example: 5
 *                                 nickname:
 *                                   type: string
 *                                   example: "용사"
 *                                 characterClass:
 *                                   type: string
 *                                   example: "attack"
 *                                 power:
 *                                   type: number
 *                                   example: 1250.5
 *                                 decorations:
 *                                   type: array
 *                                   description: 장착 중인 decoration 아이템 목록 (여러 개 가능)
 *                                   items:
 *                                     type: object
 *                                     properties:
 *                                       name:
 *                                         type: string
 *                                         example: "드래곤 슬레이어"
 *                                       itemType:
 *                                         type: string
 *                                         example: "TITLE"
 *                                         enum: 
 *                                           - TITLE
 *                                           - ACCESSORY
 *                                           - BADGE
 *                                           - FRAME
 *                                           - EFFECT
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/:
 *   post:
 *     summary: 파티 생성
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               typeDifficultyId:
 *                 type: integer
 *                 example: 1
 *               title:
 *                 type: string
 *                 example: "노말 던전 파티"
 *               characterId:
 *                 type: integer
 *                 example: 5
 *             required:
 *               - typeDifficultyId
 *               - title
 *               - characterId
 *     responses:
 *       201:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         title:
 *                           type: string
 *                           example: "노말 던전 파티"
 *                         status:
 *                           type: string
 *                           example: "RECRUITING"
 *       400:
 *         description: 요청 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/{partyId}/start:
 *   post:
 *     summary: 파티 출발
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         status:
 *                           type: string
 *                           example: "STARTED"
 *       400:
 *         description: 파티원 부족 등
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       403:
 *         description: 파티장 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 파티 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/{partyId}/back:
 *   post:
 *     summary: 파티 출발 취소 (대기 상태 복구)
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         status:
 *                           type: string
 *                           example: "RECRUITING"
 *       400:
 *         description: 잘못된 상태
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       403:
 *         description: 파티장 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 파티 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/{partyId}/join:
 *   post:
 *     summary: 파티 참여
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               characterId:
 *                 type: integer
 *                 example: 5
 *             required:
 *               - characterId
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         userId:
 *                           type: integer
 *                           example: 101
 *                         characterId:
 *                           type: integer
 *                           example: 5
 *       400:
 *         description: 요청 오류 (정원초과, 이미 가입 등)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 파티 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/{partyId}/leave:
 *   delete:
 *     summary: 파티 탈퇴
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         leftUserId:
 *                           type: integer
 *                           example: 101
 *       400:
 *         description: 파티장 탈퇴 불가 또는 미가입
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 파티 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/{partyId}/kick:
 *   delete:
 *     summary: 파티원 추방
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetUserId:
 *                 type: integer
 *                 example: 102
 *             required:
 *               - targetUserId
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         kickedUserId:
 *                           type: integer
 *                           example: 102
 *       400:
 *         description: 요청 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       403:
 *         description: 파티장 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 파티 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/{partyId}:
 *   delete:
 *     summary: 파티 삭제 (EXPIRED 상태 전환)
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         status:
 *                           type: string
 *                           example: "EXPIRED"
 *       400:
 *         description: 이미 출발/만료된 파티
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       403:
 *         description: 파티장 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 파티 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/{partyId}/title:
 *   patch:
 *     summary: 파티 제목 변경
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "업데이트된 파티 제목"
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         updatedTitle:
 *                           type: string
 *                           example: "업데이트된 파티 제목"
 *       400:
 *         description: 제목 누락
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       403:
 *         description: 파티장 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 파티 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/party/{partyId}/promote:
 *   post:
 *     summary: 파티 홍보 (10분 쿨타임)
 *     tags:
 *       - Party
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partyId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CommonSuccess'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         partyId:
 *                           type: integer
 *                           example: 42
 *                         msg:
 *                           type: string
 *                           example: "파티가 성공적으로 홍보되었습니다."
 *       403:
 *         description: 파티장 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 파티 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       429:
 *         description: 홍보 쿨타임 중
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */