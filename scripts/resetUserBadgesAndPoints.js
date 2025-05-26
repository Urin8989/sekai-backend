// scripts/resetUserBadgesAndPoints.js
const mongoose = require('mongoose');
const config = require('../config/setting'); // ★変更: './' から '../' へ
const User = require('../models/User');       // ★変更: './' から '../' へ
const connectDB = require('../config/db');     // ★変更: './' から '../' へ

/**
 * 指定されたユーザーのバッジを空にし、ポイントを指定値にリセットする関数
 * @param {string} googleId 対象ユーザーのGoogle ID (sub)
 * @param {number} pointsToSet 設定するポイント数
 */
const resetUserData = async (googleId, pointsToSet) => {
    if (!googleId || typeof pointsToSet !== 'number' || pointsToSet < 0) {
        console.error('Error: Google ID と 0以上のポイント数を指定してください。');
        console.log('Usage: node scripts/resetUserBadgesAndPoints.js <googleId> <pointsToSet>');
        // mongoose.connection.close() は接続後に呼ぶべきなので、ここでは不要
        return;
    }

    let dbConnected = false; // 接続状態を管理するフラグ
    try {
        await connectDB(); // データベースに接続
        dbConnected = true;
        console.log('MongoDB Connected for user data reset...');

        const user = await User.findOne({ googleId: googleId });

        if (!user) {
            console.log(`ユーザーが見つかりません: Google ID = ${googleId}`);
            // ユーザーが見つからない場合も接続は閉じる
            return;
        }

        console.log(`ユーザーが見つかりました: ${user.name} (Google ID: ${googleId})`);
        console.log(`現在のバッジ数: ${user.badges.length}, 現在のポイント: ${user.points}`);

        user.badges = [];
        user.displayBadges = [];
        user.points = pointsToSet;

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
        if (dbConnected && mongoose.connection.readyState === 1) { // 接続されていた場合のみ閉じる
            await mongoose.connection.close();
            console.log('MongoDB connection closed.');
        } else if (!dbConnected) {
            console.log('MongoDBへの接続が確立されなかったため、クローズ処理はスキップされました。');
        }
    }
};

// --- スクリプト実行 ---
const args = process.argv.slice(2);
const targetGoogleId = args[0];
const targetPoints = parseInt(args[1], 10);

resetUserData(targetGoogleId, targetPoints);