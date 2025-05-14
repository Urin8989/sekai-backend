// controllers/userController.js
const User = require('../models/User');
const Match = require('../models/Match'); // ★ Matchモデルをインポート
const mongoose = require('mongoose'); // ★ mongoose をインポート

// ユーザー情報取得 (主にログイン時やマイページ表示用)
exports.getUserData = async (req, res) => {
    // ★ デバッグログを追加
    console.log(`[userController] getUserData called. req.user: ${req.user ? req.user.name : 'null'}, req.params.userId: ${req.params.userId}`);
    try {
        let userToFind = null;
        let userIdToSearch = null;

        // 1. 検索対象のIDを決定
        if (req.user && !req.params.userId) {
            // /me ルートの場合 (認証済みユーザー自身)
            console.log('[userController] Fetching data for authenticated user (req.user)');
            // protectミドルウェアがセットしたユーザー情報をそのまま使う
            // ★ 注意: req.user にはパスワードハッシュなどが含まれている可能性があるため、
            // ★ フロントに返す前に必要なフィールドだけを選択するか、
            // ★ 再度DBから必要なフィールドのみ取得するのがより安全です。
            // ★ ここでは簡単のため、再度DBから取得します。
            userIdToSearch = req.user.googleId; // 検索用にgoogleIdを取得
        } else if (req.params.userId) {
            // /:userId ルートの場合 (URLで指定されたユーザー)
            console.log(`[userController] Fetching data for userId from params: ${req.params.userId}`);
            userIdToSearch = req.params.userId;
        } else {
             // ユーザーIDが特定できない場合
             console.log('[userController] User ID not specified (neither req.user nor req.params.userId).');
             return res.status(400).json({ message: 'User ID not specified' });
        }

        // 2. データベースからユーザーを検索
        if (userIdToSearch) {
            console.log(`[userController] Searching user by googleId: ${userIdToSearch}`);
            // ★ 検索キーが googleId で正しいか確認
            // ★ select('-email') でメールアドレスを除外していますが、意図した動作か確認
            userToFind = await User.findOne({ googleId: userIdToSearch }).select('-email');
            console.log('[userController] User found by googleId:', userToFind ? userToFind.name : 'Not Found'); // ★ 検索結果ログ
        }


        // 3. 結果を返す
        if (!userToFind) {
            console.log('[userController] User not found in DB, returning 404.'); // ★ 404ログ
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('[userController] Returning user data with status 200.'); // ★ 成功ログ
        // ★ フロントエンドが必要とする形式で返す (必要なら整形)
        // 例: _id を id に変えるなど
        // const responseData = userToFind.toObject(); // Mongooseドキュメントをプレーンオブジェクトに
        // responseData.id = responseData._id;
        // delete responseData._id;
        // delete responseData.__v;
        // res.status(200).json(responseData);
        res.status(200).json(userToFind); // そのまま返す場合

    } catch (error) {
        console.error('[userController] Error fetching user data:', error); // ★ エラーログ
        // MongooseのCastError（ID形式不正など）の場合
        if (error instanceof mongoose.Error.CastError) {
             return res.status(400).json({ message: 'Invalid User ID format', error: error.message });
        }
        res.status(500).json({ message: 'Error fetching user data', error: error.message });
    }
};

// プロフィール更新 (マイページ用)
exports.updateUserProfile = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
    }
    console.log(`[userController] updateUserProfile called for user: ${req.user.name}`); // ★ ログ追加

    try {
        const user = req.user; // protectミドルウェアがセットしたユーザー
        const { favCourse, comment, selfIntroduction } = req.body;

        // ★ 基本的な入力値検証 (例: 文字数制限)
        if (favCourse && favCourse.length > 50) return res.status(400).json({ message: '好きなコースは50文字以内で入力してください。' });
        if (comment && comment.length > 100) return res.status(400).json({ message: '一言コメントは100文字以内で入力してください。' });
        if (selfIntroduction && selfIntroduction.length > 500) return res.status(400).json({ message: '自己紹介は500文字以内で入力してください。' });

        // ★ サニタイズ (簡易版: HTMLタグ除去 - server.js と同じ関数を使うか、ライブラリ導入を検討)
        const sanitize = (str) => typeof str === 'string' ? str.replace(/<[^>]*>?/gm, '') : str;
        // profileオブジェクトが存在しない場合は初期化
        if (!user.profile) {
            user.profile = {};
        }

        // nullish coalescing (??) を使って、値が送られてきた場合のみ更新
        user.profile.favCourse = favCourse ?? user.profile.favCourse;
        user.profile.comment = comment ?? user.profile.comment;
        user.profile.selfIntroduction = selfIntroduction ?? user.profile.selfIntroduction;

        // 変更があったフィールドのみをマーク (Mongoose 5以降では通常不要だが、明示的に)
        // user.markModified('profile');

        const updatedUser = await user.save(); // ★ user.save() で更新

        console.log(`Profile updated successfully for user: ${updatedUser.name}`);
        res.status(200).json({ message: 'Profile updated successfully', profile: updatedUser.profile });

    } catch (error) {
        console.error('Error updating profile:', error);
        // Mongooseのバリデーションエラーの場合
        if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
};

