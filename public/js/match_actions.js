// frontend/match_actions.js

// --- マッチング API 呼び出し関数 ---

/**
 * 認証付きで fetch を行います。
 * @param {string} url - リクエストURL
 * @param {object} options - fetch オプション
 * @returns {Promise<any>} - fetch のレスポンス (JSON)
 */
async function authenticatedFetch(url, options = {}) { // (変更なし)
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
            clearMatchStateAndUI(true); // match_ui.js の関数を呼び出す
            throw new Error('認証エラーが発生しました。再ログインしてください。');
        }
        let errorData = { message: `Request failed with status ${response.status}` };
        try { errorData = await response.json(); } catch (e) { /* ignore */ }
        throw new Error(errorData.message || `APIリクエスト失敗 (ステータス: ${response.status})`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
        return null; // No Content の場合は null を返す
    }
    return response.json();
}

/**
 * マッチングリクエストを開始します。
 */
async function startMatchmaking() { // (変更なし)
    if (isMatching) return;
    if (!window.MyApp?.isUserLoggedIn) {
        alert("マッチングを開始するにはログインしてください。"); return;
    }
    isMatching = true; currentMatchId = null; currentOpponentData = null; isPollingForResult = false;
    // ★ ロビー作成者IDもリセット (マッチング開始時にクリア)
    if (typeof window.resetCurrentLobbyCreator === 'function') {
        window.resetCurrentLobbyCreator();
    }
    updateMatchUI();
    saveStateToSessionStorage();

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
        if (matchStatusText) matchStatusText.textContent = `マッチング開始エラー: ${error.message}`;
        clearMatchStateAndUI(true);
    }
}

/**
 * マッチングステータスのポーリングを開始します。
 */
