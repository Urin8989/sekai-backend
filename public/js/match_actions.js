// frontend/match_actions.js

// --- グローバル変数 (match_ui.js と共有される前提のもの) ---
// これらは実際には match_ui.js で定義され、match_actions.js からは
// グローバルスコープや MyApp 名前空間などを通じてアクセスされる想定です。
// ここでは、どの変数・関数に依存しているかを示すためにコメントとして記載します。
/*
let isMatching; // マッチング中かどうかのフラグ
let currentMatchId; // 現在のマッチID
let currentOpponentData; // 現在の対戦相手データ
let isPollingForResult; // 結果をポーリング中かどうかのフラグ
let isSubmittingResult; // 結果を送信中かどうかのフラグ

// DOM要素 (match_ui.js で取得・管理)
// let matchStatusText;
// let cancelButton;
// let battleStatusText;
// let reportWinButton;
// let reportLoseButton;
// let cancelBattleButton;
// let matchChatMessagesArea; // チャットメッセージ表示エリア

// match_ui.js で定義されている関数
// function updateMatchUI() {}
// function saveStateToSessionStorage() {}
// function clearMatchStateAndUI(updateUIFlag) {}
// function hideLobbyInstruction() {}
// function showResultModal(didWin, resultData, originalRate) {}
// function appendChatMessage(messageText, isMyMessage, senderName) {}
// window.resetCurrentLobbyCreator = function() {}; // match_ui.js でグローバルに公開

// このファイル内で定義されているWebSocket関連変数
// let matchWebSocket = null;
// let heartbeatInterval = null;
// let matchmakingStatusInterval = null; // マッチング状態ポーリング用
// let matchResultPollingInterval = null; // マッチ結果ポーリング用
*/


// --- マッチング API 呼び出し関数 ---

async function authenticatedFetch(url, options = {}) {
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    if (!token) throw new Error('ログインが必要です。');

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
    };

    if (options.body && typeof options.body !== 'string') {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            console.error(`Auth error (${response.status}) for ${url}. Clearing state.`);
            if (typeof window.handleLogout === 'function') window.handleLogout();
            if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true); // match_ui.js の関数
            throw new Error('認証エラーが発生しました。再ログインしてください。');
        }
        
        let errorData = { 
            message: `APIリクエスト失敗 (ステータス: ${response.status} ${response.statusText})`,
            status: response.status,
            statusText: response.statusText
        };
        try {
            const errorJson = await response.json();
            errorData = { ...errorData, ...errorJson };
        } catch (e) {
            try {
                const errorText = await response.text();
                errorData.rawError = errorText;
                console.log("Raw error response from server:", errorText);
            } catch (e2) {
                // テキストとしても取得できない場合は何もしない
            }
        }
        console.error("API Error Data:", errorData);
        throw new Error(errorData.detail || errorData.message || `APIリクエスト失敗 (ステータス: ${response.status})`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
        return null;
    }
    return response.json();
}

