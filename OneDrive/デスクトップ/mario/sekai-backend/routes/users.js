// routes/users.js
const express = require('express');
const userController = require('../controllers/userController');
const { protect, getUserIfAuthenticated } = require('../middleware/authMiddleware');
const router = express.Router();

// 特定ユーザーの情報取得
router.get('/:userId/stats', getUserIfAuthenticated, userController.getUserStats);
router.get('/:userId', getUserIfAuthenticated, userController.getUserData);

// 自分の情報取得
router.get('/me', protect, userController.getUserData);

// プロフィール更新
router.put('/profile', protect, userController.updateUserProfile);

// ▼▼▼ 表示バッジ更新ルートを追加 ▼▼▼
router.put('/profile/display-badges', protect, userController.updateDisplayBadges);
// ▲▲▲ ここまで追加 ▲▲▲

module.exports = router;
