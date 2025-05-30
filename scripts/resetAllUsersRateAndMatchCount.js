// scripts/resetAllUsersRateAndMatchCount.js
const mongoose = require('mongoose');
const connectDB = require('../config/db'); // DB接続関数のパスを確認
const User = require('../models/User');   // Userモデルのパスを確認

/**
 * 全てのユーザーのレートを1500にリセットし、対戦数を0にする関数
 */
const resetAllUsersRateAndMatchCount = async () => {
    try {
        await connectDB();
        console.log('MongoDB接続完了 (全ユーザーのレート・対戦数リセット用)...');

        if (!User || !User.modelName) {
            console.error('エラー: Userモデルが正しく読み込めていません。パスを確認してください。');
            return;
        }

        console.log('全てのユーザーのレートを1500に、対戦数を0にリセットします...');
        // 注意: この操作は元に戻せません。実行前に必ずバックアップを取得してください。
        const updateResult = await User.updateMany(
            {}, // 空のフィルターオブジェクトですべてのドキュメントにマッチ
            {
                $set: {
                    rate: 1500,       // User.jsのフィールド名 'rate' に合わせています
                    matchCount: 0     // User.jsのフィールド名 'matchCount' に合わせています
                }
            }
        );

        console.log('------------------------------------');
        if (updateResult.acknowledged) {
            console.log(`処理が承認されました。`);
            console.log(`  ${updateResult.matchedCount} 件のユーザーが検索されました。`);
            console.log(`  ${updateResult.modifiedCount} 件のユーザーデータが更新されました。`);
            console.log('全ユーザーのレートと対戦数のリセットが完了しました。');
        } else {
            console.log('更新処理がデータベースによって承認されませんでした。');
        }
        console.log('------------------------------------');

    } catch (err) {
        console.error('全ユーザーのレート・対戦数リセット中にエラーが発生しました:', err.message);
        if (err.stack) {
            console.error(err.stack);
        }
    } finally {
        if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
            await mongoose.connection.close();
            console.log('MongoDB接続を閉じました。');
        }
    }
};

// --- スクリプト実行 ---
// 安全のための確認プロンプト (任意で有効化してください)
/*
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('本当に全てのユーザーのレートを1500に、対戦数を0にリセットしますか？ (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes') {
    resetAllUsersRateAndMatchCount();
  } else {
    console.log('処理をキャンセルしました。');
    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
        mongoose.connection.close().then(() => process.exit(0));
    } else {
        process.exit(0);
    }
  }
  // readline.close(); // closeは非同期処理後か、exit後に行うべき
});
*/

// 上記の確認プロンプトを有効化する場合は、以下の行をコメントアウトしてください。
resetAllUsersRateAndMatchCount();