async function startMatchmaking() {
    if (typeof isMatching !== 'undefined' && isMatching) return; // isMatching は match_ui.js で管理
    if (!window.MyApp?.isUserLoggedIn) { // MyApp はグローバルな名前空間と仮定
        alert("マッチングを開始するにはログインしてください。"); return;
    }
    
    // 状態変数を初期化 (これらは match_ui.js のグローバル変数に影響を与える)
    if (typeof window !== 'undefined') { // ブラウザ環境でのみ実行
        window.isMatching = true;
        window.currentMatchId = null;
        window.currentOpponentData = null;
        window.isPollingForResult = false;
    }


    // ロビー作成者情報をリセット
    if (typeof window.resetCurrentLobbyCreator === 'function') {
        window.resetCurrentLobbyCreator();
    } else {
        console.warn("window.resetCurrentLobbyCreator is not defined. This might affect lobby creator display.");
    }

    if (typeof updateMatchUI === 'function') updateMatchUI();
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/request`;
        const result = await authenticatedFetch(apiUrl, { method: 'POST' });

        if (result.status === 'waiting') {
            startPollingMatchStatus();
        } else if (result.status === 'matched') {
            await handleMatchFound(result.opponent, result.matchId);
        } else {
            throw new Error(`予期せぬステータス: ${result.status}`);
        }
    } catch (error) {
        console.error("Error starting matchmaking:", error);
        // matchStatusText は match_ui.js で定義・管理されるDOM要素
        const statusEl = document.getElementById('match-status'); // 直接参照を試みる (非推奨)
        if (statusEl) statusEl.textContent = `マッチング開始エラー: ${error.message}`;
        
        if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
    }
}

function startPollingMatchStatus() {
    stopPollingMatchStatus();
    if (typeof window !== 'undefined') window.isMatching = true;
    
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();

    // matchmakingStatusInterval はこのファイルスコープの変数として宣言されている想定
    matchmakingStatusInterval = setInterval(async () => {
        if (typeof window === 'undefined' || !window.isMatching) { // isMatching は match_ui.js で管理
            stopPollingMatchStatus(); 
            return; 
        }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/status`;
            const result = await authenticatedFetch(apiUrl);
            if (typeof window === 'undefined' || !window.isMatching) { // authenticatedFetch後にも再度チェック
                 stopPollingMatchStatus(); 
                 return;
            }

            switch (result.status) {
                case 'waiting': 
                    break;
                case 'matched':
                    stopPollingMatchStatus();
                    await handleMatchFound(result.opponent, result.matchId);
                    break;
                case 'timeout':
                case 'not_found':
                    stopPollingMatchStatus();
                    if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
                    const statusEl = document.getElementById('match-status');
                    if (statusEl) statusEl.textContent = result.status === 'timeout' ? '時間内に相手が見つかりませんでした。' : 'マッチングが終了しました。';
                    break;
                default:
                    console.warn("[match_actions.js] Unknown status in startPollingMatchStatus:", result.status);
                    stopPollingMatchStatus();
                    if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
                    break;
            }
        } catch (error) {
            console.error("Error polling matchmaking status:", error);
            stopPollingMatchStatus();
            if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
            const statusEl = document.getElementById('match-status');
            if (statusEl) statusEl.textContent = `状況確認エラー: ${error.message}`;
        }
    }, 3000);
}

function stopPollingMatchStatus() {
    if (matchmakingStatusInterval) { // matchmakingStatusInterval はこのファイルスコープ
        clearInterval(matchmakingStatusInterval);
        matchmakingStatusInterval = null;
    }
}

async function handleMatchFound(opponentData, matchId) {
    if (typeof window !== 'undefined') {
        window.currentOpponentData = opponentData;
        window.currentMatchId = matchId;
        window.isMatching = false;
        window.isPollingForResult = false;
    }

    // 新しいマッチなので、ロビー作成者情報をリセットして再決定を促す
    if (typeof window.resetCurrentLobbyCreator === 'function') {
        window.resetCurrentLobbyCreator();
    } else {
        console.warn("[match_actions.js] resetCurrentLobbyCreator function not found. Lobby creator display might be stale.");
    }

    if (typeof updateMatchUI === 'function') updateMatchUI();
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();

    // matchChatMessagesArea は match_ui.js で定義・管理
    const chatArea = document.getElementById('match-chat-messages'); // 直接参照 (非推奨)
    if (chatArea) {
        chatArea.innerHTML = '<p class="chat-system-message">対戦相手が見つかりました。チャットを開始できます。</p>';
    }
    connectWebSocket(); // このファイル内で定義

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`; 
        await authenticatedFetch(apiUrl, { method: 'POST' });
        console.log("[match_actions.js] Left matchmaking queue after match found.");
    } catch (error) {
        console.error("[match_actions.js] Error leaving matchmaking queue:", error);
    }
}

async function cancelMatchmakingRequest() {
    if (typeof window === 'undefined' || !window.isMatching) return; // isMatching は match_ui.js で管理
    
    stopPollingMatchStatus();
    const statusEl = document.getElementById('match-status');
    if (statusEl) statusEl.textContent = 'キャンセル処理中...';
    const cancelBtnEl = document.getElementById('cancel-match-button'); // cancelButton は match_ui.js で管理
    if (cancelBtnEl) cancelBtnEl.disabled = true;

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`;
        await authenticatedFetch(apiUrl, { method: 'POST' });
        if (statusEl) statusEl.textContent = 'マッチングをキャンセルしました。';
    } catch (error) {
        console.error("Error cancelling matchmaking request:", error);
        if (statusEl) statusEl.textContent = `キャンセルエラー: ${error.message}`;
    } finally {
        if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
    }
}

