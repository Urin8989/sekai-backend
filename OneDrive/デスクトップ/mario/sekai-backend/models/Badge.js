// models/Badge.js
const mongoose = require('mongoose');

const BadgeSchema = new mongoose.Schema({
    badgeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    img: { type: String, required: true },
    isLimited: { type: Boolean, default: false },
    requiredRate: { type: Number, default: 0, min: 0 }, // ★★★ レート制限フィールドを追加 (デフォルト0は制限なし) ★★★
    requiredMatches: {
        type: Number,
        default: 0, // デフォルト値は0 (制限なし)
        min: 0      // 負の数は許可しない
    },
    // availableFrom: { type: Date },
    // availableUntil: { type: Date },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Badge', BadgeSchema);
