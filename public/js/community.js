// frontend/community.js

/**
 * Community Page Script
 * Handles fetching, displaying, and interacting with communities and chat.
 */
(async () => {
    // --- Constants ---
    const PLACEHOLDER_AVATAR = 'images/placeholder-avatar.png';
    const MSG_TYPE_SYSTEM = 'system_message';
    const MSG_TYPE_COMMUNITY_CHAT = 'community_chat_message';

    // --- Utility Functions ---
    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, function(match) {
            switch (match) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return match;
            }
        });
    }

    // --- State Management ---
    let currentUser = null;
    let currentCommunities = [];
    let selectedCommunity = null;
    let currentlyOpenCardId = null;
    let participantsCache = new Map();
    let communityWebSocket = null;
    let currentCommunityChatId = null;
    let isLoadingData = false;

    // --- DOM Elements ---
    const getElement = (id) => document.getElementById(id);
    const elements = {
        createCommunityButton: getElement('create-community-button'),
        communityListGrid: getElement('community-list-grid'),
        communityListLoading: getElement('community-list-loading'),
        noCommunitiesMsg: getElement('no-communities-msg'),
        communityDetailSection: getElement('community-detail-section'),
        detailCommunityName: getElement('detail-community-name'),
        detailOrganizer: getElement('detail-organizer'),
        detailOrganizerAvatar: getElement('detail-organizer-avatar'),
        detailParticipantsLimit: getElement('detail-participants-limit'),
        detailDescription: getElement('detail-description'),
        detailJoinPoints: getElement('detail-join-points'),
        joinCommunityButton_Full: getElement('join-community-button'),
        leaveCommunityButton_Full: getElement('leave-community-button'),
        joinStatusMessage_Full: getElement('join-status-message'),
        participantsList_Full: getElement('participants-list'),
        participantsCount_Full: getElement('detail-participants-count'),
        participantsLimitDisplay_Full: getElement('detail-participants-limit-display'),
        closeDetailButton: getElement('close-detail-button'),
        deleteCommunityButton_Full: getElement('delete-community-button'),
        chatMessagesArea_Full: getElement('chat-messages'),
        chatInput_Full: getElement('chat-input'),
        sendChatButton_Full: getElement('send-chat-button'),
        createCommunityModal: getElement('create-community-modal'),
        createCommunityForm: getElement('create-community-form'),
        closeModalButton: getElement('create-community-modal')?.querySelector('.close-modal-button'),
        createFormMessage: getElement('create-form-message'),
    };

    // --- API Service ---
    async function authenticatedFetch(url, options = {}, requiresAuth = true) {
        const headers = { ...options.headers };
        if (requiresAuth) {
            const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
            if (!token) throw new Error('ログインが必要です。');
            headers['Authorization'] = `Bearer ${token}`;
        }
        if (options.body && typeof options.body === 'object') {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        try {
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                let errorData = { message: `Request failed with status ${response.status}` };
                try { errorData = await response.json(); } catch (e) { /* ignore */ }
                const message = errorData.message || `APIリクエスト失敗 (ステータス: ${response.status})`;
                console.error(`API Error (${response.status}) on ${options.method || 'GET'} ${url}:`, message, errorData);
                const error = new Error(message);
                error.status = response.status; error.data = errorData; throw error;
            }
            if (response.status === 204 || response.headers.get('content-length') === '0') return null;
            return response.json();
        } catch (error) {
            console.error(`Network or Fetch Error on ${options.method || 'GET'} ${url}:`, error);
            throw error;
        }
    }

    const api = {
        getCommunities: () => authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities`, {}, false),
        getCommunityById: (id) => authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities/${id}`, {}, false),
        getParticipants: async (id) => {
            if (participantsCache.has(id)) return participantsCache.get(id);
            const participants = await authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities/${id}/participants`, {}, false);
            participantsCache.set(id, participants);
            return participants;
        },
        getChatMessages: (id) => authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities/${id}/chat`),
        createCommunity: (data) => authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities`, { method: 'POST', body: data }),
        joinCommunity: (id) => authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities/${id}/join`, { method: 'POST' }),
        leaveCommunity: (id) => authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities/${id}/leave`, { method: 'POST' }),
        deleteCommunity: (id) => authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities/${id}`, { method: 'DELETE' }),
    };

    // --- UI Rendering Functions ---
    function renderCommunityList(communities) {
        const { communityListGrid, noCommunitiesMsg } = elements;
        if (!communityListGrid || !noCommunitiesMsg) return;
        communityListGrid.innerHTML = '';
        const hasCommunities = communities && communities.length > 0;
        noCommunitiesMsg.style.display = hasCommunities ? 'none' : 'block';
        noCommunitiesMsg.textContent = hasCommunities ? '' : '現在参加可能なコミュニティはありません。';
        if (hasCommunities) {
            communities.forEach(community => {
                const card = createCommunityCardElement(community);
                communityListGrid.appendChild(card);
            });
        }
        setupCommunityCardClickHandlers();
    }

    function createCommunityCardElement(community) {
        const card = document.createElement('div');
        card.classList.add('community-card');
        card.dataset.communityId = community.id || community._id;
        const descriptionSnippet = (community.description || '').substring(0, 50) + ((community.description || '').length > 50 ? '...' : '');
        const currentParticipants = community.currentParticipants ?? 0;
        const participantsLimit = community.participantsLimit ?? '?';

        card.innerHTML = `
            <div class="community-card-main">
                <div class="community-card-header">
                    <h3>${escapeHTML(community.name || '無題')}</h3>
                </div>
                <div class="community-card-body">
                    <div class="organizer-info-card">
                        <img src="${escapeHTML(community.organizerPicture || PLACEHOLDER_AVATAR)}" alt="${escapeHTML(community.organizerName || '作成者')}" class="organizer-avatar-card">
                        <p><strong>作成者:</strong> ${escapeHTML(community.organizerName || '不明')}</p>
                    </div>
                    <p class="description-snippet"><strong>説明:</strong> ${escapeHTML(descriptionSnippet)}</p>
                </div>
                <div class="card-footer">
                    <div class="participants-info">参加者: <span class="count">${currentParticipants}</span> / ${participantsLimit}</div>
                    <button class="button button-secondary card-more-details-button" data-community-id="${community.id || community._id}">詳細を見る</button>
                </div>
            </div>
            <div class="community-card-details" style="display: none;">
                <h4>参加者 (<span class="card-participant-count-detail">${currentParticipants}</span>/<span class="card-participant-limit-detail">${participantsLimit}</span>)</h4>
                <ul class="card-participants-list"><li>読み込み中...</li></ul>
                <div class="card-actions">
                    <span class="card-join-status"></span>
                    <button id="card-join-${community.id || community._id}" class="button button-primary button-stylish card-join-button" data-community-id="${community.id || community._id}" style="display: none;">参加</button>
                    <button id="card-leave-${community.id || community._id}" class="button button-danger card-leave-button" data-community-id="${community.id || community._id}" style="display: none;">脱退</button>
                </div>
            </div>
        `;
        return card;
    }

    async function renderCardDetails(cardElement, communityData) {
        const communityId = communityData.id || communityData._id;
        const detailsArea = cardElement?.querySelector('.community-card-details');
        if (!detailsArea) return;
        const listElement = detailsArea.querySelector('.card-participants-list');
        await renderParticipantsList(listElement, communityId);
        const detailCountSpan = detailsArea.querySelector('.card-participant-count-detail');
        const detailLimitSpan = detailsArea.querySelector('.card-participant-limit-detail');
        if (detailCountSpan) detailCountSpan.textContent = communityData.currentParticipants ?? 0;
        if (detailLimitSpan) detailLimitSpan.textContent = communityData.participantsLimit ?? '?';
        const joinBtnCard = detailsArea.querySelector('.card-join-button');
        const leaveBtnCard = detailsArea.querySelector('.card-leave-button');
        const statusMsgCard = detailsArea.querySelector('.card-join-status');
        if (joinBtnCard && leaveBtnCard && statusMsgCard) {
            const { isMember, canJoin } = await checkUserStatus(communityData);
            updateJoinLeaveButtons(joinBtnCard, leaveBtnCard, statusMsgCard, isMember, canJoin, communityData);
        }
    }

    async function renderFullCommunityDetail(community) {
        const communityId = community.id || community._id;
        const { communityDetailSection } = elements;
        if (!communityDetailSection || !community) return;
        selectedCommunity = community;
        elements.detailCommunityName.textContent = community.name || '無題';
        elements.detailOrganizer.textContent = community.organizerName || '不明';
        elements.detailOrganizerAvatar.src = community.organizerPicture || PLACEHOLDER_AVATAR;
        elements.detailOrganizerAvatar.alt = community.organizerName || '不明';
        elements.detailDescription.textContent = community.description || '説明はありません。';
        elements.detailJoinPoints.textContent = community.joinPoints?.toString() || '0';
        const participantsLimit = community.participantsLimit ?? '?';
        if (elements.detailParticipantsLimit) elements.detailParticipantsLimit.textContent = participantsLimit;
        if (elements.participantsLimitDisplay_Full) elements.participantsLimitDisplay_Full.textContent = participantsLimit;
        await renderParticipantsList(elements.participantsList_Full, communityId);
        await updateDetailViewUI();
        const { isMember, isOrganizer } = await checkUserStatus(selectedCommunity);
        if (currentUser && (isMember || isOrganizer)) {
            await renderChatMessages(communityId);
            connectCommunityWebSocket(communityId);
        } else {
            if (elements.chatMessagesArea_Full) elements.chatMessagesArea_Full.innerHTML = '<p class="notice-text">チャットを利用するにはコミュニティに参加してください。</p>';
            disconnectCommunityWebSocket();
        }
        communityDetailSection.style.display = 'block';
        communityDetailSection.scrollIntoView({ behavior: 'smooth' });
    }

    async function renderParticipantsList(listElement, communityId) {
        if (!listElement) return;
        listElement.innerHTML = '<li>読み込み中...</li>';
        let participantsCount = 0;
        try {
            const participants = await api.getParticipants(communityId);
            participantsCount = participants.length;
            listElement.innerHTML = '';
            if (participants.length > 0) {
                participants.forEach(p => {
                    const li = document.createElement('li');
                    const img = document.createElement('img');
                    img.src = p.picture || PLACEHOLDER_AVATAR;
                    img.alt = p.name || '不明';
                    li.appendChild(img);
                    const link = document.createElement('a');
                    link.href = `mypage.html?userId=${encodeURIComponent(p.sub)}`;
                    link.className = 'user-link';
                    link.textContent = p.name || '不明';
                    li.appendChild(link);
                    listElement.appendChild(li);
                });
            } else {
                listElement.innerHTML = '<li>まだ参加者はいません。</li>';
            }
        } catch (error) {
            listElement.innerHTML = `<li>参加者情報の読み込みエラー</li>`;
        } finally {
            if (listElement === elements.participantsList_Full && elements.participantsCount_Full) {
                elements.participantsCount_Full.textContent = participantsCount;
            }
            const communityIndex = currentCommunities.findIndex(c => (c.id || c._id) === communityId);
            if (communityIndex > -1) {
                currentCommunities[communityIndex].currentParticipants = participantsCount;
            }
        }
    }

    async function renderChatMessages(communityId) {
        const { chatMessagesArea_Full } = elements;
        if (!chatMessagesArea_Full) return;
        chatMessagesArea_Full.innerHTML = '<p class="notice-text">履歴を読み込み中...</p>';
        try {
            const messages = await api.getChatMessages(communityId);
            chatMessagesArea_Full.innerHTML = '';
            if (messages.length > 0) messages.forEach(appendChatMessage);
            else appendSystemMessage('まだメッセージはありません。');
            scrollToChatBottom(true);
        } catch (error) {
            chatMessagesArea_Full.innerHTML = '';
            appendSystemMessage(`履歴の読み込みエラー: ${error.message}`, 'error');
        }
    }

    function appendChatMessage(message) {
        const { chatMessagesArea_Full } = elements;
        if (!chatMessagesArea_Full) return;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');
        const isMyMessage = currentUser && message.senderId === currentUser.sub;
        if (message.type === MSG_TYPE_SYSTEM) {
            messageDiv.classList.add('system-message');
            messageDiv.innerHTML = `<span class="message-text">${escapeHTML(message.text || '')}</span>`;
        } else if (message.type === MSG_TYPE_COMMUNITY_CHAT) {
            messageDiv.classList.add(isMyMessage ? 'own-message' : 'opponent-message');
            const timestamp = message.timestamp ? new Date(message.timestamp) : null;
            const formattedTime = timestamp ? timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            messageDiv.innerHTML = `
                <div class="message-sender">
                    <img src="${escapeHTML(message.senderPicture || PLACEHOLDER_AVATAR)}" alt="${escapeHTML(message.senderName || '不明')}" class="chat-avatar">
                </div>
                <div class="message-content-wrapper">
                    <div class="message-meta">
                        <span class="message-sender-name">${escapeHTML(message.senderName || '不明なユーザー')}</span>
                        <span class="message-timestamp">${formattedTime}</span>
                    </div>
                    <p class="message-text">${escapeHTML(message.text || '')}</p>
                </div>`;
        } else { return; }
        const placeholder = chatMessagesArea_Full.querySelector('.notice-text');
        if (placeholder) placeholder.remove();
        const shouldScroll = chatMessagesArea_Full.scrollTop + chatMessagesArea_Full.clientHeight >= chatMessagesArea_Full.scrollHeight - 50;
        chatMessagesArea_Full.appendChild(messageDiv);
        if (shouldScroll || isMyMessage) scrollToChatBottom();
    }

    function appendSystemMessage(text, type = 'info') {
        appendChatMessage({ type: MSG_TYPE_SYSTEM, text: text, classType: type });
    }

    function scrollToChatBottom(instant = false) {
        const { chatMessagesArea_Full } = elements;
        if (!chatMessagesArea_Full) return;
        setTimeout(() => chatMessagesArea_Full.scrollTo({ top: chatMessagesArea_Full.scrollHeight, behavior: instant ? 'instant' : 'smooth' }), 50);
    }

    function updateJoinLeaveButtons(joinBtn, leaveBtn, statusMsg, isMember, canJoin, communityData) {
        if (!joinBtn || !leaveBtn || !statusMsg || !communityData) return;
        joinBtn.style.display = 'none'; leaveBtn.style.display = 'none'; statusMsg.textContent = '';
        joinBtn.disabled = false; leaveBtn.disabled = false;
        if (currentUser) {
            const isOrganizer = currentUser.sub === communityData.organizerGoogleId;
            if (isMember) {
                statusMsg.textContent = isOrganizer ? '主催者' : '参加中';
                if (!isOrganizer) leaveBtn.style.display = 'inline-block';
            } else if (canJoin) {
                joinBtn.style.display = 'inline-block';
            } else {
                statusMsg.textContent = (communityData.currentParticipants ?? 0) >= communityData.participantsLimit ? '満員' : '参加不可';
            }
        } else {
            statusMsg.textContent = 'ログインして参加';
        }
    }

    function updateLoginDependentUI(userData) {
        const isLoggedIn = !!userData;
        if (elements.createCommunityButton) elements.createCommunityButton.style.display = isLoggedIn ? 'inline-flex' : 'none';
    }

    async function checkUserStatus(communityData) {
        const communityId = communityData?.id || communityData?._id;
        let isMember = false, isOrganizer = false, canJoin = false;
        if (currentUser && communityData) {
            isOrganizer = currentUser.sub === communityData.organizerGoogleId;
            try {
                const participants = await api.getParticipants(communityId);
                if (participants && Array.isArray(participants)) {
                    isMember = participants.some(p => p && p.sub === currentUser.sub);
                    const currentCount = participants.length;
                    const limit = parseInt(communityData.participantsLimit, 10);
                    canJoin = !isMember && !isOrganizer && !isNaN(limit) && currentCount < limit;
                }
            } catch (error) { console.error(`Error fetching participants for ${communityId}:`, error); }
        }
        return { isMember, canJoin, isOrganizer };
    }

    function setButtonLoading(button, isLoading, loadingText = '処理中...') {
        if (!button) return;
        button.disabled = isLoading;
        if (isLoading) {
            button.dataset.originalHTML = button.innerHTML;
            button.innerHTML = `<span class="spinner-small"></span> ${loadingText}`;
        } else {
            if (button.dataset.originalHTML) button.innerHTML = button.dataset.originalHTML;
            delete button.dataset.originalHTML;
        }
    }

    function updateGlobalUserPoints(newPoints) {
        if (typeof window.updateUserPoints === 'function') window.updateUserPoints(newPoints);
    }

    // --- Event Handlers ---
    async function handleInitialLoad() {
        const { communityListLoading, noCommunitiesMsg, communityListGrid } = elements;
        if (!communityListLoading || !noCommunitiesMsg || !communityListGrid) return;
        communityListLoading.style.display = 'block'; noCommunitiesMsg.style.display = 'none'; communityListGrid.innerHTML = '';
        try {
            currentCommunities = await api.getCommunities();
            renderCommunityList(currentCommunities);
        } catch (error) {
            noCommunitiesMsg.textContent = `一覧の読み込みエラー: ${error.message}`; noCommunitiesMsg.style.display = 'block';
        } finally {
            communityListLoading.style.display = 'none';
        }
    }

    async function openCardDetails(cardElement, communityData) {
        const communityId = communityData.id || communityData._id;
        const detailsArea = cardElement?.querySelector('.community-card-details');
        if (detailsArea) {
            detailsArea.style.display = 'block'; cardElement.classList.add('is-open'); currentlyOpenCardId = communityId;
            await renderCardDetails(cardElement, communityData);
        }
    }

    function closeCardDetails(cardElement) {
        const detailsArea = cardElement?.querySelector('.community-card-details');
        if (detailsArea) {
            detailsArea.style.display = 'none'; cardElement.classList.remove('is-open');
            if (currentlyOpenCardId === cardElement.dataset.communityId) currentlyOpenCardId = null;
        }
    }

    async function handleJoinLeave(communityId, isJoining, button, cardElement = null) {
        if (!currentUser || isLoadingData) return;
        isLoadingData = true;
        const actionText = isJoining ? '参加' : '脱退';
        const loadingText = `${actionText}処理中...`;
        const statusElement = cardElement ? cardElement.querySelector('.card-join-status') : elements.joinStatusMessage_Full;
        setButtonLoading(button, true, loadingText);
        if (statusElement) statusElement.textContent = loadingText;
        try {
            const result = isJoining ? await api.joinCommunity(communityId) : await api.leaveCommunity(communityId);
            participantsCache.delete(communityId);
            if (isJoining && result.pointsEarned > 0 && result.currentUserPoints !== undefined) {
                updateGlobalUserPoints(result.currentUserPoints);
                alert(`${actionText}しました！ ${result.pointsEarned}ポイント獲得！`);
            } else {
                alert(`${actionText}しました。`);
            }
            await refreshCommunityData(communityId);
        } catch (error) {
            alert(`${actionText}失敗: ${error.message}`);
            await refreshCommunityData(communityId);
        } finally {
            setButtonLoading(button, false); isLoadingData = false;
        }
    }

    async function handleFullDetailButtonClick(event) {
        const button = event.target.closest('button');
        if (!button || !selectedCommunity || isLoadingData) return;
        const communityId = selectedCommunity.id || selectedCommunity._id;
        if (button === elements.joinCommunityButton_Full) {
            if (!currentUser) { alert("参加するにはログインが必要です。"); return; }
            await handleJoinLeave(communityId, true, button);
        } else if (button === elements.leaveCommunityButton_Full) {
            if (!currentUser) { alert("脱退するにはログインが必要です。"); return; }
            if (currentUser.sub === selectedCommunity.organizerGoogleId) {
                 alert("主催者はコミュニティから脱退できません。削除してください。"); return;
            }
            if (confirm(`「${selectedCommunity.name}」から脱退しますか？`)) {
                await handleJoinLeave(communityId, false, button);
            }
        } else if (button === elements.deleteCommunityButton_Full) {
            await handleDeleteCommunity();
        }
    }

    async function handleDeleteCommunity() {
        if (!selectedCommunity || !currentUser || currentUser.sub !== selectedCommunity.organizerGoogleId || isLoadingData) return;
        if (!confirm(`「${selectedCommunity.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;
        isLoadingData = true;
        const button = elements.deleteCommunityButton_Full;
        setButtonLoading(button, true, '削除中...');
        try {
            await api.deleteCommunity(selectedCommunity.id || selectedCommunity._id);
            alert('コミュニティを削除しました。');
            resetCommunityView();
            await handleInitialLoad();
        } catch (error) {
            alert(`削除失敗: ${error.message}`);
        } finally {
            setButtonLoading(button, false); isLoadingData = false;
        }
    }

    async function handleCreateCommunitySubmit(event) {
        event.preventDefault();
        const { createFormMessage, createCommunityForm, createCommunityModal } = elements;
        if (!createFormMessage || !createCommunityForm || !createCommunityModal || !currentUser || isLoadingData) return;
        createFormMessage.textContent = '';
        const formData = new FormData(createCommunityForm);
        const payload = {
            name: formData.get('communityName')?.trim(),
            description: formData.get('communityDescription')?.trim(),
            participantsLimit: parseInt(formData.get('communityParticipants'), 10)
        };
        if (!payload.name) { createFormMessage.textContent = 'コミュニティ名は必須です。'; return; }
        if (isNaN(payload.participantsLimit) || payload.participantsLimit < 2 || payload.participantsLimit > 24) {
            createFormMessage.textContent = '最大参加人数は2～24の間で設定してください。'; return;
        }
        isLoadingData = true;
        const submitButton = createCommunityForm.querySelector('button[type="submit"]');
        setButtonLoading(submitButton, true, '作成中...');
        createFormMessage.textContent = 'コミュニティを作成中...';
        try {
            await api.createCommunity(payload);
            alert('新しいコミュニティを作成しました！');
            createCommunityModal.style.display = 'none'; createCommunityForm.reset();
            await handleInitialLoad();
        } catch (error) {
            createFormMessage.textContent = `作成失敗: ${error.message}`;
        } finally {
            setButtonLoading(submitButton, false); isLoadingData = false;
        }
    }

    function handleSendChatMessage() {
        const { chatInput_Full } = elements;
        const text = chatInput_Full?.value?.trim();
        if (!text || !currentUser || !selectedCommunity || !communityWebSocket || communityWebSocket.readyState !== WebSocket.OPEN) {
            if (!communityWebSocket || communityWebSocket.readyState !== WebSocket.OPEN) appendSystemMessage('チャットに接続されていません。', 'error');
            return;
        }
        try {
            const messagePayload = { type: MSG_TYPE_COMMUNITY_CHAT, text: text };
            communityWebSocket.send(JSON.stringify(messagePayload));
            chatInput_Full.value = ''; chatInput_Full.focus();
        } catch (error) {
             appendSystemMessage('メッセージの送信に失敗しました。', 'error');
        }
    }

   // --- WebSocket Management ---
    function connectCommunityWebSocket(communityId) {
        if (communityWebSocket && (communityWebSocket.readyState === WebSocket.OPEN || communityWebSocket.readyState === WebSocket.CONNECTING) && currentCommunityChatId === communityId) {
            updateDetailViewUI(); return;
        }
        disconnectCommunityWebSocket();
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!communityId || !token) {
            appendSystemMessage("チャット接続に必要な情報がありません。", 'error'); return;
        }
        currentCommunityChatId = communityId;

        // ▼▼▼ ★★★ この行を以下のように正確に修正してください ★★★ ▼▼▼
        const wsUrl = `${window.MyApp.WEBSOCKET_URL}ws/?token=${token}&communityId=${communityId}`;
        // ▲▲▲ ★★★ 修正箇所ここまで ★★★ ▲▲▲

        console.log("LOCAL_WS_DEBUG: Attempting to connect to (local):", wsUrl); // これはデバッグ用に残しておいてください
        console.log("LOCAL_WS_DEBUG: window.MyApp.WEBSOCKET_URL type:", typeof window.MyApp.WEBSOCKET_URL, "value:", window.MyApp.WEBSOCKET_URL);
        console.log("LOCAL_WS_DEBUG: token type:", typeof token, "value:", token ? token.substring(0,10)+"..." : token);
        console.log("LOCAL_WS_DEBUG: communityId type:", typeof communityId, "value:", communityId);
        
        appendSystemMessage("チャットサーバーに接続中...", 'info');
        try {
            communityWebSocket = new WebSocket(wsUrl);
            // ... (以降の WebSocket イベントハンドラは変更なし) ...
            communityWebSocket.onopen = () => {
                appendSystemMessage("接続しました。", 'info'); updateDetailViewUI();
            };
            communityWebSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === MSG_TYPE_COMMUNITY_CHAT || msg.type === MSG_TYPE_SYSTEM) appendChatMessage(msg);
                    else if (msg.type === 'error') appendSystemMessage(`サーバーエラー: ${msg.message || '不明なエラー'}`, 'error');
                } catch (e) { console.error("WS message parse error:", e); }
            };
            communityWebSocket.onerror = (error) => {
                if (currentCommunityChatId === communityId) {
                    appendSystemMessage('チャット接続エラーが発生しました。', 'error');
                    communityWebSocket = null; currentCommunityChatId = null; updateDetailViewUI();
                }
            };
            communityWebSocket.onclose = (event) => {
                if (currentCommunityChatId === communityId) {
                    const message = event.code === 1000 ? 'チャットから切断されました。' : `チャット接続が切れました (Code: ${event.code})。`;
                    const messageType = event.code === 1000 ? 'info' : 'error';
                    if (elements.communityDetailSection.style.display !== 'none' && selectedCommunity && (selectedCommunity.id || selectedCommunity._id) === communityId) {
                        appendSystemMessage(message, messageType);
                        if (event.code === 1008) appendSystemMessage("他の場所で接続中のため、ここではチャットを開始できません。", "warning");
                    }
                    communityWebSocket = null; currentCommunityChatId = null; updateDetailViewUI();
                }
            };
        } catch (error) {
            appendSystemMessage("チャットサーバーへの接続に失敗しました。", 'error');
            currentCommunityChatId = null; updateDetailViewUI();
        }
    }

    function disconnectCommunityWebSocket() {
        if (communityWebSocket) {
            communityWebSocket.onopen = null; communityWebSocket.onmessage = null;
            communityWebSocket.onerror = null; communityWebSocket.onclose = null;
            if (communityWebSocket.readyState === WebSocket.OPEN || communityWebSocket.readyState === WebSocket.CONNECTING) {
                communityWebSocket.close(1000, "Client initiated disconnect");
            }
            communityWebSocket = null; currentCommunityChatId = null;
            if (elements.chatInput_Full) elements.chatInput_Full.disabled = true;
            if (elements.sendChatButton_Full) elements.sendChatButton_Full.disabled = true;
        }
    }

    async function handleLoginStatusChange(userData) {
        const previousUser = currentUser; currentUser = userData;
        updateLoginDependentUI(currentUser);
        await handleInitialLoad();
        if (!currentUser && previousUser) resetCommunityView();
        else if (currentUser && selectedCommunity) {
            try {
                isLoadingData = true;
                const freshData = currentCommunities.find(c => (c.id || c._id) === (selectedCommunity.id || selectedCommunity._id));
                if (freshData) {
                    selectedCommunity = freshData;
                    participantsCache.delete(selectedCommunity.id || selectedCommunity._id);
                    await updateDetailViewUI();
                    const { isMember, isOrganizer } = await checkUserStatus(selectedCommunity);
                    if (isMember || isOrganizer) connectCommunityWebSocket(selectedCommunity.id || selectedCommunity._id);
                    else disconnectCommunityWebSocket();
                } else { resetCommunityView(); }
            } catch (error) { resetCommunityView();
            } finally { isLoadingData = false; }
        }
    }

    function resetCommunityView() {
        if (elements.communityDetailSection) elements.communityDetailSection.style.display = 'none';
        selectedCommunity = null; disconnectCommunityWebSocket(); isLoadingData = false;
        setButtonLoading(elements.joinCommunityButton_Full, false);
        setButtonLoading(elements.leaveCommunityButton_Full, false);
        setButtonLoading(elements.deleteCommunityButton_Full, false);
        setButtonLoading(elements.createCommunityButton, false);
    }

    async function refreshCommunityData(communityId) {
        if (isLoadingData) return; isLoadingData = true;
        try {
            await handleInitialLoad();
            if (selectedCommunity && (selectedCommunity.id || selectedCommunity._id) === communityId) {
                const updatedDetail = currentCommunities.find(c => (c.id || c._id) === communityId);
                if (updatedDetail) {
                    selectedCommunity = updatedDetail;
                    participantsCache.delete(communityId);
                    await renderParticipantsList(elements.participantsList_Full, communityId);
                    await updateDetailViewUI();
                    const { isMember, isOrganizer } = await checkUserStatus(selectedCommunity);
                     if (currentUser && (isMember || isOrganizer)) connectCommunityWebSocket(communityId);
                     else disconnectCommunityWebSocket();
                } else { resetCommunityView(); }
            }
        } catch (error) { console.error("Error refreshing data:", error);
        } finally { isLoadingData = false; }
    }

    async function updateDetailViewUI() {
        if (!selectedCommunity) return;
        const { isMember, canJoin, isOrganizer } = await checkUserStatus(selectedCommunity);
        updateJoinLeaveButtons(elements.joinCommunityButton_Full, elements.leaveCommunityButton_Full, elements.joinStatusMessage_Full, isMember, canJoin, selectedCommunity);
        if (elements.deleteCommunityButton_Full) elements.deleteCommunityButton_Full.style.display = currentUser && isOrganizer ? 'inline-block' : 'none';
        const canUseChat = currentUser && (isMember || isOrganizer);
        if (elements.chatInput_Full) {
            elements.chatInput_Full.disabled = !canUseChat;
            elements.chatInput_Full.placeholder = canUseChat ? "メッセージを入力" : (currentUser ? "参加者のみチャット可能" : "ログインが必要です");
        }
        if (elements.sendChatButton_Full) elements.sendChatButton_Full.disabled = !canUseChat;
    }

    function initializePage() {
        if (typeof window.registerUserDataReadyCallback === 'function') {
            window.registerUserDataReadyCallback(async (userData) => {
                currentUser = userData; updateLoginDependentUI(currentUser); await handleInitialLoad();
            });
        } else {
            updateLoginDependentUI(null);
            if(elements.noCommunitiesMsg) { elements.noCommunitiesMsg.textContent = 'ページ読込失敗。script.js確認。'; elements.noCommunitiesMsg.style.display = 'block';}
            if(elements.communityListLoading) elements.communityListLoading.style.display = 'none';
            handleInitialLoad();
        }
        if (typeof window.onLoginStatusChange === 'function') window.onLoginStatusChange(handleLoginStatusChange);
        elements.createCommunityButton?.addEventListener('click', () => {
            if (!currentUser) { alert("コミュニティ作成にはログインが必要です。"); return; }
            if (elements.createCommunityModal) {
                elements.createCommunityModal.style.display = 'flex';
                elements.createFormMessage.textContent = ''; elements.createCommunityForm?.reset();
            }
        });
        elements.closeModalButton?.addEventListener('click', () => { if (elements.createCommunityModal) elements.createCommunityModal.style.display = 'none'; });
        elements.createCommunityForm?.addEventListener('submit', handleCreateCommunitySubmit);
        elements.closeDetailButton?.addEventListener('click', resetCommunityView);
        elements.joinCommunityButton_Full?.addEventListener('click', handleFullDetailButtonClick);
        elements.leaveCommunityButton_Full?.addEventListener('click', handleFullDetailButtonClick);
        elements.deleteCommunityButton_Full?.addEventListener('click', handleFullDetailButtonClick);
        elements.sendChatButton_Full?.addEventListener('click', handleSendChatMessage);
        elements.chatInput_Full?.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !elements.chatInput_Full.disabled) {
                event.preventDefault(); handleSendChatMessage();
            }
        });
        window.addEventListener('click', (event) => { if (event.target === elements.createCommunityModal) elements.createCommunityModal.style.display = 'none'; });
        window.addEventListener('beforeunload', disconnectCommunityWebSocket);
        setupCommunityCardClickHandlers(); // 初期リスナー設定
    }

    function setupCommunityCardClickHandlers() {
        if (!elements.communityListGrid) return;
        elements.communityListGrid.removeEventListener('click', handleGridClick); // 重複防止
        elements.communityListGrid.addEventListener('click', handleGridClick);
    }

    async function handleGridClick(event) {
        const card = event.target.closest('.community-card');
        if (!card) return;
        const button = event.target.closest('button');
        const link = event.target.closest('a');
        const communityId = card.dataset.communityId;
        if (button) await handleCardButtonClickActions(button, card, communityId);
        else if (!link) await handleCardBodyClickActions(card, communityId);
    }

    async function handleCardButtonClickActions(button, card, communityId) {
        if (!communityId) return;
        const communityData = currentCommunities.find(c => (c.id || c._id) === communityId);
        if (!communityData) return;
        if (button.classList.contains('card-join-button')) {
            if (!currentUser) { alert("参加するにはログインが必要です。"); return; }
            await handleJoinLeave(communityId, true, button, card);
        } else if (button.classList.contains('card-leave-button')) {
            if (!currentUser) { alert("脱退するにはログインが必要です。"); return; }
            if (currentUser.sub === communityData.organizerGoogleId) {
                 alert("主催者は脱退できません。削除してください。"); return;
            }
            if (confirm(`「${communityData.name}」から脱退しますか？`)) {
                await handleJoinLeave(communityId, false, button, card);
            }
        } else if (button.classList.contains('card-more-details-button')) {
            try {
                isLoadingData = true;
                const freshData = await api.getCommunityById(communityId);
                if (freshData) {
                    await renderFullCommunityDetail(freshData);
                    if (card) closeCardDetails(card);
                } else {
                    alert("コミュニティが見つかりません。"); await handleInitialLoad();
                }
            } catch (error) { alert(`詳細表示エラー: ${error.message}`);
            } finally { isLoadingData = false; }
        }
    }

    async function handleCardBodyClickActions(card, communityId) {
        const isOpen = card.classList.contains('is-open');
        if (isOpen) closeCardDetails(card);
        else {
            const communityData = currentCommunities.find(c => (c.id || c._id) === communityId);
            if (communityData) {
                if (currentlyOpenCardId && currentlyOpenCardId !== communityId) {
                    const previouslyOpenCard = elements.communityListGrid?.querySelector(`.community-card.is-open`);
                    if (previouslyOpenCard) closeCardDetails(previouslyOpenCard);
                }
                openCardDetails(card, communityData);
            }
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePage);
    else initializePage();
})();