const request = require('supertest');
const express = require('express');
const shopRouter = require('../domains/shop/shop.router');
const shopService = require('../domains/shop/shop.service');
const shopRepository = require('../domains/shop/shop.repository');
const userRepository = require('../domains/user/user.repository');
const db = require('../config/db');

jest.mock('../middlewares/auth.middleware', () => ({
    checkLogin: (req, res, next) => {
        req.user = { id: 1, username: 'testuser', role: 'USER' };
        next();
    }
}));

jest.mock('../domains/shop/shop.service');
jest.mock('../domains/shop/shop.repository');
jest.mock('../domains/user/user.repository');
jest.mock('../config/db');

describe('Shop 도메인 API 및 비즈니스 로직 테스트', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/api/shop', shopRouter);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    /* ==============================================
       1. GET /api/shop (상점 아이템 리스트 조회)
       ============================================== */
    describe('GET /api/shop', () => {
        it('성공 시 200 코드와 보유/장착 정보가 포함된 상점 리스트를 반환해야 한다', async () => {
            const mockShopList = [
                { itemId: 1, name: 'dragon-slayer', price: 5000, isShopItem: 1, defaultDurationDays: 7, itemType: 'TITLE', isOwned: 1, isEquipped: 1, inventoryId: 10, expiryDate: '2026-07-01' },
                { itemId: 2, name: 'shadow-warrior', price: 10000, isShopItem: 1, defaultDurationDays: 7, itemType: 'TITLE', isOwned: 0, isEquipped: 0, inventoryId: null, expiryDate: null }
            ];

            shopService.getShopList.mockResolvedValue(mockShopList);

            const response = await request(app).get('/api/shop');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockShopList);
            expect(shopService.getShopList).toHaveBeenCalledWith(1);
        });
    });

    /* ==============================================
       2. POST /api/shop/purchase (아이템 구매)
       ============================================== */
    describe('POST /api/shop/purchase', () => {
        it('올바른 itemId 요청 시 201 코드와 구매 결과를 반환해야 한다', async () => {
            const mockResult = { inventoryId: 5, itemId: 1, expiryDate: '2026-06-30' };
            shopService.purchaseItem.mockResolvedValue(mockResult);

            const response = await request(app)
                .post('/api/shop/purchase')
                .send({ itemId: 1 });

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('구매가 완료되었습니다.');
            expect(response.body.data).toEqual(mockResult);
        });

        it('요청 바디에 itemId가 누락된 경우 400 코드를 반환해야 한다', async () => {
            const response = await request(app)
                .post('/api/shop/purchase')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('itemId가 필요합니다.');
        });
    });

    /* ==============================================
       3. PATCH /api/shop/toggle-equip (장착 / 장착 해제 토글)
       ============================================== */
    describe('PATCH /api/shop/toggle-equip', () => {
        it('장착 상태 변경 성공 시 200 코드와 변경 상태를 반환해야 한다', async () => {
            const mockToggleResult = { inventoryId: 10, isEquipped: 1 };
            shopService.toggleEquipItem.mockResolvedValue(mockToggleResult);

            const response = await request(app)
                .patch('/api/shop/toggle-equip')
                .send({ inventoryId: 10 });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('장착 상태가 변경되었습니다.');
            expect(response.body.data).toEqual(mockToggleResult);
        });

        it('요청 바디에 inventoryId가 누락된 경우 400 코드를 반환해야 한다', async () => {
            const response = await request(app)
                .patch('/api/shop/toggle-equip')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('inventoryId가 필요합니다.');
        });
    });
});

/* ========================================================================
   비즈니스 핵심 로직 분기 검증 (Shop Service Layer 단위 테스트)
   ======================================================================== */
