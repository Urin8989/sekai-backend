// server.js
require('dotenv').config(); // これは setting.js で呼ばれるので、ここでは不要かも
console.log('--- PM2 Environment Variables ---');
console.log('PORT from env:', process.env.PORT);
console.log('MONGODB_URI from env:', process.env.MONGODB_URI ? 'Loaded' : 'NOT LOADED'); // URI自体はログに出さない
console.log('JWT_SECRET from env:', process.env.JWT_SECRET ? 'Loaded' : 'NOT LOADED');
console.log('GOOGLE_CLIENT_ID from env:', process.env.GOOGLE_CLIENT_ID ? 'Loaded' : 'NOT LOADED');
console.log('NODE_ENV from env:', process.env.NODE_ENV);
console.log('---------------------------------');

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const helmet = require('helmet'); // ★ helmet をインポート
const rateLimit = require('express-rate-limit'); // ★ express-rate-limit をインポート
const jwt = require('jsonwebtoken');
const url = require('url');
const mongoose = require('mongoose');
const config = require('./config/setting');
const connectDB = require('./config/db');
const User = require('./models/User');
const Community = require('./models/Community'); // ★ Communityモデルをインポート
const CommunityChatMessage = require('./models/CommunityChatMessage'); // ★ Chatモデルをインポート
const { WebSocketMessageTypes } = require('./constants'); // ★ 定数ファイルをインポート

// ルートファイル
const authRoutes = require('./routes/auth');
const matchmakingRoutes = require('./routes/matchmaking');
const userRoutes = require('./routes/users');
const shopRoutes = require('./routes/shop2'); // shop.js から shop2.js に変更
const communityRoutes = require('./routes/communities'); // ranking.js の名前変更とは無関係ですが、念のため記載
const rankingRoutes = require('./routes/ranking2'); // ranking.js から ranking2.js に変更
const badgeRoutes = require('./routes/badges'); // ★ バッジ図鑑用ルートをインポート

// MongoDBに接続
connectDB();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ★ Helmet ミドルウェア (セキュリティヘッダー設定)
app.use(helmet());

// CORSミドルウェア
const corsOptions = {
    // 許可するオリジンを配列で指定 (開発環境と本番環境の両方を許可)
    origin: [
        'http://127.0.0.1:5500', // 開発用フロントエンド
        'https://www.mariokartbestrivals.com' // 本番環境のフロントエンドドメイン
        // 必要に応じて他のオリジンも追加
    ],
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ★ レートリミット設定 (例: 全APIに対して1分間に100リクエストまで)
const limiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1分
	max: 100, // 各IPからのリクエストを1分あたり100に制限
	standardHeaders: true, // RateLimit-* ヘッダーを返す
	legacyHeaders: false, // X-RateLimit-* ヘッダーを無効化
});
app.use('/api', limiter); // /api で始まるすべてのルートに適用 (必要に応じて調整)

app.use((req, res, next) => {
    /* ...リクエストロガー... */
    console.log(`${req.method} ${req.url}`);
    next();
});
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});
// ルートのマウント
app.use('/api/auth', authRoutes);
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shop', shopRoutes); // ここは shopRoutes 変数名が変更されていれば自動的に追従
app.use('/api/communities', communityRoutes);
app.use('/api/ranking', rankingRoutes); // ここは rankingRoutes 変数名が変更されていれば自動的に追従
app.use('/api/badges', badgeRoutes); // ★ バッジ図鑑用ルートをマウント

// ★ 基本的なエラーハンドリングミドルウェア (全てのルートの後に追加)
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.stack || err); // サーバーログには詳細を出力
    res.status(err.status || 500).json({
        message: err.message || 'サーバー内部でエラーが発生しました。',
        // 本番環境ではエラー詳細は返さない
        // error: process.env.NODE_ENV === 'development' ? err : {}
    });
});
// --- WebSocket 接続管理 ---
// Map<matchId, Set<WebSocketClientInfo>>
const matchConnections = new Map();
// ▼▼▼ コミュニティチャット用の接続管理を追加 ▼▼▼
// Map<communityId, Set<WebSocketClientInfo>>
const communityConnections = new Map();
// ▲▲▲ ここまで追加 ▲▲▲

// WebSocketClientInfo = { ws: WebSocket, userId: string, userName: string, userGoogleId: string, userPicture: string, connectionType: 'match' | 'community', targetId: string }