async function submitReport(result) {
    // isSubmittingResult, currentMatchId は match_ui.js で管理されるグローバル変数想定
    if (typeof window === 'undefined' || window.isSubmittingResult || !window.currentMatchId) return;
    
    console.log("[submitReport] Submitting report with data:", { matchId: window.currentMatchId, result: result });

    if (!confirm(`対戦結果を「${result === 'win' ? '勝利' : '敗北'}」として申告しますか？`)) return;

    window.isSubmittingResult = true;
    if (typeof hideLobbyInstruction === 'function') hideLobbyInstruction();
    if (typeof updateMatchUI === 'function') updateMatchUI();
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/report`;
        const responseData = await authenticatedFetch(apiUrl, {
            method: 'POST',
            body: { matchId: window.currentMatchId, result: result }
        });
        handleReportResponse(responseData); // このファイル内で定義
    } catch (error) {
        console.error("[submitReport] Error submitting report (raw error object):", error);
        console.error("[submitReport] Error message:", error.message);
        
        const battleStatusEl = document.getElementById('battle-status-text'); // battleStatusText は match_ui.js で管理
        if (battleStatusEl) {
            battleStatusEl.textContent = `結果報告エラー: ${error.message} (サーバーで問題が発生した可能性があります。しばらくしてから再試行してください。)`;
        }
        if (typeof window !== 'undefined') window.isSubmittingResult = false;
        
        // ボタンの状態復元は updateMatchUI に任せるのが望ましい
        const reportWinBtn = document.getElementById('report-win-button');
        const reportLoseBtn = document.getElementById('report-lose-button');
        const cancelBattleBtn = document.getElementById('cancel-battle-button');
        if (reportWinBtn) reportWinBtn.disabled = false;
        if (reportLoseBtn) reportLoseBtn.disabled = false;
        if (cancelBattleBtn) cancelBattleBtn.disabled = false;
        
        if (typeof updateMatchUI === 'function') updateMatchUI();
    }
}

async function cancelBattle() {
    if (typeof window === 'undefined' || window.isSubmittingResult || !window.currentMatchId) return;
    if (!confirm("この対戦をキャンセルしますか？\nレートは変動しません。")) return;

    window.isSubmittingResult = true;
    if (typeof hideLobbyInstruction === 'function') hideLobbyInstruction();
    if (typeof updateMatchUI === 'function') updateMatchUI();
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel-match`;
        const responseData = await authenticatedFetch(apiUrl, {
            method: 'POST',
            body: { matchId: window.currentMatchId }
        });
        handleReportResponse(responseData);
    } catch (error) {
        console.error("Error cancelling battle:", error);
        const battleStatusEl = document.getElementById('battle-status-text');
        if (battleStatusEl) battleStatusEl.textContent = `対戦キャンセルエラー: ${error.message}`;
        if (typeof window !== 'undefined') window.isSubmittingResult = false;
        
        const reportWinBtn = document.getElementById('report-win-button');
        const reportLoseBtn = document.getElementById('report-lose-button');
        const cancelBattleBtn = document.getElementById('cancel-battle-button');
        if (reportWinBtn) reportWinBtn.disabled = true; // キャンセル後は報告不可
        if (reportLoseBtn) reportLoseBtn.disabled = true;
        if (cancelBattleBtn) cancelBattleBtn.disabled = true; // キャンセル後は再キャンセル不可

        if (typeof updateMatchUI === 'function') updateMatchUI();
    }
}

