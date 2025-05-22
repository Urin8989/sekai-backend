// models/CommunityChatMessage.js
const mongoose = require('mongoose');

const CommunityChatMessageSchema = new mongoose.Schema({
    communityId: { // どのコミュニティのメッセージか
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Community',
        required: true,
        index: true // 検索用にインデックスを追加
    },
    sender: { // 送信者のUserドキュメントID
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: { // メッセージ本文
        type: String,
        required: true,
        trim: true,
        maxlength: 500 // 最大文字数制限 (例)
    },
    timestamp: { // 送信日時
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('CommunityChatMessage', CommunityChatMessageSchema);