function startPollingMatchStatus() { // (変更なし)
    stopPollingMatchStatus();
    isMatching = true; 
    saveStateToSessionStorage(); // ポーリング開始前に状態保存
    matchmakingStatusInterval = setInterval(async () => {
        if (!isMatching) { stopPollingMatchStatus(); return; }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/status`;
            const result = await authenticatedFetch(apiUrl);
            if (!isMatching) { stopPollingMatchStatus(); return; } // authenticatedFetch 後にもチェック

            switch (result.status) {
                case 'waiting': break;
                case 'matched':
                    stopPollingMatchStatus();
                    await handleMatchFound(result.opponent, result.matchId);
                    break;
                case 'timeout':
                case 'not_found':
                    stopPollingMatchStatus();
                    clearMatchStateAndUI(true);
                    if (matchStatusText) matchStatusText.textContent = result.status === 'timeout' ? '時間内に相手が見つかりませんでした。' : 'マッチングが終了しました。';
                    break;
                default:
                    console.warn("[match_actions.js] Unknown status:", result.status);
                    stopPollingMatchStatus();
                    clearMatchStateAndUI(true);
                    break;
            }
        } catch (error) {
            console.error("Error polling matchmaking status:", error);
            stopPollingMatchStatus();
            clearMatchStateAndUI(true);
            if (matchStatusText) matchStatusText.textContent = `状況確認エラー: ${error.message}`;
        }
    }, 3000);
}

/**
 * マッチングステータスのポーリングを停止します。
 */
function stopPollingMatchStatus() { // (変更なし)
    if (matchmakingStatusInterval) {
        clearInterval(matchmakingStatusInterval);
        matchmakingStatusInterval = null;
    }
}

/**
 * マッチング成功時の処理を行います。
 * @param {object} opponentData - 対戦相手データ
 * @param {string} matchId - マッチID
 */
async function handleMatchFound(opponentData, matchId) {
    currentOpponentData = opponentData;
    currentMatchId = matchId;
    isMatching = false;
    isPollingForResult = false; // 新しいマッチでは結果ポーリングは初期状態

    // ★ 追加: match_ui.js にあるロビー作成者IDリセット関数を呼び出す
    if (typeof window.resetCurrentLobbyCreator === 'function') {
        window.resetCurrentLobbyCreator();
    } else {
        console.warn("[match_actions.js] resetCurrentLobbyCreator function not found on window.");
    }

    updateMatchUI(); // UIを更新 (この中でロビー作成者が決定・表示される)
    saveStateToSessionStorage(); // 新しい状態を保存 (決定されたロビー作成者IDも保存される)

    if (matchChatMessagesArea) {
        matchChatMessagesArea.innerHTML = '<p class="chat-system-message">対戦相手が見つかりました。チャットを開始できます。</p>';
    }
    connectWebSocket(); // WebSocket接続を開始

    // マッチングキューから抜ける処理
    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`; 
        await authenticatedFetch(apiUrl, { method: 'POST' });
        console.log("[match_actions.js] Left matchmaking queue after match found.");
    } catch (error) {
        console.error("[match_actions.js] Error leaving matchmaking queue:", error);
    }
}

/**
 * マッチングリクエストをキャンセルします。
 */
async function cancelMatchmakingRequest() { // (変更なし)
    if (!isMatching) return;
    stopPollingMatchStatus();
    if (matchStatusText) matchStatusText.textContent = 'キャンセル処理中...';
    if (cancelButton) cancelButton.disabled = true;

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`;
        await authenticatedFetch(apiUrl, { method: 'POST' });
        if (matchStatusText) matchStatusText.textContent = 'マッチングをキャンセルしました。';
    } catch (error) {
        if (matchStatusText) matchStatusText.textContent = `キャンセルエラー: ${error.message}`;
    } finally {
        clearMatchStateAndUI(true); // キャンセル後、状態を完全にクリア
    }
}

/**
 * 対戦結果を報告します。
 * @param {'win' | 'lose'} result - 結果 ('win' または 'lose')
 */
async function submitReport(result) { // (変更なし)
    if (isSubmittingResult || !currentMatchId) return;
    if (!confirm(`対戦結果を「${result === 'win' ? '勝利' : '敗北'}」として申告しますか？`)) return;

    isSubmittingResult = true;
    hideLobbyInstruction(); // 結果報告時はロビー指示を隠す
    updateMatchUI();
    saveStateToSessionStorage();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/report`;
        const responseData = await authenticatedFetch(apiUrl, {
            method: 'POST',
            body: { matchId: currentMatchId, result: result }
        });
        handleReportResponse(responseData);
    } catch (error) {
        if (battleStatusText) battleStatusText.textContent = `結果報告エラー: ${error.message}`;
        isSubmittingResult = false;
        if (reportWinButton) reportWinButton.disabled = true; // エラー時はボタン無効化
        if (reportLoseButton) reportLoseButton.disabled = true;
        if (cancelBattleButton) cancelBattleButton.disabled = true;
        updateMatchUI(); // UIを元に戻す試み（ボタンの有効/無効など）
        // setTimeout(() => clearMatchStateAndUI(true), 2000); // エラー後すぐにクリアせず、メッセージ表示時間を確保する場合
    }
}

/**
 * 対戦をキャンセルします。
 */
