// frontend/match_actions.js

// このファイルスコープの変数 (ポーリングインターバルやWebSocketオブジェクト)
let matchmakingStatusInterval = null;
let matchResultPollingInterval = null;
let matchWebSocket = null;
let heartbeatInterval = null;


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
            if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true); // match_ui.js で定義されたグローバル関数
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
            } catch (e2) { /* ignore */ }
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
    console.log("[match_actions.js] startMatchmaking called.");

    if (typeof window.isMatching !== 'undefined' && window.isMatching) {
        console.log("[match_actions.js] Already matching, exiting startMatchmaking.");
        return;
    }
    if (!window.MyApp?.isUserLoggedIn) {
        alert("マッチングを開始するにはログインしてください。");
        return;
    }
    
    console.log("[match_actions.js] Setting isMatching to true.");
    window.isMatching = true;
    window.currentMatchId = null;
    window.currentOpponentData = null;
    window.isPollingForResult = false;

    console.log("[match_actions.js] isMatching is now:", window.isMatching);

    if (typeof window.resetCurrentLobbyCreator === 'function') { // match_ui.js で定義されたグローバル関数
        window.resetCurrentLobbyCreator();
    } else {
        console.warn("[match_actions.js] window.resetCurrentLobbyCreator is not defined.");
    }

    if (typeof updateMatchUI === 'function') { // match_ui.js で定義されたグローバル関数
        console.log("[match_actions.js] Calling updateMatchUI from startMatchmaking.");
        updateMatchUI();
    } else {
        console.error("[match_actions.js] updateMatchUI function is not defined!");
    }
    if (typeof saveStateToSessionStorage === 'function') { // match_ui.js で定義されたグローバル関数
        saveStateToSessionStorage();
    } else {
        console.error("[match_actions.js] saveStateToSessionStorage function is not defined!");
    }

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/request`;
        const result = await authenticatedFetch(apiUrl, { method: 'POST' });
        console.log("[match_actions.js] Matchmaking request response:", result);

        if (result.status === 'waiting') {
            startPollingMatchStatus();
        } else if (result.status === 'matched') {
            await handleMatchFound(result.opponent, result.matchId);
        } else {
            throw new Error(`予期せぬステータス: ${result.status}`);
        }
    } catch (error) {
        console.error("[match_actions.js] Error starting matchmaking:", error);
        const statusEl = document.getElementById('match-status'); // match_ui.js で管理されるDOM要素
        if (statusEl) statusEl.textContent = `マッチング開始エラー: ${error.message}`;
        
        window.isMatching = false; // エラー時はフラグを戻す
        if (typeof clearMatchStateAndUI === 'function') { // match_ui.js で定義されたグローバル関数
            clearMatchStateAndUI(true);
        } else {
            console.error("[match_actions.js] clearMatchStateAndUI function is not defined!");
        }
    }
}
window.startMatchmaking = startMatchmaking; // グローバル関数として公開

function startPollingMatchStatus() {
    stopPollingMatchStatus();
    window.isMatching = true; 
    
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();

    matchmakingStatusInterval = setInterval(async () => {
        if (!window.isMatching) {
            stopPollingMatchStatus(); 
            return; 
        }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/status`;
            const result = await authenticatedFetch(apiUrl);
            if (!window.isMatching) {
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
                    const statusEl = document.getElementById('match-status'); // match_ui.js で管理
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
            const statusEl = document.getElementById('match-status'); // match_ui.js で管理
            if (statusEl) statusEl.textContent = `状況確認エラー: ${error.message}`;
        }
    }, 3000);
}
// window.startPollingMatchStatus = startPollingMatchStatus; // UIから直接呼ばない想定なら不要

function stopPollingMatchStatus() {
    if (matchmakingStatusInterval) {
        clearInterval(matchmakingStatusInterval);
        matchmakingStatusInterval = null;
    }
}
window.stopPollingMatchStatus = stopPollingMatchStatus; // clearMatchStateAndUI から呼ばれるのでグローバルに

