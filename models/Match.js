// models/Match.js
const mongoose = require('mongoose');

// プレイヤーの報告を格納するサブスキーマ
const ReportSchema = new mongoose.Schema({
    player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    report: { // 'win' または 'lose'
        type: String,
        enum: ['win', 'lose'],
        required: true
    },
    reportedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false }); // サブドキュメントに _id は不要

const MatchSchema = new mongoose.Schema({
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    }],
    status: {
        type: String,
        enum: [
            'matched',        // マッチ成立直後
            'reported_one',   // 片方が報告済み
            'finished',       // 結果一致 (正常終了)
            'disputed',       // 結果不一致 (キャンセル扱い)
            'cancelled'       // ユーザーによりキャンセル
        ],
        default: 'matched',
        required: true,
        index: true,
    },
    reports: [ReportSchema], // ★ 各プレイヤーの報告を保存
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rateChange: [{
        player: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        change: { type: Number }
    }],
    finishedAt: {
        type: Date
    },
}, {
    timestamps: true // createdAt と updatedAt を自動追加
});

module.exports = mongoose.model('Match', MatchSchema);