// ▼▼▼ 表示バッジ更新コントローラー関数を追加 ▼▼▼
exports.updateDisplayBadges = async (req, res) => {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    console.log(`[userController] updateDisplayBadges called for user: ${req.user.name}`); // ★ ログ追加

    try {
        const user = req.user;
        const { displayBadges } = req.body; // フロントから送られてくるバッジIDの配列

        // 配列であること、要素数が3以下であることをバリデーション
        if (!Array.isArray(displayBadges) || displayBadges.length > 3) {
            return res.status(400).json({ message: 'Invalid displayBadges data. Must be an array with up to 3 elements.' });
        }

        // TODO: 送られてきたバッジIDがユーザーが実際に所有しているものか検証 (より厳密にする場合)
        const ownedBadges = new Set(user.badges || []);
        const validDisplayBadges = displayBadges.filter(id => ownedBadges.has(id));
        if (validDisplayBadges.length !== displayBadges.length) {
            console.warn(`User ${user.name} tried to display unowned badges. Saving only owned badges.`);
            // エラーにするか、有効なものだけ保存するか選択 (ここでは有効なものだけ保存)
            user.displayBadges = validDisplayBadges;
        } else {
             user.displayBadges = displayBadges; // 送られてきた配列で上書き
        }

        const updatedUser = await user.save(); // ★ user.save() で更新

        console.log(`Display badges updated successfully for user: ${updatedUser.name}`);
        res.status(200).json({ message: 'Display badges updated successfully', displayBadges: updatedUser.displayBadges });

    } catch (error) {
        console.error('Error updating display badges:', error);
        // Mongooseのバリデーションエラーの場合
        if (error.name === 'ValidationError') {
             return res.status(400).json({ message: 'Validation Error', errors: error.errors });
        }
        res.status(500).json({ message: 'Error updating display badges', error: error.message });
    }
};
// ▲▲▲ ここまで追加 ▲▲▲

// ユーザー統計情報取得 (マイページ用 - レート履歴や勝率は別途実装が必要)
exports.getUserStats = async (req, res) => {
    const userGoogleId = req.params.userId; // URLパラメータからGoogle IDを取得
    console.log(`[userController] getUserStats called for userGoogleId: ${userGoogleId}`); // ★ ログ追加

    if (!userGoogleId) {
        return res.status(400).json({ message: 'User ID is required in URL parameter.' });
    }

    try {
        // 1. 対象ユーザーのMongoDB _id を取得
        const user = await User.findOne({ googleId: userGoogleId }).select('_id rate matchCount'); // 必要なフィールドのみ取得
        if (!user) {
            console.log(`[userController] getUserStats - User not found for googleId: ${userGoogleId}`); // ★ ログ追加
            return res.status(404).json({ message: 'User not found.' });
        }
        const userMongoId = user._id;

        // 2. 関連する完了済み対戦を取得 (最大100件まで取得して処理)
        const recentMatches = await Match.find({
            players: userMongoId, // ユーザーが参加している
            status: 'finished'    // 完了している
        })
        .sort({ finishedAt: -1 }) // 新しい順にソート
        .limit(100) // パフォーマンスのため、直近100件に制限 (必要に応じて調整)
        .populate('winner', '_id') // winnerフィールドの_idのみ取得
        .select('finishedAt winner rateChange'); // 必要なフィールドのみ取得

        // 3. レート履歴を計算 (取得した recentMatches を古い順に処理)
        const rateHistory = [];
        let currentRate = 1500; // ★ 初期レート (Userモデルのデフォルト値と合わせる)
        // 取得したマッチを古い順に並び替え
        const sortedMatchesForRate = [...recentMatches].reverse();
        for (const match of sortedMatchesForRate) {
            const rateChangeEntry = match.rateChange?.find(rc => rc.player.equals(userMongoId));
            if (rateChangeEntry) {
                // rateChange は変化量なので、前のレートに加算する
                // 注意: この計算方法は、取得した100件より前の履歴がないと不正確になる可能性がある
                // より正確にするには、全期間のマッチを取得するか、レート履歴を別途保存する必要がある
                currentRate += rateChangeEntry.change; // ここでは簡易的に加算
                rateHistory.push({
                    date: match.finishedAt,
                    rate: Math.max(0, currentRate) // マイナスレート防止
                });
            }
        }
        // もし履歴が空なら、現在のレートを追加
        if (rateHistory.length === 0) {
            rateHistory.push({ date: new Date(), rate: user.rate });
        }

        // 4. 勝率を計算
        let overallWins = 0;
        let recentWins = 0;
        const recentMatchCount = Math.min(10, recentMatches.length); // 直近10件または取得件数

        for (let i = 0; i < recentMatches.length; i++) {
            const match = recentMatches[i];
            const didWin = match.winner?._id.equals(userMongoId) ?? false; // winnerがnullの場合も考慮
            if (didWin) overallWins++;
            if (i < recentMatchCount && didWin) recentWins++;
        }

        const statsData = {
            rateHistory: rateHistory, // 計算したレート履歴
            winRate: {
                // 全体勝率は取得した100件から計算 (user.matchCount は使わない)
                overall: { wins: overallWins, losses: recentMatches.length - overallWins },
                // 直近勝率は10件から計算
                recent: { wins: recentWins, losses: recentMatchCount - recentWins }
            }
        };
        console.log(`[userController] getUserStats - Returning stats data for ${user.name}`); // ★ ログ追加
        res.status(200).json(statsData);
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ message: 'Error fetching user stats', error: error.message });
    }
};
