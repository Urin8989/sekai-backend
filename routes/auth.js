// routes/auth.js
const express = require('express');
// ▼▼▼ googleSignIn に加えて verifyToken (仮名) もインポート ▼▼▼
const { googleSignIn, verifyToken } = require('../controllers/authController');
// ▲▲▲ インポート修正 ▲▲▲
const { protect } = require('../middleware/authMiddleware'); // protect ミドルウェアもインポート
const router = express.Router();

// POST /api/auth/google - Googleサインイン処理
router.post('/google', googleSignIn);

// ▼▼▼ /api/auth/verify ルートを追加 ▼▼▼
// POST /api/auth/verify - トークン検証 (要認証)
router.post('/verify', protect, verifyToken);
// ▲▲▲ ルート追加 ▲▲▲

module.exports = router;