async function handleMatchFound(opponentData, matchId) {
    window.currentOpponentData = opponentData;
    window.currentMatchId = matchId;
    window.isMatching = false;
    window.isPollingForResult = false;

    if (typeof window.resetCurrentLobbyCreator === 'function') { // match_ui.js で定義
        window.resetCurrentLobbyCreator();
    } else {
        console.warn("[match_actions.js] resetCurrentLobbyCreator function not found. Lobby creator display might be stale.");
    }

    if (typeof updateMatchUI === 'function') updateMatchUI(); // match_ui.js で定義
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage(); // match_ui.js で定義

    const chatArea = document.getElementById('match-chat-messages'); // match_ui.js で管理
    if (chatArea) {
        chatArea.innerHTML = '<p class="chat-system-message">対戦相手が見つかりました。チャットを開始できます。</p>';
    }
    connectWebSocket();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`; 
        await authenticatedFetch(apiUrl, { method: 'POST' });
        console.log("[match_actions.js] Left matchmaking queue after match found.");
    } catch (error) {
        console.error("[match_actions.js] Error leaving matchmaking queue:", error);
    }
}
// window.handleMatchFound = handleMatchFound; // UIから直接呼ばない想定なら不要

async function cancelMatchmakingRequest() {
    if (!window.isMatching) return;
    
    stopPollingMatchStatus();
    const statusEl = document.getElementById('match-status'); // match_ui.js で管理
    if (statusEl) statusEl.textContent = 'キャンセル処理中...';
    const cancelBtnEl = document.getElementById('cancel-match-button'); // match_ui.js で管理
    if (cancelBtnEl) cancelBtnEl.disabled = true;

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`;
        await authenticatedFetch(apiUrl, { method: 'POST' });
        if (statusEl) statusEl.textContent = 'マッチングをキャンセルしました。';
    } catch (error) {
        console.error("Error cancelling matchmaking request:", error);
        if (statusEl) statusEl.textContent = `キャンセルエラー: ${error.message}`;
    } finally {
        if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true); // match_ui.js で定義
    }
}
window.cancelMatchmakingRequest = cancelMatchmakingRequest; // グローバル関数として公開

async function submitReport(result) {
    if (window.isSubmittingResult || !window.currentMatchId) return;
    
    console.log("[submitReport] Submitting report with data:", { matchId: window.currentMatchId, result: result });

    if (!confirm(`対戦結果を「${result === 'win' ? '勝利' : '敗北'}」として申告しますか？`)) return;

    window.isSubmittingResult = true;
    if (typeof hideLobbyInstruction === 'function') hideLobbyInstruction(); // match_ui.js で定義
    if (typeof updateMatchUI === 'function') updateMatchUI(); // match_ui.js で定義
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage(); // match_ui.js で定義

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/report`;
        const responseData = await authenticatedFetch(apiUrl, {
            method: 'POST',
            body: { matchId: window.currentMatchId, result: result }
        });
        handleReportResponse(responseData);
    } catch (error) {
        console.error("[submitReport] Error submitting report (raw error object):", error);
        console.error("[submitReport] Error message:", error.message);
        
        const battleStatusEl = document.getElementById('battle-status-text'); // match_ui.js で管理
        if (battleStatusEl) {
            battleStatusEl.textContent = `結果報告エラー: ${error.message} (サーバーで問題が発生した可能性があります。しばらくしてから再試行してください。)`;
        }
        window.isSubmittingResult = false;
        
        // ボタンの状態復元は updateMatchUI に任せるのが望ましい
        const reportWinBtn = document.getElementById('report-win-button'); // match_ui.js で管理
        const reportLoseBtn = document.getElementById('report-lose-button'); // match_ui.js で管理
        const cancelBattleBtn = document.getElementById('cancel-battle-button'); // match_ui.js で管理
        if (reportWinBtn) reportWinBtn.disabled = false;
        if (reportLoseBtn) reportLoseBtn.disabled = false;
        if (cancelBattleBtn) cancelBattleBtn.disabled = false;
        
        if (typeof updateMatchUI === 'function') updateMatchUI(); // match_ui.js で定義
    }
}
window.submitReport = submitReport; // グローバル関数として公開

async function cancelBattle() {
    if (window.isSubmittingResult || !window.currentMatchId) return;
    if (!confirm("この対戦をキャンセルしますか？\nレートは変動しません。")) return;

    window.isSubmittingResult = true;
    if (typeof hideLobbyInstruction === 'function') hideLobbyInstruction(); // match_ui.js で定義
    if (typeof updateMatchUI === 'function') updateMatchUI(); // match_ui.js で定義
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage(); // match_ui.js で定義

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel-match`;
        const responseData = await authenticatedFetch(apiUrl, {
            method: 'POST',
            body: { matchId: window.currentMatchId }
        });
        handleReportResponse(responseData);
    } catch (error) {
        console.error("Error cancelling battle:", error);
        const battleStatusEl = document.getElementById('battle-status-text'); // match_ui.js で管理
        if (battleStatusEl) battleStatusEl.textContent = `対戦キャンセルエラー: ${error.message}`;
        window.isSubmittingResult = false;
        
        // ボタンの状態復元は updateMatchUI に任せるのが望ましい
        const reportWinBtn = document.getElementById('report-win-button'); // match_ui.js で管理
        const reportLoseBtn = document.getElementById('report-lose-button'); // match_ui.js で管理
        const cancelBattleBtn = document.getElementById('cancel-battle-button'); // match_ui.js で管理
        if (reportWinBtn) reportWinBtn.disabled = true;
        if (reportLoseBtn) reportLoseBtn.disabled = true;
        if (cancelBattleBtn) cancelBattleBtn.disabled = true;

        if (typeof updateMatchUI === 'function') updateMatchUI(); // match_ui.js で定義
    }
}
window.cancelBattle = cancelBattle; // グローバル関数として公開

