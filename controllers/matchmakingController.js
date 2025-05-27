// controllers/matchmakingController.js
const User = require('../models/User');
const mongoose = require('mongoose');
const Match = require('../models/Match'); // ★ Matchモデルをインポート

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

// マッチングキューの処理
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
                    // ★★★ Matchモデルを使ってドキュメント作成 ★★★
                    const newMatch = new Match({
                        players: [userA.userId, userB.userId],
                        status: 'matched', // デフォルトが 'matched' なので明示不要かも
                    });
                    const savedMatch = await newMatch.save();
                    const matchId = savedMatch._id.toString();

                    userA.status = 'matched';
                    userA.opponent = {
                        googleId: userB.googleId, name: userB.name, picture: userB.picture, rate: userB.rate,
                        profile: userB.profile, badges: userB.badges, displayBadges: userB.displayBadges
                    };
                    userA.matchId = matchId;
                    userB.status = 'matched';
                    userB.opponent = {
                        googleId: userA.googleId, name: userA.name, picture: userA.picture, rate: userA.rate,
                        profile: userA.profile, badges: userA.badges, displayBadges: userA.displayBadges
                    };
                    userB.matchId = matchId;
                    matchedUserIds.add(userA.userId);
                    matchedUserIds.add(userB.userId);
                    console.log(`Match found: ${userA.name} vs ${userB.name} MatchID: ${matchId}`);
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

// マッチングリクエストAPI
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
        profile: currentUser.profile,
        badges: currentUser.badges,
        displayBadges: currentUser.displayBadges,
        requestedAt: new Date(),
        status: 'waiting',
        opponent: null,
        matchId: null,
    };
    matchmakingQueue.push(newEntry);
    console.log(`User ${currentUser.name} added to matchmaking queue.`);
    res.status(202).json({ status: 'waiting' });
};

// マッチングキュー状況確認API
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

// マッチングキューキャンセルAPI
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

// ★★★ ここから新しいAPI / 修正API ★★★

/**
 * 対戦結果を報告するAPI
 */
exports.submitMatchReport = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const { matchId, result } = req.body; // result は 'win' or 'lose'
    const currentUser = req.user;

    if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Valid Match ID is required.' });
    }
    if (!['win', 'lose'].includes(result)) {
        return res.status(400).json({ message: 'Result must be "win" or "lose".' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const match = await Match.findById(matchId).populate('players', 'name rate points').session(session);

        if (!match) {
            throw new Error('Match not found.');
        }
        if (!match.players.some(p => p._id.equals(currentUser._id))) {
            throw new Error('You are not a player in this match.');
        }
        if (['finished', 'disputed', 'cancelled'].includes(match.status)) {
            throw new Error('Match is already concluded or cancelled.');
        }
        if (match.reports.some(r => r.player.equals(currentUser._id))) {
            throw new Error('You have already reported the result.');
        }

        // 報告を追加
        match.reports.push({ player: currentUser._id, report: result });

        // 両者が報告したかチェック
        if (match.reports.length === 2) {
            const report1 = match.reports[0];
            const report2 = match.reports[1];

            const player1 = match.players.find(p => p._id.equals(report1.player));
            const player2 = match.players.find(p => p._id.equals(report2.player));

            // 結果が一致するかチェック (片方がwin, もう片方がlose)
            const isConsistent = (report1.report === 'win' && report2.report === 'lose') ||
                                 (report1.report === 'lose' && report2.report === 'win');

            if (isConsistent) {
                // --- 結果一致: レート計算と更新 ---
                const winnerReport = report1.report === 'win' ? report1 : report2;
                const loserReport = report1.report === 'lose' ? report1 : report2;
                const winner = match.players.find(p => p._id.equals(winnerReport.player));
                const loser = match.players.find(p => p._id.equals(loserReport.player));

                const originalWinnerRate = winner.rate;
                const originalLoserRate = loser.rate;

                const winnerRateChange = calculateRateChange(originalWinnerRate, originalLoserRate, true);
                const loserRateChange = calculateRateChange(originalLoserRate, originalWinnerRate, false);

                const winnerPoints = 100;
                const loserPoints = 50;

                const winnerNewRate = Math.max(0, originalWinnerRate + winnerRateChange);
                const loserNewRate = Math.max(0, originalLoserRate + loserRateChange);
                const winnerNewPoints = (winner.points || 0) + winnerPoints;
                const loserNewPoints = (loser.points || 0) + loserPoints;

                await User.findByIdAndUpdate(winner._id, {
                    rate: winnerNewRate,
                    points: winnerNewPoints,
                    $inc: { matchCount: 1 }
                }, { session });
                await User.findByIdAndUpdate(loser._id, {
                    rate: loserNewRate,
                    points: loserNewPoints,
                    $inc: { matchCount: 1 }
                }, { session });

                match.winner = winner._id;
                match.rateChange = [
                    { player: winner._id, change: winnerRateChange },
                    { player: loser._id, change: loserRateChange }
                ];
                match.status = 'finished';
                match.finishedAt = new Date();
                await match.save({ session });
                await session.commitTransaction();
                session.endSession();

                console.log(`Match ${matchId} finished. Winner: ${winner.name}`);

                // 報告者に応じたレスポンスを返す
                const isCurrentUserWinner = winner._id.equals(currentUser._id);
                return res.status(200).json({
                    status: 'finished',
                    resultData: {
                        didWin: isCurrentUserWinner,
                        originalRate: isCurrentUserWinner ? originalWinnerRate : originalLoserRate,
                        newRate: isCurrentUserWinner ? winnerNewRate : loserNewRate,
                        rateChange: isCurrentUserWinner ? winnerRateChange : loserRateChange,
                        pointsEarned: isCurrentUserWinner ? winnerPoints : loserPoints,
                        newPoints: isCurrentUserWinner ? winnerNewPoints : loserNewPoints,
                    }
                });

            } else {
                // --- 結果不一致: disputed に設定 ---
                match.status = 'disputed';
                match.finishedAt = new Date();
                await match.save({ session });
                await session.commitTransaction();
                session.endSession();
                 console.log(`Match ${matchId} disputed.`);
                return res.status(200).json({ status: 'disputed' });
            }

        } else {
            // --- 片方のみ報告: reported_one に設定 ---
            match.status = 'reported_one';
            await match.save({ session });
            await session.commitTransaction();
            session.endSession();
            console.log(`Match ${matchId} reported by one player.`);
            return res.status(200).json({ status: 'waiting' });
        }

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error submitting match report:', error);
        return res.status(500).json({ message: 'Error submitting report', error: error.message });
    }
};

/**
 * 対戦をキャンセルするAPI
 */
exports.cancelMatch = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const { matchId } = req.body;
    const currentUser = req.user;

    if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Valid Match ID is required.' });
    }

    try {
        const match = await Match.findById(matchId);

        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }
        if (!match.players.some(p => p._id.equals(currentUser._id))) {
            return res.status(403).json({ message: 'You are not a player in this match.' });
        }
        if (['finished', 'disputed', 'cancelled'].includes(match.status)) {
            return res.status(400).json({ message: 'Match is already concluded or cancelled.' });
        }

        match.status = 'cancelled';
        match.finishedAt = new Date();
        await match.save();

        console.log(`Match ${matchId} cancelled by ${currentUser.name}`);
        return res.status(200).json({ status: 'cancelled' });

    } catch (error) {
        console.error('Error cancelling match:', error);
        return res.status(500).json({ message: 'Error cancelling match', error: error.message });
    }
};

