// models/Badge.js
const mongoose = require('mongoose');

const BadgeSchema = new mongoose.Schema({
    badgeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    img: { type: String, required: true },
    isLimited: { type: Boolean, default: false },
    requiredRate: { type: Number, default: 0, min: 0 },
    requiredMatches: {
        type: Number,
        default: 0, 
        min: 0      
    },
    rarity: { type: String, default: 'common' }, // ★★★ この行を追加 ★★★
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Badge', BadgeSchema);