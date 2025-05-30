// scripts/resetAllUsersRateAndMatchCount.js
const mongoose = require('mongoose');
const connectDB = require('../config/db'); // 提供されたdb.jsのパスを想定
const User = require('../models/User');   // 提供されたUser.jsのパスを想定

/**
 * 全てのユーザーのレートを1500にリセットし、対戦数を0にする関数
 */
const resetAllUsersData = async () => {
    try {
        await connectDB(); //
        console.log('MongoDB接続完了 (全ユーザーデータリセット用)...');

        // Userモデルが存在するか確認
        if (!User || !User.modelName) {
            console.error('エラー: Userモデルが正しく読み込めていません。パスを確認してください。');
            return;
        }

        console.log('全てのユーザーのレートを1500に、対戦数を0にリセットします...');

        // 全ユーザーを対象に更新
        // 注意: この操作は元に戻せません。実行前に必ずバックアップを取得してください。
        const updateResult = await User.updateMany(
            {}, // 空のフィルターオブジェクトですべてのドキュメントにマッチ
            {
                $set: {
                    rate: 1500,       // レートを1500に設定 (User.jsのフィールド名 'rate' に合わせています)
                    matchCount: 0     // 対戦数を0に設定 (User.jsのフィールド名 'matchCount' に合わせています)
                    // 必要であれば他のリセットしたいフィールドもここに追加
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
        console.error('全ユーザーデータのリセット中にエラーが発生しました:', err.message);
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
// このスクリプトは引数を必要としません。
// 実行前に、この操作が本当に必要か確認してください。

// 安全のための確認プロンプト (任意で有効化してください)
/*
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('本当に全てのユーザーのレートを1500に、対戦数を0にリセットしますか？ (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes') {
    resetAllUsersData();
  } else {
    console.log('処理をキャンセルしました。');
    process.exit(0); // プロセスを終了
  }
  readline.close();
});
*/

// 上記の確認プロンプトを有効化する場合は、以下の行をコメントアウトしてください。
resetAllUsersData();