/**
 * 特定のマッチの状態を取得するAPI (ポーリング用)
 */
exports.getMatchStatus = async (req, res) => {
     if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const { matchId } = req.params;
    const currentUser = req.user;

    if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) {
        return res.status(400).json({ message: 'Valid Match ID is required.' });
    }

    try {
        const match = await Match.findById(matchId).populate('players', 'name rate points');

        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }
         if (!match.players.some(p => p._id.equals(currentUser._id))) {
            return res.status(403).json({ message: 'You are not a player in this match.' });
        }

        let responseData = { status: match.status };

        // 'finished' の場合、報告者に応じた結果データを付与
        if (match.status === 'finished' && match.winner && match.rateChange.length === 2) {
            const winnerData = match.players.find(p => p._id.equals(match.winner));
            const loserData = match.players.find(p => !p._id.equals(match.winner));
            const winnerRateData = match.rateChange.find(rc => rc.player.equals(winnerData._id));
            const loserRateData = match.rateChange.find(rc => rc.player.equals(loserData._id));

            // Populate がないと rateChange は見つからない可能性があるので、チェック
            if (!winnerData || !loserData || !winnerRateData || !loserRateData) {
                 return res.status(500).json({ message: 'Internal error: Could not process finished match data.' });
            }


            const isCurrentUserWinner = winnerData._id.equals(currentUser._id);
            // 元のレートを計算 (現在のレート - 変動値)
            const originalWinnerRate = winnerData.rate - winnerRateData.change;
            const originalLoserRate = loserData.rate - loserRateData.change;
            const pointsEarned = isCurrentUserWinner ? 100 : 50;


            responseData.resultData = {
                didWin: isCurrentUserWinner,
                originalRate: isCurrentUserWinner ? originalWinnerRate : originalLoserRate,
                newRate: isCurrentUserWinner ? winnerData.rate : loserData.rate,
                rateChange: isCurrentUserWinner ? winnerRateData.change : loserRateData.change,
                pointsEarned: pointsEarned,
                newPoints: isCurrentUserWinner ? winnerData.points : loserData.points,
            };
        }

        return res.status(200).json(responseData);

    } catch (error) {
         console.error('Error getting match status:', error);
         return res.status(500).json({ message: 'Error getting match status', error: error.message });
    }
};