// scripts/resetAllMatchHistory.js
const mongoose = require('mongoose');
const connectDB = require('../config/db'); // DB接続関数のパスを確認
const Match = require('../models/Match'); // Matchモデルのパスを確認

/**
 * 全ての対戦履歴 (Matchドキュメント) を削除する関数
 */
const resetAllMatchHistory = async () => {
    let dbConnected = false;
    try {
        await connectDB();
        dbConnected = true;
        console.log('MongoDB接続完了 (全対戦履歴削除用)...');

        if (!Match || !Match.modelName) {
            console.error('エラー: Matchモデルが正しく読み込めていません。パスを確認してください。');
            return;
        }

        console.log('全ての対戦履歴 (Matchドキュメント) を削除します...');
        // 注意: この操作は元に戻せません。実行前に必ずバックアップを取得してください。
        //       Matchコレクション内の全てのドキュメントが削除されます。
        const deleteResult = await Match.deleteMany({}); // 空のフィルターオブジェクトで全てのドキュメントにマッチ

        console.log('------------------------------------');
        if (deleteResult.acknowledged) {
            console.log(`処理が承認されました。`);
            console.log(`  ${deleteResult.deletedCount} 件の対戦履歴が削除されました。`);
            console.log('全ての対戦履歴の削除が完了しました。');
        } else {
            console.log('対戦履歴の削除処理がデータベースによって承認されませんでした。');
        }
        console.log('------------------------------------');

    } catch (err) {
        console.error('全対戦履歴の削除中にエラーが発生しました:', err.message);
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
// このスクリプトは全ての対戦データを完全に削除します。
// 実行前に、この操作が本当に必要か十分に確認してください。
// 安全のために、実行前に確認プロンプトを設けることも検討できます。
/*
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('本当に全ての対戦履歴をデータベースから削除しますか？この操作は元に戻せません。(yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes') {
    resetAllMatchHistory();
  } else {
    console.log('処理をキャンセルしました。');
    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
        mongoose.connection.close().then(() => process.exit(0));
    } else {
        process.exit(0);
    }
  }
  // readline.close();
});
*/
// 上記の確認プロンプトを有効化する場合は、以下の行をコメントアウトしてください。
resetAllMatchHistory();