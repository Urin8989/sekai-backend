// controllers/matchmakingController.js
const User = require('../models/User');
const mongoose = require('mongoose'); // ★ mongoose をインポート
const Match = require('../models/Match'); // ★ Matchモデルをインポート

// --- マッチングキュー (インメモリ) ---
// 本番環境ではRedisやDBなど永続的なストアを推奨
const matchmakingQueue = []; // { userId: string, googleId: string, name: string, picture: string, rate: number, requestedAt: Date, status: 'waiting' | 'matched' | 'timeout', opponent: object | null, matchId: string | null }
const MATCHMAKING_INTERVAL = 5000; // 5秒ごとにキューを処理
const MATCHMAKING_TIMEOUT = 74999; // 60秒でタイムアウト
const INITIAL_RATE_RANGE = 20; // 初期のレート許容差
const RATE_RANGE_INCREASE = 20; // 15秒ごとに許容差を広げる量
const RATE_RANGE_INCREASE_INTERVAL = 15000; // 15秒

// --- Eloレーティング計算 ---
const K_FACTOR = 30; // 32から30に変更
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
// --- Eloレーティング計算ここまで ---

/**
 * マッチング待機キューを処理する関数
 */
async function processMatchmakingQueue() { // ★ async に変更
    const now = new Date();
    const waitingUsers = matchmakingQueue.filter(user => user.status === 'waiting');

    // レートでソート
    waitingUsers.sort((a, b) => a.rate - b.rate);

    const matchedUserIds = new Set(); // マッチング済みのユーザーIDを記録

    for (let i = 0; i < waitingUsers.length; i++) {
        const userA = waitingUsers[i];

        // 既にマッチング済みかタイムアウト処理済みならスキップ
        if (matchedUserIds.has(userA.userId) || userA.status !== 'waiting') {
            continue;
        }

        // タイムアウトチェック
        const waitingTime = now.getTime() - userA.requestedAt.getTime();
        if (waitingTime > MATCHMAKING_TIMEOUT) {
            userA.status = 'timeout';
            console.log(`Matchmaking timeout for user: ${userA.name}`);
            continue; // 次のユーザーへ
        }

        // 待機時間に応じてレート許容範囲を計算
        const increaseSteps = Math.floor(waitingTime / RATE_RANGE_INCREASE_INTERVAL);
        const currentRateRange = INITIAL_RATE_RANGE + (increaseSteps * RATE_RANGE_INCREASE);

        // userA に近いレートの相手を探す (userAよりレートが高いユーザーのみチェック)
        for (let j = i + 1; j < waitingUsers.length; j++) {
            const userB = waitingUsers[j];

            // 既にマッチング済みかタイムアウト処理済みならスキップ
            if (matchedUserIds.has(userB.userId) || userB.status !== 'waiting') {
                continue;
            }

            const rateDiff = Math.abs(userA.rate - userB.rate);

            if (rateDiff <= currentRateRange) {
                // ▼▼▼ マッチング成立！ Matchドキュメントを作成 ▼▼▼
                try {
                    // DBにMatchドキュメントを作成
                    const newMatch = new Match({
                        players: [userA.userId, userB.userId], // MongoDBのObjectIdを保存
                        status: 'matched', // ステータスを設定
                        // 他に必要な初期情報があれば設定
                    });
                    const savedMatch = await newMatch.save();
                    const matchId = savedMatch._id.toString(); // 生成されたドキュメントIDをmatchIdとして使用

                    // キュー内のユーザー情報を更新
                    userA.status = 'matched';
                    userA.opponent = { googleId: userB.googleId, name: userB.name, picture: userB.picture, rate: userB.rate };
                    userA.matchId = matchId; // ★ matchId を設定

                    userB.status = 'matched';
                    userB.opponent = { googleId: userA.googleId, name: userA.name, picture: userA.picture, rate: userA.rate };
                    userB.matchId = matchId; // ★ matchId を設定

                    // マッチング済みとしてマーク
                    matchedUserIds.add(userA.userId);
                    matchedUserIds.add(userB.userId);

                    console.log(`Match found: ${userA.name} (Rate: ${userA.rate}) vs ${userB.name} (Rate: ${userB.rate}) MatchID: ${matchId}`);
                    break; // userA の相手が見つかったので、次の userA の処理へ
                } catch (error) {
                    console.error("Error creating Match document:", error);
                    // エラーが発生した場合、マッチングを中断するか、リトライするかなどの処理が必要
                    // ここでは単純に次のユーザーへ (エラーログは出力される)
                    continue;
                }
                // ▲▲▲ Matchドキュメント作成ここまで ▲▲▲
            }

            // レート差が許容範囲を超えたら、それ以上高いレートのユーザーは見ない
            if (userB.rate - userA.rate > currentRateRange) {
                break;
            }
        }
    }

    // タイムアウトしたユーザーをキューから削除する処理は getMatchmakingStatus で行う
}

