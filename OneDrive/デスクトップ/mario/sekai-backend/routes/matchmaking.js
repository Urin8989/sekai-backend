// routes/matchmaking.js
const express = require('express');
// 関数名を変更・追加
const { requestMatchmaking, getMatchmakingStatus, cancelMatchmaking, recordMatchResult } = require('../controllers/matchmakingController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

// POST /api/matchmaking/request (マッチング開始リクエスト - 旧 /find)
router.post('/request', protect, requestMatchmaking);

// GET /api/matchmaking/status (マッチング状況確認)
router.get('/status', protect, getMatchmakingStatus);

// POST /api/matchmaking/cancel (マッチングキャンセル)
router.post('/cancel', protect, cancelMatchmaking);

// POST /api/matchmaking/result (対戦結果記録 - 変更なし)
router.post('/result', protect, recordMatchResult);

module.exports = router;