describe('Shop Service 비즈니스 예외 상황 단위 테스트', () => {
    const originalShopService = jest.requireActual('../domains/shop/shop.service');

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('purchaseItem() 서비스 레이어 검증', () => {
        it('존재하지 않는 아이템 구매 시 404 에러를 발생시켜야 한다', async () => {
            shopRepository.findItemById.mockResolvedValue(null);

            await expect(originalShopService.purchaseItem(1, 999)).rejects.toThrow('존재하지 않는 아이템입니다.');
        });

        it('비매품(is_shop_item !== 1) 아이템 구매 시 403 에러를 발생시켜야 한다', async () => {
            shopRepository.findItemById.mockResolvedValue({ id: 2, name: '이벤트템', is_shop_item: 0 });

            await expect(originalShopService.purchaseItem(1, 2)).rejects.toThrow('상점에서 판매하는 아이템이 아닙니다.');
        });

        it('이미 보유 중인 아이템 구매 시 400 에러를 발생시켜야 한다', async () => {
            shopRepository.findItemById.mockResolvedValue({ id: 1, name: '칭호', is_shop_item: 1 });
            shopRepository.checkUserOwnsItem.mockResolvedValue(true);

            await expect(originalShopService.purchaseItem(1, 1)).rejects.toThrow('이미 보유 중인 아이템입니다.');
        });

        it('유저의 누적 점수(total_score)가 부족할 경우 400 에러를 발생시켜야 한다', async () => {
            shopRepository.findItemById.mockResolvedValue({ id: 1, name: '칭호', price: 5000, is_shop_item: 1 });
            shopRepository.checkUserOwnsItem.mockResolvedValue(false);
            userRepository.findAllByUserId.mockResolvedValue({ id: 1, total_score: 3000 });

            await expect(originalShopService.purchaseItem(1, 1)).rejects.toThrow('누적 점수(total_score)가 부족합니다.');
        });

        it('트랜잭션 실행 중 예외가 발생하면 롤백을 수행해야 한다', async () => {
            shopRepository.findItemById.mockResolvedValue({ id: 1, name: '칭호', price: 1000, is_shop_item: 1, default_duration_days: 7 });
            shopRepository.checkUserOwnsItem.mockResolvedValue(false);
            userRepository.findAllByUserId.mockResolvedValue({ id: 1, total_score: 5000 });

            const mockConnection = {
                beginTransaction: jest.fn(),
                query: jest.fn().mockRejectedValue(new Error('DB 다운')),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            await expect(originalShopService.purchaseItem(1, 1)).rejects.toThrow('DB 다운');
            expect(mockConnection.rollback).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('영구제(default_duration_days가 null) 아이템 구매 시 expiryDate가 null로 저장되어야 한다', async () => {
            shopRepository.findItemById.mockResolvedValue({
                id: 3,
                name: '영구제 칭호',
                price: 2000,
                is_shop_item: 1,
                default_duration_days: null
            });
            shopRepository.checkUserOwnsItem.mockResolvedValue(false);
            userRepository.findAllByUserId.mockResolvedValue({ id: 1, total_score: 5000 });

            const mockConnection = {
                beginTransaction: jest.fn(),
                query: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);
            shopRepository.insertInventoryTx.mockResolvedValue(88);

            const result = await originalShopService.purchaseItem(1, 3);

            expect(result.expiryDate).toBeNull();
            expect(shopRepository.insertInventoryTx).toHaveBeenCalledWith(mockConnection, 1, 3, null);
        });
    });

    describe('toggleEquipItem() 서비스 레이어 검증', () => {
        it('내 인벤토리에 없거나 유효기간이 지나 삭제된 아이템 장착 시 404 에러를 터트려야 한다', async () => {
            shopRepository.findInventoryByIdAndUserId.mockResolvedValue(null);

            await expect(originalShopService.toggleEquipItem(1, 999)).rejects.toThrow('보유하고 있지 않거나 만료된 아이템입니다.');
        });

        it('이미 장착 중인 아이템을 토글하면 단순 미장착 상태로 변경해야 한다', async () => {
            shopRepository.findInventoryByIdAndUserId.mockResolvedValue({ id: 10, is_equipped: 1, item_type_id: 2 });

            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await originalShopService.toggleEquipItem(1, 10);

            expect(shopRepository.updateEquipStatusTx).toHaveBeenCalledWith(mockConnection, 10, 0);
            expect(result.isEquipped).toBe(0);
        });

        it('미장착 중인 아이템을 장착하면 동일 타입 아이템을 다 밀어버리고 장착 상태로 변경해야 한다', async () => {
            shopRepository.findInventoryByIdAndUserId.mockResolvedValue({ id: 10, is_equipped: 0, item_type_id: 2 });

            const mockConnection = {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn()
            };
            db.getConnection.mockResolvedValue(mockConnection);

            const result = await originalShopService.toggleEquipItem(1, 10);

            expect(shopRepository.clearEquipStatusByTypeTx).toHaveBeenCalledWith(mockConnection, 1, 2);
            expect(shopRepository.updateEquipStatusTx).toHaveBeenCalledWith(mockConnection, 10, 1);
            expect(result.isEquipped).toBe(1);
        });
    });
});