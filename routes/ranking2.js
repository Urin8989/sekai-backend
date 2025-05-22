// routes/ranking.js
const express = require('express');
const rankingController = require('../controllers/rankingController');
const router = express.Router();

// ランキング取得 (レート順 or 対戦数順、検索、ページネーション対応)
router.get('/', rankingController.getRanking);

module.exports = router;
