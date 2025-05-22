// models/User.js
const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
    favCourse: { type: String, default: '' },
    comment: { type: String, default: '' },
    selfIntroduction: { type: String, default: '' },
}, { _id: false });

// ▼▼▼ バッジ配列の要素数制限用関数 ▼▼▼
function arrayLimit(val) {
  return val.length <= 3;
}
// ▲▲▲ ここまで追加 ▲▲▲

const UserSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    picture: { type: String },
    rate: { type: Number, default: 1500, index: true },
    points: { type: Number, default: 100 },
    badges: [{ type: String }],
    profile: { type: ProfileSchema, default: () => ({}) },
    matchCount: { type: Number, default: 0, index: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
    // ▼▼▼ 表示バッジフィールドを追加 ▼▼▼
    displayBadges: {
        type: [String], // バッジIDの配列
        default: [],
        validate: [arrayLimit, '{PATH} exceeds the limit of 3'] // 配列の要素数を3つに制限
    }
    // ▲▲▲ ここまで追加 ▲▲▲
});

module.exports = mongoose.model('User', UserSchema);
