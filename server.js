// server.js
 require('dotenv').config(); // config/setting.js で呼ばれている想定

console.log('--- PM2 Environment Variables ---');
console.log('PORT from env:', process.env.PORT);
console.log('MONGODB_URI from env:', process.env.MONGODB_URI ? 'Loaded' : 'NOT LOADED');
console.log('JWT_SECRET from env:', process.env.JWT_SECRET ? 'Loaded' : 'NOT LOADED');
console.log('GOOGLE_CLIENT_ID from env:', process.env.GOOGLE_CLIENT_ID ? 'Loaded' : 'NOT LOADED');
console.log('NODE_ENV from env:', process.env.NODE_ENV);
console.log('---------------------------------');

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const url = require('url');
const mongoose = require('mongoose'); // mongoose の require を追加
const config = require('./config/setting');
const connectDB = require('./config/db');
const User = require('./models/User');
const Match = require('./models/Match'); // Matchモデルをインポート
const Community = require('./models/Community');
const CommunityChatMessage = require('./models/CommunityChatMessage');
const { WebSocketMessageTypes } = require('./constants');

// ルートファイル
const authRoutes = require('./routes/auth');
const matchmakingRoutes = require('./routes/matchmaking');
const userRoutes = require('./routes/users');
const shopRoutes = require('./routes/shop2');
const communityRoutes = require('./routes/communities');
const rankingRoutes = require('./routes/ranking2');
const badgeRoutes = require('./routes/badges');

// MongoDBに接続
connectDB();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ★★★ 'trust proxy' の設定を追加 ★★★
// Nginxなどのリバースプロキシの背後で動作していることをExpressに伝える
// 1 は、最も近いプロキシ（この場合はNginx）を信頼することを意味します。
app.set('trust proxy', 1);

// Helmet ミドルウェア (セキュリティヘッダー設定)
app.use(helmet());

// CORSミドルウェア
const allowedOrigins = [
    'https://mariokartbestrivals.com',    // wwwなし (エラーログにあったオリジン)
    'https://www.mariokartbestrivals.com', // wwwあり
    'http://127.0.0.1:5500',              // 開発用フロントエンド (もし使用している場合)
    // 必要に応じて他のオリジンも追加
];

aapp.use(cors({
    origin: function (origin, callback) {
        // デバッグ用に現在のオリジンをログに出力
        console.log("CORS Check - Received Origin:", origin); 

        if (!origin || origin === "null" || allowedOrigins.indexOf(origin) !== -1) {
            console.log("CORS Check - Allowed:", origin);
            callback(null, true); // 許可
        } else {
            console.error('CORS Check - Denied:', origin);
            callback(null, false); // ★★★ 許可しない (エラーではなく、CORSとして拒否) ★★★
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// レートリミット設定
const limiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1分
	max: 100, 
	standardHeaders: true, 
	legacyHeaders: false, 
    keyGenerator: (req, res) => { // Nginxの背後なので X-Forwarded-For を参照
        return req.ip; // app.set('trust proxy', 1) により req.ip がクライアントのIPになる
    }
});
app.use('/api', limiter);

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});
app.use((req, res, next) => {
    // このヘッダーはGoogleログインのポップアップ等で必要になることがある
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});

// ルートのマウント
app.use('/api/auth', authRoutes);
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/badges', badgeRoutes);

// 基本的なエラーハンドリングミドルウェア
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.stack || err);
    res.status(err.status || 500).json({
        message: err.message || 'サーバー内部でエラーが発生しました。',
        // error: process.env.NODE_ENV === 'development' ? err : {} // 開発時のみエラー詳細を返す
    });
});

// --- WebSocket 接続管理 ---
const matchConnections = new Map();
const communityConnections = new Map();

function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/<[^>]*>?/gm, '');
}