function handleReportResponse(responseData) {
    console.log("[handleReportResponse] Received responseData:", JSON.parse(JSON.stringify(responseData)));

    stopPollingMatchResult();
    window.isSubmittingResult = false;
    
    if (typeof hideLobbyInstruction === 'function') { // match_ui.js で定義
        hideLobbyInstruction();
    }

    const battleStatusEl = document.getElementById('battle-status-text'); // match_ui.js で管理

    if (!responseData || typeof responseData.status === 'undefined') {
        console.error("[handleReportResponse] Invalid responseData or responseData.status is undefined.", responseData);
        if (battleStatusEl) battleStatusEl.textContent = "サーバーからの応答が不正です。";
        setTimeout(() => {
            if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true); // match_ui.js で定義
        }, 3000);
        if (typeof updateMatchUI === 'function') updateMatchUI(); // match_ui.js で定義
        if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage(); // match_ui.js で定義
        return;
    }

    console.log(`[handleReportResponse] Processing server status: '${responseData.status}'`);

    switch (responseData.status) {
        case 'waiting':
            console.log("[handleReportResponse] Status: 'waiting'. Starting polling for other player's result.");
            window.isPollingForResult = true;
            startPollingMatchResult();
            break;
        case 'finished':
            console.log("[handleReportResponse] Status: 'finished'. Attempting to show result modal. Result data:", responseData.resultData);
            window.isPollingForResult = false;
            const originalRate = responseData.resultData?.originalRate ?? window.MyApp?.currentUserData?.rate;
            
            updateGlobalUserData(responseData.resultData.newRate, responseData.resultData.newPoints); // このファイル内で定義

            if (typeof showResultModal === 'function') { // match_ui.js で定義
                showResultModal(responseData.resultData.didWin, responseData.resultData, originalRate);
            } else {
                console.error("showResultModal function is not defined!");
            }
            break;
        case 'disputed':
            console.log("[handleReportResponse] Status: 'disputed'. Reporting disagreement.");
            window.isPollingForResult = false;
            if (battleStatusEl) battleStatusEl.textContent = '報告が一致しませんでした。この対戦は無効になります。';
            setTimeout(() => {
                if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true); // match_ui.js で定義
            }, 3000);
            break;
        case 'cancelled':
            console.log("[handleReportResponse] Status: 'cancelled'. Match was cancelled.");
            window.isPollingForResult = false;
            if (battleStatusEl) battleStatusEl.textContent = '対戦がキャンセルされました。';
            setTimeout(() => {
                if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true); // match_ui.js で定義
            }, 3000);
            break;
        default:
            console.warn("[handleReportResponse] Unknown status received from server:", responseData.status, responseData);
            window.isPollingForResult = false;
            if (battleStatusEl) battleStatusEl.textContent = `不明な応答 ('${responseData.status}') をサーバーから受信しました。`;
            setTimeout(() => {
                if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true); // match_ui.js で定義
            }, 3000);
            break;
    }

    if (typeof updateMatchUI === 'function') updateMatchUI(); // match_ui.js で定義
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage(); // match_ui.js で定義
}
// window.handleReportResponse = handleReportResponse; // UIから直接呼ばない想定なら不要

