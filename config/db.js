// config/db.js
const mongoose = require('mongoose');
const config = require('./setting');

const connectDB = async () => {
    try {
        await mongoose.connect(config.mongodbUri, {
            // useNewUrlParser: true, // Mongoose 6以降は不要
            // useUnifiedTopology: true, // Mongoose 6以降は不要
        });
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        // エラー発生時にプロセスを終了
        process.exit(1);
    }
};

module.exports = connectDB;