wss.on('connection', async (ws, req) => {
    console.log('WebSocket client connected');
    const queryParams = url.parse(req.url, true).query;
    const token = queryParams.token;
    const communityId = queryParams.communityId;
    const matchId = queryParams.matchId;

    let userId = null;
    let userName = null;
    let userGoogleId = null; // googleIdを保持
    let userPicture = null;  // pictureを保持
    let connectionType = null;
    let targetId = null;

    if (!token) {
        ws.close(1008, 'Missing token'); return;
    }
    if (!communityId && !matchId) {
        ws.close(1008, 'Missing communityId or matchId'); return;
    }
    if (communityId && matchId) {
        ws.close(1008, 'Cannot specify both communityId and matchId'); return;
    }

    connectionType = communityId ? 'community' : 'match';
    targetId = communityId || matchId;

    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        userId = decoded.id;
        const user = await User.findById(userId).select('name googleId picture'); // googleIdとpictureも取得
        if (!user) throw new Error('User not found for token');
        userName = user.name;
        userGoogleId = user.googleId;
        userPicture = user.picture;

        let connectionsMap;
        let canConnect = false;

        if (connectionType === 'community') {
            connectionsMap = communityConnections;
            const community = await Community.findById(communityId).select('participants organizer');
            if (community && (community.participants.some(id => id.equals(userId)) || community.organizer.equals(userId))) {
                canConnect = true;
            } else {
                const reason = community ? `User ${userName} not a member of community ${communityId}` : `Community ${communityId} not found`;
                ws.close(1008, community ? 'Not a member of this community' : 'Community not found');
                return;
            }
            console.log(`WebSocket authenticated for COMMUNITY: ${userName} (ID: ${userId}, GoogleID: ${userGoogleId}), Community: ${targetId}`);
        } else { // connectionType === 'match'
            connectionsMap = matchConnections;
            // マッチング相手として有効か確認 (Matchドキュメントをチェックするのが理想)
            const match = await Match.findById(targetId).select('players status');
            if (match && match.players.some(id => id.equals(userId)) && match.status === 'matched') {
                 canConnect = true;
            } else {
                 const reason = match ? `User ${userName} not part of active match ${targetId} or match not in 'matched' state` : `Match ${targetId} not found`;
                 console.log(`WebSocket connection rejected: ${reason}`);
                 ws.close(1008, match ? 'Not part of this match or match not active' : 'Match not found');
                 return;
            }
            console.log(`WebSocket authenticated for MATCH: ${userName} (ID: ${userId}, GoogleID: ${userGoogleId}), Match: ${targetId}`);
        }

        if (!canConnect) { // 通常ここには到達しないはず
             ws.close(1008, 'Connection not allowed');
             return;
        }

        const clientInfo = { ws, userId, userName, userGoogleId, userPicture, connectionType, targetId };
        if (!connectionsMap.has(targetId)) {
            connectionsMap.set(targetId, new Set());
        }
        const connectionSet = connectionsMap.get(targetId);

        // 同じユーザーの重複接続チェック (オプション)
        for (const client of connectionSet) {
            if (client.userId === userId && client.ws !== ws) { // 既存の接続が自分自身でない場合
                console.log(`User ${userName} attempting to connect again to ${connectionType} ${targetId}. Closing older connection or new one.`);
                // client.ws.close(1011, 'Another connection was made by this user.'); // 古い接続を切る場合
                ws.close(1008, 'User already connected from another client.'); return; // 新しい接続を切る場合
            }
        }
        connectionSet.add(clientInfo);
        console.log(`Total connections for ${connectionType} ${targetId}: ${connectionSet.size}`);

        if (connectionType === 'community') {
            broadcastToCommunity(targetId, {
                type: WebSocketMessageTypes.SYSTEM_MESSAGE,
                text: `${userName} が入室しました。`
            }, ws); // 自分以外の参加者に入室を通知
        }

    } catch (error) {
        console.log(`WebSocket connection rejected: Invalid token or validation failed`, error.message);
        ws.close(1008, 'Invalid token or connection failed');
        return;
    }

    ws.on('message', async (message) => {
        try {
            const messageData = JSON.parse(message);
            console.log(`Received message for ${connectionType} ${targetId} from ${userName}:`, messageData);

            if (connectionType === 'community' && messageData.type === WebSocketMessageTypes.COMMUNITY_CHAT_MESSAGE && messageData.text) {
                const text = messageData.text.trim();
                if (text.length === 0 || text.length > 500) return;

                const chatMessage = new CommunityChatMessage({
                    communityId: targetId,
                    sender: userId, // MongoDB ObjectId
                    text: sanitizeText(text)
                });
                await chatMessage.save();

                const broadcastPayload = {
                    type: WebSocketMessageTypes.COMMUNITY_CHAT_MESSAGE,
                    senderId: userGoogleId, // Google ID を使用
                    senderName: userName,
                    senderPicture: userPicture,
                    text: chatMessage.text,
                    timestamp: chatMessage.timestamp
                };
                broadcastToCommunity(targetId, broadcastPayload, null); // 自分自身にも送信

            } else if (connectionType === 'match' && messageData.type === WebSocketMessageTypes.MATCH_CHAT_MESSAGE && messageData.text) {
                const text = messageData.text.trim();
                if (text.length === 0 || text.length > 500) return;

                const broadcastPayload = {
                    type: WebSocketMessageTypes.MATCH_CHAT_MESSAGE,
                    text: sanitizeText(text),
                    senderId: userGoogleId, // Google ID を使用
                    senderName: userName,
                    senderPicture: userPicture
                };
                broadcastToMatch(targetId, broadcastPayload, ws); // 自分以外の相手に送信
            }
        } catch (e) {
            console.error('Failed to parse message or process:', e);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`WebSocket client disconnected: ${userName} (ID: ${userId}), ${connectionType}: ${targetId}, Code: ${code}, Reason: ${String(reason)}`);
        const connectionsMap = connectionType === 'community' ? communityConnections : matchConnections;
        if (connectionsMap.has(targetId)) {
            const connectionSet = connectionsMap.get(targetId);
            let disconnectedClientInfo = null;
            for (const client of connectionSet) {
                if (client.ws === ws) {
                    disconnectedClientInfo = client;
                    connectionSet.delete(client);
                    break;
                }
            }
            if (disconnectedClientInfo) {
                 console.log(`Total connections remaining for ${connectionType} ${targetId}: ${connectionSet.size}`);
                 if (connectionSet.size === 0) {
                     connectionsMap.delete(targetId);
                     console.log(`${connectionType} ${targetId} removed from connections map.`);
                 } else {
                     if (connectionType === 'community') {
                         broadcastToCommunity(targetId, {
                             type: WebSocketMessageTypes.SYSTEM_MESSAGE,
                             text: `${disconnectedClientInfo.userName} が退室しました。`
                         }, null); // 退室した本人以外に通知する場合、nullではなくwsを渡すか、フィルタリングする
                     } else { // match
                         broadcastToMatch(targetId, {
                             type: WebSocketMessageTypes.OPPONENT_DISCONNECTED,
                             text: `${disconnectedClientInfo.userName} が切断しました。`
                         }, null); // こちらも同様
                     }
                 }
            }
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userName} (ID: ${userId}), ${connectionType}: ${targetId}:`, error);
    });
});

function broadcastGeneric(connectionsMap, targetId, messagePayload, excludeWs) {
    if (connectionsMap.has(targetId)) {
        const connectionSet = connectionsMap.get(targetId);
        const messageString = JSON.stringify(messagePayload);
        const connectionType = connectionsMap === communityConnections ? 'community' : 'match';
        // console.log(`Broadcasting to ${connectionType} ${targetId} (excluding sender: ${!!excludeWs}):`, messagePayload);

        connectionSet.forEach(client => {
            if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageString, (err) => {
                    if (err) {
                        console.error(`Failed to send message to user ${client.userName} in ${connectionType} ${targetId}:`, err);
                        connectionSet.delete(client);
                        client.ws.terminate();
                        if (connectionSet.size === 0) {
                            connectionsMap.delete(targetId);
                        }
                    }
                });
            }
        });
    }
}

function broadcastToMatch(matchId, messagePayload, excludeWs) {
    broadcastGeneric(matchConnections, matchId, messagePayload, excludeWs);
}

function broadcastToCommunity(communityId, messagePayload, excludeWs) {
    broadcastGeneric(communityConnections, communityId, messagePayload, excludeWs);
}

const PORT = config.port;
server.listen(PORT, () => console.log(`Server (HTTP + WebSocket) running on port ${PORT}`));