// 定期的にキュー処理を実行
setInterval(processMatchmakingQueue, MATCHMAKING_INTERVAL);

// --- APIエンドポイント ---

/**
 * POST /api/matchmaking/request - マッチング待機キューへの登録リクエスト
 */
exports.requestMatchmaking = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    const currentUser = req.user;

    // 既にキューにいるかチェック
    const existingEntry = matchmakingQueue.find(user => user.userId === currentUser._id.toString());
    if (existingEntry && (existingEntry.status === 'waiting' || existingEntry.status === 'matched')) {
        console.log(`User ${currentUser.name} is already in queue with status: ${existingEntry.status}`);
        // 既に待機中またはマッチング済みの場合、現在のステータスを返す
        return res.status(200).json({ status: existingEntry.status, opponent: existingEntry.opponent, matchId: existingEntry.matchId });
    }

    // キューから古いエントリ（完了/タイムアウト済み）を削除
    const indexToRemove = matchmakingQueue.findIndex(user => user.userId === currentUser._id.toString());
    if (indexToRemove > -1) {
        matchmakingQueue.splice(indexToRemove, 1);
    }

    // 新しい待機エントリを作成してキューに追加
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

    res.status(202).json({ status: 'waiting' }); // 202 Accepted: リクエスト受け付け完了
};

/**
 * GET /api/matchmaking/status - マッチングステータスの確認
 */
exports.getMatchmakingStatus = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    const currentUser = req.user;

    const userEntry = matchmakingQueue.find(user => user.userId === currentUser._id.toString());

    if (!userEntry) {
        // キューにいない場合は、まだリクエストしていないか、既に完了/タイムアウトして削除された可能性
        return res.status(404).json({ status: 'not_found', message: 'Not currently in matchmaking queue.' });
    }

    // ステータスに応じてレスポンスを返す
    switch (userEntry.status) {
        case 'waiting':
            res.status(200).json({ status: 'waiting' });
            break;
        case 'matched':
            res.status(200).json({
                status: 'matched',
                opponent: userEntry.opponent,
                matchId: userEntry.matchId // ★ matchId を返す
            });
            // マッチング成立を返したらキューから削除
            const index = matchmakingQueue.findIndex(u => u.userId === userEntry.userId);
            if (index > -1) matchmakingQueue.splice(index, 1);
            break;
        case 'timeout':
            res.status(200).json({ status: 'timeout' });
            // タイムアウトを返したらキューから削除
            const timeoutIndex = matchmakingQueue.findIndex(u => u.userId === userEntry.userId);
            if (timeoutIndex > -1) matchmakingQueue.splice(timeoutIndex, 1);
            break;
        default:
            // ありえないはずだが念のため
            res.status(500).json({ status: 'error', message: 'Unknown matchmaking status.' });
            // 不明なステータスの場合もキューから削除
            const unknownIndex = matchmakingQueue.findIndex(u => u.userId === userEntry.userId);
            if (unknownIndex > -1) matchmakingQueue.splice(unknownIndex, 1);
            break;
    }
};

/**
 * POST /api/matchmaking/cancel - マッチング待機のキャンセル
 */
exports.cancelMatchmaking = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    const currentUser = req.user;

    const index = matchmakingQueue.findIndex(user => user.userId === currentUser._id.toString() && user.status === 'waiting');

    if (index > -1) {
        matchmakingQueue.splice(index, 1);
        console.log(`User ${currentUser.name} cancelled matchmaking.`);
        res.status(200).json({ message: 'Matchmaking cancelled.' });
    } else {
        // 待機中でない場合（既にマッチング済み、タイムアウト、またはキューにいない）
        const userEntry = matchmakingQueue.find(user => user.userId === currentUser._id.toString());
        const currentStatus = userEntry ? userEntry.status : 'not found';
        res.status(400).json({ message: `Cannot cancel. Current status: ${currentStatus}` });
    }
};


/**
 * POST /api/matchmaking/result - 対戦結果の記録
 */
