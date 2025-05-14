// models/Match.js
const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
    // matchId: { type: String, required: true, unique: true, index: true }, // 必要なら専用のIDフィールド
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }], // 参加プレイヤー (必須), ★ インデックス追加
    status: {
        type: String,
        enum: ['pending', 'matched', 'playing', 'finished', 'cancelled'], // マッチの状態
        default: 'matched', // ★ デフォルトを 'matched' に変更 (コントローラーの実装に合わせる)
        index: true,
    },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // 勝者
    rateChange: [{
        player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        change: { type: Number }
    }],
    matchDate: { type: Date, default: Date.now }, // マッチング成立日時 or 開始日時
    // matchedAt: { type: Date, default: Date.now }, // ★ matchDate をリネームするならこちら
    // createdAt: { type: Date, default: Date.now }, // ドキュメント作成日時
    finishedAt: { type: Date }, // ★ 試合終了日時を追加
}, { timestamps: true }); // ★ timestamps オプションを追加

module.exports = mongoose.model('Match', MatchSchema);
