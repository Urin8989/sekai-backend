// scripts/findUserGoogleId.js
const mongoose = require('mongoose');
const connectDB = require('../config/db'); // DB接続関数のパスを確認
const User = require('../models/User');   // Userモデルのパスを確認

/**
 * 指定された情報でユーザーを検索し、Google IDを表示する関数
 * @param {string} searchValue 検索する値 (メールアドレスまたはユーザー名)
 */
const findUserAndDisplayGoogleId = async (searchValue) => {
    if (!searchValue) {
        console.error('エラー: 検索するためのメールアドレスまたはユーザー名を指定してください。');
        console.log('使用法1: node scripts/findUserGoogleId.js <email>');
        console.log('使用法2: node scripts/findUserGoogleId.js <username>');
        return;
    }

    try {
        await connectDB();
        console.log('MongoDB接続完了 (ユーザー情報検索用)...');

        // まずメールアドレスで検索、見つからなければ名前で検索
        let user = await User.findOne({ email: searchValue });

        if (!user) {
            console.log(`メールアドレス「${searchValue}」で見つかりませんでした。名前で再検索します...`);
            user = await User.findOne({ name: searchValue });
        }

        if (!user) {
            console.log(`ユーザーが見つかりません: "${searchValue}"`);
            return;
        }

        console.log('------------------------------------');
        console.log('ユーザー情報が見つかりました:');
        console.log(`  名前        : ${user.name}`);
        console.log(`  メール      : ${user.email}`);
        console.log(`  Google ID   : ${user.googleId}`); // ← これが目的のIDです
        console.log(`  現在のポイント: ${user.points}`);
        console.log(`  現在のバッジ数: ${user.badges ? user.badges.length : 0}`);
        console.log('------------------------------------');

    } catch (err) {
        console.error('ユーザー情報検索中にエラーが発生しました:', err.message);
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
const args = process.argv.slice(2);
const searchValue = args[0];

findUserAndDisplayGoogleId(searchValue);