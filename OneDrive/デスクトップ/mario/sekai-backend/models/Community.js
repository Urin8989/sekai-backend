// models/Community.js
const mongoose = require('mongoose');

const CommunitySchema = new mongoose.Schema({
    name: { type: String, required: true, index: true }, // コミュニティ名 (検索用にインデックス)
    description: { type: String, default: '' },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // 作成者のUserドキュメントID
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // 参加者のUserドキュメントIDの配列
    participantsLimit: { type: Number, required: true, min: 2, max: 24 }, // 定員
    joinPoints: { type: Number, default: 0 }, // 参加時に獲得できるポイント
    // chatMessages: [{...}], // チャット履歴 (別コレクション推奨)
    createdAt: { type: Date, default: Date.now },
});

// 仮想プロパティ: 現在の参加者数を簡単に取得
CommunitySchema.virtual('currentParticipantsCount').get(function() {
  return this.participants.length;
});

// toJSON/toObjectで仮想プロパティを含める設定
CommunitySchema.set('toJSON', { virtuals: true });
CommunitySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Community', CommunitySchema);
