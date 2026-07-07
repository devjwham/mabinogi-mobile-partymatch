/**
 * @swagger
 * /api/webpush/subscriptions:
 *   get:
 *     summary: 내 웹푸시 구독 기기 목록 조회
 *     tags:
 *       - Webpush
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
 *                             example: 1
 *                           endpoint:
 *                             type: string
 *                             example: "https://fcm.googleapis.com/fcm/send/..."
 *                           browser_name:
 *                             type: string
 *                             example: "Chrome"
 *                           os_name:
 *                             type: string
 *                             example: "Windows"
 *                           status:
 *                             type: string
 *                             example: "ACTIVE"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-06-01T10:00:00.000Z"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/webpush/check-device:
 *   post:
 *     summary: 현재 기기 등록 여부 체크
 *     tags:
 *       - Webpush
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endpoint:
 *                 type: string
 *                 example: "https://fcm.googleapis.com/fcm/send/..."
 *             required:
 *               - endpoint
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
 *                         registered:
 *                           type: boolean
 *                           example: true
 *                         status:
 *                           type: string
 *                           nullable: true
 *                           example: "ACTIVE"
 *       400:
 *         description: endpoint 누락
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
 * /api/webpush/register:
 *   post:
 *     summary: 웹푸시 구독 등록 및 갱신
 *     tags:
 *       - Webpush
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subscription:
 *                 type: object
 *                 properties:
 *                   endpoint:
 *                     type: string
 *                   keys:
 *                     type: object
 *                     properties:
 *                       p256dh:
 *                         type: string
 *                       auth:
 *                         type: string
 *               browserName:
 *                 type: string
 *                 example: "Chrome"
 *               osName:
 *                 type: string
 *                 example: "Windows"
 *               userAgent:
 *                 type: string
 *                 nullable: true
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
 *                         message:
 *                           type: string
 *                           example: "구독 정보가 성공적으로 등록/갱신 되었습니다."
 *       400:
 *         description: 잘못된 구독 객체
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
 * /api/webpush/toggle/{id}:
 *   patch:
 *     summary: 구독 알림 상태 토글 (ACTIVE ↔ UNSUBSCRIBED)
 *     tags:
 *       - Webpush
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 5
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
 *                         id:
 *                           type: integer
 *                           example: 5
 *                         newState:
 *                           type: string
 *                           example: "ACTIVE"
 *       404:
 *         description: 구독 정보를 찾을 수 없음 또는 권한 없음
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
 * /api/webpush/subscriptions/{id}:
 *   delete:
 *     summary: 구독 정보 삭제
 *     tags:
 *       - Webpush
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 5
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
 *                         id:
 *                           type: integer
 *                           example: 5
 *                         message:
 *                           type: string
 *                           example: "구독 정보가 완전히 삭제되었습니다."
 *       404:
 *         description: 구독 정보를 찾을 수 없음 또는 권한 없음
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