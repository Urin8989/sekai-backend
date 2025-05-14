// resetUserBadgesAndPoints.js
const mongoose = require('mongoose');
const config = require('./config/setting'); // 設定ファイルのパスを確認
const User = require('./models/User'); // Userモデルのパスを確認
const connectDB = require('./config/db'); // DB接続関数のパスを確認

/**
 * 指定されたユーザーのバッジを空にし、ポイントを指定値にリセットする関数
 * @param {string} googleId 対象ユーザーのGoogle ID (sub)
 * @param {number} pointsToSet 設定するポイント数
 */
const resetUserData = async (googleId, pointsToSet) => {
    if (!googleId || typeof pointsToSet !== 'number' || pointsToSet < 0) {
        console.error('Error: Google ID と 0以上のポイント数を指定してください。');
        console.log('Usage: node resetUserBadgesAndPoints.js <googleId> <pointsToSet>');
        return; // 引数が不正な場合は処理を中断
    }

    try {
        await connectDB(); // データベースに接続
        console.log('MongoDB Connected for user data reset...');

        // Google ID (sub) でユーザーを検索
        const user = await User.findOne({ googleId: googleId });

        if (!user) {
            console.log(`ユーザーが見つかりません: Google ID = ${googleId}`);
            return; // ユーザーが見つからない場合は処理を中断
        }

        console.log(`ユーザーが見つかりました: ${user.name} (Google ID: ${googleId})`);
        console.log(`現在のバッジ数: ${user.badges.length}, 現在のポイント: ${user.points}`);

        // バッジ情報を空にし、ポイントを指定値に更新
        user.badges = []; // バッジ配列を空にする
        user.displayBadges = []; // 表示バッジも空にする (必要に応じて)
        user.points = pointsToSet; // ポイントを指定値に設定

        // 変更を保存
        await user.save();

        console.log('------------------------------------');
        console.log('ユーザーデータの更新が完了しました。');
        console.log(`対象ユーザー: ${user.name} (Google ID: ${googleId})`);
        console.log(`更新後のバッジ数: ${user.badges.length}`);
        console.log(`更新後のポイント: ${user.points}`);
        console.log('------------------------------------');

    } catch (err) {
        console.error('ユーザーデータの更新中にエラーが発生しました:', err);
    } finally {
        mongoose.connection.close(); // 接続を閉じる
        console.log('MongoDB connection closed.');
    }
};

// --- スクリプト実行 ---
// コマンドライン引数を取得
const args = process.argv.slice(2); // node と スクリプトファイル名を除いた引数
const targetGoogleId = args[0];
const targetPoints = parseInt(args[1], 10); // 第2引数を数値に変換

// 関数を実行
resetUserData(targetGoogleId, targetPoints);