exports.recordMatchResult = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });

    const { matchId, didWin } = req.body;
    const currentUser = req.user; // 認証ミドルウェアから取得

    // --- 入力値検証 ---
    if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) { // ★ ObjectId形式か検証
        return res.status(400).json({ message: 'Match ID is required.' });
    }
    if (typeof didWin !== 'boolean') {
        return res.status(400).json({ message: 'didWin (boolean) is required.' });
    }
    // --- 入力値検証ここまで ---

    // ▼▼▼ トランザクション開始 ▼▼▼
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // 1. Matchドキュメントを検索 (populateでプレイヤー情報も取得)
        const match = await Match.findById(matchId).populate('players', 'name rate points matchCount'); // 必要なフィールドのみ取得
        if (!match) {
            return res.status(404).json({ message: 'Match not found.' });
        }

        // 2. 自分がプレイヤーに含まれているか確認
        const playerEntry = match.players.find(p => p._id.equals(currentUser._id));
        if (!playerEntry) {
            return res.status(403).json({ message: 'You are not a player in this match.' });
        }

        // 3. 対戦相手を特定
        const opponentEntry = match.players.find(p => !p._id.equals(currentUser._id));
        if (!opponentEntry) {
            return res.status(404).json({ message: 'Opponent not found in this match.' });
        }

        // 4. 既に結果が記録されていないか確認 (任意)
        if (match.status === 'finished') {
             console.warn(`Match ${matchId} result already recorded.`);
             // 既に記録されている場合でも、現在のユーザー情報を返すなど検討
             return res.status(400).json({ message: 'Match result already recorded.' });
        }

        // --- ポイント付与 ---
        const pointsEarned = didWin ? 100 : 50; // 例: 勝利100, 敗北50
        const currentUserNewPoints = (currentUser.points || 0) + pointsEarned;

        // --- レート計算 ---
        const currentUserRateChange = calculateRateChange(currentUser.rate, opponentEntry.rate, didWin);
        const opponentRateChange = calculateRateChange(opponentEntry.rate, currentUser.rate, !didWin);

        const currentUserNewRate = Math.max(0, currentUser.rate + currentUserRateChange); // マイナス防止
        const opponentNewRate = Math.max(0, opponentEntry.rate + opponentRateChange); // マイナス防止

        // --- DB更新 (トランザクションを使うのが理想) ---
        // ユーザーのレート、ポイント、対戦数を更新
        await User.findByIdAndUpdate(currentUser._id, {
            rate: currentUserNewRate,
            points: currentUserNewPoints,
            $inc: { matchCount: 1 } // $inc でアトミックに加算
        }, { session }); // ★ session を渡す

        // 対戦相手のレート、対戦数を更新
        await User.findByIdAndUpdate(opponentEntry._id, {
            rate: opponentNewRate,
            $inc: { matchCount: 1 }
        }, { session }); // ★ session を渡す

        // Matchドキュメントに結果を記録
        match.winner = didWin ? currentUser._id : opponentEntry._id;
        match.rateChange = [
            { player: currentUser._id, change: currentUserRateChange },
            { player: opponentEntry._id, change: opponentRateChange }
        ];
        match.status = 'finished'; // ステータスを完了に
        match.finishedAt = new Date(); // 終了日時
        await match.save({ session }); // ★ session を渡す

        await session.commitTransaction(); // ★ トランザクションをコミット
        // ▲▲▲ トランザクションここまで ▲▲▲

        console.log(`Match result recorded for MatchID: ${matchId}. Winner: ${didWin ? currentUser.name : opponentEntry.name}`);

        res.status(200).json({
            message: 'Match result recorded',
            newRate: currentUserNewRate,
            rateChange: currentUserRateChange,
            pointsEarned: pointsEarned,
            newPoints: currentUserNewPoints,
        });

    } catch (error) {
        // ▼▼▼ トランザクション中断処理 ▼▼▼
        await session.abortTransaction();
        // ▲▲▲ トランザクション中断処理 ▲▲▲
        console.error('Error recording match result:', error);
        // エラー内容に応じて適切なステータスコードを返す
        if (error.message.includes('Match not found') || error.message.includes('Opponent not found')) {
            res.status(404).json({ message: error.message });
        } else if (error.message.includes('not a player') || error.message.includes('already recorded')) {
            res.status(400).json({ message: error.message });
        } else {
            console.error('Error updating database with match result:', dbError);
            throw dbError; // エラーを外側のcatchに投げる
        }
    } finally {
        // ▼▼▼ セッション終了 ▼▼▼
        session.endSession();
        // ▲▲▲ セッション終了 ▲▲▲
    }
};
