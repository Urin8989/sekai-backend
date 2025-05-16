// frontend/community.js

/**
 * Community Page Script
 * Handles fetching, displaying, and interacting with communities and chat.
 */
(async () => {
    // --- Constants ---
    const BACKEND_URL = 'https://www.mariokartbestrivals.com'; // ★ Xserver上のサーバーアドレス ★
    const WEBSOCKET_URL = 'wss://www.mariokartbestrivals.com'; // ★ Xserver上のWebSocketサーバーアドレス (wss) ★
    const PLACEHOLDER_AVATAR = 'images/placeholder-avatar.png'; // ★ パス修正 (./ はあってもなくても同じ挙動になることが多いですが、images/ の方が一般的です)
    const MSG_TYPE_SYSTEM = 'system_message';
    const MSG_TYPE_COMMUNITY_CHAT = 'community_chat_message';

    // --- Utility Functions ---
    /**
     * HTML文字列をエスケープする
     * @param {string} str エスケープする文字列
     * @returns {string} エスケープされた文字列
     */
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
    let currentUser = null; // script.js から取得するログインユーザー情報
    let currentCommunities = []; // 現在表示中のコミュニティリスト
    let selectedCommunity = null; // 詳細表示中のコミュニティデータ
    let currentlyOpenCardId = null; // カード内で詳細が開かれているコミュニティID
    let participantsCache = new Map(); // コミュニティIDをキーとした参加者リストのキャッシュ
    let communityWebSocket = null; // 現在のWebSocket接続インスタンス
    let currentCommunityChatId = null; // WebSocket接続中のコミュニティID
    let isLoadingData = false; // APIリクエスト中のフラグ

    // --- DOM Elements ---
    const getElement = (id) => document.getElementById(id);
    const elements = {
        // コミュニティリスト関連
        createCommunityButton: getElement('create-community-button'),
        communityListGrid: getElement('community-list-grid'),
        communityListLoading: getElement('community-list-loading'),
        noCommunitiesMsg: getElement('no-communities-msg'),
        // コミュニティ詳細ビュー関連
        communityDetailSection: getElement('community-detail-section'),
        detailCommunityName: getElement('detail-community-name'),
        detailOrganizer: getElement('detail-organizer'),
        detailOrganizerAvatar: getElement('detail-organizer-avatar'),
        detailParticipantsLimit: getElement('detail-participants-limit'), // 情報カード内の最大人数
        detailDescription: getElement('detail-description'),
        detailJoinPoints: getElement('detail-join-points'),
        joinCommunityButton_Full: getElement('join-community-button'), // 詳細ビューの参加ボタン
        leaveCommunityButton_Full: getElement('leave-community-button'), // 詳細ビューの脱退ボタン
        joinStatusMessage_Full: getElement('join-status-message'), // 詳細ビューの参加ステータス
        participantsList_Full: getElement('participants-list'), // 詳細ビューの参加者リストUL
        participantsCount_Full: getElement('detail-participants-count'), // 参加者カード内の現在数
        participantsLimitDisplay_Full: getElement('detail-participants-limit-display'), // 参加者カード内の最大数
        closeDetailButton: getElement('close-detail-button'),
        deleteCommunityButton_Full: getElement('delete-community-button'), // 詳細ビューの削除ボタン
        // チャット関連 (詳細ビュー内)
        chatMessagesArea_Full: getElement('chat-messages'),
        chatInput_Full: getElement('chat-input'),
        sendChatButton_Full: getElement('send-chat-button'),
        // コミュニティ作成モーダル関連
        createCommunityModal: getElement('create-community-modal'),
        createCommunityForm: getElement('create-community-form'),
        closeModalButton: getElement('create-community-modal')?.querySelector('.close-modal-button'),
        createFormMessage: getElement('create-form-message'),
    };

    console.log("[community.js] Checking essential elements:", {
        createBtn: !!elements.createCommunityButton,
        listGrid: !!elements.communityListGrid,
        loading: !!elements.communityListLoading,
        noMsg: !!elements.noCommunitiesMsg,
        detailSection: !!elements.communityDetailSection,
        joinBtnFull: !!elements.joinCommunityButton_Full,
        leaveBtnFull: !!elements.leaveCommunityButton_Full,
        deleteBtnFull: !!elements.deleteCommunityButton_Full,
        statusMsgFull: !!elements.joinStatusMessage_Full,
        detailLimitInfo: !!elements.detailParticipantsLimit,
        detailLimitParticipants: !!elements.participantsLimitDisplay_Full,
        chatArea: !!elements.chatMessagesArea_Full,
        chatInput: !!elements.chatInput_Full,
        chatSendBtn: !!elements.sendChatButton_Full,
    });

    // --- API Service ---
    /**
     * 認証トークン付きでfetchリクエストを行うヘルパー関数
     * @param {string} url リクエストURL
     * @param {object} options fetchオプション
     * @param {boolean} requiresAuth 認証が必要か (デフォルト: true)
     * @returns {Promise<any>} fetchレスポンス (JSONパース済み)
     */
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

    // APIエンドポイント関数群
    const api = {
        getCommunities: () => authenticatedFetch(`${BACKEND_URL}/api/communities`, {}, false),
        getCommunityById: (id) => authenticatedFetch(`${BACKEND_URL}/api/communities/${id}`, {}, false),
        getParticipants: async (id) => {
            if (participantsCache.has(id)) {
                console.log(`[community.js] Using cached participants for ID: ${id}`);
                return participantsCache.get(id);
            }
            console.log(`[community.js] Fetching participants for ID: ${id}`);
            const participants = await authenticatedFetch(`${BACKEND_URL}/api/communities/${id}/participants`, {}, false);
            participantsCache.set(id, participants);
            return participants;
        },
        getChatMessages: (id) => authenticatedFetch(`${BACKEND_URL}/api/communities/${id}/chat`), // ★ 認証が必要
        createCommunity: (data) => authenticatedFetch(`${BACKEND_URL}/api/communities`, { method: 'POST', body: data }),
        joinCommunity: (id) => authenticatedFetch(`${BACKEND_URL}/api/communities/${id}/join`, { method: 'POST' }),
        leaveCommunity: (id) => authenticatedFetch(`${BACKEND_URL}/api/communities/${id}/leave`, { method: 'POST' }),
        deleteCommunity: (id) => authenticatedFetch(`${BACKEND_URL}/api/communities/${id}`, { method: 'DELETE' }),
    };


    // --- UI Rendering Functions ---

    /** コミュニティカードのリストを描画 */
    function renderCommunityList(communities) {
        console.log("[community.js] renderCommunityList called.");
        const { communityListGrid, noCommunitiesMsg } = elements;
        if (!communityListGrid || !noCommunitiesMsg) {
            console.error("[community.js] renderCommunityList: List grid or no message element not found.");
            return;
        }

        communityListGrid.innerHTML = '';
        const hasCommunities = communities && communities.length > 0;
        noCommunitiesMsg.style.display = hasCommunities ? 'none' : 'block';
        noCommunitiesMsg.textContent = hasCommunities ? '' : '現在参加可能なコミュニティはありません。';

        if (hasCommunities) {
            communities.forEach(community => {
                // ★ APIレスポンスのIDフィールド名を確認 (MongoDBなら _id)
                // ここでは community.id が存在すると仮定
                const card = createCommunityCardElement(community);
                communityListGrid.appendChild(card);
            });
            setupCommunityCardClickHandlers(); // リスナー設定
        } else {
            setupCommunityCardClickHandlers(); // リスナー設定 (空でも必要)
        }
        console.log("[community.js] renderCommunityList finished.");
    }

    /** 単一のコミュニティカードHTML要素を作成 */
    function createCommunityCardElement(community) {
        const card = document.createElement('div');
        card.classList.add('community-card');
        // ★ APIレスポンスのIDフィールド名を確認 (MongoDBなら _id)
        card.dataset.communityId = community.id || community._id; // フォールバック

        const descriptionSnippet = (community.description || '').substring(0, 50) + ((community.description || '').length > 50 ? '...' : '');
        const currentParticipants = community.currentParticipants ?? 0;
        const participantsLimit = community.participantsLimit ?? '?';

        // --- メインコンテンツ ---
        const mainDiv = document.createElement('div');
        mainDiv.className = 'community-card-main';
        const header = document.createElement('div');
        header.className = 'community-card-header';
        const h3 = document.createElement('h3');
        h3.textContent = community.name || '無題';
        header.appendChild(h3);
        mainDiv.appendChild(header);
        const body = document.createElement('div');
        body.className = 'community-card-body';

        const organizerDiv = document.createElement('div');
        organizerDiv.className = 'organizer-info-card';
        const organizerAvatar = document.createElement('img');
        organizerAvatar.src = community.organizerPicture || PLACEHOLDER_AVATAR;
        organizerAvatar.alt = community.organizerName || '作成者';
        organizerAvatar.className = 'organizer-avatar-card';
        organizerDiv.appendChild(organizerAvatar);
        const organizerP = document.createElement('p');
        organizerP.innerHTML = '<strong>作成者:</strong> ';
        organizerP.appendChild(document.createTextNode(community.organizerName || '不明'));
        organizerDiv.appendChild(organizerP);
        body.appendChild(organizerDiv);

        const descriptionP = document.createElement('p');
        descriptionP.className = 'description-snippet';
        descriptionP.innerHTML = '<strong>説明:</strong> ';
        descriptionP.appendChild(document.createTextNode(descriptionSnippet));
        body.appendChild(descriptionP);

        mainDiv.appendChild(body);

        const footerDiv = document.createElement('div');
        footerDiv.className = 'card-footer';
        const participantsInfo = document.createElement('div');
        participantsInfo.className = 'participants-info';
        participantsInfo.innerHTML = `参加者: <span class="count">${currentParticipants}</span> / ${participantsLimit}`;
        footerDiv.appendChild(participantsInfo);
        const detailsButton = document.createElement('button');
        detailsButton.className = 'button button-secondary card-more-details-button';
        detailsButton.dataset.communityId = community.id || community._id;
        detailsButton.textContent = '詳細を見る';
        footerDiv.appendChild(detailsButton);
        mainDiv.appendChild(footerDiv);

        card.appendChild(mainDiv);

        // --- 詳細セクション (初期非表示) ---
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'community-card-details';
        detailsDiv.style.display = 'none';
        const detailsHeader = document.createElement('h4');
        detailsHeader.innerHTML = `参加者 (<span class="card-participant-count-detail">${currentParticipants}</span>/<span class="card-participant-limit-detail">${participantsLimit}</span>)`;
        detailsDiv.appendChild(detailsHeader);
        const participantsList = document.createElement('ul');
        participantsList.className = 'card-participants-list';
        participantsList.innerHTML = '<li>読み込み中...</li>';
        detailsDiv.appendChild(participantsList);
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'card-actions';
        actionsDiv.innerHTML = `
            <span class="card-join-status"></span>
            <button id="card-join-${community.id || community._id}" class="button button-primary button-stylish card-join-button" data-community-id="${community.id || community._id}" style="display: none;">参加</button>
            <button id="card-leave-${community.id || community._id}" class="button button-danger card-leave-button" data-community-id="${community.id || community._id}" style="display: none;">脱退</button>
        `;
        detailsDiv.appendChild(actionsDiv);
        card.appendChild(detailsDiv);

        return card;
    }

    /** コミュニティカード内の詳細セクションを更新 */
    async function renderCardDetails(cardElement, communityData) {
        const communityId = communityData.id || communityData._id;
        console.log(`[community.js] renderCardDetails called for card ID: ${communityId}`);
        const detailsArea = cardElement?.querySelector('.community-card-details');
        if (!detailsArea) return;

        const listElement = detailsArea.querySelector('.card-participants-list');
        await renderParticipantsList(listElement, communityId); // 参加者リスト更新

        // カード内詳細のヘッダー内カウントも更新
        const detailCountSpan = detailsArea.querySelector('.card-participant-count-detail');
        const detailLimitSpan = detailsArea.querySelector('.card-participant-limit-detail');
        if (detailCountSpan) detailCountSpan.textContent = communityData.currentParticipants ?? 0;
        if (detailLimitSpan) detailLimitSpan.textContent = communityData.participantsLimit ?? '?';

        // 参加/脱退ボタン更新
        const joinBtnCard = detailsArea.querySelector('.card-join-button');
        const leaveBtnCard = detailsArea.querySelector('.card-leave-button');
        const statusMsgCard = detailsArea.querySelector('.card-join-status');

        if (joinBtnCard && leaveBtnCard && statusMsgCard) {
            console.log(`[community.js] renderCardDetails: Checking user status for card ID: ${communityId}`);
            const { isMember, canJoin } = await checkUserStatus(communityData);
            console.log(`[community.js] renderCardDetails: Status for card - isMember: ${isMember}, canJoin: ${canJoin}`);
            updateJoinLeaveButtons(
                joinBtnCard,
                leaveBtnCard,
                statusMsgCard,
                isMember,
                canJoin,
                communityData
            );
        } else {
            console.warn(`[community.js] renderCardDetails: Buttons or status message not found in card ID: ${communityId}`);
        }
    }

    /** コミュニティ詳細セクション全体を描画 */
    async function renderFullCommunityDetail(community) {
        const communityId = community.id || community._id;
        console.log(`[community.js] renderFullCommunityDetail called for ID: ${communityId}`);
        const { communityDetailSection } = elements;
        if (!communityDetailSection || !community) return;

        selectedCommunity = community; // 現在選択中のコミュニティを更新

        // --- 基本情報の描画 ---
        elements.detailCommunityName.textContent = community.name || '無題';
        elements.detailOrganizer.textContent = community.organizerName || '不明';
        elements.detailOrganizerAvatar.src = community.organizerPicture || PLACEHOLDER_AVATAR;
        elements.detailOrganizerAvatar.alt = community.organizerName || '不明';
        elements.detailDescription.textContent = community.description || '説明はありません。';
        elements.detailJoinPoints.textContent = community.joinPoints?.toString() || '0';

        // 最大人数表示
        const participantsLimit = community.participantsLimit ?? '?';
        if (elements.detailParticipantsLimit) elements.detailParticipantsLimit.textContent = participantsLimit;
        if (elements.participantsLimitDisplay_Full) elements.participantsLimitDisplay_Full.textContent = participantsLimit;
        console.log(`[community.js] renderFullCommunityDetail: Set limits to ${participantsLimit}`);

        // --- 参加者リストと現在数の描画 ---
        await renderParticipantsList(elements.participantsList_Full, communityId);

        // --- UI状態の更新 (ボタン、チャットなど) ---
        await updateDetailViewUI(); // UI更新処理を呼び出し

        // --- チャット履歴の読み込みとWebSocket接続 ---
        const { isMember, isOrganizer } = await checkUserStatus(selectedCommunity);
        if (currentUser && (isMember || isOrganizer)) {
            await renderChatMessages(communityId); // チャット履歴読み込み
            connectCommunityWebSocket(communityId); // WebSocket接続開始
        } else {
            if (elements.chatMessagesArea_Full) {
                elements.chatMessagesArea_Full.innerHTML = '<p class="notice-text">チャットを利用するにはコミュニティに参加してください。</p>';
            }
            disconnectCommunityWebSocket(); // 参加していない場合は切断
        }

        // --- 詳細セクションを表示 ---
        communityDetailSection.style.display = 'block';
        communityDetailSection.scrollIntoView({ behavior: 'smooth' });
    }

    /** 指定されたUL要素に参加者リストを描画 */
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
                    // ★★★ バックエンドが返す参加者IDのキー名を確認 (例: p.sub) ★★★
                    link.href = `mypage.html?userId=${encodeURIComponent(p.sub)}`; // 'sub' と仮定
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
            console.error(`Error rendering participants for ${communityId}:`, error);
        } finally {
            // 詳細ビューの現在参加者数を更新
            if (listElement === elements.participantsList_Full && elements.participantsCount_Full) {
                elements.participantsCount_Full.textContent = participantsCount;
                console.log(`[community.js] renderParticipantsList: Updated participantsCount_Full to ${participantsCount}`);
            }
            // グローバル状態のコミュニティデータも更新
            const communityIndex = currentCommunities.findIndex(c => (c.id || c._id) === communityId);
            if (communityIndex > -1) {
                currentCommunities[communityIndex].currentParticipants = participantsCount;
            }
        }
    }

    /** チャット履歴を描画 */
    async function renderChatMessages(communityId) {
        const { chatMessagesArea_Full } = elements;
        if (!chatMessagesArea_Full) return;
        chatMessagesArea_Full.innerHTML = '<p class="notice-text">履歴を読み込み中...</p>';
        try {
            const messages = await api.getChatMessages(communityId);
            chatMessagesArea_Full.innerHTML = '';
            if (messages.length > 0) {
                messages.forEach(appendChatMessage);
            } else {
                appendSystemMessage('まだメッセージはありません。');
            }
            scrollToChatBottom(true); // 履歴読み込み後に即時スクロール
        } catch (error) {
            chatMessagesArea_Full.innerHTML = ''; // エラーメッセージ表示前にクリア
            appendSystemMessage(`履歴の読み込みエラー: ${error.message}`, 'error');
            console.error(`Error rendering chat messages for ${communityId}:`, error);
        }
    }

    /** 単一のチャットメッセージをチャットエリアに追加 */
    function appendChatMessage(message) {
        const { chatMessagesArea_Full } = elements;
        if (!chatMessagesArea_Full) return;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');
        // ★★★ バックエンドが返す送信者IDのキー名を確認 (例: message.senderId) ★★★
        const isMyMessage = currentUser && message.senderId === currentUser.sub; // 'sub' と仮定

        if (message.type === MSG_TYPE_SYSTEM) {
            messageDiv.classList.add('system-message');
            const textSpan = document.createElement('span');
            textSpan.className = 'message-text';
            textSpan.textContent = message.text || '';
            messageDiv.appendChild(textSpan);
        } else if (message.type === MSG_TYPE_COMMUNITY_CHAT) {
            messageDiv.classList.add(isMyMessage ? 'own-message' : 'opponent-message');
            const timestamp = message.timestamp ? new Date(message.timestamp) : null;
            const formattedTime = timestamp ? timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            // CSSの構造に合わせてHTMLを生成
            messageDiv.innerHTML = `
                <div class="message-sender">
                    <img src="${message.senderPicture || PLACEHOLDER_AVATAR}" alt="${message.senderName || '不明'}" class="chat-avatar">
                </div>
                <div class="message-content-wrapper">
                    <div class="message-meta">
                        <span class="message-sender-name">${escapeHTML(message.senderName || '不明なユーザー')}</span>
                        <span class="message-timestamp">${formattedTime}</span>
                    </div>
                    <p class="message-text">${escapeHTML(message.text || '')}</p>
                </div>
            `;
        } else {
            console.warn("Received unknown message type:", message.type); return;
        }
        const placeholder = chatMessagesArea_Full.querySelector('.notice-text');
        if (placeholder) placeholder.remove();
        const shouldScroll = chatMessagesArea_Full.scrollTop + chatMessagesArea_Full.clientHeight >= chatMessagesArea_Full.scrollHeight - 50;
        chatMessagesArea_Full.appendChild(messageDiv);
        if (shouldScroll || isMyMessage) scrollToChatBottom();
    }

    /** システムメッセージをチャットエリアに追加 */
    function appendSystemMessage(text, type = 'info') { // type: 'info', 'error', 'warning'
        const { chatMessagesArea_Full } = elements;
        if (!chatMessagesArea_Full) return;
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message', 'system-message', `system-${type}`);
        const textSpan = document.createElement('span');
        textSpan.className = 'message-text';
        textSpan.textContent = text || '';
        messageDiv.appendChild(textSpan);
        const placeholder = chatMessagesArea_Full.querySelector('.notice-text');
        if (placeholder) placeholder.remove();
        chatMessagesArea_Full.appendChild(messageDiv);
        scrollToChatBottom();
    }

    /** チャットエリアを最下部にスクロール */
    function scrollToChatBottom(instant = false) {
        const { chatMessagesArea_Full } = elements;
        if (!chatMessagesArea_Full) return;
        setTimeout(() => {
            chatMessagesArea_Full.scrollTo({ top: chatMessagesArea_Full.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
        }, 50); // DOM更新後の描画を待つ
    }

    /** 参加/脱退ボタンとステータスメッセージの表示状態を更新 */
    function updateJoinLeaveButtons(joinBtn, leaveBtn, statusMsg, isMember, canJoin, communityData) {
        const communityId = communityData?.id || communityData?._id;
        console.log(`[community.js] updateJoinLeaveButtons called. isMember: ${isMember}, canJoin: ${canJoin}, communityId: ${communityId}`);
        if (!joinBtn || !leaveBtn || !statusMsg || !communityData) {
            console.warn("[community.js] updateJoinLeaveButtons: Missing required elements or communityData.");
            return;
        }

        joinBtn.style.display = 'none';
        leaveBtn.style.display = 'none';
        statusMsg.textContent = '';
        joinBtn.disabled = false;
        leaveBtn.disabled = false;

        if (currentUser) {
            // ★★★ バックエンドが返す主催者IDのキー名を確認 (例: communityData.organizerGoogleId) ★★★
            const isOrganizer = currentUser.sub === communityData.organizerGoogleId; // 'sub' と仮定
            console.log(`[community.js] updateJoinLeaveButtons: User logged in. isOrganizer: ${isOrganizer}`);

            if (isMember) {
                if (isOrganizer) {
                    statusMsg.textContent = '主催者';
                    console.log("[community.js] updateJoinLeaveButtons: Displaying '主催者'");
                } else {
                    leaveBtn.style.display = 'inline-block';
                    statusMsg.textContent = '参加中';
                    console.log("[community.js] updateJoinLeaveButtons: Displaying '脱退' button and '参加中'");
                }
            } else if (canJoin) {
                joinBtn.style.display = 'inline-block';
                statusMsg.textContent = '';
                console.log("[community.js] updateJoinLeaveButtons: Displaying '参加' button");
            } else {
                const limitReached = (communityData.currentParticipants ?? 0) >= communityData.participantsLimit;
                statusMsg.textContent = limitReached ? '満員' : '参加不可';
                console.log(`[community.js] updateJoinLeaveButtons: Cannot join. Displaying status: ${statusMsg.textContent}`);
            }
        } else {
            statusMsg.textContent = 'ログインして参加';
            console.log("[community.js] updateJoinLeaveButtons: User not logged in. Displaying 'ログインして参加'");
        }
    }

    /** ログイン状態に応じて基本的なUI要素を更新 */
    function updateLoginDependentUI(userData) {
        const isLoggedIn = !!userData;
        console.log(`[community.js] updateLoginDependentUI called. isLoggedIn: ${isLoggedIn}`);
        if (elements.createCommunityButton) {
            elements.createCommunityButton.style.display = isLoggedIn ? 'inline-flex' : 'none';
            console.log(`[community.js] createCommunityButton display set to: ${isLoggedIn ? 'inline-flex' : 'none'}`);
        } else {
            console.warn("[community.js] updateLoginDependentUI: createCommunityButton element not found.");
        }
    }

    // --- Helper Functions ---

    /** 特定コミュニティに対するユーザーの状態を確認 */
    async function checkUserStatus(communityData) {
        const communityId = communityData?.id || communityData?._id;
        console.log(`[community.js] checkUserStatus called for community ID: ${communityId}`);
        let isMember = false;
        let isOrganizer = false;
        let canJoin = false;

        if (currentUser && communityData) {
            // ★★★ バックエンドが返す主催者IDのキー名を確認 (例: communityData.organizerGoogleId) ★★★
            isOrganizer = currentUser.sub === communityData.organizerGoogleId; // 'sub' と仮定
            console.log(`[community.js] checkUserStatus: Current user sub: ${currentUser.sub}, Organizer sub: ${communityData.organizerGoogleId}, isOrganizer: ${isOrganizer}`);
            try {
                const participants = await api.getParticipants(communityId);
                console.log(`[community.js] checkUserStatus: Fetched participants for ID ${communityId}:`, participants);
                if (participants && Array.isArray(participants)) {
                    // ★★★ バックエンドが返す参加者IDのキー名を確認 (例: p.sub) ★★★
                    isMember = participants.some(p => p && p.sub === currentUser.sub); // 'sub' と仮定
                    console.log(`[community.js] checkUserStatus: isMember check result: ${isMember}`);
                    const currentCount = participants.length;
                    const limit = parseInt(communityData.participantsLimit, 10);
                    canJoin = !isMember && !isOrganizer && !isNaN(limit) && currentCount < limit;
                    console.log(`[community.js] checkUserStatus: canJoin check result: ${canJoin} (limit: ${limit}, current: ${currentCount})`);
                } else {
                     console.warn(`[community.js] checkUserStatus: Invalid participants data received for ID ${communityId}`);
                }
            } catch (error) {
                console.error(`[community.js] checkUserStatus: Error fetching participants for ID ${communityId}:`, error);
            }
        } else {
            console.log("[community.js] checkUserStatus: currentUser or communityData is missing.");
        }
        console.log(`[community.js] checkUserStatus final result: { isMember: ${isMember}, canJoin: ${canJoin}, isOrganizer: ${isOrganizer} }`);
        return { isMember, canJoin, isOrganizer };
    }

    /** ボタンのローディング状態を設定/解除 */
    function setButtonLoading(button, isLoading, loadingText = '処理中...') {
        if (!button) return;
        button.disabled = isLoading;
        if (isLoading) {
            button.dataset.originalHTML = button.innerHTML;
            button.innerHTML = `<span class="spinner-small"></span> ${loadingText}`;
        } else {
            if (button.dataset.originalHTML) {
                button.innerHTML = button.dataset.originalHTML;
                delete button.dataset.originalHTML;
            }
        }
    }

    /** グローバルユーザーデータのポイントを更新 (script.jsの関数を呼び出す) */
    function updateGlobalUserPoints(newPoints) {
        if (typeof window.updateUserPoints === 'function') {
            window.updateUserPoints(newPoints);
        } else {
            console.warn("[community.js] Global function 'updateUserPoints' not found in script.js.");
        }
    }

    // --- Event Handlers ---

    /** 初期ロード時にコミュニティ一覧を取得・表示 */
    async function handleInitialLoad() {
        console.log("[community.js] handleInitialLoad called.");
        const { communityListLoading, noCommunitiesMsg, communityListGrid } = elements;
        if (!communityListLoading || !noCommunitiesMsg || !communityListGrid) {
            console.error("[community.js] handleInitialLoad: Missing essential list elements.");
            return;
        }
        communityListLoading.style.display = 'block';
        noCommunitiesMsg.style.display = 'none';
        communityListGrid.innerHTML = '';
        try {
            currentCommunities = await api.getCommunities();
            renderCommunityList(currentCommunities);
        } catch (error) {
            noCommunitiesMsg.textContent = `一覧の読み込みエラー: ${error.message}`;
            noCommunitiesMsg.style.display = 'block';
        } finally {
            communityListLoading.style.display = 'none';
        }
    }

    /** カード詳細を開く */
    async function openCardDetails(cardElement, communityData) {
        const communityId = communityData.id || communityData._id;
        const detailsArea = cardElement?.querySelector('.community-card-details');
        if (detailsArea) {
            detailsArea.style.display = 'block';
            cardElement.classList.add('is-open');
            currentlyOpenCardId = communityId;
            console.log(`[community.js] openCardDetails: Rendering details for ID: ${communityId}`);
            await renderCardDetails(cardElement, communityData);
        }
    }

    /** カード詳細を閉じる */
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

    /** 参加・脱退処理 */
    async function handleJoinLeave(communityId, isJoining, button, cardElement = null) {
        console.log(`[community.js] handleJoinLeave called for ID: ${communityId}, Joining: ${isJoining}`);
        if (!currentUser || isLoadingData) {
             console.log(`[community.js] handleJoinLeave: Skipping due to no user or loading state (${isLoadingData}).`);
             return;
        }
        isLoadingData = true;
        const actionText = isJoining ? '参加' : '脱退';
        const loadingText = `${actionText}処理中...`;
        const statusElement = cardElement ? cardElement.querySelector('.card-join-status') : elements.joinStatusMessage_Full;

        setButtonLoading(button, true, loadingText);
        if (statusElement) statusElement.textContent = loadingText;

        try {
            const result = isJoining ? await api.joinCommunity(communityId) : await api.leaveCommunity(communityId);
            participantsCache.delete(communityId); // キャッシュをクリア

            if (isJoining && result.pointsEarned > 0 && result.currentUserPoints !== undefined) {
                updateGlobalUserPoints(result.currentUserPoints);
                alert(`${actionText}しました！ ${result.pointsEarned}ポイント獲得！`);
            } else {
                alert(`${actionText}しました。`);
            }

            await refreshCommunityData(communityId); // データとUIを更新

        } catch (error) {
            console.error(`[community.js] handleJoinLeave Error (${actionText}):`, error);
            alert(`${actionText}失敗: ${error.message}`);
            // エラー時もUIを最新状態に更新
            await refreshCommunityData(communityId);
        } finally {
            setButtonLoading(button, false);
            isLoadingData = false;
        }
    }

    /** 詳細ビュー内のボタンクリック処理 */
    async function handleFullDetailButtonClick(event) {
        console.log("[community.js] handleFullDetailButtonClick triggered!");
        const button = event.target.closest('button');
        if (!button || !selectedCommunity || isLoadingData) { // ★ isLoadingData チェック追加
             console.log("[community.js] handleFullDetailButtonClick: Invalid state (no button, selection, or loading). Ignoring.");
             return;
        }

        const communityId = selectedCommunity.id || selectedCommunity._id;
        console.log(`[community.js] handleFullDetailButtonClick: Button clicked in full detail view. Community ID: ${communityId}, Classes: ${button.className}`);

        if (button === elements.joinCommunityButton_Full) {
            console.log(`[community.js] handleFullDetailButtonClick: Join button clicked.`);
            if (!currentUser) { alert("参加するにはログインが必要です。"); return; }
            await handleJoinLeave(communityId, true, button);
        } else if (button === elements.leaveCommunityButton_Full) {
            console.log(`[community.js] handleFullDetailButtonClick: Leave button clicked.`);
            if (!currentUser) { alert("脱退するにはログインが必要です。"); return; }
            // ★★★ バックエンドが返す主催者IDのキー名を確認 ★★★
            if (currentUser.sub === selectedCommunity.organizerGoogleId) { // 'sub' と仮定
                 alert("主催者はコミュニティから脱退できません。削除してください。"); return;
            }
            if (confirm(`「${selectedCommunity.name}」から脱退しますか？`)) {
                await handleJoinLeave(communityId, false, button);
            }
        } else if (button === elements.deleteCommunityButton_Full) {
            console.log(`[community.js] handleFullDetailButtonClick: Delete button clicked.`);
            await handleDeleteCommunity();
        } else {
             console.log("[community.js] handleFullDetailButtonClick: Clicked button has no recognized action.");
        }
    }

    /** コミュニティ削除処理 */
    async function handleDeleteCommunity() {
        console.log("[community.js] handleDeleteCommunity called.");
        // ★★★ バックエンドが返す主催者IDのキー名を確認 ★★★
        if (!selectedCommunity || !currentUser || currentUser.sub !== selectedCommunity.organizerGoogleId || isLoadingData) { // 'sub' と仮定
             console.log(`[community.js] handleDeleteCommunity: Skipping due to invalid state.`);
             return;
        }
        if (!confirm(`「${selectedCommunity.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;

        isLoadingData = true;
        const button = elements.deleteCommunityButton_Full;
        setButtonLoading(button, true, '削除中...');
        try {
            await api.deleteCommunity(selectedCommunity.id || selectedCommunity._id);
            alert('コミュニティを削除しました。');
            resetCommunityView(); // 詳細ビューを閉じる
            await handleInitialLoad(); // リストを再読み込み
        } catch (error) {
            console.error("[community.js] handleDeleteCommunity Error:", error);
            alert(`削除失敗: ${error.message}`);
        } finally {
            setButtonLoading(button, false);
            isLoadingData = false;
        }
    }

    /** コミュニティ作成フォーム送信処理 */
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
        console.log("[community.js] handleCreateCommunitySubmit: Payload:", payload);

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
            createCommunityModal.style.display = 'none';
            createCommunityForm.reset();
            await handleInitialLoad(); // リストを再読み込み
        } catch (error) {
            console.error("[community.js] handleCreateCommunitySubmit: Error:", error);
            createFormMessage.textContent = `作成失敗: ${error.message}`;
        } finally {
            setButtonLoading(submitButton, false);
            isLoadingData = false;
        }
    }

    /** チャットメッセージをWebSocketで送信 */
    function handleSendChatMessage() {
        const { chatInput_Full } = elements;
        const text = chatInput_Full?.value?.trim();
        if (!text || !currentUser || !selectedCommunity || !communityWebSocket || communityWebSocket.readyState !== WebSocket.OPEN) {
            console.warn("[community.js] handleSendChatMessage: Cannot send message due to invalid state.");
            if (!communityWebSocket || communityWebSocket.readyState !== WebSocket.OPEN) {
                appendSystemMessage('チャットに接続されていません。', 'error');
            }
            return;
        }
        console.log("[community.js] handleSendChatMessage: Sending message:", text);
        try {
            // ★★★ サーバーが期待するメッセージ形式に合わせる ★★★
            const messagePayload = {
                type: MSG_TYPE_COMMUNITY_CHAT,
                text: text
            };
            communityWebSocket.send(JSON.stringify(messagePayload));
            chatInput_Full.value = '';
            chatInput_Full.focus();
        } catch (error) {
             console.error("[community.js] handleSendChatMessage: Error sending message:", error);
             appendSystemMessage('メッセージの送信に失敗しました。', 'error');
        }
    }

    // --- WebSocket Management ---
    /** WebSocket接続を開始または確認 */
    function connectCommunityWebSocket(communityId) {
        // 既に接続中か、接続試行中なら何もしない
        if (communityWebSocket && (communityWebSocket.readyState === WebSocket.OPEN || communityWebSocket.readyState === WebSocket.CONNECTING) && currentCommunityChatId === communityId) {
            console.log(`[community.js] WebSocket already connected or connecting to community ${communityId}`);
            // UI状態が不整合な場合があるので再確認
            updateDetailViewUI();
            return;
        }
        // 既存の接続があれば切断 (違うコミュニティ or 状態がおかしい場合)
        disconnectCommunityWebSocket();

        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!communityId || !token) {
            console.error("[community.js] connectCommunityWebSocket: Missing communityId or token.");
            appendSystemMessage("チャット接続に必要な情報がありません。", 'error');
            return;
        }
        currentCommunityChatId = communityId; // 接続試行中のIDを記録
        const wsUrl = `${WEBSOCKET_URL}?token=${token}&communityId=${communityId}`;
        console.log(`[community.js] Connecting WebSocket to: ${wsUrl}`);
        appendSystemMessage("チャットサーバーに接続中...", 'info');

        try {
            communityWebSocket = new WebSocket(wsUrl);

            communityWebSocket.onopen = () => {
                console.log(`[community.js] WebSocket connected to community ${communityId}`);
                appendSystemMessage("接続しました。", 'info');
                // 接続成功時にUIを有効化 (updateDetailViewUIで最終的に判断される)
                updateDetailViewUI();
                // 必要なら接続後に履歴を要求する
                // requestChatHistory(communityId);
            };

            communityWebSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    console.log("[community.js] WebSocket message received:", msg);
                    if (msg.type === MSG_TYPE_COMMUNITY_CHAT || msg.type === MSG_TYPE_SYSTEM) {
                        appendChatMessage(msg);
                    } else if (msg.type === 'error') { // サーバーからのエラーメッセージ
                        appendSystemMessage(`サーバーエラー: ${msg.message || '不明なエラー'}`, 'error');
                    } else {
                        console.warn("[community.js] Received unexpected WebSocket message type:", msg.type);
                    }
                } catch (e) { console.error("[community.js] WebSocket message parse error:", e); }
            };

            communityWebSocket.onerror = (error) => {
                console.error("[community.js] WebSocket error:", error);
                // このコミュニティの接続でのエラーか確認
                if (currentCommunityChatId === communityId) {
                    appendSystemMessage('チャット接続エラーが発生しました。', 'error');
                    communityWebSocket = null; // インスタンスをクリア
                    currentCommunityChatId = null;
                    updateDetailViewUI(); // UIを無効化
                }
            };

            communityWebSocket.onclose = (event) => {
                console.log(`[community.js] WebSocket closed: Code=${event.code}, Reason=${event.reason}`);
                // このコミュニティの詳細表示中の切断か確認
                if (currentCommunityChatId === communityId) {
                    const message = event.code === 1000 ? 'チャットから切断されました。' : `チャット接続が切れました (Code: ${event.code})。`;
                    const messageType = event.code === 1000 ? 'info' : 'error';
                    // 詳細ビューが表示されている場合のみメッセージ表示とUI無効化
                    if (elements.communityDetailSection.style.display !== 'none' && selectedCommunity && (selectedCommunity.id || selectedCommunity._id) === communityId) {
                        appendSystemMessage(message, messageType);
                    }
                    // 1008 Policy Violation (User already connected の可能性)
                    if (event.code === 1008) {
                        console.warn("[community.js] WebSocket closed with code 1008 (Policy Violation). Check for duplicate connections.");
                        if (elements.communityDetailSection.style.display !== 'none' && selectedCommunity && (selectedCommunity.id || selectedCommunity._id) === communityId) {
                            appendSystemMessage("他の場所で接続中のため、ここではチャットを開始できません。", "warning");
                        }
                    }
                    communityWebSocket = null; // 接続が閉じたのでインスタンスをクリア
                    currentCommunityChatId = null;
                    updateDetailViewUI(); // UIを無効化
                }
            };
        } catch (error) {
            console.error("[community.js] WebSocket connection failed to initialize:", error);
            appendSystemMessage("チャットサーバーへの接続に失敗しました。", 'error');
            currentCommunityChatId = null;
            updateDetailViewUI(); // UIを無効化
        }
    }

    /** WebSocket接続を切断 */
    function disconnectCommunityWebSocket() {
        if (communityWebSocket) {
            console.log(`[community.js] Disconnecting WebSocket for community ${currentCommunityChatId}`);
            // イベントリスナーを削除してから閉じる
            communityWebSocket.onopen = null;
            communityWebSocket.onmessage = null;
            communityWebSocket.onerror = null;
            communityWebSocket.onclose = null;
            if (communityWebSocket.readyState === WebSocket.OPEN || communityWebSocket.readyState === WebSocket.CONNECTING) {
                communityWebSocket.close(1000, "Client initiated disconnect");
            }
            communityWebSocket = null;
            currentCommunityChatId = null;
            // チャットUIを無効化 (updateDetailViewUI で最終的に制御されるが念のため)
            if (elements.chatInput_Full) elements.chatInput_Full.disabled = true;
            if (elements.sendChatButton_Full) elements.sendChatButton_Full.disabled = true;
        }
    }

    // --- Initialization and Login Status Handling ---

    /** ログイン状態変更時の処理 */
    async function handleLoginStatusChange(userData) {
        console.log("[community.js] handleLoginStatusChange called.", userData ? `User: ${userData.name}` : "Logged out");
        const previousUser = currentUser;
        currentUser = userData;

        updateLoginDependentUI(currentUser); // 作成ボタンなどの表示/非表示

        console.log("[community.js] handleLoginStatusChange: Refreshing community list due to status change.");
        await handleInitialLoad(); // コミュニティリストを再読み込み

        if (!currentUser && previousUser) {
            console.log("[community.js] handleLoginStatusChange: User logged out, resetting view.");
            resetCommunityView(); // ログアウトしたら詳細ビューを閉じる
        } else if (currentUser && selectedCommunity) {
            // ログイン状態が変わった場合、詳細ビューが開いていればUIを更新
            console.log("[community.js] handleLoginStatusChange: User logged in/switched, refreshing detail view UI.");
            try {
                isLoadingData = true;
                // 最新のコミュニティデータをリストから取得 (handleInitialLoadで更新されているはず)
                const freshData = currentCommunities.find(c => (c.id || c._id) === (selectedCommunity.id || selectedCommunity._id));
                if (freshData) {
                    selectedCommunity = freshData; // 選択中のデータを更新
                    participantsCache.delete(selectedCommunity.id || selectedCommunity._id); // 参加者キャッシュクリア
                    await updateDetailViewUI(); // ボタンやチャットの状態を更新
                    // WebSocket接続も再確認
                    const { isMember, isOrganizer } = await checkUserStatus(selectedCommunity);
                    if (isMember || isOrganizer) {
                        connectCommunityWebSocket(selectedCommunity.id || selectedCommunity._id);
                    } else {
                        disconnectCommunityWebSocket();
                    }
                } else {
                    // コミュニティが見つからない場合はリセット
                    resetCommunityView();
                }
            } catch (error) {
                console.error("[community.js] handleLoginStatusChange: Error refreshing detail view:", error);
                resetCommunityView();
            } finally {
                isLoadingData = false;
            }
        }
        console.log("[community.js] handleLoginStatusChange: Finished processing status change.");
    }

    /** コミュニティ関連のUIと状態をリセット */
    function resetCommunityView() {
        console.log("[community.js] Resetting community view...");
        if (elements.communityDetailSection) {
            elements.communityDetailSection.style.display = 'none';
        }
        selectedCommunity = null;
        disconnectCommunityWebSocket(); // WebSocket切断
        isLoadingData = false;
        // ボタンのローディング状態解除
        setButtonLoading(elements.joinCommunityButton_Full, false);
        setButtonLoading(elements.leaveCommunityButton_Full, false);
        setButtonLoading(elements.deleteCommunityButton_Full, false);
        setButtonLoading(elements.createCommunityButton, false);
        // チャットエリアクリア (任意)
        // if (elements.chatMessagesArea_Full) elements.chatMessagesArea_Full.innerHTML = '';
        console.log("[community.js] Community view reset complete.");
    }

    /** 特定コミュニティのデータを再取得してUIを更新 */
    async function refreshCommunityData(communityId) {
        console.log(`[community.js] refreshCommunityData called for ID: ${communityId}`);
        if (isLoadingData) {
             console.log("[community.js] refreshCommunityData: Skipping due to loading state.");
             return;
        }
        isLoadingData = true;
        try {
            await handleInitialLoad(); // リスト全体を再取得・再描画

            // 詳細ビューが開いている場合、そのコミュニティのデータを更新
            if (selectedCommunity && (selectedCommunity.id || selectedCommunity._id) === communityId) {
                console.log("[community.js] refreshCommunityData: Detail view is open, fetching latest data...");
                const updatedDetail = currentCommunities.find(c => (c.id || c._id) === communityId);
                console.log("[community.js] refreshCommunityData: Found latest detail data in refreshed list:", updatedDetail);
                if (updatedDetail) {
                    selectedCommunity = updatedDetail; // 選択中のデータを更新
                    participantsCache.delete(communityId); // 参加者キャッシュクリア
                    console.log("[community.js] refreshCommunityData: Rendering participants...");
                    await renderParticipantsList(elements.participantsList_Full, communityId);
                    console.log("[community.js] refreshCommunityData: Updating detail view UI...");
                    await updateDetailViewUI(); // 詳細ビューのUI（ボタン、チャット状態）を更新
                    // WebSocket接続も再確認
                    const { isMember, isOrganizer } = await checkUserStatus(selectedCommunity);
                     if (currentUser && (isMember || isOrganizer)) {
                         connectCommunityWebSocket(communityId);
                     } else {
                         disconnectCommunityWebSocket();
                     }
                } else {
                    console.log("[community.js] refreshCommunityData: Community not found after refresh, resetting view.");
                    resetCommunityView();
                }
            }
        } catch (error) {
            console.error("[community.js] refreshCommunityData: Error:", error);
        } finally {
             isLoadingData = false;
             console.log("[community.js] refreshCommunityData: Finished.");
        }
    }

    /** 詳細ビューのUI（ボタン、ステータス、チャット有効/無効）を更新 */
    async function updateDetailViewUI() {
        console.log("[community.js] updateDetailViewUI called.");
        if (!selectedCommunity) {
            console.log("[community.js] updateDetailViewUI: No selected community, skipping.");
            return;
        }
        const communityId = selectedCommunity.id || selectedCommunity._id;
        console.log(`[community.js] updateDetailViewUI: Checking user status for detail view ID: ${communityId}`);
        const { isMember, canJoin, isOrganizer } = await checkUserStatus(selectedCommunity);
        console.log(`[community.js] updateDetailViewUI: Status for detail view - isMember: ${isMember}, canJoin: ${canJoin}, isOrganizer: ${isOrganizer}`);

        // 参加/脱退ボタン更新
        updateJoinLeaveButtons(
            elements.joinCommunityButton_Full,
            elements.leaveCommunityButton_Full,
            elements.joinStatusMessage_Full,
            isMember,
            canJoin,
            selectedCommunity
        );

        // 削除ボタン更新
        if (elements.deleteCommunityButton_Full) {
            elements.deleteCommunityButton_Full.style.display = currentUser && isOrganizer ? 'inline-block' : 'none';
            console.log(`[community.js] updateDetailViewUI: Delete button display set to: ${currentUser && isOrganizer ? 'inline-block' : 'none'}`);
        }

        // チャットUI更新
        const canUseChat = currentUser && (isMember || isOrganizer);
        if (elements.chatInput_Full) {
            elements.chatInput_Full.disabled = !canUseChat;
            elements.chatInput_Full.placeholder = canUseChat ? "メッセージを入力" : (currentUser ? "参加者のみチャット可能" : "ログインが必要です");
        }
        if (elements.sendChatButton_Full) {
            elements.sendChatButton_Full.disabled = !canUseChat;
        }
        console.log(`[community.js] updateDetailViewUI: Chat enabled: ${canUseChat}`);

        console.log("[community.js] updateDetailViewUI: Finished.");
    }

    /** ページ初期化 */
    function initializePage() {
        console.log("[community.js] Initializing page...");
        // script.js のユーザーデータ準備完了を待つ
        if (typeof window.registerUserDataReadyCallback === 'function') {
            window.registerUserDataReadyCallback(async (userData) => {
                console.log("[community.js] User data ready callback executed.", userData ? `User: ${userData.name}` : "No user data");
                currentUser = userData;
                updateLoginDependentUI(currentUser);
                console.log("[community.js] User data ready, initiating initial list load.");
                await handleInitialLoad(); // ユーザーデータ確定後にリスト読み込み
            });
        } else {
            console.error("[community.js] Global function 'registerUserDataReadyCallback' not found.");
            updateLoginDependentUI(null);
            if(elements.noCommunitiesMsg) {
                elements.noCommunitiesMsg.textContent = 'ページの読み込みに失敗しました。script.jsを確認してください。';
                elements.noCommunitiesMsg.style.display = 'block';
            }
            if(elements.communityListLoading) elements.communityListLoading.style.display = 'none';
            console.log("[community.js] registerUserDataReadyCallback not found, attempting list load anyway.");
            handleInitialLoad(); // フォールバックとしてリスト読み込み試行
        }

        // script.js のログイン状態変更を監視
        if (typeof window.onLoginStatusChange === 'function') {
            window.onLoginStatusChange(handleLoginStatusChange);
        } else {
             console.error("[community.js] Global function 'onLoginStatusChange' not found.");
        }

        // --- イベントリスナー設定 ---
        elements.createCommunityButton?.addEventListener('click', () => {
            if (!currentUser) { alert("コミュニティを作成するにはログインが必要です。"); return; }
            if (elements.createCommunityModal) {
                elements.createCommunityModal.style.display = 'flex';
                elements.createFormMessage.textContent = '';
                elements.createCommunityForm?.reset();
            }
        });
        elements.closeModalButton?.addEventListener('click', () => {
            if (elements.createCommunityModal) elements.createCommunityModal.style.display = 'none';
        });
        elements.createCommunityForm?.addEventListener('submit', handleCreateCommunitySubmit);

        // グリッドへの単一クリックリスナー設定 (setupCommunityCardClickHandlers内で実行)

        elements.closeDetailButton?.addEventListener('click', resetCommunityView);
        elements.joinCommunityButton_Full?.addEventListener('click', handleFullDetailButtonClick);
        elements.leaveCommunityButton_Full?.addEventListener('click', handleFullDetailButtonClick);
        elements.deleteCommunityButton_Full?.addEventListener('click', handleFullDetailButtonClick);

        elements.sendChatButton_Full?.addEventListener('click', handleSendChatMessage);
        elements.chatInput_Full?.addEventListener('keypress', (event) => {
            // disabledでないこともチェック
            if (event.key === 'Enter' && !event.shiftKey && !elements.chatInput_Full.disabled) {
                event.preventDefault();
                handleSendChatMessage();
            }
        });

        // モーダル外クリックで閉じる
        window.addEventListener('click', (event) => {
            if (event.target === elements.createCommunityModal) elements.createCommunityModal.style.display = 'none';
        });
        // ページ離脱時にWebSocket切断
        window.addEventListener('beforeunload', disconnectCommunityWebSocket);

        console.log("[community.js] Page initialization complete.");
    }

    /** カードクリックハンドラ設定関数 */
    function setupCommunityCardClickHandlers() {
        console.log("[community.js] Setting up card click handlers.");
        if (!elements.communityListGrid) {
            console.warn("[community.js] setupCommunityCardClickHandlers: communityListGrid not found.");
            return;
        }
        // 既存リスナーを削除してから新しいリスナーを追加 (重複防止)
        elements.communityListGrid.removeEventListener('click', handleGridClick);
        elements.communityListGrid.addEventListener('click', handleGridClick);
        console.log("[community.js] Card click handlers set up using single handler (handleGridClick).");
    }

    // --- カードクリック処理 (イベント委譲) ---

    /** グリッド内のクリックイベントを処理 */
    async function handleGridClick(event) {
        console.log("[community.js] handleGridClick triggered!");
        console.log("[community.js] handleGridClick: event.target is:", event.target);

        const card = event.target.closest('.community-card');
        if (!card) {
            console.log("[community.js] handleGridClick: Click outside any card. Ignoring.");
            return;
        }

        const button = event.target.closest('button');
        console.log("[community.js] handleGridClick: event.target.closest('button') result:", button);

        const link = event.target.closest('a');
        const communityId = card.dataset.communityId;

        if (button) {
            // ボタンがクリックされた場合
            console.log(`[community.js] handleGridClick: Button clicked within card ${communityId}. Classes: ${button.className}`);
            await handleCardButtonClickActions(button, card, communityId);
        } else if (!link) {
            // ボタンやリンク以外 (カード本体) がクリックされた場合
            console.log(`[community.js] handleGridClick: Card body clicked (not button/link). ID: ${communityId}`);
            await handleCardBodyClickActions(card, communityId);
        } else {
            // リンクがクリックされた場合 (デフォルトの動作に任せる)
            console.log("[community.js] handleGridClick: Link clicked. Allowing default navigation.");
        }
    }

    /** カード内のボタンクリック時のアクション */
    async function handleCardButtonClickActions(button, card, communityId) {
        console.log(`[community.js] handleCardButtonClickActions: Processing button click for ID: ${communityId}`);

        if (!communityId) {
            console.warn("[community.js] handleCardButtonClickActions: Community ID is missing.");
            return;
        }

        const communityData = currentCommunities.find(c => (c.id || c._id) === communityId);
        if (!communityData) {
            console.warn(`[community.js] handleCardButtonClickActions: Community data not found for ID: ${communityId}`);
            return;
        }

        if (button.classList.contains('card-join-button')) {
            console.log(`[community.js] handleCardButtonClickActions: Join button action.`);
            if (!currentUser) { alert("参加するにはログインが必要です。"); return; }
            await handleJoinLeave(communityId, true, button, card);
        } else if (button.classList.contains('card-leave-button')) {
            console.log(`[community.js] handleCardButtonClickActions: Leave button action.`);
            if (!currentUser) { alert("脱退するにはログインが必要です。"); return; }
            // ★★★ バックエンドが返す主催者IDのキー名を確認 ★★★
            if (currentUser.sub === communityData.organizerGoogleId) { // 'sub' と仮定
                 alert("主催者はコミュニティから脱退できません。削除してください。"); return;
            }
            if (confirm(`「${communityData.name}」から脱退しますか？`)) {
                await handleJoinLeave(communityId, false, button, card);
            }
        } else if (button.classList.contains('card-more-details-button')) {
            console.log(`[community.js] handleCardButtonClickActions: More Details button action.`);
            try {
                isLoadingData = true;
                console.log(`[community.js] handleCardButtonClickActions: Fetching full details for ID: ${communityId}`);
                const freshData = await api.getCommunityById(communityId);
                if (freshData) {
                    console.log(`[community.js] handleCardButtonClickActions: Rendering full details for ID: ${communityId}`);
                    await renderFullCommunityDetail(freshData);
                    if (card) closeCardDetails(card); // カード内の詳細は閉じる
                } else {
                    alert("コミュニティが見つかりません。削除された可能性があります。");
                    await handleInitialLoad(); // リストを再読み込み
                }
            } catch (error) {
                 console.error(`[community.js] handleCardButtonClickActions: Error fetching/rendering full details for ID ${communityId}:`, error);
                 alert(`詳細の表示エラー: ${error.message}`);
            } finally {
                isLoadingData = false;
            }
        } else {
             console.log("[community.js] handleCardButtonClickActions: Clicked button has no recognized action class.");
        }
    }

    /** カード本体クリック時のアクション (詳細の開閉) */
    async function handleCardBodyClickActions(card, communityId) {
        console.log(`[community.js] handleCardBodyClickActions: Processing card body click for ID: ${communityId}`);
        const isOpen = card.classList.contains('is-open');
        if (isOpen) {
            console.log(`[community.js] handleCardBodyClickActions: Closing card details.`);
            closeCardDetails(card);
        } else {
            const communityData = currentCommunities.find(c => (c.id || c._id) === communityId);
            if (communityData) {
                console.log(`[community.js] handleCardBodyClickActions: Opening card details.`);
                // 他に開いているカードがあれば閉じる
                if (currentlyOpenCardId && currentlyOpenCardId !== communityId) {
                    const previouslyOpenCard = elements.communityListGrid?.querySelector(`.community-card.is-open`);
                    if (previouslyOpenCard) {
                        console.log(`[community.js] handleCardBodyClickActions: Closing previously open card ID: ${currentlyOpenCardId}`);
                        closeCardDetails(previouslyOpenCard);
                    }
                }
                openCardDetails(card, communityData); // クリックされたカードの詳細を開く
            } else {
                console.warn(`[community.js] handleCardBodyClickActions: Community data not found for ID: ${communityId}`);
            }
        }
    }


    // --- 実行 ---
    // DOMContentLoadedを待って初期化を実行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePage);
    } else {
        initializePage();
    }

})(); // IIFE終了
