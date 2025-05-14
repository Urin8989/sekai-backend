// middleware/authMiddleware.js
// const { OAuth2Client } = require('google-auth-library'); // Googleトークン検証は不要に
const jwt = require('jsonwebtoken'); // ★ jsonwebtoken をインポート
const config = require('../config/setting');
const User = require('../models/User');

// const client = new OAuth2Client(config.googleClientId); // 不要

// オプション: 認証が必要なAPI用のミドルウェア (JWT検証に変更)
const protect = async (req, res, next) => {
    let token;
    // AuthorizationヘッダーからBearerトークンを取得
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // トークンがない場合は認証されていないと判断
    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        // ▼▼▼ JWTを検証 ▼▼▼
        const decoded = jwt.verify(token, config.jwtSecret); // 秘密鍵で検証
        // ▲▲▲ JWT検証ここまで ▲▲▲

        // ▼▼▼ トークンのペイロードからユーザーIDを取得し、DBからユーザーを検索 ▼▼▼
        // ペイロードに含めたプロパティ名 (ここでは 'id') を使用
        const user = await User.findById(decoded.id).select('-password'); // パスワードなど不要な情報は除外
        // ▲▲▲ DB検索ここまで ▲▲▲

        if (!user) {
            // トークンは有効だが、該当ユーザーがDBに存在しない場合
            return res.status(401).json({ message: 'Not authorized, user not found' });
        }

        // ユーザー情報をリクエストオブジェクトに添付
        req.user = user;
        next(); // 次のミドルウェアまたはルートハンドラへ

    } catch (error) {
        console.error('Token verification failed:', error);
        // トークンが無効 (期限切れ、改ざんなど) の場合
        return res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

// オプション: 認証は必須ではないが、ユーザー情報があれば利用したいAPI用のミドルウェア (JWT検証に変更)
const getUserIfAuthenticated = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
        try {
            // ▼▼▼ JWTを検証 ▼▼▼
            const decoded = jwt.verify(token, config.jwtSecret);
            // ▲▲▲ JWT検証ここまで ▲▲▲

            // ▼▼▼ DBからユーザーを検索 ▼▼▼
            req.user = await User.findById(decoded.id).select('-password');
            // ▲▲▲ DB検索ここまで ▲▲▲
            // ユーザーが見つからなくてもエラーにしない
        } catch (error) {
            // トークンが無効でもエラーにはせず、req.user は undefined のままにする
            console.warn('Optional authentication failed:', error.message);
        }
    }
    next(); // 必ず next() を呼ぶ
};


module.exports = { protect, getUserIfAuthenticated };
