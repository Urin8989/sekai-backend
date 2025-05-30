// scripts/resetAllUsersBadgesAndPoints.js
const mongoose = require('mongoose');
const User = require('../models/User');       // Userモデルのパスを確認
const connectDB = require('../config/db');     // DB接続関数のパスを確認

/**
 * 全てのユーザーのバッジ情報 (badges, displayBadges) を空にし、ポイントを指定値にリセットする関数
 * @param {number} pointsToSet 設定するポイント数
 */
const resetAllUsersBadgesAndPoints = async (pointsToSet) => {
    if (typeof pointsToSet !== 'number' || pointsToSet < 0) {
        console.error('エラー: 0以上のポイント数を指定してください。');
        console.log('使用法: node scripts/resetAllUsersBadgesAndPoints.js <pointsToSet>');
        return;
    }

    let dbConnected = false; // 接続状態を管理するフラグ
    try {
        await connectDB(); // データベースに接続
        dbConnected = true;
        console.log('MongoDB接続完了 (全ユーザーのバッジ・ポイントリセット用)...');

        if (!User || !User.modelName) {
            console.error('エラー: Userモデルが正しく読み込めていません。パスを確認してください。');
            return;
        }

        console.log(`全てのユーザーのバッジを空にし、ポイントを ${pointsToSet} にリセットします...`);
        // 注意: この操作は元に戻せません。実行前に必ずバックアップを取得してください。

        const updateResult = await User.updateMany(
            {}, // 空のフィルターオブジェクトですべてのドキュメントにマッチ
            {
                $set: {
                    badges: [],         // badges 配列を空にする
                    displayBadges: [],  // displayBadges 配列を空にする
                    points: pointsToSet // points を指定値に設定
                }
            }
        );

        console.log('------------------------------------');
        if (updateResult.acknowledged) {
            console.log(`処理が承認されました。`);
            console.log(`  ${updateResult.matchedCount} 件のユーザーが検索されました。`);
            console.log(`  ${updateResult.modifiedCount} 件のユーザーデータが更新されました。`);
            console.log('全ユーザーのバッジとポイントのリセットが完了しました。');
            console.log(`設定されたポイント数: ${pointsToSet}`);
        } else {
            console.log('更新処理がデータベースによって承認されませんでした。');
        }
        console.log('------------------------------------');

    } catch (err) {
        console.error('全ユーザーのバッジ・ポイントリセット中にエラーが発生しました:', err.message);
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
const targetPoints = parseInt(args[0], 10); // 最初の引数をポイント数として取得

// 安全のための確認プロンプト (任意で有効化してください)
/*
if (isNaN(targetPoints)) {
    console.error('エラー: ポイント数には数値を指定してください。');
    console.log('使用法: node scripts/resetAllUsersBadgesAndPoints.js <pointsToSet>');
} else {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    readline.question(`本当に全てのユーザーのバッジを空にし、ポイントを ${targetPoints} にリセットしますか？この操作は元に戻せません。(yes/no): `, (answer) => {
        if (answer.toLowerCase() === 'yes') {
            resetAllUsersBadgesAndPoints(targetPoints);
        } else {
            console.log('処理をキャンセルしました。');
            if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
                mongoose.connection.close().then(() => process.exit(0));
            } else {
                process.exit(0);
            }
        }
        // readline.close(); // 非同期処理後に実行されるように調整が必要な場合がある
    });
}
*/

// 上記の確認プロンプトを有効化する場合は、以下の行をコメントアウトまたは上記のelseブロック内に移動してください。
if (isNaN(targetPoints)) { // 引数が数値でない場合の基本的なチェック
    console.error('エラー: ポイント数には数値を指定してください。');
    console.log('使用法: node scripts/resetAllUsersBadgesAndPoints.js <pointsToSet>');
} else {
    resetAllUsersBadgesAndPoints(targetPoints);
}