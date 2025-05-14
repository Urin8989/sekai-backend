// routes/communities.js
const express = require('express');
const router = express.Router();
// communityController から各関数が正しくエクスポートされていることを確認してください
const communityController = require('../controllers/communityController');
const { protect } = require('../middleware/authMiddleware'); // 認証ミドルウェア

// GET /api/communities - コミュニティ一覧取得 (認証不要)
// communityController.getCommunities が controllers/communityController.js で
// 正しく定義・エクスポートされている必要があります。
router.get('/', communityController.getCommunities);

// POST /api/communities - コミュニティ作成 (要認証)
router.post('/', protect, communityController.createCommunity);

// GET /api/communities/:communityId - 単一コミュニティ情報取得
// ▼▼▼ この行のコメントを解除しました ▼▼▼
router.get('/:communityId', communityController.getCommunityById);
// ▲▲▲ コメントを解除しました ▲▲▲

// POST /api/communities/:communityId/join - コミュニティ参加 (要認証)
router.post('/:communityId/join', protect, communityController.joinCommunity);

// POST /api/communities/:communityId/leave - コミュニティ脱退 (要認証)
router.post('/:communityId/leave', protect, communityController.leaveCommunity);

// DELETE /api/communities/:communityId - コミュニティ削除 (要認証)
router.delete('/:communityId', protect, communityController.deleteCommunity);

// GET /api/communities/:communityId/participants - 参加者リスト取得 (認証不要)
router.get('/:communityId/participants', communityController.getCommunityParticipants);

// GET /api/communities/:communityId/chat - チャットメッセージ取得 (要認証)
router.get('/:communityId/chat', protect, communityController.getChatMessages);

module.exports = router;