function handleReportResponse(responseData) {
    console.log("[handleReportResponse] Received responseData:", JSON.parse(JSON.stringify(responseData)));

    stopPollingMatchResult();
    if (typeof window !== 'undefined') window.isSubmittingResult = false;
    
    if (typeof hideLobbyInstruction === 'function') {
        hideLobbyInstruction();
    }

    const battleStatusEl = document.getElementById('battle-status-text'); // DOM要素へのアクセス

    if (!responseData || typeof responseData.status === 'undefined') {
        console.error("[handleReportResponse] Invalid responseData or responseData.status is undefined.", responseData);
        if (battleStatusEl) battleStatusEl.textContent = "サーバーからの応答が不正です。";
        setTimeout(() => {
            if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
        }, 3000);
        if (typeof updateMatchUI === 'function') updateMatchUI();
        if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();
        return;
    }

    console.log(`[handleReportResponse] Processing server status: '${responseData.status}'`);

    switch (responseData.status) {
        case 'waiting':
            console.log("[handleReportResponse] Status: 'waiting'. Starting polling for other player's result.");
            if (typeof window !== 'undefined') window.isPollingForResult = true;
            startPollingMatchResult();
            break;
        case 'finished':
            console.log("[handleReportResponse] Status: 'finished'. Attempting to show result modal. Result data:", responseData.resultData);
            if (typeof window !== 'undefined') window.isPollingForResult = false;
            const originalRate = responseData.resultData?.originalRate ?? window.MyApp?.currentUserData?.rate;
            
            if (typeof updateGlobalUserData === 'function') { // このファイル内で定義
                updateGlobalUserData(responseData.resultData.newRate, responseData.resultData.newPoints);
            }

            if (typeof showResultModal === 'function') { // match_ui.js の関数
                showResultModal(responseData.resultData.didWin, responseData.resultData, originalRate);
            } else {
                console.error("showResultModal function is not defined!");
            }
            break;
        case 'disputed':
            console.log("[handleReportResponse] Status: 'disputed'. Reporting disagreement.");
            if (typeof window !== 'undefined') window.isPollingForResult = false;
            if (battleStatusEl) battleStatusEl.textContent = '報告が一致しませんでした。この対戦は無効になります。';
            setTimeout(() => {
                if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
            }, 3000);
            break;
        case 'cancelled':
            console.log("[handleReportResponse] Status: 'cancelled'. Match was cancelled.");
            if (typeof window !== 'undefined') window.isPollingForResult = false;
            if (battleStatusEl) battleStatusEl.textContent = '対戦がキャンセルされました。';
            setTimeout(() => {
                if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
            }, 3000);
            break;
        default:
            console.warn("[handleReportResponse] Unknown status received from server:", responseData.status, responseData);
            if (typeof window !== 'undefined') window.isPollingForResult = false;
            if (battleStatusEl) battleStatusEl.textContent = `不明な応答 ('${responseData.status}') をサーバーから受信しました。`;
            setTimeout(() => {
                if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
            }, 3000);
            break;
    }

    if (typeof updateMatchUI === 'function') updateMatchUI();
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();
}

function updateGlobalUserData(newRate, newPoints) {
    if (window.MyApp?.currentUserData) {
        window.MyApp.currentUserData.rate = newRate;
        window.MyApp.currentUserData.points = newPoints;
        if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
        if (typeof window.updateUserPoints === 'function') window.updateUserPoints(newPoints);
        // displayMyProfileInfo は match_ui.js の関数。updateMatchUI経由で呼ばれることを期待。
        // if (typeof displayMyProfileInfo === 'function') displayMyProfileInfo(window.MyApp.currentUserData);
    }
}

