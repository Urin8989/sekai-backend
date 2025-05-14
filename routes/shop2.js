// routes/shop.js
const express = require('express');
const shopController = require('../controllers/shopController');
// getUserIfAuthenticated は /badges で使うので残します
const { protect, getUserIfAuthenticated } = require('../middleware/authMiddleware');
const router = express.Router();

// --- 既存のショップルート (購入対象バッジ用) ---
// バッジ一覧取得 - 認証は任意 (購入済みかどうかの表示に利用)
router.get('/badges', getUserIfAuthenticated, shopController.getAvailableBadges);

// バッジ購入 - 認証必須 (ガチャ対象外のバッジを購入)
router.post('/purchase', protect, shopController.purchaseBadge);
// --- 既存のショップルートここまで ---


// ▼▼▼ ガチャ実行APIルートを追加 ▼▼▼
// POST /api/shop/gacha - ガチャ実行 (認証必須)
router.post('/gacha', protect, shopController.playGacha);
// ▲▲▲ ここまで追加 ▲▲▲

module.exports = router;
