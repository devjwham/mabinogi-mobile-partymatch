/**
 * @swagger
 * /api/shop/:
 *   get:
 *     summary: 상점 아이템 목록 조회 (보유/장착 상태 포함)
 *     tags:
 *       - Shop
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
 *                           itemId:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: "드래곤 슬레이어 타이틀"
 *                           price:
 *                             type: integer
 *                             example: 500
 *                           isShopItem:
 *                             type: integer
 *                             example: 1
 *                           defaultDurationDays:
 *                             type: integer
 *                             nullable: true
 *                             example: 30
 *                           itemType:
 *                             type: string
 *                             example: "TITLE"
 *                           isOwned:
 *                             type: integer
 *                             example: 1
 *                           isEquipped:
 *                             type: integer
 *                             example: 0
 *                           inventoryId:
 *                             type: integer
 *                             nullable: true
 *                             example: 42
 *                           expiryDate:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             example: "2026-07-25T00:00:00.000Z"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/shop/purchase:
 *   post:
 *     summary: 아이템 구매
 *     tags:
 *       - Shop
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               itemId:
 *                 type: integer
 *                 example: 5
 *             required:
 *               - itemId
 *     responses:
 *       201:
 *         description: 구매 성공
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
 *                         inventoryId:
 *                           type: integer
 *                           example: 123
 *                         itemId:
 *                           type: integer
 *                           example: 5
 *                         expiryDate:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                           example: "2026-08-10T00:00:00.000Z"
 *       400:
 *         description: 요청 오류 (itemId 누락, 이미 보유, 점수 부족 등)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       403:
 *         description: 상점 판매 아이템이 아님
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 존재하지 않는 아이템
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
 * /api/shop/toggle-equip:
 *   patch:
 *     summary: 아이템 장착/해제 토글
 *     tags:
 *       - Shop
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventoryId:
 *                 type: integer
 *                 example: 42
 *             required:
 *               - inventoryId
 *     responses:
 *       200:
 *         description: 장착 상태 변경 성공
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
 *                         inventoryId:
 *                           type: integer
 *                           example: 42
 *                         isEquipped:
 *                           type: integer
 *                           example: 1
 *       400:
 *         description: 요청 오류 (inventoryId 누락)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 보유하지 않거나 만료된 아이템
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