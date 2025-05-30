// scripts/resetUserMatchHistory.js
const mongoose = require('mongoose');
const connectDB = require('../config/db'); // DB接続関数のパスを確認
const User = require('../models/User');   // Userモデルのパスを確認
const Match = require('../models/Match'); // Matchモデルのパスを確認

/**
 * 指定されたユーザーの全ての対戦履歴 (Matchドキュメント) を削除する関数
 * @param {string} googleId 対象ユーザーのGoogle ID
 */
const resetUserMatchHistory = async (googleId) => {
    if (!googleId) {
        console.error('エラー: 対象ユーザーのGoogle IDを指定してください。');
        console.log('使用法: node scripts/resetUserMatchHistory.js <googleId>');
        return;
    }

    let dbConnected = false;
    try {
        await connectDB();
        dbConnected = true;
        console.log('MongoDB接続完了 (対戦履歴リセット用)...');

        // 1. Google IDからユーザーのMongoDB _idを取得
        const user = await User.findOne({ googleId: googleId }).select('_id name');
        if (!user) {
            console.log(`ユーザーが見つかりません: Google ID = ${googleId}`);
            return;
        }
        const userMongoId = user._id;
        console.log(`対象ユーザー: ${user.name} (MongoDB ID: ${userMongoId})`);

        // 2. 対象ユーザーが参加している全てのMatchドキュメントを検索して削除
        console.log(`ユーザー ${user.name} の全ての対戦履歴を削除します...`);
        // 注意: この操作は元に戻せません。実行前に必ずバックアップを取得してください。
        const deleteResult = await Match.deleteMany({ players: userMongoId });

        console.log('------------------------------------');
        if (deleteResult.acknowledged) {
            console.log(`処理が承認されました。`);
            console.log(`  ${deleteResult.deletedCount} 件の対戦履歴が削除されました。`);
            console.log(`ユーザー ${user.name} の対戦履歴のリセットが完了しました。`);
        } else {
            console.log('対戦履歴の削除処理がデータベースによって承認されませんでした。');
        }
        console.log('------------------------------------');

    } catch (err) {
        console.error('対戦履歴のリセット中にエラーが発生しました:', err.message);
        if (err.stack) {
            console.error(err.stack);
        }
    } finally {
        if (dbConnected && (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2)) {
            await mongoose.connection.close();
            console.log('MongoDB接続を閉じました。');
        } else if (!dbConnected) {
            console.log('MongoDBへの接続が確立されなかったため、クローズ処理はスキップされました。');
        }
    }
};

// --- スクリプト実行 ---
const args = process.argv.slice(2);
const targetGoogleId = args[0];

// このスクリプトは対象ユーザーの対戦データを完全に削除します。
// 実行前に、この操作が本当に必要か十分に確認してください。
// 安全のために、実行前に確認プロンプトを設けることも検討できます。

resetUserMatchHistory(targetGoogleId);