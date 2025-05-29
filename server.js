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
            console.log("CORS Check - Allowed:", origin);
            callback(null, true);
        } else {
            console.error('CORS Check - Denied:', origin);
            callback(null, false); // ★★★ CORSエラーとして拒否する (500エラーにはしない) ★★★
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
    keyGenerator: (req, res) => {
        return req.ip;
    }
});
app.use('/api', limiter);

app.use((req, res, next) => {
    console.log(`HTTP Request: ${req.method} ${req.url}`); // HTTPリクエストのログを明確化
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

app.use((err, req, res, next) => {
    console.error("Unhandled HTTP error:", err.stack || err);
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

wss.on('connection', async (ws, req) => {
    // ★★★ 接続試行時のログ ★★★
    console.log('★★★ WebSocket client attempting connection...');
    const queryParams = url.parse(req.url, true).query;
    const token = queryParams.token;
    const communityId = queryParams.communityId;
    const matchId = queryParams.matchId;

    let userId = null;
    let userName = null;
    let userGoogleId = null;
    let userPicture = null;
    let connectionType = null;
    let targetId = null;

    if (!token) {
        console.log('★★★ WS Close: Missing token');
        ws.close(1008, 'Missing token'); return;
    }
    if (!communityId && !matchId) {
        console.log('★★★ WS Close: Missing communityId or matchId');
        ws.close(1008, 'Missing communityId or matchId'); return;
    }
    if (communityId && matchId) {
        console.log('★★★ WS Close: Cannot specify both communityId and matchId');
        ws.close(1008, 'Cannot specify both communityId and matchId'); return;
    }

    connectionType = communityId ? 'community' : 'match';
    targetId = communityId || matchId;

    try {
        console.log(`★★★ WS: Verifying token for ${connectionType} ${targetId}`);
        const decoded = jwt.verify(token, config.jwtSecret);
        userId = decoded.id;
        const user = await User.findById(userId).select('name googleId picture');
        if (!user) {
            console.log(`★★★ WS Close: User not found for token. UserId: ${userId}`);
            throw new Error('User not found for token');
        }
        userName = user.name;
        userGoogleId = user.googleId;
        userPicture = user.picture;
        console.log(`★★★ WS: Token verified. User: ${userName} (ID: ${userId})`);

        let connectionsMap;
        let canConnect = false;

        if (connectionType === 'community') {
            connectionsMap = communityConnections;
            console.log(`★★★ WS Community: Checking membership for ${userName} in ${communityId}`);
            const community = await Community.findById(communityId).select('participants organizer');
            if (community && (community.participants.some(id => id.equals(userId)) || community.organizer.equals(userId))) {
                canConnect = true;
                console.log(`★★★ WS Community: ${userName} is member/organizer of ${communityId}. Can connect.`);
            } else {
                const reason = community ? `Not a member of this community` : `Community not found`;
                console.log(`★★★ WS Close: ${userName} ${reason} for community ${communityId}`);
                ws.close(1008, reason);
                return;
            }
        } else { // connectionType === 'match'
            connectionsMap = matchConnections;
            console.log(`★★★ WS Match: Checking participation for ${userName} in ${matchId}`);
            const match = await Match.findById(targetId).select('players status');
            if (match && match.players.some(id => id.equals(userId)) && match.status === 'matched') {
                 canConnect = true;
                 console.log(`★★★ WS Match: ${userName} is part of active match ${matchId}. Can connect.`);
            } else {
                 const reason = match ? `Not part of this match or match not active` : `Match not found`;
                 console.log(`★★★ WS Close: ${userName} ${reason} for match ${matchId}`);
                 ws.close(1008, reason);
                 return;
            }
        }

        if (!canConnect) { // Should not be reached if logic above is correct
             console.log(`★★★ WS Close: Connection not allowed (should not happen here) for ${userName} to ${connectionType} ${targetId}`);
             ws.close(1008, 'Connection not allowed');
             return;
        }
        
        // ★★★ 接続確立直後のログ ★★★ (ここに来たらハンドシェイクは成功)
        console.log(`★★★ WebSocket client connected and authenticated: ${userName} (ID: ${userId}), Type: ${connectionType}, Target: ${targetId}`);


        const clientInfo = { ws, userId, userName, userGoogleId, userPicture, connectionType, targetId };
        if (!connectionsMap.has(targetId)) {
            connectionsMap.set(targetId, new Set());
            console.log(`★★★ WS: New connection set created for ${connectionType} ${targetId}`);
        }
        const connectionSet = connectionsMap.get(targetId);

        // ★★★ 重複接続チェックと処理 (修正版) ★★★
        for (const client of connectionSet) {
            if (client.userId === userId && client.ws !== ws) { // 既存の接続が自分自身でない場合
                console.log(`★★★ DUPLICATE DETECTED! User: ${userName}, Old WS state: ${client.ws.readyState}, New WS state: ${ws.readyState}`);
                console.log(`★★★ Closing OLD connection (1011) for ${userName}.`);
                client.ws.close(1011, 'Another connection was made for this user.');
                console.log(`★★★ Explicitly DELETING old client from set. Current set size BEFORE delete: ${connectionSet.size}`);
                connectionSet.delete(client); // ★★★ ここで明示的に削除 ★★★
                console.log(`★★★ Old client removed. Set size AFTER delete: ${connectionSet.size}`);
                // return; // return はしないので、新しい接続が追加される
            }
        }
        console.log(`★★★ Adding NEW connection for ${userName} to ${connectionType} ${targetId}. Current set size before add: ${connectionSet.size}`);
        connectionSet.add(clientInfo);
        console.log(`★★★ New connection added for ${userName}. New set size after add: ${connectionSet.size}`);


        if (connectionType === 'community') {
            broadcastToCommunity(targetId, {
                type: WebSocketMessageTypes.SYSTEM_MESSAGE,
                text: `${userName} が入室しました。`
            }, ws);
        }

    } catch (error) {
        console.log(`★★★ WS Close: Error during connection setup for ${userName || 'Unknown user'}: ${error.message}`);
        ws.close(1008, 'Invalid token or connection failed');
        return;
    }

    ws.on('message', async (message) => {
        try {
            const messageData = JSON.parse(message);
            console.log(`★★★ WS Message: Received for ${connectionType} ${targetId} from ${userName}:`, messageData);

            if (connectionType === 'community' && messageData.type === WebSocketMessageTypes.COMMUNITY_CHAT_MESSAGE && messageData.text) {
                // ... (変更なし) ...
                const text = messageData.text.trim();
                if (text.length === 0 || text.length > 500) return;

                const chatMessage = new CommunityChatMessage({
                    communityId: targetId,
                    sender: userId,
                    text: sanitizeText(text)
                });
                await chatMessage.save();

                const broadcastPayload = {
                    type: WebSocketMessageTypes.COMMUNITY_CHAT_MESSAGE,
                    senderId: userGoogleId,
                    senderName: userName,
                    senderPicture: userPicture,
                    text: chatMessage.text,
                    timestamp: chatMessage.timestamp
                };
                broadcastToCommunity(targetId, broadcastPayload, null);
            } else if (connectionType === 'match' && messageData.type === WebSocketMessageTypes.MATCH_CHAT_MESSAGE && messageData.text) {
                // ... (変更なし) ...
                const text = messageData.text.trim();
                if (text.length === 0 || text.length > 500) return;

                const broadcastPayload = {
                    type: WebSocketMessageTypes.MATCH_CHAT_MESSAGE,
                    text: sanitizeText(text),
                    senderId: userGoogleId,
                    senderName: userName,
                    senderPicture: userPicture
                };
                broadcastToMatch(targetId, broadcastPayload, ws);
            }
        } catch (e) {
            console.error('★★★ WS Error: Failed to parse message or process:', e);
        }
    });

    ws.on('close', (code, reason) => {
        const logUserName = userName || 'Unknown User (closed before auth)'; // userNameが未設定の場合のフォールバック
        const logConnectionType = connectionType || 'N/A';
        const logTargetId = targetId || 'N/A';
        console.log(`★★★ ON_CLOSE triggered for ${logUserName}. Code: ${code}, Reason: ${String(reason)}, Type: ${logConnectionType}, Target: ${logTargetId}`);
        
        const connectionsMap = logConnectionType === 'community' ? communityConnections : matchConnections;
        if (logTargetId !== 'N/A' && connectionsMap.has(logTargetId)) {
            const connectionSet = connectionsMap.get(logTargetId);
            let disconnectedClientInfo = null;
            for (const client of connectionSet) {
                if (client.ws === ws) {
                    disconnectedClientInfo = client;
                    console.log(`★★★ ON_CLOSE: Found client to remove: ${client.userName}. Current set size BEFORE delete: ${connectionSet.size}`);
                    connectionSet.delete(client);
                    console.log(`★★★ ON_CLOSE: Client removed. New set size AFTER delete: ${connectionSet.size}`);
                    break;
                }
            }
            if (disconnectedClientInfo) {
                 console.log(`Total connections remaining for ${logConnectionType} ${logTargetId}: ${connectionSet.size}`);
                 if (connectionSet.size === 0) {
                     connectionsMap.delete(logTargetId);
                     console.log(`${logConnectionType} ${logTargetId} removed from connections map.`);
                 } else {
                     if (logConnectionType === 'community') {
                         broadcastToCommunity(logTargetId, {
                             type: WebSocketMessageTypes.SYSTEM_MESSAGE,
                             text: `${disconnectedClientInfo.userName} が退室しました。`
                         }, null);
                     } else { // match
                         broadcastToMatch(logTargetId, {
                             type: WebSocketMessageTypes.OPPONENT_DISCONNECTED,
                             text: `${disconnectedClientInfo.userName} が切断しました。`
                         }, null);
                     }
                 }
            } else {
                 console.log(`★★★ ON_CLOSE: Client not found in set for ${logUserName}. Target: ${logTargetId}, Set size: ${connectionSet.size}`);
            }
        } else {
             console.log(`★★★ ON_CLOSE: No connectionSet for targetId ${logTargetId} or targetId not set for ${logUserName}.`);
        }
    });

    ws.on('error', (error) => {
        const logUserName = userName || 'Unknown User (error before auth)';
        const logConnectionType = connectionType || 'N/A';
        const logTargetId = targetId || 'N/A';
        console.error(`★★★ WebSocket ERROR for user ${logUserName}, Type: ${logConnectionType}, Target: ${logTargetId}:`, error);
    });
});

function broadcastGeneric(connectionsMap, targetId, messagePayload, excludeWs) {
    // ... (変更なし) ...
    if (connectionsMap.has(targetId)) {
        const connectionSet = connectionsMap.get(targetId);
        const messageString = JSON.stringify(messagePayload);
        const connectionType = connectionsMap === communityConnections ? 'community' : 'match';
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