function updateGlobalUserData(newRate, newPoints) {
    if (window.MyApp?.currentUserData) {
        window.MyApp.currentUserData.rate = newRate;
        window.MyApp.currentUserData.points = newPoints;
        if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
        if (typeof window.updateUserPoints === 'function') window.updateUserPoints(newPoints);
    }
}
// window.updateGlobalUserData = updateGlobalUserData; // UIから直接呼ばない想定なら不要

function startPollingMatchResult() {
    stopPollingMatchResult();
    window.isPollingForResult = true;
    if (typeof saveStateToSessionStorage === 'function') saveStateToSessionStorage();

    matchResultPollingInterval = setInterval(async () => {
        if (!window.currentMatchId || !window.isPollingForResult) {
            stopPollingMatchResult();
            return;
        }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/match-status/${window.currentMatchId}`;
            const result = await authenticatedFetch(apiUrl);
            if (!window.currentMatchId || !window.isPollingForResult) {
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
            const battleStatusEl = document.getElementById('battle-status-text'); // match_ui.js で管理
            if (battleStatusEl) battleStatusEl.textContent = `結果確認エラー: ${error.message}`;
            setTimeout(() => {
                if (typeof clearMatchStateAndUI === 'function') clearMatchStateAndUI(true); // match_ui.js で定義
            }, 2000);
        }
    }, 5000);
}
// window.startPollingMatchResult = startPollingMatchResult; // UIから直接呼ばない想定なら不要

function stopPollingMatchResult() {
    if (matchResultPollingInterval) {
        clearInterval(matchResultPollingInterval);
        matchResultPollingInterval = null;
    }
}
window.stopPollingMatchResult = stopPollingMatchResult; // clearMatchStateAndUI から呼ばれるのでグローバルに

// --- WebSocket (チャット) 関連 ---

function sendChatMessage() {
    const chatInputEl = document.getElementById('match-chat-input'); // match_ui.js で管理
    if (!chatInputEl || !matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) {
        if (!matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) alert("チャットサーバーに接続されていません。");
        return;
    }
    const messageText = chatInputEl.value.trim();
    if (messageText && window.currentMatchId) {
        const messagePayload = { type: 'MATCH_CHAT_MESSAGE', matchId: window.currentMatchId, text: messageText };
        matchWebSocket.send(JSON.stringify(messagePayload));
        if (typeof window.appendChatMessage === 'function') { // match_ui.js で定義・グローバル公開
            window.appendChatMessage(messageText, true, window.MyApp?.currentUserData?.name || '自分');
        }
        chatInputEl.value = '';
    }
}
window.sendChatMessage = sendChatMessage; // グローバル関数として公開

function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (matchWebSocket && matchWebSocket.readyState === WebSocket.OPEN) {
            try { matchWebSocket.send(JSON.stringify({ type: 'PING' })); }
            catch (e) { console.error("Failed to send PING:", e); stopHeartbeat(); }
        } else { stopHeartbeat(); }
    }, 30000);
}
// window.startHeartbeat = startHeartbeat; // UIから直接呼ばない想定なら不要

function stopHeartbeat() {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}
window.stopHeartbeat = stopHeartbeat; // clearMatchStateAndUI, disconnectWebSocket から呼ばれるのでグローバルに

function connectWebSocket() {
    if (matchWebSocket && (matchWebSocket.readyState === WebSocket.OPEN || matchWebSocket.readyState === WebSocket.CONNECTING)) return;
    
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    let wsUrl = window.MyApp?.WEBSOCKET_URL; 
    const currentMatchIdForWs = window.currentMatchId;


    if (!currentMatchIdForWs || !token || !wsUrl) {
        if (typeof window.appendChatMessage === 'function') window.appendChatMessage("チャット接続情報が不足またはURL未設定です。", false, "システム");
        return;
    }

    let path = "";
    if (wsUrl && !wsUrl.endsWith('/')) wsUrl += '/'; 
    if (window.location.hostname === 'www.mariokartbestrivals.com' || window.location.hostname === 'mariokartbestrivals.com') {
        path = "ws/"; // 本番環境用のパスプレフィックス
    }
    // ローカル環境など、他のホスト名の場合はパスプレフィックスなし

    if (!wsUrl || (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://'))) {
        if (typeof window.appendChatMessage === 'function') window.appendChatMessage('無効なWebSocket URLです。 ws:// または wss:// で始まる必要があります。', false, "システム");
        return;
    }

    const fullWsUrl = `${wsUrl}${path}?token=${token}&matchId=${currentMatchIdForWs}`;
    console.log(`[match_actions.js] Connecting to WebSocket: ${fullWsUrl}`);
    if (typeof window.appendChatMessage === 'function') window.appendChatMessage("チャットサーバーに接続中...", false, "システム");

    try {
        matchWebSocket = new WebSocket(fullWsUrl); // このファイルスコープの matchWebSocket を使用
        matchWebSocket.onopen = () => { 
            if (typeof window.appendChatMessage === 'function') window.appendChatMessage("チャットに接続しました。", false, "システム"); 
            startHeartbeat(); 
        };
        matchWebSocket.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data);
                if (messageData.type === 'PONG') return; // ハートビート応答は無視
                if (messageData.type === 'MATCH_CHAT_MESSAGE' && messageData.text && messageData.senderId !== window.MyApp?.currentUserData?.googleId) {
                    if (typeof window.appendChatMessage === 'function') window.appendChatMessage(messageData.text, false, messageData.senderName || '相手');
                } else if (messageData.type === 'SYSTEM_MESSAGE') {
                    if (typeof window.appendChatMessage === 'function') window.appendChatMessage(messageData.text, false, "システム");
                } else if (messageData.type === 'ERROR') {
                     if (typeof window.appendChatMessage === 'function') window.appendChatMessage(`エラー: ${messageData.message}`, false, "システム");
                }
            } catch (e) { console.error("WS message parse error:", e, "Raw data:", event.data); }
        };
        matchWebSocket.onerror = (error) => { 
            console.error("WS error:", error); 
            if (typeof window.appendChatMessage === 'function') window.appendChatMessage("チャット接続エラー。", false, "システム"); 
        };
        matchWebSocket.onclose = (event) => {
            stopHeartbeat();
            const currentMatchIdForCloseMsg = window.currentMatchId; // グローバルから再取得
            if (event.code !== 1000 && currentMatchIdForCloseMsg) { 
                const codeMsg = event.code === 1006 ? ' (接続が異常終了しました)' : '';
                if (typeof window.appendChatMessage === 'function') window.appendChatMessage(`チャット接続が切れました (Code: ${event.code}${codeMsg})`, false, "システム");
            }
            matchWebSocket = null; // 再接続できるように null にする
            console.log("WebSocket connection closed. Code:", event.code, "Reason:", event.reason);
        };
    } catch (error) { 
        console.error("WS creation error:", error); 
        if (typeof window.appendChatMessage === 'function') window.appendChatMessage("チャット接続失敗。", false, "システム"); 
    }
}
// window.connectWebSocket = connectWebSocket; // UIから直接呼ばない想定なら不要 (updateMatchUIから呼ばれる)

function disconnectWebSocket() {
    stopHeartbeat();
    if (matchWebSocket) { // このファイルスコープの matchWebSocket を使用
        matchWebSocket.close(1000, "Client requested disconnect");
        matchWebSocket = null;
    }
    console.log("WebSocket disconnected by client request.");
}
window.disconnectWebSocket = disconnectWebSocket; // clearMatchStateAndUI などから呼ばれるのでグローバルに