// ★ サニタイズ関数 (簡易版: HTMLタグを除去)
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/<[^>]*>?/gm, ''); // HTMLタグを除去
}

wss.on('connection', async (ws, req) => {
    console.log('WebSocket client connected');

    // 接続URLからパラメータを取得 (例: ws://.../?token=xxx&communityId=yyy または ws://.../?token=xxx&matchId=zzz)
    const queryParams = url.parse(req.url, true).query;
    const token = queryParams.token;
    const communityId = queryParams.communityId; // コミュニティチャット用
    const matchId = queryParams.matchId; // マッチング用

    let userId = null;
    let userName = null;
    let connectionType = null;
    let targetId = null;

    // 1. トークン検証 & 接続タイプ判定
    if (!token) {
        console.log('WebSocket connection rejected: Missing token');
        ws.close(1008, 'Missing token');
        return;
    }
    if (!communityId && !matchId) { // どちらかのIDが必要
        console.log('WebSocket connection rejected: Missing communityId or matchId');
        ws.close(1008, 'Missing communityId or matchId');
        return;
    }
    if (communityId && matchId) { // 同時には指定できない
        console.log('WebSocket connection rejected: Cannot specify both communityId and matchId');
        ws.close(1008, 'Cannot specify both communityId and matchId');
        return;
    }

    connectionType = communityId ? 'community' : 'match';
    targetId = communityId || matchId;

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        userId = decoded.id; // MongoDBのユーザーID
        // ▼▼▼ 修正: picture も取得 ▼▼▼
        const user = await User.findById(userId).select('name googleId picture');
        // ▲▲▲ 修正 ▲▲▲
        if (!user) throw new Error('User not found for token');
        userName = user.name;
        const userGoogleId = user.googleId; // ★ Google ID を保持
        // ▼▼▼ 修正: 画像URLを保持 ▼▼▼
        const userPicture = user.picture;
        // ▲▲▲ 修正 ▲▲▲

        let connectionsMap;
        let canConnect = false;

        // 2. 接続先の検証と接続許可判定
        if (connectionType === 'community') {
            connectionsMap = communityConnections;
            // コミュニティ存在確認 & ユーザーが参加者か確認
            const community = await Community.findById(communityId).select('participants organizer');

            if (community && (community.participants.some(id => id.equals(userId)) || community.organizer.equals(userId))) {
                canConnect = true;
            } else {
                const reason = community ? `User ${userName} not a member of community ${communityId}` : `Community ${communityId} not found`;
                console.log(`WebSocket connection rejected: ${reason}`);
                ws.close(1008, community ? 'Not a member of this community' : 'Community not found');
                return;
            }
            console.log(`WebSocket authenticated for COMMUNITY: ${userName} (ID: ${userId}), Community: ${targetId}`);
        } else { // connectionType === 'match'
            connectionsMap = matchConnections;
            // マッチング相手として有効か確認 (matchmakingController側でMatchドキュメントが作られている前提)
            // ここでは簡易的に接続を許可 (本来はMatchドキュメントをチェックすべき)
            canConnect = true; // ★ 必要に応じてMatchモデルをチェックするロジックを追加
            console.log(`WebSocket authenticated for MATCH: ${userName} (ID: ${userId}), Match: ${targetId}`);
        }

        if (!canConnect) { // このルートは通常通らないはずだが念のため
            ws.close(1008, 'Connection not allowed');
            return;
        }

        // 3. 接続情報を保存
        // ▼▼▼ 修正: userPicture を追加 ▼▼▼
        const clientInfo = {
            ws,
            userId,
            userName,
            userGoogleId,
            userPicture, // ★ 画像URLを追加
            connectionType,
            targetId
        };
        // ▲▲▲ 修正 ▲▲▲
        if (!connectionsMap.has(targetId)) {
            connectionsMap.set(targetId, new Set());
        }
        const connectionSet = connectionsMap.get(targetId);

        // 同じユーザーが複数接続しないようにチェック (オプション)
        for (const client of connectionSet) {
            if (client.userId === userId) {
                console.log(`User ${userName} already connected to ${connectionType} ${targetId}. Closing new connection.`);
                ws.close(1008, 'User already connected');
                return;
            }
        }

        connectionSet.add(clientInfo);
        console.log(`Total connections for ${connectionType} ${targetId}: ${connectionSet.size}`);

        // 接続通知 (オプション) - コミュニティチャットの場合のみ
        if (connectionType === 'community') {
            broadcastToCommunity(targetId, {
                type: WebSocketMessageTypes.SYSTEM_MESSAGE,
                text: `${userName} が入室しました。`
            }, ws);
        }

    } catch (error) {
        console.log(`WebSocket connection rejected: Invalid token or validation failed`, error.message);
        ws.close(1008, 'Invalid token or connection failed');
        return;
    }

    // 4. メッセージ受信ハンドラ
    ws.on('message', async (message) => { // ★ async に変更
        try {
            const messageData = JSON.parse(message);
            console.log(`Received message for ${connectionType} ${targetId} from ${userName}:`, messageData);

            // --- コミュニティチャットメッセージ処理 ---
            if (connectionType === 'community' && messageData.type === WebSocketMessageTypes.COMMUNITY_CHAT_MESSAGE && messageData.text) {
                const text = messageData.text.trim();
                if (text.length === 0 || text.length > 500) { // 空メッセージや長すぎるメッセージは無視
                    console.warn(`Ignoring invalid chat message from ${userName}: "${text}"`);
                    return;
                }

                // DBにメッセージを保存
                const chatMessage = new CommunityChatMessage({
                    communityId: targetId,
                    sender: userId,
                    text: sanitizeText(text) // ★ サニタイズ処理を追加
                });
                await chatMessage.save();

                // 接続時の clientInfo から Google ID と画像URLを取得
                const senderClientInfo = Array.from(communityConnections.get(targetId) || []).find(c => c.ws === ws);
                const senderGoogleId = senderClientInfo?.userGoogleId;
                // ▼▼▼ 修正: 画像URLを取得 ▼▼▼
                const senderPicture = senderClientInfo?.userPicture;
                // ▲▲▲ 修正 ▲▲▲

                if (!senderGoogleId) {
                    console.error(`Could not find Google ID for sender ${userName} in community ${targetId}`);
                    return; // Google ID が見つからない場合は送信しない
                }

                // ▼▼▼ 修正: senderPicture を追加 ▼▼▼
                const broadcastPayload = {
                    type: WebSocketMessageTypes.COMMUNITY_CHAT_MESSAGE,
                    senderId: senderGoogleId,
                    senderName: userName,
                    senderPicture: senderPicture, // ★ 画像URLを追加
                    text: chatMessage.text, // ★ サニタイズ済みのテキスト
                    timestamp: chatMessage.timestamp // 保存されたタイムスタンプ
                };
                // ▲▲▲ 修正 ▲▲▲

                // 同じコミュニティの参加者全員に送信 (自分自身にも送る)
                broadcastToCommunity(targetId, broadcastPayload, null); // excludeWs = null で全員に送信

            // --- マッチングチャットメッセージ処理 (既存) ---
            } else if (connectionType === 'match' && messageData.type === WebSocketMessageTypes.MATCH_CHAT_MESSAGE && messageData.text) {
                const text = messageData.text.trim();
                if (text.length === 0 || text.length > 500) {
                    console.warn(`Ignoring invalid match chat message from ${userName}: "${text}"`);
                    return;
                }
                // マッチングチャットはDB保存しない想定 (必要なら実装)

                // 接続時の clientInfo から Google ID と画像URLを取得
                const senderClientInfo = Array.from(matchConnections.get(targetId) || []).find(c => c.ws === ws);
                const senderGoogleId = senderClientInfo?.userGoogleId;
                // ▼▼▼ 修正: 画像URLを取得 ▼▼▼
                const senderPicture = senderClientInfo?.userPicture;
                // ▲▲▲ 修正 ▲▲▲

                if (!senderGoogleId) {
                    console.error(`Could not find Google ID for sender ${userName} in match ${targetId}`);
                    return; // Google ID が見つからない場合は送信しない
                }

                // ▼▼▼ 修正: senderPicture を追加 ▼▼▼
                const broadcastPayload = {
                    type: WebSocketMessageTypes.MATCH_CHAT_MESSAGE,
                    text: sanitizeText(text), // ★ サニタイズ処理を追加
                    senderId: senderGoogleId,
                    senderName: userName, // 送信者名を付与
                    senderPicture: senderPicture // ★ 画像URLを追加
                };
                // ▲▲▲ 修正 ▲▲▲

                broadcastToMatch(targetId, broadcastPayload, ws); // 自分以外のクライアントに送信
            }
            // 他のメッセージタイプも処理可能
        } catch (e) {
            console.error('Failed to parse message or process:', e);
        }
    });

    // 5. 切断ハンドラ
    ws.on('close', (code, reason) => {
        console.log(`WebSocket client disconnected: ${userName} (ID: ${userId}), ${connectionType}: ${targetId}, Code: ${code}, Reason: ${reason}`);
        const connectionsMap = connectionType === 'community' ? communityConnections : matchConnections;
        if (connectionsMap.has(targetId)) {
            const connectionSet = connectionsMap.get(targetId);
            let disconnectedClientInfo = null; // ★ 切断したクライアント情報を保持
            for (const client of connectionSet) {
                if (client.ws === ws) {
                    disconnectedClientInfo = client; // ★ 見つけたら保持
                    connectionSet.delete(client);
                    break;
                }
            }
            console.log(`Total connections remaining for ${connectionType} ${targetId}: ${connectionSet.size}`);

            if (connectionSet.size === 0) {
                connectionsMap.delete(targetId);
                console.log(`${connectionType} ${targetId} removed from connections map.`);
            } else if (disconnectedClientInfo) { // ★ 切断したクライアント情報があれば
                // 退室/切断通知 (オプション)
                if (connectionType === 'community') {
                    broadcastToCommunity(targetId, {
                        type: WebSocketMessageTypes.SYSTEM_MESSAGE,
                        text: `${disconnectedClientInfo.userName} が退室しました。` // ★ 保存した名前を使用
                    }, null);
                } else { // match
                    broadcastToMatch(targetId, {
                        type: WebSocketMessageTypes.OPPONENT_DISCONNECTED,
                        text: `${disconnectedClientInfo.userName} が切断しました。` // ★ 保存した名前を使用
                    }, null);
                }
            }
        }
    });

    // 6. エラーハンドラ
    ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userName} (ID: ${userId}), ${connectionType}: ${targetId}:`, error);
        // エラー発生時も切断処理を試みる (closeハンドラが呼ばれることが多い)
        // ws.close(); // 必要に応じて強制クローズ
    });
});

/**
 * 特定のマッチIDの参加者にメッセージをブロードキャストする (既存)
 * @param {string} matchId
 * @param {object} messagePayload
 * @param {WebSocket} [excludeWs]
 */
function broadcastToMatch(matchId, messagePayload, excludeWs) {
    broadcastGeneric(matchConnections, matchId, messagePayload, excludeWs);
}

/**
 * 特定のコミュニティIDの参加者にメッセージをブロードキャストする (新規)
 * @param {string} communityId
 * @param {object} messagePayload
 * @param {WebSocket} [excludeWs]
 */
function broadcastToCommunity(communityId, messagePayload, excludeWs) {
    broadcastGeneric(communityConnections, communityId, messagePayload, excludeWs);
}

/**
 * 汎用ブロードキャスト関数
 * @param {Map<string, Set<WebSocketClientInfo>>} connectionsMap
 * @param {string} targetId
 * @param {object} messagePayload
 * @param {WebSocket} [excludeWs]
 */
function broadcastGeneric(connectionsMap, targetId, messagePayload, excludeWs) {
    if (connectionsMap.has(targetId)) {
        const connectionSet = connectionsMap.get(targetId);
        const messageString = JSON.stringify(messagePayload);
        const connectionType = connectionsMap === communityConnections ? 'community' : 'match';
        console.log(`Broadcasting to ${connectionType} ${targetId} (excluding sender: ${!!excludeWs}):`, messagePayload);

        connectionSet.forEach(client => {
            if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageString, (err) => {
                    if (err) {
                        console.error(`Failed to send message to user ${client.userName} in ${connectionType} ${targetId}:`, err);
                        // エラー発生時の処理 (接続を閉じるなど)
                        connectionSet.delete(client);
                        client.ws.terminate(); // 強制切断
                        if (connectionSet.size === 0) {
                            connectionsMap.delete(targetId);
                        }
                    }
                });
            }
        });
    }
}

// --- WebSocket 接続管理ここまで ---


// サーバー起動
const PORT = config.port;
server.listen(PORT, () => console.log(`Server (HTTP + WebSocket) running on port ${PORT}`));
