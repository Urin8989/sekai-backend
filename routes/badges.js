// routes/badges.js (新規作成)
const express = require('express');
// shopControllerに関数を追加したので、shopControllerをインポート
const shopController = require('../controllers/shopController');
const router = express.Router();

// GET /api/badges/all - 全てのバッジ情報を取得 (図鑑用)
router.get('/all', shopController.getAllBadgesForDex);

module.exports = router;
