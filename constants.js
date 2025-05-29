// constants.js (修正版)
const WebSocketMessageTypes = {
  SYSTEM_MESSAGE: 'system_message',
  COMMUNITY_CHAT_MESSAGE: 'community_chat_message',
  MATCH_CHAT_MESSAGE: 'MATCH_CHAT_MESSAGE', // ★★★ 'chat_message' から変更 ★★★
  OPPONENT_DISCONNECTED: 'opponent_disconnected',
  // 他のメッセージタイプやイベント名もここに追加可能
};

module.exports = { WebSocketMessageTypes };