function startPollingMatchResult() {
    stopPollingMatchResult();
    if (typeof window !== 'undefined') window.isPollingForResult = true;
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();

    // matchResultPollingInterval はこのファイルスコープの変数
    matchResultPollingInterval = setInterval(async () => {
        if (typeof window === 'undefined' || !window.currentMatchId || !window.isPollingForResult) {
            stopPollingMatchResult();
            return;
        }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/match-status/${window.currentMatchId}`;
            const result = await authenticatedFetch(apiUrl);
            if (typeof window === 'undefined' || !window.currentMatchId || !window.isPollingForResult) { // authenticatedFetch後にも再度チェック
                stopPollingMatchResult(); 
                return; 
            }

            if (result.status !== 'matched' && result.status !== 'reported_one') {
                stopPollingMatchResult();
                handleReportResponse(result);
            }
        } catch (error) {
            console.error("Error polling match result:", error);
            stopPollingMatchResult();
            const battleStatusEl = document.getElementById('battle-status-text');
            if (battleStatusEl) battleStatusEl.textContent = `結果確認エラー: ${error.message}`;
            setTimeout(() => {
                if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true);
            }, 2000);
        }
    }, 5000);
}

function stopPollingMatchResult() {
    if (matchResultPollingInterval) { // matchResultPollingInterval はこのファイルスコープ
        clearInterval(matchResultPollingInterval);
        matchResultPollingInterval = null;
    }
}

// --- WebSocket (チャット) 関連 ---
// matchWebSocket, heartbeatInterval はこのファイルスコープの変数
let matchWebSocket = null; 
let heartbeatInterval = null;

function sendChatMessage() {
    // matchChatInput は match_ui.js で管理
    const chatInputEl = document.getElementById('match-chat-input');
    if (!chatInputEl || !matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) {
        if (!matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) alert("チャットサーバーに接続されていません。");
        return;
    }
    const messageText = chatInputEl.value.trim();
    if (messageText && typeof window !== 'undefined' && window.currentMatchId) {
        const messagePayload = { type: 'MATCH_CHAT_MESSAGE', matchId: window.currentMatchId, text: messageText };
        matchWebSocket.send(JSON.stringify(messagePayload));
        if (typeof appendChatMessage === 'function') { // appendChatMessage は match_ui.js の関数
            appendChatMessage(messageText, true, window.MyApp?.currentUserData?.name || '自分');
        }
        chatInputEl.value = '';
    }
}

function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (matchWebSocket && matchWebSocket.readyState === WebSocket.OPEN) {
            try { matchWebSocket.send(JSON.stringify({ type: 'PING' })); }
            catch (e) { console.error("Failed to send PING:", e); stopHeartbeat(); }
        } else { stopHeartbeat(); }
    }, 30000);
}

function stopHeartbeat() {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

function connectWebSocket() {
    if (matchWebSocket && (matchWebSocket.readyState === WebSocket.OPEN || matchWebSocket.readyState === WebSocket.CONNECTING)) return;
    
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    let wsUrl = window.MyApp?.WEBSOCKET_URL; 
    const currentMatchIdFromUI = typeof window !== 'undefined' ? window.currentMatchId : null;


    if (!currentMatchIdFromUI || !token || !wsUrl) {
        if (typeof appendChatMessage === 'function') appendChatMessage("チャット接続情報が不足またはURL未設定です。", false, "システム");
        return;
    }

    let path = "";
    if (wsUrl && !wsUrl.endsWith('/')) wsUrl += '/'; 
    if (window.location.hostname === 'www.mariokartbestrivals.com' || window.location.hostname === 'mariokartbestrivals.com') {
        path = "ws/";
    }
    if (!wsUrl || (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://'))) {
        if (typeof appendChatMessage === 'function') appendChatMessage('無効なWebSocket URLです。 ws:// または wss:// で始まる必要があります。', false, "システム");
        return;
    }

    const fullWsUrl = `${wsUrl}${path}?token=${token}&matchId=${currentMatchIdFromUI}`;
    console.log(`[match_actions.js] Connecting to WebSocket: ${fullWsUrl}`);
    if (typeof appendChatMessage === 'function') appendChatMessage("チャットサーバーに接続中...", false, "システム");

    try {
        matchWebSocket = new WebSocket(fullWsUrl);
        matchWebSocket.onopen = () => { 
            if (typeof appendChatMessage === 'function') appendChatMessage("チャットに接続しました。", false, "システム"); 
            startHeartbeat(); 
        };
        matchWebSocket.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data);
                if (messageData.type === 'PONG') return;
                if (messageData.type === 'MATCH_CHAT_MESSAGE' && messageData.text && messageData.senderId !== window.MyApp?.currentUserData?.googleId) {
                    if (typeof appendChatMessage === 'function') appendChatMessage(messageData.text, false, messageData.senderName || '相手');
                } else if (messageData.type === 'SYSTEM_MESSAGE') {
                    if (typeof appendChatMessage === 'function') appendChatMessage(messageData.text, false, "システム");
                } else if (messageData.type === 'ERROR') {
                     if (typeof appendChatMessage === 'function') appendChatMessage(`エラー: ${messageData.message}`, false, "システム");
                }
            } catch (e) { console.error("WS message parse error:", e); }
        };
        matchWebSocket.onerror = (error) => { 
            console.error("WS error:", error); 
            if (typeof appendChatMessage === 'function') appendChatMessage("チャット接続エラー。", false, "システム"); 
        };
        matchWebSocket.onclose = (event) => {
            stopHeartbeat();
            // currentMatchId は match_ui.js で管理されるグローバル変数。ここでは再取得を試みる。
            const currentMatchIdForClose = typeof window !== 'undefined' ? window.currentMatchId : null;
            if (event.code !== 1000 && currentMatchIdForClose) { 
                const codeMsg = event.code === 1006 ? ' (接続が異常終了しました)' : '';
                if (typeof appendChatMessage === 'function') appendChatMessage(`チャット接続が切れました (Code: ${event.code}${codeMsg})`, false, "システム");
            }
            matchWebSocket = null;
        };
    } catch (error) { 
        console.error("WS creation error:", error); 
        if (typeof appendChatMessage === 'function') appendChatMessage("チャット接続失敗。", false, "システム"); 
    }
}

function disconnectWebSocket() {
    stopHeartbeat();
    if (matchWebSocket) {
        matchWebSocket.close(1000, "Client requested disconnect");
        matchWebSocket = null;
    }
}