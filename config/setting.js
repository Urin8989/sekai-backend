// config/setting.js
require('dotenv').config();

module.exports = {
    port: process.env.PORT || 5000,
    mongodbUri: process.env.MONGODB_URI,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d', // デフォルト値を設定
    frontendBaseUrl: process.env.FRONTEND_BASE_URL, // この行があるか確認
    nodeEnv: process.env.NODE_ENV || 'development'
};