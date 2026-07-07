/**
 * @swagger
 * /api/user/characters:
 *   get:
 *     summary: 사용자 캐릭터 목록 조회
 *     tags:
 *       - User Characters
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
 *                           user_id:
 *                             type: integer
 *                             example: 100
 *                           nickname:
 *                             type: string
 *                             example: "용사닉네임"
 *                           character_class:
 *                             type: string
 *                             example: "attack"
 *                           power:
 *                             type: number
 *                             example: 1250.5
 *                           character_type:
 *                             type: string
 *                             example: "MAIN"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 */

/**
 * @swagger
 * /api/user/characters:
 *   post:
 *     summary: 캐릭터 생성
 *     tags:
 *       - User Characters
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *                 example: "새로운용사"
 *               characterClass:
 *                 type: string
 *                 example: "attack"
 *               power:
 *                 type: number
 *                 example: 500
 *             required:
 *               - nickname
 *               - power
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
 *                         id:
 *                           type: integer
 *                           example: 42
 *                         userId:
 *                           type: integer
 *                           example: 100
 *                         nickname:
 *                           type: string
 *                           example: "새로운용사"
 *                         characterClass:
 *                           type: string
 *                           example: "attack"
 *                         power:
 *                           type: number
 *                           example: 500
 *       400:
 *         description: 요청 오류 (닉네임/전투력 누락 또는 유효하지 않음)
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
 * /api/user/characters/{characterId}/metadata:
 *   put:
 *     summary: 캐릭터 메타데이터(닉네임, 전투력) 업데이트
 *     tags:
 *       - User Characters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *                 example: "업데이트된닉네임"
 *               power:
 *                 type: number
 *                 example: 1500
 *             required:
 *               - nickname
 *               - power
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
 *                         nickname:
 *                           type: string
 *                           example: "업데이트된닉네임"
 *                         power:
 *                           type: number
 *                           example: 1500
 *       400:
 *         description: 요청 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 캐릭터를 찾을 수 없음 또는 권한 없음
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
 * /api/user/characters/{characterId}/class:
 *   patch:
 *     summary: 캐릭터 클래스 업데이트
 *     tags:
 *       - User Characters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               characterClass:
 *                 type: string
 *                 example: "support"
 *             required:
 *               - characterClass
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
 *                         character_class:
 *                           type: string
 *                           example: "support"
 *       400:
 *         description: 잘못된 클래스 값
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 캐릭터를 찾을 수 없음 또는 권한 없음
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
 * /api/user/characters/{characterId}:
 *   delete:
 *     summary: 캐릭터 삭제 (MAIN 캐릭터 제외)
 *     tags:
 *       - User Characters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 10
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
 *                           example: 10
 *                         message:
 *                           type: string
 *                           example: "캐릭터가 성공적으로 삭제되었습니다."
 *       400:
 *         description: 메인 캐릭터 삭제 시도
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 캐릭터를 찾을 수 없음 또는 권한 없음
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
 * /api/user/password:
 *   patch:
 *     summary: 사용자 비밀번호 변경
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: "oldpass123"
 *               newPassword:
 *                 type: string
 *                 example: "newpass1234"
 *             required:
 *               - oldPassword
 *               - newPassword
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
 *                           example: "비밀번호가 성공적으로 변경되었습니다."
 *       400:
 *         description: 요청 오류 (필수값 누락, 비밀번호 길이 부족, 기존 비밀번호 불일치, 동일 비밀번호)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CommonError'
 *       404:
 *         description: 존재하지 않는 유저
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