async function cancelBattle() { // (変更なし)
    if (isSubmittingResult || !currentMatchId) return;
    if (!confirm("この対戦をキャンセルしますか？\nレートは変動しません。")) return;

    isSubmittingResult = true; // 他の送信処理と同様にフラグを立てる
    hideLobbyInstruction();
    updateMatchUI();
    saveStateToSessionStorage();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel-match`;
        const responseData = await authenticatedFetch(apiUrl, {
            method: 'POST',
            body: { matchId: currentMatchId }
        });
        handleReportResponse(responseData); // 通常の結果報告と同様のレスポンス処理を期待
    } catch (error) {
        if (battleStatusText) battleStatusText.textContent = `対戦キャンセルエラー: ${error.message}`;
        isSubmittingResult = false;
        if (reportWinButton) reportWinButton.disabled = true;
        if (reportLoseButton) reportLoseButton.disabled = true;
        if (cancelBattleButton) cancelBattleButton.disabled = true;
        updateMatchUI();
    }
}


/**
 * サーバーからの結果報告レスポンスを処理します。
 */
function handleReportResponse(responseData) { // (変更なし)
    stopPollingMatchResult(); 
    
    isSubmittingResult = false;
    hideLobbyInstruction();

    switch (responseData.status) {
        case 'waiting':
            isPollingForResult = true;
            startPollingMatchResult(); 
            updateMatchUI(); 
            break;
        case 'finished':
            isPollingForResult = false;
            const originalRate = responseData.resultData?.originalRate ?? window.MyApp?.currentUserData?.rate;
            updateGlobalUserData(responseData.resultData.newRate, responseData.resultData.newPoints);
            showResultModal(responseData.resultData.didWin, responseData.resultData, originalRate);
            // チャットはこのモーダルが表示されている間もアクティブ
            // モーダルが閉じられると clearMatchStateAndUI が呼ばれる
            break;
        case 'disputed':
            isPollingForResult = false;
            if (battleStatusText) battleStatusText.textContent = '報告が一致しませんでした。この対戦は無効になります。';
            if (reportResultButtons) reportResultButtons.style.display = 'flex';
            if (startBattleButton) startBattleButton.style.display = 'none';
            if (reportWinButton) reportWinButton.disabled = true;
            if (reportLoseButton) reportLoseButton.disabled = true;
            if (cancelBattleButton) cancelBattleButton.disabled = true;
            setTimeout(() => clearMatchStateAndUI(true), 3000); // 3秒後にクリア
            break;
        case 'cancelled':
            isPollingForResult = false;
            if (battleStatusText) battleStatusText.textContent = '対戦がキャンセルされました。';
            if (reportResultButtons) reportResultButtons.style.display = 'flex';
            if (startBattleButton) startBattleButton.style.display = 'none';
            if (reportWinButton) reportWinButton.disabled = true;
            if (reportLoseButton) reportLoseButton.disabled = true;
            if (cancelBattleButton) cancelBattleButton.disabled = true;
            setTimeout(() => clearMatchStateAndUI(true), 3000); // 3秒後にクリア
            break;
        default: 
            isPollingForResult = false;
            if (battleStatusText) battleStatusText.textContent = `不明な応答 (${responseData.status}) を受信。`;
            if (reportResultButtons) reportResultButtons.style.display = 'flex';
            if (startBattleButton) startBattleButton.style.display = 'none';
            if (reportWinButton) reportWinButton.disabled = true;
            if (reportLoseButton) reportLoseButton.disabled = true;
            if (cancelBattleButton) cancelBattleButton.disabled = true;
            setTimeout(() => clearMatchStateAndUI(true), 3000); // 3秒後にクリア
            break;
    }
    saveStateToSessionStorage(); // 応答処理後にも状態保存
    updateMatchUI(); // UIも更新
}

/**
 * ユーザーのグローバルデータを更新します。
 */
function updateGlobalUserData(newRate, newPoints) { // (変更なし)
    if (window.MyApp?.currentUserData) {
        window.MyApp.currentUserData.rate = newRate;
        window.MyApp.currentUserData.points = newPoints;
        if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
        if (typeof window.updateUserPoints === 'function') window.updateUserPoints(newPoints); // グローバルなポイント表示を更新
        displayMyProfileInfo(window.MyApp.currentUserData); // 対戦ページのプロフィール表示も更新
    }
}

/**
 * マッチ結果のポーリングを開始します。
 */
function startPollingMatchResult() { // (変更なし)
    stopPollingMatchResult();
    isPollingForResult = true;
    saveStateToSessionStorage();
    matchResultPollingInterval = setInterval(async () => {
        if (!currentMatchId || !isPollingForResult) { stopPollingMatchResult(); return; }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/match-status/${currentMatchId}`;
            const result = await authenticatedFetch(apiUrl);
            if (!currentMatchId || !isPollingForResult) { stopPollingMatchResult(); return; }

            if (result.status !== 'matched' && result.status !== 'reported_one') { // 'matched' や 'reported_one' はまだ待機状態
                stopPollingMatchResult();
                handleReportResponse(result); // それ以外のステータスは最終結果として処理
            }
        } catch (error) {
            console.error("Error polling match result:", error);
            stopPollingMatchResult();
            if (battleStatusText) battleStatusText.textContent = `結果確認エラー: ${error.message}`;
            setTimeout(() => clearMatchStateAndUI(true), 2000);
        }
    }, 5000);
}

/**
 * マッチ結果のポーリングを停止します。
 */
function stopPollingMatchResult() { // (変更なし)
    if (matchResultPollingInterval) {
        clearInterval(matchResultPollingInterval);
        matchResultPollingInterval = null;
    }
}

// --- WebSocket (チャット) 関連 --- (変更なし)

