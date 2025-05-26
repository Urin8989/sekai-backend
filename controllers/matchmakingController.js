// controllers/matchmakingController.js
const User = require('../models/User');
const mongoose = require('mongoose');
const Match = require('../models/Match');

// --- マッチングキュー (インメモリ) ---
const matchmakingQueue = [];
const MATCHMAKING_INTERVAL = 5000;
const MATCHMAKING_TIMEOUT = 74999;
const INITIAL_RATE_RANGE = 20;
const RATE_RANGE_INCREASE = 20;
const RATE_RANGE_INCREASE_INTERVAL = 15000;

// --- Eloレーティング計算 ---
const K_FACTOR = 30;
const MIN_RATE_CHANGE = 1;
const MAX_RATE_CHANGE = 29;

function calculateExpectedWinRate(playerARate, playerBRate) {
    return 1 / (1 + Math.pow(10, (playerBRate - playerARate) / 400));
}

function calculateRateChange(currentRate, opponentRate, didWin, kFactor = K_FACTOR) {
    const expectedWinRate = calculateExpectedWinRate(currentRate, opponentRate);
    const actualScore = didWin ? 1 : 0;
    const change = Math.round(kFactor * (actualScore - expectedWinRate));

    if (change === 0) {
        return didWin ? MIN_RATE_CHANGE : -MIN_RATE_CHANGE;
    } else if (change > 0) {
        return Math.max(MIN_RATE_CHANGE, Math.min(MAX_RATE_CHANGE, change));
    } else {
        return Math.max(-MAX_RATE_CHANGE, Math.min(-MIN_RATE_CHANGE, change));
    }
}

async function processMatchmakingQueue() {
    const now = new Date();
    const waitingUsers = matchmakingQueue.filter(user => user.status === 'waiting');
    waitingUsers.sort((a, b) => a.rate - b.rate);
    const matchedUserIds = new Set();

    for (let i = 0; i < waitingUsers.length; i++) {
        const userA = waitingUsers[i];
        if (matchedUserIds.has(userA.userId) || userA.status !== 'waiting') {
            continue;
        }
        const waitingTime = now.getTime() - userA.requestedAt.getTime();
        if (waitingTime > MATCHMAKING_TIMEOUT) {
            userA.status = 'timeout';
            console.log(`Matchmaking timeout for user: ${userA.name}`);
            continue;
        }
        const increaseSteps = Math.floor(waitingTime / RATE_RANGE_INCREASE_INTERVAL);
        const currentRateRange = INITIAL_RATE_RANGE + (increaseSteps * RATE_RANGE_INCREASE);

        for (let j = i + 1; j < waitingUsers.length; j++) {
            const userB = waitingUsers[j];
            if (matchedUserIds.has(userB.userId) || userB.status !== 'waiting') {
                continue;
            }
            const rateDiff = Math.abs(userA.rate - userB.rate);
            if (rateDiff <= currentRateRange) {
                try {
                    const newMatch = new Match({
                        players: [userA.userId, userB.userId],
                        status: 'matched',
                    });
                    const savedMatch = await newMatch.save();
                    const matchId = savedMatch._id.toString();

                    userA.status = 'matched';
                    userA.opponent = { googleId: userB.googleId, name: userB.name, picture: userB.picture, rate: userB.rate };
                    userA.matchId = matchId;
                    userB.status = 'matched';
                    userB.opponent = { googleId: userA.googleId, name: userA.name, picture: userA.picture, rate: userA.rate };
                    userB.matchId = matchId;
                    matchedUserIds.add(userA.userId);
                    matchedUserIds.add(userB.userId);
                    console.log(`Match found: ${userA.name} (Rate: ${userA.rate}) vs ${userB.name} (Rate: ${userB.rate}) MatchID: ${matchId}`);
                    break; 
                } catch (error) {
                    console.error("Error creating Match document:", error);
                    continue;
                }
            }
            if (userB.rate - userA.rate > currentRateRange) {
                break;
            }
        }
    }
}
setInterval(processMatchmakingQueue, MATCHMAKING_INTERVAL);

exports.requestMatchmaking = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    const currentUser = req.user;
    const existingEntry = matchmakingQueue.find(user => user.userId === currentUser._id.toString());
    if (existingEntry && (existingEntry.status === 'waiting' || existingEntry.status === 'matched')) {
        return res.status(200).json({ status: existingEntry.status, opponent: existingEntry.opponent, matchId: existingEntry.matchId });
    }
    const indexToRemove = matchmakingQueue.findIndex(user => user.userId === currentUser._id.toString());
    if (indexToRemove > -1) {
        matchmakingQueue.splice(indexToRemove, 1);
    }
    const newEntry = {
        userId: currentUser._id.toString(),
        googleId: currentUser.googleId,
        name: currentUser.name,
        picture: currentUser.picture,
        rate: currentUser.rate,
        requestedAt: new Date(),
        status: 'waiting',
        opponent: null,
        matchId: null,
    };
    matchmakingQueue.push(newEntry);
    console.log(`User ${currentUser.name} added to matchmaking queue.`);
    res.status(202).json({ status: 'waiting' });
};

