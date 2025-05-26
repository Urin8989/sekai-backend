// controllers/authController.js
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken'); // ★ jsonwebtoken をインポート
const config = require('../config/setting');
const User = require('../models/User');

const client = new OAuth2Client(config.googleClientId);

// Googleサインイン (トークンを受け取り、ユーザーを登録/取得し、JWTを発行)
exports.googleSignIn = async (req, res) => {
    const { credential } = req.body;

    if (!credential) {
        // これはGoogleからのPOSTリダイレクトで credential がない場合のエラー
        console.error('Google Sign-In Error: Missing credential in POST body.');
        // ▼▼▼ 修正 ▼▼▼
        // エラー時も設定されたフロントエンドURLのエラーページにリダイレクト
        const errorRedirectUrl = `${config.frontendBaseUrl}/error-page.html?error=${encodeURIComponent('Authentication failed: Missing credential.')}`;
        console.log(`Authentication failed (missing credential). Redirecting to: ${errorRedirectUrl}`);
        return res.redirect(errorRedirectUrl);
        // ▲▲▲ 修正 ▲▲▲
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: config.googleClientId,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, name, email, picture } = payload;

        let user = await User.findOne({ googleId });

        if (!user) {
            user = await User.create({
                googleId,
                name,
                email,
                picture,
                // ★ 新規ユーザーの初期レートやポイントを設定
                rate: 1500, // 例: 初期レート
                points: 0,  // 例: 初期ポイント
            });
            console.log('New user created:', user.email);
        } else {
            // 既存ユーザーの場合も、Googleからの最新情報で更新
            user.name = name;
            user.picture = picture;
            user.lastLogin = Date.now(); // 最終ログイン更新
            await user.save();
            console.log('Existing user logged in:', user.email);
        }

        // ▼▼▼ JWTを生成 ▼▼▼
        const tokenPayload = {
            id: user._id, // MongoDBのユーザーIDをペイロードに含める
            googleId: user.googleId,
        };
        const token = jwt.sign(
            tokenPayload,
            config.jwtSecret, // 設定ファイルから秘密鍵を取得
            { expiresIn: config.jwtExpiresIn } // 設定ファイルから有効期限を取得
        );
        // ▲▲▲ JWT生成ここまで ▲▲▲

        // フロントエンドがlocalStorageから読み込むためのユーザーデータ形式
        const frontendUserData = {
            sub: user.googleId,
            name: user.name,
            email: user.email,
            picture: user.picture,
            rate: user.rate,
            points: user.points,
            badges: user.badges || [],
            displayBadges: user.displayBadges || [],
            profile: user.profile,
        };

        // トークンとユーザーデータをクエリパラメータとしてリダイレクトURLに付与
        // ▼▼▼ 修正 ▼▼▼
        const successRedirectUrl = `${config.frontendBaseUrl}/index.html?token=${encodeURIComponent(token)}&userData=${encodeURIComponent(JSON.stringify(frontendUserData))}`;
        // ▲▲▲ 修正 ▲▲▲
        console.log(`Authentication successful. Redirecting to: ${successRedirectUrl}`);
        res.redirect(successRedirectUrl);

    } catch (error) {
        console.error('Google Sign-In Error:', error);
        // エラー発生時もエラーページなどにリダイレクト
        // ▼▼▼ 修正 ▼▼▼
        const errorRedirectUrl = `${config.frontendBaseUrl}/error-page.html?error=${encodeURIComponent(error.message)}`;
        // ▲▲▲ 修正 ▲▲▲
        console.log(`Authentication failed. Redirecting to: ${errorRedirectUrl}`);
        res.redirect(errorRedirectUrl);
    }
};


// ▼▼▼ トークン検証関数を追加 ▼▼▼
/**
 * POST /api/auth/verify - トークンを検証し、有効であればユーザーデータを返す
 * protectミドルウェアによって req.user にユーザー情報がセットされている前提
 */
exports.verifyToken = async (req, res) => {
    console.log('POST /api/auth/verify called'); // ★ ログ追加
    try {
        // protectミドルウェアが成功していれば、req.user にユーザー情報が入っている
        if (req.user) {
            console.log(`Token verified for user: ${req.user.name}`);
            // フロントエンドが必要とする形式でユーザーデータを返す
            // (googleSignIn と同様の形式にするのが一般的)
            // 注意: ここで新しいトークンを発行するかどうかは設計次第
            //       (今回は既存トークンが有効かの確認なので、新しいトークンは発行しない)
            res.status(200).json({
                // token: req.headers.authorization.split(' ')[1], // 必要なら既存トークンを返す
                userData: {
                    sub: req.user.googleId,
                    name: req.user.name,
                    email: req.user.email,
                    picture: req.user.picture,
                    rate: req.user.rate,
                    points: req.user.points,
                    badges: req.user.badges || [],
                    displayBadges: req.user.displayBadges || [],
                    profile: req.user.profile,
                }
            });
        } else {
            // protectミドルウェアが何らかの理由でユーザーを見つけられなかった場合
            // (通常は protect が 401 を返すはずだが、念のため)
            console.warn('Token verification called, but req.user is not set.');
            res.status(401).json({ message: 'Not authorized' });
        }
    } catch (error) {
        console.error('Error verifying token:', error);
        res.status(500).json({ message: 'Server error during token verification', error: error.message });
    }
};
// ▲▲▲ トークン検証関数ここまで ▲▲▲
