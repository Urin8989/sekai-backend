// routes/matchmaking.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); // 認証ミドルウェアをインポート

// ★★★ 修正: 正しいコントローラー関数をインポート ★★★
const {
    requestMatchmaking,
    getMatchmakingStatus, // これはキューのステータス用
    cancelMatchmaking,    // これはキューのキャンセル用
    submitMatchReport,    // ★ 新しい結果報告API
    cancelMatch,          // ★ 新しい対戦キャンセルAPI
    getMatchStatus        // ★ 新しいマッチステータス確認API
} = require('../controllers/matchmakingController');

// --- マッチングキュー関連 ---

// POST /api/matchmaking/request (マッチング開始リクエスト)
router.post('/request', protect, requestMatchmaking);

// GET /api/matchmaking/status (マッチングキュー状況確認)
router.get('/status', protect, getMatchmakingStatus);

// POST /api/matchmaking/cancel (マッチングキューキャンセル)
router.post('/cancel', protect, cancelMatchmaking);

// --- 対戦結果・進行関連 ---

// ★★★ 追加: 対戦結果を報告 ★★★
router.post('/report', protect, submitMatchReport);

// ★★★ 追加: 対戦をキャンセル ★★★
router.post('/cancel-match', protect, cancelMatch);

// ★★★ 追加: 特定のマッチの状況を確認 (ポーリング用) ★★★
router.get('/match-status/:matchId', protect, getMatchStatus);

// ★★★ 削除: 古い結果記録API (submitMatchReport に置き換え) ★★★
// router.post('/result', protect, recordMatchResult);

module.exports = router;