exports.getMatchmakingStatus = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    const currentUser = req.user;
    const userEntry = matchmakingQueue.find(user => user.userId === currentUser._id.toString());

    if (!userEntry) {
        return res.status(404).json({ status: 'not_found', message: 'Not currently in matchmaking queue.' });
    }
    let index;
    switch (userEntry.status) {
        case 'waiting':
            res.status(200).json({ status: 'waiting' });
            break;
        case 'matched':
            res.status(200).json({
                status: 'matched',
                opponent: userEntry.opponent,
                matchId: userEntry.matchId
            });
            index = matchmakingQueue.findIndex(u => u.userId === userEntry.userId);
            if (index > -1) matchmakingQueue.splice(index, 1);
            break;
        case 'timeout':
            res.status(200).json({ status: 'timeout' });
            index = matchmakingQueue.findIndex(u => u.userId === userEntry.userId);
            if (index > -1) matchmakingQueue.splice(index, 1);
            break;
        default:
            res.status(500).json({ status: 'error', message: 'Unknown matchmaking status.' });
            index = matchmakingQueue.findIndex(u => u.userId === userEntry.userId);
            if (index > -1) matchmakingQueue.splice(index, 1);
            break;
    }
};

exports.cancelMatchmaking = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    const currentUser = req.user;
    const index = matchmakingQueue.findIndex(user => user.userId === currentUser._id.toString() && user.status === 'waiting');

    if (index > -1) {
        matchmakingQueue.splice(index, 1);
        console.log(`User ${currentUser.name} cancelled matchmaking.`);
        res.status(200).json({ message: 'Matchmaking cancelled.' });
    } else {
        const userEntry = matchmakingQueue.find(user => user.userId === currentUser._id.toString());
        const currentStatus = userEntry ? userEntry.status : 'not found';
        res.status(400).json({ message: `Cannot cancel. Current status: ${currentStatus}` });
    }
};

exports.recordMatchResult = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const { matchId, didWin } = req.body;
    const currentUserInfo = req.user; // 報告者 (Userドキュメント、スキーマには points フィールドがある)

    if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Valid Match ID is required.' });
    }
    if (typeof didWin !== 'boolean') {
        return res.status(400).json({ message: 'didWin (boolean) is required.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const match = await Match.findById(matchId).populate('players', 'name rate points matchCount').session(session); // ★ セッション内で検索
        if (!match) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Match not found.' });
        }

        const playerEntry = match.players.find(p => p._id.equals(currentUserInfo._id));
        if (!playerEntry) {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ message: 'You are not a player in this match.' });
        }

        const opponentEntry = match.players.find(p => !p._id.equals(currentUserInfo._id));
        if (!opponentEntry) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Opponent not found in this match.' });
        }

        if (match.status === 'finished') {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Match result already recorded.' });
        }

        // --- ポイント付与ロジック ---
        let currentUserPointsEarned;
        let opponentPointsEarned;

        if (didWin) {
            currentUserPointsEarned = 100; // 勝者
            opponentPointsEarned = 50;   // 敗者
        } else {
            currentUserPointsEarned = 50;    // 敗者
            opponentPointsEarned = 100;  // 勝者
        }

        const currentUserNewPoints = (playerEntry.points || 0) + currentUserPointsEarned;
        const opponentNewPoints = (opponentEntry.points || 0) + opponentPointsEarned;
        // --- ポイント付与ロジックここまで ---

        const currentUserRateChange = calculateRateChange(playerEntry.rate, opponentEntry.rate, didWin);
        const opponentRateChange = calculateRateChange(opponentEntry.rate, playerEntry.rate, !didWin);

        const currentUserNewRate = Math.max(0, playerEntry.rate + currentUserRateChange);
        const opponentNewRate = Math.max(0, opponentEntry.rate + opponentRateChange);

        // ユーザーのレート、ポイント、対戦数を更新
        await User.findByIdAndUpdate(playerEntry._id, { // playerEntry._id を使用
            rate: currentUserNewRate,
            points: currentUserNewPoints, // ★ 更新されたポイント
            $inc: { matchCount: 1 }
        }, { session });

        // 対戦相手のレート、ポイント、対戦数を更新
        await User.findByIdAndUpdate(opponentEntry._id, {
            rate: opponentNewRate,
            points: opponentNewPoints, // ★ 更新されたポイント
            $inc: { matchCount: 1 }
        }, { session });

        match.winner = didWin ? playerEntry._id : opponentEntry._id;
        match.rateChange = [
            { player: playerEntry._id, change: currentUserRateChange },
            { player: opponentEntry._id, change: opponentRateChange }
        ];
        match.status = 'finished';
        match.finishedAt = new Date();
        await match.save({ session });

        await session.commitTransaction();
        session.endSession();

        console.log(`Match result recorded for MatchID: ${matchId}. Winner: ${didWin ? playerEntry.name : opponentEntry.name}. Points: ${playerEntry.name} +${currentUserPointsEarned}, ${opponentEntry.name} +${opponentPointsEarned}`);

        res.status(200).json({
            message: 'Match result recorded',
            newRate: currentUserNewRate,
            rateChange: currentUserRateChange,
            pointsEarned: currentUserPointsEarned, // 報告者が獲得したポイント
            newPoints: currentUserNewPoints,       // 報告者の更新後総ポイント
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error recording match result:', error);
        res.status(500).json({ message: 'Error recording match result', error: error.message });
    }
};