/**
 * チャットメッセージを送信します。
 */
function sendChatMessage() {
    if (!matchChatInput || !matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) {
        if (!matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) alert("チャットサーバーに接続されていません。");
        return;
    }
    const messageText = matchChatInput.value.trim();
    if (messageText && currentMatchId) {
        const messagePayload = { type: 'MATCH_CHAT_MESSAGE', matchId: currentMatchId, text: messageText };
        matchWebSocket.send(JSON.stringify(messagePayload));
        appendChatMessage(messageText, true, window.MyApp?.currentUserData?.name || '自分'); // match_ui.js の関数
        matchChatInput.value = '';
    }
}

/**
 * WebSocket ハートビートを開始します。
 */
function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (matchWebSocket && matchWebSocket.readyState === WebSocket.OPEN) {
            try { matchWebSocket.send(JSON.stringify({ type: 'PING' })); }
            catch (e) { console.error("Failed to send PING:", e); stopHeartbeat(); }
        } else { stopHeartbeat(); }
    }, 30000);
}

/**
 * WebSocket ハートビートを停止します。
 */
function stopHeartbeat() {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

/**
 * WebSocket サーバーに接続します。
 */
function connectWebSocket() {
    if (matchWebSocket && (matchWebSocket.readyState === WebSocket.OPEN || matchWebSocket.readyState === WebSocket.CONNECTING)) return;
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    let wsUrl = window.MyApp?.WEBSOCKET_URL; 

    if (!currentMatchId || !token || !wsUrl) {
        appendChatMessage("チャット接続情報が不足またはURL未設定です。", false, "システム"); return;
    }

    let path = "";
    if (wsUrl && !wsUrl.endsWith('/')) wsUrl += '/'; 
    if (window.location.hostname === 'www.mariokartbestrivals.com' || window.location.hostname === 'mariokartbestrivals.com') {
        path = "ws/";
    }
    if (!wsUrl || (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://'))) {
        appendChatMessage('無効なWebSocket URLです。 ws:// または wss:// で始まる必要があります。', false, "システム");
        return;
    }

    const fullWsUrl = `${wsUrl}${path}?token=${token}&matchId=${currentMatchId}`;
    console.log(`[match_actions.js] Connecting to WebSocket: ${fullWsUrl}`);
    appendChatMessage("チャットサーバーに接続中...", false, "システム"); // match_ui.js の関数

    try {
        matchWebSocket = new WebSocket(fullWsUrl);
        matchWebSocket.onopen = () => { appendChatMessage("チャットに接続しました。", false, "システム"); startHeartbeat(); };
        matchWebSocket.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data);
                if (messageData.type === 'PONG') return;
                if (messageData.type === 'MATCH_CHAT_MESSAGE' && messageData.text && messageData.senderId !== window.MyApp?.currentUserData?.googleId) {
                    appendChatMessage(messageData.text, false, messageData.senderName || '相手');
                } else if (messageData.type === 'SYSTEM_MESSAGE') {
                    appendChatMessage(messageData.text, false, "システム");
                } else if (messageData.type === 'ERROR') {
                     appendChatMessage(`エラー: ${messageData.message}`, false, "システム");
                }
            } catch (e) { console.error("WS message parse error:", e); }
        };
        matchWebSocket.onerror = (error) => { console.error("WS error:", error); appendChatMessage("チャット接続エラー。", false, "システム"); };
        matchWebSocket.onclose = (event) => {
            stopHeartbeat();
            if (event.code !== 1000 && currentMatchId) { // 1000は正常終了
                const codeMsg = event.code === 1006 ? ' (接続が異常終了しました)' : '';
                appendChatMessage(`チャット接続が切れました (Code: ${event.code}${codeMsg})`, false, "システム");
            }
            matchWebSocket = null; // 再接続できるように null にする
        };
    } catch (error) { console.error("WS creation error:", error); appendChatMessage("チャット接続失敗。", false, "システム"); }
}

/**
 * WebSocket 接続を切断します。
 */
function disconnectWebSocket() {
    stopHeartbeat();
    if (matchWebSocket) {
        matchWebSocket.close(1000, "Client requested disconnect"); // 正常終了コード1000
        matchWebSocket = null;
    }
}