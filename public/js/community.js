// frontend/community.js

/**
 * Community Page Script
 * Handles fetching, displaying, and interacting with communities and chat.
 */
(async () => {
    // --- Constants ---
    const PLACEHOLDER_AVATAR = 'images/placeholder-avatar.png'; // 実際のパスに置き換えてください
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
        detailParticipantsLimit: getElement('detail-participants-limit'), // これはcard内かfull detailか確認
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
    // authenticatedFetch は mypage.js から流用または共通化されている想定
    async function authenticatedFetch(url, options = {}, requiresAuth = true) {
        const headers = { ...options.headers };
        if (requiresAuth) {
            const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
            if (!token && requiresAuth) { // requiresAuthがtrueの場合のみトークン必須
                console.error("Authentication token is missing for a protected route.");
                throw new Error('ログインが必要です。');
            }
            if(token) headers['Authorization'] = `Bearer ${token}`;
        }

        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(options.body);
        }
        // FormDataの場合はContent-Typeを設定しない（ブラウザが自動設定）

        try {
            const response = await fetch(url, { ...options, headers });
            if (!response.ok) {
                let errorData = { message: `Request failed with status ${response.status}` };
                try { errorData = await response.json(); } catch (e) { /* ignore if response is not json */ }
                const message = errorData.message || `APIリクエスト失敗 (ステータス: ${response.status})`;
                console.error(`API Error (${response.status}) on ${options.method || 'GET'} ${url}:`, message, errorData);
                const error = new Error(message);
                error.status = response.status; error.data = errorData; throw error;
            }
            if (response.status === 204 || response.headers.get('content-length') === '0') {
                return null; // No content to parse
            }
            return response.json();
        } catch (error) {
            // fetch自体が失敗した場合 (ネットワークエラーなど)
            console.error(`Network or Fetch Error on ${options.method || 'GET'} ${url}:`, error);
            throw error; // 再スローして呼び出し元で処理
        }
    }
    // グローバルスコープにauthenticatedFetchを公開 (mypage.jsと共通化する場合)
    if (typeof window.authenticatedFetch === 'undefined') {
        window.authenticatedFetch = authenticatedFetch;
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
        getChatMessages: (id) => authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/communities/${id}/chat`), // Requires auth
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
        await renderParticipantsList(listElement, communityId); // Await this
        const detailCountSpan = detailsArea.querySelector('.card-participant-count-detail');
        const detailLimitSpan = detailsArea.querySelector('.card-participant-limit-detail');
        // currentParticipants は communityData から取得するのではなく、renderParticipantsListの結果で更新する
        const fetchedParticipants = participantsCache.get(communityId) || [];
        if (detailCountSpan) detailCountSpan.textContent = fetchedParticipants.length;
        if (detailLimitSpan) detailLimitSpan.textContent = communityData.participantsLimit ?? '?';

        const joinBtnCard = detailsArea.querySelector('.card-join-button');
        const leaveBtnCard = detailsArea.querySelector('.card-leave-button');
        const statusMsgCard = detailsArea.querySelector('.card-join-status');

        if (joinBtnCard && leaveBtnCard && statusMsgCard) {
            const { isMember, canJoin } = await checkUserStatus(communityData, fetchedParticipants);
            updateJoinLeaveButtons(joinBtnCard, leaveBtnCard, statusMsgCard, isMember, canJoin, communityData);
        }
    }

    async function renderFullCommunityDetail(community) {
        const communityId = community.id || community._id;
        const { communityDetailSection } = elements;
        if (!communityDetailSection || !community) return;

        selectedCommunity = community; // Update selected community

        elements.detailCommunityName.textContent = community.name || '無題';
        elements.detailOrganizer.textContent = community.organizerName || '不明';
        elements.detailOrganizerAvatar.src = community.organizerPicture || PLACEHOLDER_AVATAR;
        elements.detailOrganizerAvatar.alt = community.organizerName || '不明';
        elements.detailDescription.textContent = community.description || '説明はありません。';
        elements.detailJoinPoints.textContent = community.joinPoints?.toString() || '0';

        const participantsLimit = community.participantsLimit ?? '?';
        if (elements.detailParticipantsLimit) elements.detailParticipantsLimit.textContent = participantsLimit; // This ID seems unused in HTML
        if (elements.participantsLimitDisplay_Full) elements.participantsLimitDisplay_Full.textContent = participantsLimit;

        await renderParticipantsList(elements.participantsList_Full, communityId);
        await updateDetailViewUI(); // This will check status and update buttons

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
            participantsCount = participants.length; // Actual count from fetched data
            listElement.innerHTML = ''; // Clear "読み込み中..."
            if (participants.length > 0) {
                participants.forEach(p => {
                    const li = document.createElement('li');
                    const img = document.createElement('img');
                    img.src = p.picture || PLACEHOLDER_AVATAR;
                    img.alt = p.name || '不明';
                    img.onerror = () => { img.src = PLACEHOLDER_AVATAR; };
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
            console.error(`Error rendering participants for ${communityId}:`, error);
            listElement.innerHTML = `<li>参加者情報の読み込みエラー</li>`;
        } finally {
            // Update count in the full detail view if it's that list
            if (listElement === elements.participantsList_Full && elements.participantsCount_Full) {
                elements.participantsCount_Full.textContent = participantsCount;
            }
            // Update currentParticipants in currentCommunities array
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
            chatMessagesArea_Full.innerHTML = ''; // Clear loading message
            if (messages.length > 0) {
                messages.forEach(appendChatMessage);
            } else {
                appendSystemMessage('まだメッセージはありません。');
            }
            scrollToChatBottom(true); // Scroll after messages are rendered
        } catch (error) {
            chatMessagesArea_Full.innerHTML = ''; // Clear loading message on error too
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
                    <img src="${escapeHTML(message.senderPicture || PLACEHOLDER_AVATAR)}" alt="${escapeHTML(message.senderName || '不明')}" class="chat-avatar" onerror="this.src='${PLACEHOLDER_AVATAR}'">
                </div>
                <div class="message-content-wrapper">
                    <div class="message-meta">
                        <span class="message-sender-name">${escapeHTML(message.senderName || '不明なユーザー')}</span>
                        <span class="message-timestamp">${formattedTime}</span>
                    </div>
                    <p class="message-text">${escapeHTML(message.text || '')}</p>
                </div>`;
        } else {
            // Unknown message type, skip
            return;
        }

        const placeholder = chatMessagesArea_Full.querySelector('.notice-text');
        if (placeholder) {
            placeholder.remove();
        }

        const shouldScroll = chatMessagesArea_Full.scrollTop + chatMessagesArea_Full.clientHeight >= chatMessagesArea_Full.scrollHeight - 50; // Check before appending
        chatMessagesArea_Full.appendChild(messageDiv);

        if (shouldScroll || isMyMessage) { // Scroll if user was at bottom or it's their own message
            scrollToChatBottom();
        }
    }

    function appendSystemMessage(text, type = 'info') { // type can be 'info', 'error', 'warning'
        appendChatMessage({ type: MSG_TYPE_SYSTEM, text: text, classType: type });
    }

    function scrollToChatBottom(instant = false) {
        const { chatMessagesArea_Full } = elements;
        if (!chatMessagesArea_Full) return;
        // Timeout gives the browser a moment to render the new message before scrolling
        setTimeout(() => {
            chatMessagesArea_Full.scrollTo({
                top: chatMessagesArea_Full.scrollHeight,
                behavior: instant ? 'instant' : 'smooth'
            });
        }, 50);
    }


    function updateJoinLeaveButtons(joinBtn, leaveBtn, statusMsg, isMember, canJoin, communityData) {
        if (!joinBtn || !leaveBtn || !statusMsg || !communityData) return;

        joinBtn.style.display = 'none';
        leaveBtn.style.display = 'none';
        statusMsg.textContent = '';
        joinBtn.disabled = false; // Enable by default, then disable if needed
        leaveBtn.disabled = false;

        if (currentUser) {
            const isOrganizer = currentUser.sub === communityData.organizerGoogleId;
            if (isMember) {
                statusMsg.textContent = isOrganizer ? '主催者' : '参加中';
                if (!isOrganizer) {
                    leaveBtn.style.display = 'inline-block';
                }
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
        if (elements.createCommunityButton) {
            elements.createCommunityButton.style.display = isLoggedIn ? 'inline-flex' : 'none';
        }
    }

    async function checkUserStatus(communityData, prefetchedParticipants = null) {
        const communityId = communityData?.id || communityData?._id;
        let isMember = false;
        let isOrganizer = false;
        let canJoin = false;

        if (currentUser && communityData) {
            isOrganizer = currentUser.sub === communityData.organizerGoogleId;
            try {
                const participants = prefetchedParticipants || await api.getParticipants(communityId);
                if (participants && Array.isArray(participants)) {
                    isMember = participants.some(p => p && p.sub === currentUser.sub);
                    const currentCount = participants.length; // Use actual fetched count
                    const limit = parseInt(communityData.participantsLimit, 10);
                    canJoin = !isMember && !isOrganizer && !isNaN(limit) && currentCount < limit;
                }
            } catch (error) {
                console.error(`Error checking user status for community ${communityId}:`, error);
                // Default to cannot join if participant fetch fails
            }
        }
        return { isMember, canJoin, isOrganizer };
    }


    function setButtonLoading(button, isLoading, loadingText = '処理中...') {
        if (!button) return;
        button.disabled = isLoading;
        if (isLoading) {
            button.dataset.originalHTML = button.innerHTML; // Store original content
            button.innerHTML = `<span class="spinner-small"></span> ${escapeHTML(loadingText)}`;
        } else {
            if (button.dataset.originalHTML) { // Restore original content
                button.innerHTML = button.dataset.originalHTML;
            }
            // If no originalHTML was stored (e.g. button had no text initially),
            // you might need a default text. For now, this handles restoration.
            delete button.dataset.originalHTML;
        }
    }

    function updateGlobalUserPoints(newPoints) {
        if (currentUser && typeof window.updateUserPoints === 'function') {
            currentUser.points = newPoints; // Update local currentUser state too
            window.updateUserPoints(newPoints); // Update header/global display
        }
         if (window.MyApp?.currentUserData) { // Update global MyApp state if used
            window.MyApp.currentUserData.points = newPoints;
            if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
        }
    }

    // --- Event Handlers ---
    async function handleInitialLoad() {
        const { communityListLoading, noCommunitiesMsg, communityListGrid } = elements;
        if (!communityListLoading || !noCommunitiesMsg || !communityListGrid) return;

        communityListLoading.style.display = 'block';
        noCommunitiesMsg.style.display = 'none';
        communityListGrid.innerHTML = '';

        try {
            currentCommunities = await api.getCommunities();
            renderCommunityList(currentCommunities);
        } catch (error) {
            console.error("Error fetching initial community list:", error);
            noCommunitiesMsg.textContent = `コミュニティ一覧の読み込みに失敗しました: ${error.message}`;
            noCommunitiesMsg.style.display = 'block';
        } finally {
            communityListLoading.style.display = 'none';
        }
    }


    async function openCardDetails(cardElement, communityData) {
        const communityId = communityData.id || communityData._id;
        const detailsArea = cardElement?.querySelector('.community-card-details');
        if (detailsArea) {
            detailsArea.style.display = 'block';
            cardElement.classList.add('is-open');
            currentlyOpenCardId = communityId;
            await renderCardDetails(cardElement, communityData); // This will fetch and render participants
        }
    }

    function closeCardDetails(cardElement) {
        const detailsArea = cardElement?.querySelector('.community-card-details');
        if (detailsArea) {
            detailsArea.style.display = 'none';
            cardElement.classList.remove('is-open');
            if (currentlyOpenCardId === cardElement.dataset.communityId) {
                currentlyOpenCardId = null;
            }
        }
    }

    // ★★★ ここから修正 ★★★
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
            participantsCache.delete(communityId); // 参加者情報が変わるのでキャッシュをクリア

            if (isJoining) {
                // バックエンドからのレスポンスメッセージを優先的に使用
                let successMessage = result?.message || `${actionText}しました。`;
                if (result?.pointsEarned > 0 && result?.currentUserPoints !== undefined) {
                    updateGlobalUserPoints(result.currentUserPoints); // グローバルなポイント表示を更新
                    successMessage += ` ${result.pointsEarned}ポイント獲得！`;
                }
                alert(successMessage + "\nページを更新します。");
                window.location.reload(); // ★★★ 参加成功時にページをリロード ★★★
            } else { // 脱退の場合
                alert(result?.message || `${actionText}しました。`);
                // 脱退後はリロードせずにUIを更新 (またはリロードしても良い)
                await refreshCommunityData(communityId);
            }

        } catch (error) {
            alert(`${actionText}に失敗しました: ${error.message || '不明なエラー'}`);
            // エラー時もUIを現在の状態に更新した方が良い場合がある
            if (cardElement || elements.communityDetailSection.style.display === 'block') {
                 await refreshCommunityData(communityId); // UIを最新の状態に戻す試み
            }
        } finally {
            setButtonLoading(button, false); // ボタンのローディング状態を解除
            isLoadingData = false;
        }
    }
    // ★★★ ここまで修正 ★★★


    async function handleFullDetailButtonClick(event) {
        const button = event.target.closest('button');
        if (!button || !selectedCommunity || isLoadingData) return;

        const communityId = selectedCommunity.id || selectedCommunity._id;

        if (button === elements.joinCommunityButton_Full) {
            if (!currentUser) { alert("参加するにはログインが必要です。"); return; }
            await handleJoinLeave(communityId, true, button);
        } else if (button === elements.leaveCommunityButton_Full) {
            if (!currentUser) { alert("脱退するにはログインが必要です。"); return; }
             if (currentUser.sub === selectedCommunity.organizerGoogleId) { // 主催者チェック
                 alert("主催者はコミュニティから脱退できません。コミュニティの削除をご検討ください。");
                 return;
            }
            if (confirm(`「${escapeHTML(selectedCommunity.name)}」から脱退しますか？`)) {
                await handleJoinLeave(communityId, false, button);
            }
        } else if (button === elements.deleteCommunityButton_Full) {
            await handleDeleteCommunity();
        }
    }

    async function handleDeleteCommunity() {
        if (!selectedCommunity || !currentUser || currentUser.sub !== selectedCommunity.organizerGoogleId || isLoadingData) return;

        if (!confirm(`「${escapeHTML(selectedCommunity.name)}」を削除しますか？\nこの操作は元に戻せません。`)) return;
        isLoadingData = true;
        const button = elements.deleteCommunityButton_Full;
        setButtonLoading(button, true, '削除中...');

        try {
            await api.deleteCommunity(selectedCommunity.id || selectedCommunity._id);
            alert('コミュニティを削除しました。');
            resetCommunityView(); // 詳細ビューを閉じる
            await handleInitialLoad(); // コミュニティリストを再読み込み
        } catch (error) {
            alert(`コミュニティの削除に失敗しました: ${error.message}`);
        } finally {
            setButtonLoading(button, false);
            isLoadingData = false;
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

        // Basic validation
        if (!payload.name) { createFormMessage.textContent = 'コミュニティ名は必須です。'; return; }
        if (payload.name.length > 50) { createFormMessage.textContent = 'コミュニティ名は50文字以内です。'; return; }
        if (payload.description && payload.description.length > 200) { createFormMessage.textContent = '説明は200文字以内です。'; return; }
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
            createCommunityModal.style.display = 'none';
            createCommunityForm.reset();
            await handleInitialLoad(); // Refresh the list
        } catch (error) {
            createFormMessage.textContent = `コミュニティの作成に失敗しました: ${error.message}`;
        } finally {
            setButtonLoading(submitButton, false);
            isLoadingData = false;
        }
    }

    function handleSendChatMessage() {
        const { chatInput_Full } = elements;
        const text = chatInput_Full?.value?.trim();
        if (!text || !currentUser || !selectedCommunity || !communityWebSocket || communityWebSocket.readyState !== WebSocket.OPEN) {
            if (!communityWebSocket || communityWebSocket.readyState !== WebSocket.OPEN) {
                appendSystemMessage('チャットに接続されていません。', 'error');
            }
            return;
        }
        try {
            const messagePayload = { type: MSG_TYPE_COMMUNITY_CHAT, text: text };
            communityWebSocket.send(JSON.stringify(messagePayload));
            chatInput_Full.value = '';
            chatInput_Full.focus(); // Re-focus after sending
        } catch (error) {
             console.error("Error sending chat message via WebSocket:", error);
             appendSystemMessage('メッセージの送信に失敗しました。接続を確認してください。', 'error');
        }
    }

    // --- WebSocket Management ---
    function connectCommunityWebSocket(communityId) {
        if (communityWebSocket && (communityWebSocket.readyState === WebSocket.OPEN || communityWebSocket.readyState === WebSocket.CONNECTING) && currentCommunityChatId === communityId) {
            updateDetailViewUI(); // Ensure UI is correct for existing connection
            return;
        }
        disconnectCommunityWebSocket(); // Disconnect any existing connection

        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!communityId || !token) {
            appendSystemMessage("チャット接続に必要な情報がありません（トークンまたはコミュニティIDなし）。", 'error');
            updateDetailViewUI(); // Update UI to reflect no connection
            return;
        }
        currentCommunityChatId = communityId; // Set before attempting connection

        let baseUrl = window.MyApp.WEBSOCKET_URL;
        let path = "";
        if (baseUrl && !baseUrl.endsWith('/')) baseUrl += '/';
        if (window.location.hostname === 'www.mariokartbestrivals.com' || window.location.hostname === 'mariokartbestrivals.com') {
            path = "ws/";
        }
        if (!baseUrl || (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://'))) {
            appendSystemMessage('無効なWebSocket URLです。 ws:// または wss:// で始まる必要があります。', 'error');
            currentCommunityChatId = null; updateDetailViewUI(); return;
        }
        const wsUrl = `${baseUrl}${path}?token=${token}&communityId=${communityId}`;

        appendSystemMessage("チャットサーバーに接続中...", 'info');
        try {
            communityWebSocket = new WebSocket(wsUrl);
            communityWebSocket.onopen = () => {
                appendSystemMessage("接続しました。", 'info');
                updateDetailViewUI();
            };
            communityWebSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === MSG_TYPE_COMMUNITY_CHAT || msg.type === MSG_TYPE_SYSTEM) {
                        appendChatMessage(msg);
                    } else if (msg.type === 'error') { // Server-side application error
                        appendSystemMessage(`サーバーエラー: ${msg.message || '不明なエラー'}`, 'error');
                    } else {
                        console.warn("Unknown WS message type received:", msg);
                    }
                } catch (e) { console.error("WS message parse error:", e); appendSystemMessage('受信メッセージの解析エラー。', 'error');}
            };
            communityWebSocket.onerror = (errorEvent) => {
                // This usually means the connection couldn't be established or a low-level error occurred
                console.error("WebSocket Error:", errorEvent);
                if (currentCommunityChatId === communityId) { // Check if this error is for the current attempt
                    appendSystemMessage('チャット接続エラーが発生しました。', 'error');
                    communityWebSocket = null; currentCommunityChatId = null; updateDetailViewUI();
                }
            };
            communityWebSocket.onclose = (event) => {
                if (currentCommunityChatId === communityId) { // Only process if it's the current chat
                    const message = event.code === 1000 ? 'チャットから切断されました。' : `チャット接続が切れました (Code: ${event.code})。`;
                    const messageType = event.code === 1000 ? 'info' : 'error';
                    // Only show message if the detail view for this community is still open
                    if (elements.communityDetailSection.style.display !== 'none' && selectedCommunity && (selectedCommunity.id || selectedCommunity._id) === communityId) {
                        appendSystemMessage(message, messageType);
                        if (event.code === 1008) { // Policy Violation
                             appendSystemMessage("他の場所で同じコミュニティチャットに接続中のため、ここではチャットを開始できません。", "warning");
                        }
                    }
                    communityWebSocket = null; currentCommunityChatId = null; updateDetailViewUI();
                }
            };
        } catch (error) { // Error creating WebSocket object itself
            console.error("Error initializing WebSocket:", error);
            appendSystemMessage("チャットサーバーへの接続準備に失敗しました。", 'error');
            currentCommunityChatId = null; updateDetailViewUI();
        }
    }

    function disconnectCommunityWebSocket() {
        if (communityWebSocket) {
            communityWebSocket.onopen = null;
            communityWebSocket.onmessage = null;
            communityWebSocket.onerror = null;
            communityWebSocket.onclose = null; // Prevent onclose logic from running for an explicit disconnect
            if (communityWebSocket.readyState === WebSocket.OPEN || communityWebSocket.readyState === WebSocket.CONNECTING) {
                communityWebSocket.close(1000, "Client initiated disconnect"); // Normal closure
            }
            communityWebSocket = null;
        }
        currentCommunityChatId = null; // Always clear this
        // Update UI elements that depend on WebSocket state
        if (elements.chatInput_Full) {
            elements.chatInput_Full.disabled = true;
            elements.chatInput_Full.placeholder = "チャットは利用できません";
        }
        if (elements.sendChatButton_Full) {
            elements.sendChatButton_Full.disabled = true;
        }
    }

    // --- Initialization and Event Binding ---
    async function handleLoginStatusChange(userData) {
        const previousUserSub = currentUser?.sub;
        currentUser = userData;
        updateLoginDependentUI(currentUser);

        // ユーザーが変更された場合、または初回ロード時にコミュニティリストを更新
        if (!previousUserSub && currentUser || (previousUserSub && !currentUser) || (previousUserSub !== currentUser?.sub) ) {
            await handleInitialLoad(); // Fetch all communities again
        }

        // 詳細ビューが開いている場合、その表示を更新
        if (selectedCommunity) {
            // selectedCommunityが最新のリストにまだ存在するか確認
            const stillExists = currentCommunities.some(c => (c.id || c._id) === (selectedCommunity.id || selectedCommunity._id));
            if (stillExists) {
                // コミュニティデータ自体は currentCommunities から最新版を取得できるが、
                // 参加者リストやチャットはログイン状態によって再取得・再接続が必要
                const communityId = selectedCommunity.id || selectedCommunity._id;
                isLoadingData = true;
                try {
                    // participantsCache.delete(communityId); // ログイン状態が変わったので参加者キャッシュをクリア
                    // await renderParticipantsList(elements.participantsList_Full, communityId); // 再描画
                    await updateDetailViewUI(); // ボタン状態などを更新

                    const { isMember, isOrganizer } = await checkUserStatus(selectedCommunity);
                    if (currentUser && (isMember || isOrganizer)) {
                        if (elements.chatMessagesArea_Full.innerHTML.includes("参加してください") || elements.chatMessagesArea_Full.innerHTML.includes("ログインが必要です")) {
                           await renderChatMessages(communityId); // チャット履歴再取得
                        }
                        connectCommunityWebSocket(communityId); // WebSocket再接続
                    } else {
                        disconnectCommunityWebSocket();
                        if(elements.chatMessagesArea_Full) elements.chatMessagesArea_Full.innerHTML = '<p class="notice-text">チャットを利用するにはコミュニティに参加してください。</p>';
                    }
                } catch (error) {
                    console.error("Error updating detail view on login change:", error);
                    resetCommunityView(); // 問題があればビューをリセット
                } finally {
                    isLoadingData = false;
                }
            } else {
                resetCommunityView(); // 選択されていたコミュニティがリストから消えた
            }
        } else {
            resetCommunityView();
        }
    }


    function resetCommunityView() {
        if (elements.communityDetailSection) elements.communityDetailSection.style.display = 'none';
        selectedCommunity = null;
        disconnectCommunityWebSocket();
        isLoadingData = false; // Reset loading flag

        // Reset button states if they exist
        setButtonLoading(elements.joinCommunityButton_Full, false);
        setButtonLoading(elements.leaveCommunityButton_Full, false);
        setButtonLoading(elements.deleteCommunityButton_Full, false);
        // createCommunityButton loading state is handled in its own submit handler
    }

    async function refreshCommunityData(communityId) {
        if (isLoadingData) return;
        isLoadingData = true;

        try {
            // 1. コミュニティリスト全体を再取得して currentCommunities を更新
            currentCommunities = await api.getCommunities();
            renderCommunityList(currentCommunities); // リストを再描画 (カードの参加人数なども更新される)

            // 2. もし詳細ビューが開かれていて、それが対象のコミュニティなら、詳細ビューも更新
            if (selectedCommunity && (selectedCommunity.id || selectedCommunity._id) === communityId) {
                const updatedCommunityData = currentCommunities.find(c => (c.id || c._id) === communityId);
                if (updatedCommunityData) {
                    selectedCommunity = updatedCommunityData; // 選択中のコミュニティデータを最新に
                    participantsCache.delete(communityId); // 参加者キャッシュをクリア
                    await renderParticipantsList(elements.participantsList_Full, communityId); // 詳細ビューの参加者リストを更新
                    await updateDetailViewUI(); // 詳細ビューのボタンやチャット状態を更新

                    const { isMember, isOrganizer } = await checkUserStatus(selectedCommunity);
                     if (currentUser && (isMember || isOrganizer)) {
                         connectCommunityWebSocket(communityId); // 必要ならWS再接続
                     } else {
                         disconnectCommunityWebSocket();
                         if(elements.chatMessagesArea_Full) elements.chatMessagesArea_Full.innerHTML = '<p class="notice-text">チャットを利用するにはコミュニティに参加してください。</p>';
                     }
                } else {
                    // コミュニティがリストから消えた場合 (例: 削除された)
                    resetCommunityView();
                }
            } else if (currentlyOpenCardId === communityId) {
                // カードの詳細が開いている場合
                const cardElement = elements.communityListGrid?.querySelector(`.community-card[data-community-id="${communityId}"]`);
                const communityData = currentCommunities.find(c => (c.id || c._id) === communityId);
                if (cardElement && communityData) {
                    participantsCache.delete(communityId);
                    await renderCardDetails(cardElement, communityData);
                }
            }
        } catch (error) {
            console.error("Error refreshing community data:", error);
            // エラー発生時、ユーザーに通知するか、あるいは何もしないかなど検討
            // alert("データの更新中にエラーが発生しました。");
        } finally {
            isLoadingData = false;
        }
    }

    async function updateDetailViewUI() {
        if (!selectedCommunity) return;
        const { isMember, canJoin, isOrganizer } = await checkUserStatus(selectedCommunity);

        updateJoinLeaveButtons(elements.joinCommunityButton_Full, elements.leaveCommunityButton_Full, elements.joinStatusMessage_Full, isMember, canJoin, selectedCommunity);

        if (elements.deleteCommunityButton_Full) {
            elements.deleteCommunityButton_Full.style.display = currentUser && isOrganizer ? 'inline-block' : 'none';
        }

        const canUseChat = currentUser && (isMember || isOrganizer);
        if (elements.chatInput_Full) {
            elements.chatInput_Full.disabled = !canUseChat;
            elements.chatInput_Full.placeholder = canUseChat ? "メッセージを入力" : (currentUser ? "参加者のみチャット可能" : "ログインが必要です");
        }
        if (elements.sendChatButton_Full) {
            elements.sendChatButton_Full.disabled = !canUseChat;
        }
    }

    function initializePage() {
        if (typeof window.registerUserDataReadyCallback === 'function') {
            window.registerUserDataReadyCallback(async (userData) => {
                currentUser = userData;
                updateLoginDependentUI(currentUser);
                await handleInitialLoad(); // コミュニティリストを初期ロード
            });
        } else {
            console.error("registerUserDataReadyCallback is not defined. User data might not be loaded correctly.");
            updateLoginDependentUI(null); // ログインしていない状態としてUIを初期化
            if(elements.noCommunitiesMsg) {
                elements.noCommunitiesMsg.textContent = 'ページの読み込みに失敗しました。script.jsが正しく読み込まれているか確認してください。';
                elements.noCommunitiesMsg.style.display = 'block';
            }
            if(elements.communityListLoading) elements.communityListLoading.style.display = 'none';
            handleInitialLoad(); // ログイン状態に関わらずコミュニティリストは表示試行
        }

        if (typeof window.onLoginStatusChange === 'function') {
            window.onLoginStatusChange(handleLoginStatusChange);
        } else {
            console.error("onLoginStatusChange is not defined. Login status changes might not be handled.");
        }

        elements.createCommunityButton?.addEventListener('click', () => {
            if (!currentUser) { alert("コミュニティ作成にはログインが必要です。"); return; }
            if (elements.createCommunityModal) {
                elements.createCommunityModal.style.display = 'flex';
                if (elements.createFormMessage) elements.createFormMessage.textContent = '';
                elements.createCommunityForm?.reset();
            }
        });

        elements.closeModalButton?.addEventListener('click', () => {
            if (elements.createCommunityModal) elements.createCommunityModal.style.display = 'none';
        });
        elements.createCommunityForm?.addEventListener('submit', handleCreateCommunitySubmit);

        elements.closeDetailButton?.addEventListener('click', resetCommunityView);

        // ボタン群へのイベントリスナーは一つにまとめる
        elements.communityDetailSection?.addEventListener('click', handleFullDetailButtonClick);


        elements.sendChatButton_Full?.addEventListener('click', handleSendChatMessage);
        elements.chatInput_Full?.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey && elements.chatInput_Full && !elements.chatInput_Full.disabled) {
                event.preventDefault();
                handleSendChatMessage();
            }
        });

        // モーダルの外側クリックで閉じる
        window.addEventListener('click', (event) => {
            if (event.target === elements.createCommunityModal) {
                elements.createCommunityModal.style.display = 'none';
            }
        });

        window.addEventListener('beforeunload', disconnectCommunityWebSocket);
        setupCommunityCardClickHandlers(); // 初期リスナー設定
    }

    function setupCommunityCardClickHandlers() {
        if (!elements.communityListGrid) return;
        // イベントデリゲーションを使用して、動的に追加されるカードにも対応
        elements.communityListGrid.removeEventListener('click', handleGridClick); // 念のため既存のリスナーを削除
        elements.communityListGrid.addEventListener('click', handleGridClick);
    }

    async function handleGridClick(event) {
        const card = event.target.closest('.community-card');
        if (!card) return; // カード外のクリックは無視

        const button = event.target.closest('button'); // クリックされた要素がボタンか、ボタンの子要素か
        const link = event.target.closest('a'); // リンクのクリックは別途処理されるように
        const communityId = card.dataset.communityId;

        if (button) { // ボタンがクリックされた場合
            await handleCardButtonClickActions(button, card, communityId);
        } else if (!link) { // ボタンでもリンクでもない、カード本体のクリックの場合
            await handleCardBodyClickActions(card, communityId);
        }
        // リンクの場合はデフォルトの動作（ページ遷移など）
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
                 alert("主催者はコミュニティから脱退できません。コミュニティの削除をご検討ください。");
                 return;
            }
            if (confirm(`「${escapeHTML(communityData.name)}」から脱退しますか？`)) {
                await handleJoinLeave(communityId, false, button, card);
            }
        } else if (button.classList.contains('card-more-details-button')) {
            try {
                isLoadingData = true;
                setButtonLoading(button, true, '読込中');
                const freshData = await api.getCommunityById(communityId); // 詳細表示用に最新データを取得
                if (freshData) {
                    selectedCommunity = freshData; // selectedCommunityを更新
                    await renderFullCommunityDetail(freshData); // 最新データでフル詳細を描画
                    if (card) closeCardDetails(card); // カード詳細が開いていれば閉じる
                } else {
                    alert("コミュニティが見つかりません。一覧を更新します。");
                    await handleInitialLoad();
                }
            } catch (error) {
                alert(`コミュニティ詳細の表示中にエラーが発生しました: ${error.message}`);
            } finally {
                setButtonLoading(button, false);
                isLoadingData = false;
            }
        }
    }

    async function handleCardBodyClickActions(card, communityId) {
        const isOpen = card.classList.contains('is-open');
        if (isOpen) {
            closeCardDetails(card);
        } else {
            const communityData = currentCommunities.find(c => (c.id || c._id) === communityId);
            if (communityData) {
                // 他に開いているカードがあれば閉じる
                if (currentlyOpenCardId && currentlyOpenCardId !== communityId) {
                    const previouslyOpenCard = elements.communityListGrid?.querySelector(`.community-card.is-open[data-community-id="${currentlyOpenCardId}"]`);
                    if (previouslyOpenCard) {
                        closeCardDetails(previouslyOpenCard);
                    }
                }
                await openCardDetails(card, communityData);
            }
        }
    }

    // --- DOMContentLoaded or Immediate Execution ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePage);
    } else {
        initializePage(); // DOMが既にロード済みの場合
    }

})();