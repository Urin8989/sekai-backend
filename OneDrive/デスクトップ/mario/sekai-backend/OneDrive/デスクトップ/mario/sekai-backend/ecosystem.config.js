// ~/sekai-backend/ecosystem.config.js
module.exports = {
  apps : [{
    name   : "mariokart-rivals-backend", // PM2で表示されるアプリ名
    script : "./server.js",             // 実行するメインファイル (例: server.js)
    cwd    : "/home/xs490499/mariokartbestrivals.com/sekai-backend/", // ★★★ pwdコマンドで確認した正しい絶対パスに修正 ★★★
    env_production: {
       NODE_ENV: "production",
       PORT: 5000, // ★ Node.jsアプリがリッスンする内部ポート (リバースプロキシで設定するポートと合わせる)
       // MONGODB_URI, JWT_SECRET, GOOGLE_CLIENT_ID などは .env ファイルで管理推奨
    }
  }]
};
