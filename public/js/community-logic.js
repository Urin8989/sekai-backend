// frontend/community-logic.js

window.CommunityLogic = (() => {
    // --- Constants ---
    const MSG_TYPE_SYSTEM = 'system_message';
    const MSG_TYPE_COMMUNITY_CHAT = 'community_chat_message';

    // --- State Management ---
    let currentUser = null;
    let currentCommunities = [];
    let selectedCommunity = null;
    let participantsCache = new Map();
    let communityWebSocket = null;
    let currentCommunityChatId = null;
    let isLoadingData = false;
    let heartbeatInterval = null; // ★★★ ハートビート用の Interval ID を追加 ★★★

    // --- UI Interface (Placeholders) ---
    // ... (変更なし) ...
    let ui = {
        renderCommunityList: () => {},
        showLoading: () => {},
        showNoCommunitiesMessage: () => {},
        renderFullCommunityDetail: () => {},
        renderCardDetails: () => {},
        updateParticipantsList: () => {},
        updateDetailViewUI: () => {},
        appendChatMessage: () => {},
        appendSystemMessage: () => {},
        setButtonLoading: () => {},
        resetCommunityView: () => {},
        closeCardDetailsById: () => {},
        showFormMessage: () => {},
        closeCreateModal: () => {},
        updateLoginDependentUI: () => {},
        alert: (msg) => window.alert(msg), // Default fallback
        confirm: (msg) => window.confirm(msg), // Default fallback
        reloadPage: () => window.location.reload(),
        updateGlobalUserPoints: () => {},
        scrollToChatBottom: () => {},
        getChatInput: () => null,
        clearChatInput: () => {},
        disableChat: () => {},
        enableChat: () => {},
        showChatHistoryLoading: () => {},
        clearChatHistory: () => {},
        showChatConnectionMessage: () => {},
        getAuthToken: () => (typeof window.getAuthToken === 'function' ? window.getAuthToken() : null),
        getWebSocketUrl: () => window.MyApp.WEBSOCKET_URL,
        getBackendUrl: () => window.MyApp.BACKEND_URL,
        getDeleteButton: () => null, // Placeholder added
    };

    function registerUI(uiModule) {
        ui = { ...ui, ...uiModule };
    }


    // --- API Service ---
    // ... (変更なし) ...
    async function authenticatedFetch(url, options = {}, requiresAuth = true) {
        const headers = { ...options.headers };
        if (requiresAuth) {
            const token = ui.getAuthToken();
            if (!token) {
                console.error("Authentication token is missing.");
                throw new Error('ログインが必要です。');
            }
            headers['Authorization'] = `Bearer ${token}`;
        }

        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                let errorData;
                try { errorData = await response.json(); } catch (e) { errorData = { message: `Request failed: ${response.status}` }; }
                const message = errorData.message || `APIリクエスト失敗 (ステータス: ${response.status})`;
                console.error(`API Error (${response.status}) on ${options.method || 'GET'} ${url}:`, message, errorData);
                const error = new Error(message);
                error.status = response.status; error.data = errorData; throw error;
            }
            return response.status === 204 || response.headers.get('content-length') === '0' ? null : response.json();
        } catch (error) {
            console.error(`Network or Fetch Error on ${options.method || 'GET'} ${url}:`, error);
            throw error;
        }
    }
    window.authenticatedFetch = authenticatedFetch;

    const api = {
        getCommunities: () => authenticatedFetch(`${ui.getBackendUrl()}/api/communities`, {}, false),
        getCommunityById: (id) => authenticatedFetch(`${ui.getBackendUrl()}/api/communities/${id}`, {}, false),
        getParticipants: async (id) => {
            if (participantsCache.has(id)) return participantsCache.get(id);
            const participants = await authenticatedFetch(`${ui.getBackendUrl()}/api/communities/${id}/participants`, {}, false);
            participantsCache.set(id, participants);
            return participants;
        },
        getChatMessages: (id) => authenticatedFetch(`${ui.getBackendUrl()}/api/communities/${id}/chat`),
        createCommunity: (data) => authenticatedFetch(`${ui.getBackendUrl()}/api/communities`, { method: 'POST', body: data }),
        joinCommunity: (id) => authenticatedFetch(`${ui.getBackendUrl()}/api/communities/${id}/join`, { method: 'POST' }),
        leaveCommunity: (id) => authenticatedFetch(`${ui.getBackendUrl()}/api/communities/${id}/leave`, { method: 'POST' }),
        deleteCommunity: (id) => authenticatedFetch(`${ui.getBackendUrl()}/api/communities/${id}`, { method: 'DELETE' }),
        kickParticipant: (communityId, participantId) => authenticatedFetch(`${ui.getBackendUrl()}/api/communities/${communityId}/kick`, { method: 'POST', body: { participantId } }),
    };


    // --- WebSocket Management ---

    // ★★★ ハートビート開始関数を追加 ★★★
    function startHeartbeat() {
        stopHeartbeat(); // 既存のタイマーをクリア
        heartbeatInterval = setInterval(() => {
            if (communityWebSocket && communityWebSocket.readyState === WebSocket.OPEN) {
                try {
                    communityWebSocket.send(JSON.stringify({ type: 'PING' }));
                } catch (e) {
                    console.error("Failed to send PING:", e);
                    stopHeartbeat(); // 送信に失敗したら停止
                }
            } else {
                stopHeartbeat(); // WebSocketが開いていなければ停止
            }
        }, 30000); // 30秒ごと
    }

    // ★★★ ハートビート停止関数を追加 ★★★
    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }

    function connectCommunityWebSocket(communityId) {
        if (communityWebSocket && (communityWebSocket.readyState === WebSocket.OPEN || communityWebSocket.readyState === WebSocket.CONNECTING) && currentCommunityChatId === communityId) {
             ui.enableChat();
             return;
        }
        disconnectCommunityWebSocket(); // 既存の接続とハートビートを停止

        const token = ui.getAuthToken();
        if (!communityId || !token) { ui.appendSystemMessage("チャット接続に必要な情報がありません。", 'error'); return; }
        currentCommunityChatId = communityId;

        let baseUrl = ui.getWebSocketUrl();
        if (!baseUrl) { ui.appendSystemMessage("WebSocket URLが設定されていません。", 'error'); return; }

        // ★★★ URL末尾のスラッシュ処理を追加 ★★★
        if (!baseUrl.endsWith('/')) {
            baseUrl += '/';
        }

        let path = (window.location.hostname.includes('mariokartbestrivals.com')) ? "ws/" : "";
        const wsUrl = `${baseUrl}${path}?token=${token}&communityId=${communityId}`;

        ui.appendSystemMessage("チャットサーバーに接続中...", 'info');
        try {
            communityWebSocket = new WebSocket(wsUrl);
            communityWebSocket.onopen = () => {
                ui.appendSystemMessage("接続しました。", 'info');
                ui.enableChat();
                startHeartbeat(); // ★★★ 接続時にハートビートを開始 ★★★
            };
            communityWebSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                     // ★★★ PONG メッセージは無視 ★★★
                     if (msg.type === 'PONG') return;

                     if (msg.type === 'participant_kicked' && msg.kickedUserId === currentUser?.sub) {
                         ui.alert("コミュニティから追放されました。");
                         ui.reloadPage();
                     } else if (msg.type === 'community_deleted' && msg.communityId === selectedCommunity?._id) {
                         ui.alert("現在表示中のコミュニティが削除されました。");
                         handleResetCommunityView();
                         handleInitialLoad();
                     } else if (msg.type === 'participant_update') {
                         refreshCommunityData(communityId); // 参加者変動時に更新
                     } else {
                         ui.appendChatMessage(msg);
                     }
                } catch (e) { console.error("WS message parse error:", e); ui.appendSystemMessage('受信メッセージの解析エラー。', 'error'); }
            };
            communityWebSocket.onerror = (errorEvent) => {
                console.error("WebSocket Error:", errorEvent);
                ui.appendSystemMessage('チャット接続エラーが発生しました。', 'error');
                disconnectCommunityWebSocket(); // エラー時も切断処理
            };
            communityWebSocket.onclose = (event) => {
                 // ★★★ 切断時にハートビートを停止 ★★★
                 stopHeartbeat();
                 // 自分が意図しない切断のみメッセージを出す (1000 は正常終了)
                 if (currentCommunityChatId === communityId && event.code !== 1000) {
                     const message = `チャット接続が切れました (Code: ${event.code})。`;
                     ui.appendSystemMessage(message, 'error');
                 }
                 // ★★★ 切断時は常に WebSocket を null にする ★★★
                 communityWebSocket = null;
                 currentCommunityChatId = null;
                 ui.disableChat("チャットは利用できません");
            };
        } catch (error) {
            console.error("Error initializing WebSocket:", error);
            ui.appendSystemMessage("チャットサーバーへの接続準備に失敗しました。", 'error');
            disconnectCommunityWebSocket();
        }
    }

    function disconnectCommunityWebSocket() {
        stopHeartbeat(); // ★★★ 切断時にハートビートを停止 ★★★
        if (communityWebSocket) {
            communityWebSocket.onopen = null;
            communityWebSocket.onmessage = null;
            communityWebSocket.onerror = null;
            communityWebSocket.onclose = null;
            if (communityWebSocket.readyState === WebSocket.OPEN || communityWebSocket.readyState === WebSocket.CONNECTING) {
                communityWebSocket.close(1000, "Client initiated disconnect");
            }
        }
        communityWebSocket = null;
        currentCommunityChatId = null;
        ui.disableChat("チャットは利用できません");
    }

    // --- Core Logic ---
    // ... (変更なし) ...
    async function checkUserStatus(communityData, prefetchedParticipants = null) {
        const communityId = communityData?.id || communityData?._id;
        let isMember = false, isOrganizer = false, canJoin = false;
        if (currentUser && communityData) {
            isOrganizer = currentUser.sub === communityData.organizerGoogleId;
            try {
                const participants = prefetchedParticipants || await api.getParticipants(communityId);
                isMember = participants.some(p => p && p.sub === currentUser.sub);
                const currentCount = participants.length;
                const limit = parseInt(communityData.participantsLimit, 10);
                canJoin = !isMember && !isOrganizer && !isNaN(limit) && currentCount < limit;
            } catch (error) { console.error(`Error checking user status for community ${communityId}:`, error); }
        }
        return { isMember, canJoin, isOrganizer };
    }

    async function refreshCommunityData(communityId) {
        if (isLoadingData) return;
        isLoadingData = true;
        try {
            const freshCommunities = await api.getCommunities();
            currentCommunities = freshCommunities; // 状態を更新
            ui.renderCommunityList(currentCommunities, currentUser);

            participantsCache.delete(communityId); // キャッシュをクリア

            const updatedCommunityData = currentCommunities.find(c => (c.id || c._id) === communityId);

            if (selectedCommunity && (selectedCommunity.id || selectedCommunity._id) === communityId) {
                if (updatedCommunityData) {
                    selectedCommunity = updatedCommunityData; // 選択中のデータも更新
                    const participants = await api.getParticipants(communityId);
                    const status = await checkUserStatus(selectedCommunity, participants);
                    ui.renderFullCommunityDetail(selectedCommunity, participants, status, currentUser); // 詳細ビューを再描画
                    // WebSocket接続状態は維持または再接続
                    if (currentUser && (status.isMember || status.isOrganizer)) {
                        connectCommunityWebSocket(communityId);
                    } else {
                        disconnectCommunityWebSocket();
                    }
                } else {
                    ui.alert("表示中のコミュニティが見つかりません。一覧に戻ります。");
                    handleResetCommunityView(); // コミュニティが消えた場合
                }
            } else {
                 // カードが開いている場合、カードの詳細も更新 (UI側でID管理が必要)
                 const openCard = document.querySelector(`.community-card.is-open[data-community-id="${communityId}"]`);
                 if(openCard && updatedCommunityData) {
                    const participants = await api.getParticipants(communityId);
                    const status = await checkUserStatus(updatedCommunityData, participants);
                    ui.renderCardDetails(openCard, updatedCommunityData, participants, status, currentUser);
                 }
            }
        } catch (error) { console.error("Error refreshing data:", error); ui.alert("データの更新に失敗しました。"); }
        finally { isLoadingData = false; }
    }


    // --- Handlers ---
    // ... (変更なし) ...
    async function handleInitialLoad() {
        ui.showLoading(true);
        try {
            currentCommunities = await api.getCommunities();
            ui.renderCommunityList(currentCommunities, currentUser);
        } catch (error) {
            ui.showNoCommunitiesMessage(`一覧の読み込み失敗: ${error.message}`);
        } finally {
            ui.showLoading(false);
        }
    }

    async function handleJoinLeave(communityId, isJoining, button, cardElement = null) {
        if (!currentUser || isLoadingData) return;
        isLoadingData = true;
        const actionText = isJoining ? '参加' : '脱退';
        ui.setButtonLoading(button, true, `${actionText}中...`);
        try {
            const result = isJoining ? await api.joinCommunity(communityId) : await api.leaveCommunity(communityId);
            participantsCache.delete(communityId);
            let alertMessage = result?.message || `${actionText}しました。`;
            if (isJoining && result?.pointsEarned > 0 && result?.currentUserPoints !== undefined) {
                 ui.updateGlobalUserPoints(result.currentUserPoints);
                 alertMessage += ` ${result.pointsEarned}ポイント獲得！`;
            }
            ui.alert(alertMessage + "\nページを更新します。");
            ui.reloadPage(); // 参加/脱退後はリロードして状態を確実に反映
        } catch (error) {
            ui.alert(`${actionText}に失敗: ${error.message}`);
            ui.setButtonLoading(button, false); // エラー時のみボタンを戻す
            isLoadingData = false;
        }
    }

    async function handleKickParticipant(communityId, participantId, participantName, button) {
        if (!ui.confirm(`${participantName} を追放しますか？\nこの操作は元に戻せません。`)) return;
        isLoadingData = true;
        ui.setButtonLoading(button, true, '追放中');
        try {
            await api.kickParticipant(communityId, participantId);
            ui.alert(`${participantName} を追放しました。`);
            await refreshCommunityData(communityId); // UIを更新
        } catch (error) {
            ui.alert(`追放失敗: ${error.message}`);
            ui.setButtonLoading(button, false); // エラー時はボタンを戻す
        } finally {
            isLoadingData = false;
        }
    }

    async function handleDeleteCommunity() {
        if (!selectedCommunity || !currentUser || currentUser.sub !== selectedCommunity.organizerGoogleId || isLoadingData) return;
        if (!ui.confirm(`「${selectedCommunity.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;

        isLoadingData = true;
        const deleteButton = ui.getDeleteButton(); // UIからボタンを取得
        ui.setButtonLoading(deleteButton, true, '削除中...'); // ボタンをローディング状態に

        try {
            await api.deleteCommunity(selectedCommunity.id || selectedCommunity._id);
            ui.alert('コミュニティを削除しました。');
            handleResetCommunityView();
            await handleInitialLoad();
        } catch (error) {
            ui.alert(`削除失敗: ${error.message}`);
        } finally {
            ui.setButtonLoading(deleteButton, false); // ボタンの状態を戻す
            isLoadingData = false;
        }
    }

    async function handleCreateCommunitySubmit(payload, submitButton) {
        if (!currentUser || isLoadingData) return;
        isLoadingData = true;
        ui.showFormMessage('作成中...');
        ui.setButtonLoading(submitButton, true, '作成中...');
        try {
            await api.createCommunity(payload);
            ui.alert('新しいコミュニティを作成しました！');
            ui.closeCreateModal();
            await handleInitialLoad();
        } catch (error) {
            ui.showFormMessage(`作成失敗: ${error.message}`);
        } finally {
            ui.setButtonLoading(submitButton, false);
            isLoadingData = false;
        }
    }

    function handleSendChatMessage() {
        const input = ui.getChatInput();
        const text = input?.value?.trim();
        if (!text) return;
        if (!communityWebSocket || communityWebSocket.readyState !== WebSocket.OPEN) {
             ui.appendSystemMessage('チャットに接続されていません。', 'error');
             return;
        }
        try {
            communityWebSocket.send(JSON.stringify({ type: MSG_TYPE_COMMUNITY_CHAT, text: text }));
            ui.clearChatInput();
        } catch (error) {
             console.error("Error sending chat message:", error);
             ui.appendSystemMessage('メッセージ送信失敗。', 'error');
        }
    }

    async function handleLoginStatusChange(userData) {
        const wasLoggedIn = !!currentUser;
        currentUser = userData;
        ui.updateLoginDependentUI(currentUser);

        // ログイン状態が変わった場合、または初めてロードされた場合はリストを再読み込み
        if ((wasLoggedIn !== !!currentUser) || !currentCommunities.length) {
            await handleInitialLoad();
        }

        // 詳細ビューが開いている場合、その状態も更新
        if (selectedCommunity) {
            await refreshCommunityData(selectedCommunity.id || selectedCommunity._id);
        } else {
             handleResetCommunityView();
        }
    }

    function handleResetCommunityView() {
        selectedCommunity = null;
        disconnectCommunityWebSocket();
        ui.resetCommunityView();
    }

    async function handleShowFullDetails(communityId) {
        isLoadingData = true;
        try {
            const communityData = await api.getCommunityById(communityId);
            const participants = await api.getParticipants(communityId);
            const status = await checkUserStatus(communityData, participants);
            selectedCommunity = communityData; // 選択中のコミュニティを設定

            ui.renderFullCommunityDetail(communityData, participants, status, currentUser);

            if (currentUser && (status.isMember || status.isOrganizer)) {
                ui.clearChatHistory();
                ui.showChatHistoryLoading();
                try {
                    const messages = await api.getChatMessages(communityId);
                    ui.clearChatHistory();
                    if (messages.length === 0) {
                        ui.appendSystemMessage("まだメッセージはありません。", 'info');
                    } else {
                        messages.forEach(msg => ui.appendChatMessage(msg));
                    }
                    ui.scrollToChatBottom(true);
                    connectCommunityWebSocket(communityId);
                } catch (chatError) {
                    ui.clearChatHistory();
                    ui.appendSystemMessage(`チャット履歴の取得エラー: ${chatError.message}`, 'error');
                    disconnectCommunityWebSocket();
                }
            } else {
                disconnectCommunityWebSocket();
                ui.clearChatHistory();
                ui.showChatConnectionMessage(currentUser ? "チャットを利用するにはコミュニティに参加してください。" : "チャットを利用するにはログインして参加してください。");
            }
        } catch (error) {
            ui.alert(`詳細表示エラー: ${error.message}`);
            handleResetCommunityView(); // エラー時はビューをリセット
        } finally {
            isLoadingData = false;
        }
    }

     async function handleShowCardDetails(cardElement, communityId) {
        try {
            const communityData = currentCommunities.find(c => (c.id || c._id) === communityId);
            if (!communityData) throw new Error("コミュニティデータが見つかりません。");
            const participants = await api.getParticipants(communityId);
            const status = await checkUserStatus(communityData, participants);
            ui.renderCardDetails(cardElement, communityData, participants, status, currentUser);
        } catch (error) {
            console.error("Error showing card details:", error);
            // カード内にエラーメッセージを表示するなどの処理も可能
        }
     }


    return {
        registerUI,
        handleInitialLoad,
        handleJoinLeave,
        handleKickParticipant,
        handleDeleteCommunity,
        handleCreateCommunitySubmit,
        handleSendChatMessage,
        handleLoginStatusChange,
        handleResetCommunityView,
        handleShowFullDetails,
        handleShowCardDetails,
        getCurrentUser: () => currentUser,
        getSelectedCommunity: () => selectedCommunity,
        isLoading: () => isLoadingData,
        getCommunityById: (id) => currentCommunities.find(c => (c.id || c._id) === id),
        api,
    };
})();