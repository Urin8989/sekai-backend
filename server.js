// server.js (修正版)
require('dotenv').config();

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
const mongoose = require('mongoose');
const config = require('./config/setting');
const connectDB = require('./config/db');
const User = require('./models/User');
const Match = require('./models/Match');
const Community = require('./models/Community');
const CommunityChatMessage = require('./models/CommunityChatMessage');
// ★★★ constants.js に 'PARTICIPANT_KICKED', 'PARTICIPANT_UPDATE', 'COMMUNITY_DELETED' を追加してください ★★★
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

// ★★★ Expressアプリにwssインスタンスをセット ★★★
app.set('wss', wss);

app.set('trust proxy', 1);
app.use(helmet());

const allowedOrigins = [
    'https://mariokartbestrivals.com',
    'https://www.mariokartbestrivals.com',
    'http://127.0.0.1:5500',
];

app.use(cors({
    origin: function (origin, callback) {
        console.log("CORS Check - Received Origin:", origin);
        if (!origin || origin === "null" || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.error('CORS Check - Denied:', origin);
            callback(new Error('Not allowed by CORS')); // エラーとして返す
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const limiter = rateLimit({
	windowMs: 1 * 60 * 1000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false,
    keyGenerator: (req, res) => req.ip
});
app.use('/api', limiter);

app.use((req, res, next) => {
    console.log(`HTTP Request: ${req.method} ${req.url}`);
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
app.use('/api/shop', shopRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/badges', badgeRoutes);

// エラーハンドリング
app.use((err, req, res, next) => {
    console.error("Unhandled HTTP error:", err.stack || err);
    // CORSエラーの場合もここで処理される可能性がある
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ message: 'Not allowed by CORS' });
    }
    res.status(err.status || 500).json({
        message: err.message || 'サーバー内部でエラーが発生しました。',
    });
});

const matchConnections = new Map();
const communityConnections = new Map();

function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/<[^>]*>?/gm, '');
}

// --- WebSocket Connection Handling ---
wss.on('connection', async (ws, req) => {
    console.log('★★★ WebSocket client attempting connection...');
    const queryParams = url.parse(req.url, true).query;
    const token = queryParams.token;
    const communityId = queryParams.communityId;
    const matchId = queryParams.matchId;

    let userId = null; // MongoDB _id
    let userName = null;
    let userGoogleId = null; // これをキック時の識別子に使う
    let userPicture = null;
    let connectionType = null;
    let targetId = null;

    if (!token) { ws.close(1008, 'Missing token'); return; }
    if (!communityId && !matchId) { ws.close(1008, 'Missing communityId or matchId'); return; }
    if (communityId && matchId) { ws.close(1008, 'Cannot specify both communityId and matchId'); return; }

    connectionType = communityId ? 'community' : 'match';
    targetId = communityId || matchId;

    try {
        console.log(`★★★ WS: Verifying token for ${connectionType} ${targetId}`);
        // ★★★ config.jwtSecret を使用 ★★★
        const decoded = jwt.verify(token, config.jwtSecret);
        userId = decoded.id; // MongoDB _id
        const user = await User.findById(userId).select('name googleId picture');
        if (!user) { throw new Error('User not found for token'); }
        userName = user.name;
        userGoogleId = user.googleId; // googleId (sub) を取得
        userPicture = user.picture;
        console.log(`★★★ WS: Token verified. User: ${userName} (GoogleID: ${userGoogleId})`);

        let connectionsMap;
        let canConnect = false;

        if (connectionType === 'community') {
            connectionsMap = communityConnections;
            const community = await Community.findById(communityId).select('participants organizer');
            if (community && (community.participants.some(id => id.equals(userId)) || community.organizer.equals(userId))) {
                canConnect = true;
            } else { ws.close(1008, community ? 'Not a member' : 'Community not found'); return; }
        } else { // match
            connectionsMap = matchConnections;
            const match = await Match.findById(targetId).select('players status');
            if (match && match.players.some(id => id.equals(userId)) && match.status === 'matched') {
                 canConnect = true;
            } else { ws.close(1008, match ? 'Not part of match or match not active' : 'Match not found'); return; }
        }

        if (!canConnect) { ws.close(1008, 'Connection not allowed'); return; }

        console.log(`★★★ WS client connected: ${userName} (GoogleID: ${userGoogleId}), Type: ${connectionType}, Target: ${targetId}`);

        // ★★★ clientInfo に userGoogleId を含める ★★★
        const clientInfo = { ws, userId, userName, userGoogleId, userPicture, connectionType, targetId };

        if (!connectionsMap.has(targetId)) {
            connectionsMap.set(targetId, new Set());
        }
        const connectionSet = connectionsMap.get(targetId);

        // 重複接続チェック (userGoogleId でチェック)
        for (const client of connectionSet) {
            if (client.userGoogleId === userGoogleId && client.ws !== ws) {
                console.log(`★★★ Closing OLD connection for ${userName} (GoogleID: ${userGoogleId}).`);
                client.ws.close(1011, 'Another connection was made for this user.');
                connectionSet.delete(client); // 明示的に削除
            }
        }
        connectionSet.add(clientInfo);
        console.log(`★★★ New connection added for ${userName}. Set size: ${connectionSet.size}`);

        if (connectionType === 'community') {
            broadcastToCommunity(targetId, {
                type: WebSocketMessageTypes.SYSTEM_MESSAGE,
                text: `${userName} が入室しました。`
            }, ws);
        }

    } catch (error) {
        console.log(`★★★ WS Close: Error during connection setup for ${userName || 'Unknown'}: ${error.message}`);
        ws.close(1008, 'Invalid token or connection failed');
        return;
    }

    // --- メッセージ受信ハンドラ ---
    ws.on('message', async (message) => {
        try {
            const messageData = JSON.parse(message);
            console.log(`★★★ WS Message: Received for ${connectionType} ${targetId} from ${userName}:`, messageData);

            if (connectionType === 'community' && messageData.type === WebSocketMessageTypes.COMMUNITY_CHAT_MESSAGE && messageData.text) {
                const text = sanitizeText(messageData.text.trim());
                if (text.length === 0 || text.length > 500) return;

                const chatMessage = new CommunityChatMessage({
                    communityId: targetId, sender: userId, text: text
                });
                await chatMessage.save();

                broadcastToCommunity(targetId, {
                    type: WebSocketMessageTypes.COMMUNITY_CHAT_MESSAGE,
                    senderId: userGoogleId, senderName: userName, senderPicture: userPicture,
                    text: chatMessage.text, timestamp: chatMessage.timestamp
                }, null);
            } else if (connectionType === 'match' /* ... */) {
                // ... マッチチャットの処理 ...
            }
        } catch (e) { console.error('★★★ WS Error: Failed to parse message:', e); }
    });

    // --- 切断ハンドラ ---
    ws.on('close', (code, reason) => {
        const logUserName = userName || 'Unknown (closed early)';
        console.log(`★★★ ON_CLOSE triggered for ${logUserName}. Code: ${code}, Reason: ${String(reason)}`);

        const connectionsMap = connectionType === 'community' ? communityConnections : matchConnections;
        if (targetId && connectionsMap.has(targetId)) {
            const connectionSet = connectionsMap.get(targetId);
            for (const client of connectionSet) {
                if (client.ws === ws) {
                    connectionSet.delete(client);
                    console.log(`★★★ ON_CLOSE: Client removed: ${client.userName}. New set size: ${connectionSet.size}`);
                    // 1011(重複)と4001(キック), 4002(削除) 以外の場合のみ退室通知
                    if (code !== 1011 && code !== 4001 && code !== 4002) {
                        if (connectionType === 'community') {
                            broadcastToCommunity(targetId, {
                                type: WebSocketMessageTypes.SYSTEM_MESSAGE,
                                text: `${client.userName} が退室しました。`
                            }, null);
                            // ★★★ 退室時にも参加者リスト更新を通知 ★★★
                            wss.broadcastParticipantUpdate(targetId);
                        } else { /* マッチの処理 */ }
                    }
                    if (connectionSet.size === 0) {
                        connectionsMap.delete(targetId);
                        console.log(`★★★ ${connectionType} ${targetId} removed from map.`);
                    }
                    break;
                }
            }
        }
    });

    ws.on('error', (error) => { console.error(`★★★ WS ERROR for ${userName || 'Unknown'}:`, error); });
});

// --- ブロードキャスト関数 ---
function broadcastGeneric(connectionsMap, targetId, messagePayload, excludeWs) {
    if (connectionsMap.has(targetId)) {
        const connectionSet = connectionsMap.get(targetId);
        const messageString = JSON.stringify(messagePayload);
        connectionSet.forEach(client => {
            if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(messageString, (err) => {
                    if (err) {
                        console.error(`Failed to send WS message to ${client.userName}:`, err);
                        client.ws.terminate(); // 送信失敗した接続は強制終了
                        connectionSet.delete(client); // セットからも削除
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

// ★★★ ここからキック用などの関数を追加 ★★★

/**
 * 指定されたユーザーを指定されたコミュニティからキックします。
 * @param {string} communityId - コミュニティID
 * @param {string} userGoogleIdToKick - キック対象ユーザーのGoogle ID (sub)
 */
wss.kickUser = (communityId, userGoogleIdToKick) => {
    console.log(`WSS: Attempting to kick user ${userGoogleIdToKick} from community ${communityId}`);
    const connectionSet = communityConnections.get(communityId);
    if (!connectionSet) {
        console.log(`WSS: No connection set for community ${communityId}.`);
        return;
    }

    let kickedClient = null;
    for (const client of connectionSet) {
        if (client.userGoogleId === userGoogleIdToKick) {
            kickedClient = client;
            break;
        }
    }

    if (kickedClient) {
        console.log(`WSS: Kicking user ${kickedClient.userName}`);
        kickedClient.ws.send(JSON.stringify({
            type: WebSocketMessageTypes.PARTICIPANT_KICKED,
            kickedUserId: userGoogleIdToKick,
            communityId: communityId,
            text: 'コミュニティから追放されました。'
        }));
        // 短い遅延を入れてメッセージ送信を確実にする (必須ではない)
        setTimeout(() => {
            kickedClient.ws.close(4001, 'Kicked by organizer');
        }, 100);
        // on('close')でセットから削除されるが、念のためここでも削除
        connectionSet.delete(kickedClient);
        // 他のメンバーに参加者更新を通知
        wss.broadcastParticipantUpdate(communityId);
    } else {
        console.log(`WSS: User ${userGoogleIdToKick} not connected via WS for community ${communityId}.`);
        // ユーザーがオフラインでもキックは成功しているので、参加者更新は通知する
        wss.broadcastParticipantUpdate(communityId);
    }
};

/**
 * 指定されたコミュニティに参加者リストの更新を通知します。
 * @param {string} communityId - コミュニティID
 */
wss.broadcastParticipantUpdate = (communityId) => {
     console.log(`WSS: Broadcasting participant update for community ${communityId}`);
     broadcastToCommunity(communityId, {
         type: WebSocketMessageTypes.PARTICIPANT_UPDATE,
         communityId: communityId
     }, null); // 全員に送信
};

/**
 * 指定されたコミュニティが削除されたことを通知し、接続を閉じます。
 * @param {string} communityId - コミュニティID
 */
wss.broadcastCommunityDeleted = (communityId) => {
     console.log(`WSS: Broadcasting community deleted for community ${communityId}`);
     const connectionSet = communityConnections.get(communityId);
     if (connectionSet) {
         const message = JSON.stringify({
             type: WebSocketMessageTypes.COMMUNITY_DELETED,
             communityId: communityId
         });
         // Setを配列に変換してからループ (Setをループ中に削除するため)
         [...connectionSet].forEach(client => {
            if (client.ws.readyState === WebSocket.OPEN) {
                 client.ws.send(message);
                 client.ws.close(4002, 'Community deleted');
            }
         });
         communityConnections.delete(communityId); // マップからセットを削除
         console.log(`WSS: Closed all connections for deleted community ${communityId}`);
     }
};

// ★★★ 追加ここまで ★★★

const PORT = config.port;
server.listen(PORT, () => console.log(`Server (HTTP + WebSocket) running on port ${PORT}`));