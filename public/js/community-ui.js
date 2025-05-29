// frontend/community-ui.js

(() => {
    const logic = window.CommunityLogic;
    if (!logic) {
        console.error("CommunityLogic is not loaded!");
        return;
    }

    // --- Constants ---
    const PLACEHOLDER_AVATAR = 'images/placeholder-avatar.png';

    // --- Utility Functions ---
    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, match => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[match]);
    }

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
        // detailParticipantsLimit: getElement('detail-participants-limit'), // 削除 (重複するため)
        detailDescription: getElement('detail-description'),
        detailJoinPoints: getElement('detail-join-points'),
        joinCommunityButton_Full: getElement('join-community-button'),
        leaveCommunityButton_Full: getElement('leave-community-button'),
        joinStatusMessage_Full: getElement('join-status-message'),
        participantsList_Full: getElement('participants-list'),
        participantsCount_Full: getElement('detail-participants-count'),
        participantsLimitDisplay_Full: getElement('detail-participants-limit-display'), // 1つ目
        participantsLimitDisplay_Header: getElement('detail-participants-limit-header'), // 2つ目 (追加)
        closeDetailButton: getElement('close-detail-button'),
        deleteCommunityButton_Full: getElement('delete-community-button'),
        chatMessagesArea_Full: getElement('chat-messages'),
        chatInput_Full: getElement('chat-input'),
        sendChatButton_Full: getElement('send-chat-button'),
        createCommunityModal: getElement('create-community-modal'),
        createCommunityForm: getElement('create-community-form'),
        closeModalButton: getElement('create-community-modal')?.querySelector('.close-modal-button'),
        createFormMessage: getElement('create-form-message'),
        submitCommunityButton: getElement('create-community-form')?.querySelector('button[type="submit"]'),
    };
    let currentlyOpenCardId = null;

    // --- UI Rendering Functions ---
    function renderCommunityList(communities, currentUser) {
        const grid = elements.communityListGrid;
        const noMsg = elements.noCommunitiesMsg;
        if (!grid || !noMsg) return;
        grid.innerHTML = '';
        const hasCommunities = communities && communities.length > 0;
        noMsg.style.display = hasCommunities ? 'none' : 'block';
        noMsg.textContent = hasCommunities ? '' : '現在参加可能なコミュニティはありません。';
        if (hasCommunities) {
            communities.forEach(community => grid.appendChild(createCommunityCardElement(community)));
        }
    }

    function createCommunityCardElement(community) {
        const card = document.createElement('div');
        card.classList.add('community-card');
        card.dataset.communityId = community.id || community._id;
        const desc = (community.description || '').substring(0, 50) + ((community.description || '').length > 50 ? '...' : '');
        const current = community.currentParticipants ?? 0;
        const limit = community.participantsLimit ?? '?';
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
                    <p class="description-snippet"><strong>説明:</strong> ${escapeHTML(desc)}</p>
                </div>
                <div class="card-footer">
                    <div class="participants-info">参加者: <span class="count">${current}</span> / ${limit}</div>
                    <button class="button button-secondary card-more-details-button" data-community-id="${community.id || community._id}">詳細を見る</button>
                </div>
            </div>
            <div class="community-card-details" style="display: none;">
                <h4>参加者 (<span class="card-participant-count-detail">${current}</span>/<span class="card-participant-limit-detail">${limit}</span>)</h4>
                <ul class="card-participants-list"><li>読み込み中...</li></ul>
                <div class="card-actions">
                    <span class="card-join-status"></span>
                    <button class="button button-primary button-stylish card-join-button" style="display: none;">参加</button>
                    <button class="button button-danger card-leave-button" style="display: none;">脱退</button>
                </div>
            </div>`;
        return card;
    }

    function renderParticipantsList(listElement, participants, communityData, currentUser) {
        if (!listElement) return 0;
        listElement.innerHTML = '';
        const isOrganizer = currentUser && communityData && currentUser.sub === communityData.organizerGoogleId;
        if (participants.length > 0) {
            participants.forEach(p => {
                const li = document.createElement('li');
                const participantNameEscaped = escapeHTML(p.name || '不明');
                li.innerHTML = `
                    <div class="participant-info">
                        <img src="${escapeHTML(p.picture || PLACEHOLDER_AVATAR)}" alt="${participantNameEscaped}" onerror="this.src='${PLACEHOLDER_AVATAR}'">
                        <a href="mypage.html?userId=${encodeURIComponent(p.sub)}" class="user-link">${participantNameEscaped}</a>
                    </div>
                    ${(isOrganizer && p.sub !== currentUser.sub) ?
                        `<button class="button button-kick" data-participant-id="${p.sub}" data-participant-name="${participantNameEscaped}">キック</button>` : ''}
                `;
                listElement.appendChild(li);
            });
        } else {
            listElement.innerHTML = '<li>まだ参加者はいません。</li>';
        }
        return participants.length;
    }

     function renderCardDetails(cardElement, communityData, participants, status, currentUser) {
        const detailsArea = cardElement?.querySelector('.community-card-details');
        if (!detailsArea) return;
        const listElement = detailsArea.querySelector('.card-participants-list');
        const count = renderParticipantsList(listElement, participants, communityData, currentUser);

        detailsArea.querySelector('.card-participant-count-detail').textContent = count;
        detailsArea.querySelector('.card-participant-limit-detail').textContent = communityData.participantsLimit ?? '?';

        const joinBtn = detailsArea.querySelector('.card-join-button');
        const leaveBtn = detailsArea.querySelector('.card-leave-button');
        const statusMsg = detailsArea.querySelector('.card-join-status');
        updateJoinLeaveButtons(joinBtn, leaveBtn, statusMsg, status.isMember, status.canJoin, status.isOrganizer, communityData, currentUser);
        detailsArea.style.display = 'block';
     }


    function renderFullCommunityDetail(community, participants, status, currentUser) {
        if (!elements.communityDetailSection || !community) return;

        elements.detailCommunityName.textContent = community.name || '無題';
        elements.detailOrganizer.textContent = community.organizerName || '不明';
        elements.detailOrganizerAvatar.src = community.organizerPicture || PLACEHOLDER_AVATAR;
        elements.detailDescription.textContent = community.description || '説明はありません。';
        elements.detailJoinPoints.textContent = community.joinPoints?.toString() || '0';

        // ↓↓↓ --- 修正箇所 --- ↓↓↓
        const limitText = community.participantsLimit ?? '?'; // 値を取得
        elements.participantsLimitDisplay_Full.textContent = limitText; // 1つ目を更新
        if (elements.participantsLimitDisplay_Header) {
            elements.participantsLimitDisplay_Header.textContent = limitText; // 2つ目を更新
        }
        // ↑↑↑ --- 修正箇所 --- ↑↑↑

        const count = renderParticipantsList(elements.participantsList_Full, participants, community, currentUser);
        elements.participantsCount_Full.textContent = count;

        updateJoinLeaveButtons(elements.joinCommunityButton_Full, elements.leaveCommunityButton_Full, elements.joinStatusMessage_Full, status.isMember, status.canJoin, status.isOrganizer, community, currentUser);
        elements.deleteCommunityButton_Full.style.display = status.isOrganizer ? 'inline-block' : 'none';

        elements.communityDetailSection.style.display = 'block';
        elements.communityDetailSection.scrollIntoView({ behavior: 'smooth' });
    }

    function appendChatMessage(message) {
        const area = elements.chatMessagesArea_Full;
        if (!area) return;
        const currentUser = logic.getCurrentUser();
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('chat-message');
        const isSystem = message.type === 'system_message';
        const isMyMsg = !isSystem && currentUser && message.senderId === currentUser.sub;

        if (isSystem) {
            msgDiv.classList.add('system-message', message.classType || 'info');
            msgDiv.innerHTML = `<span class="message-text">${escapeHTML(message.text || '')}</span>`;
        } else if (message.type === 'community_chat_message') {
            msgDiv.classList.add(isMyMsg ? 'own-message' : 'opponent-message');
            const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            msgDiv.innerHTML = `
                <div class="message-sender"><img src="${escapeHTML(message.senderPicture || PLACEHOLDER_AVATAR)}" alt="${escapeHTML(message.senderName || '不明')}" class="chat-avatar" onerror="this.src='${PLACEHOLDER_AVATAR}'"></div>
                <div class="message-content-wrapper">
                    <div class="message-meta">
                        <span class="message-sender-name">${escapeHTML(message.senderName || '不明')}</span>
                        <span class="message-timestamp">${time}</span>
                    </div>
                    <p class="message-text">${escapeHTML(message.text || '')}</p>
                </div>`;
        } else {
             console.warn("Unknown message type received in UI:", message);
             return;
        }

        const placeholder = area.querySelector('.notice-text');
        if (placeholder) placeholder.remove();

        area.appendChild(msgDiv);
        scrollToChatBottom();
    }

    function scrollToChatBottom(instant = false) {
        const area = elements.chatMessagesArea_Full;
        if (area) {
            setTimeout(() => {
                 area.scrollTo({ top: area.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
            }, 50);
        }
    }

    // --- UI Update Functions ---
    function updateJoinLeaveButtons(joinBtn, leaveBtn, statusMsg, isMember, canJoin, isOrganizer, communityData, currentUser) {
        if (!joinBtn || !leaveBtn || !statusMsg) return;
        joinBtn.style.display = 'none'; leaveBtn.style.display = 'none'; statusMsg.textContent = '';
        joinBtn.disabled = false; leaveBtn.disabled = false;

        if (currentUser) {
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

    function setButtonLoading(button, isLoading, loadingText = '処理中...') {
        if (!button) return;
        button.disabled = isLoading;
        if (isLoading) {
            button.dataset.originalHTML = button.innerHTML;
            button.innerHTML = `<span class="spinner-small"></span> ${escapeHTML(loadingText)}`;
        } else if (button.dataset.originalHTML) {
            button.innerHTML = button.dataset.originalHTML;
            delete button.dataset.originalHTML;
        }
    }

    function resetCommunityView() {
        elements.communityDetailSection.style.display = 'none';
        clearChatHistory();
        showChatConnectionMessage("コミュニティを選択してください。");
        disableChat();
    }

     function openCardDetails(cardElement) {
        const communityId = cardElement.dataset.communityId;

        if (currentlyOpenCardId && currentlyOpenCardId !== communityId) {
             const prevCard = document.querySelector(`.community-card.is-open[data-community-id="${currentlyOpenCardId}"]`);
             if(prevCard) closeCardDetails(prevCard);
        }

        cardElement.classList.add('is-open');
        currentlyOpenCardId = communityId;
        logic.handleShowCardDetails(cardElement, communityId);
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

    function clearChatHistory() { if (elements.chatMessagesArea_Full) elements.chatMessagesArea_Full.innerHTML = ''; }
    function showChatHistoryLoading() { if (elements.chatMessagesArea_Full) elements.chatMessagesArea_Full.innerHTML = '<p class="notice-text">履歴を読み込み中...</p>'; }
    function showChatConnectionMessage(text) { if (elements.chatMessagesArea_Full) elements.chatMessagesArea_Full.innerHTML = `<p class="notice-text">${escapeHTML(text)}</p>`; }
    function disableChat(placeholder = "チャットは利用できません") {
        if(elements.chatInput_Full) { elements.chatInput_Full.disabled = true; elements.chatInput_Full.placeholder = placeholder; }
        if(elements.sendChatButton_Full) elements.sendChatButton_Full.disabled = true;
    }
    function enableChat() {
        if(elements.chatInput_Full) { elements.chatInput_Full.disabled = false; elements.chatInput_Full.placeholder = "メッセージを入力"; }
        if(elements.sendChatButton_Full) elements.sendChatButton_Full.disabled = false;
    }


    // --- Initialization & Event Binding ---
    function initializePage() {
        // Register UI functions with Logic
        logic.registerUI({
            renderCommunityList,
            showLoading: (show) => elements.communityListLoading.style.display = show ? 'block' : 'none',
            showNoCommunitiesMessage: (msg) => { elements.noCommunitiesMsg.textContent = msg; elements.noCommunitiesMsg.style.display = 'block'; },
            renderFullCommunityDetail,
            renderCardDetails,
            appendChatMessage,
            appendSystemMessage: (text, type) => appendChatMessage({ type: 'system_message', text, classType: type }),
            setButtonLoading,
            resetCommunityView,
            closeCardDetailsById: (id) => { const card = document.querySelector(`.community-card[data-community-id="${id}"]`); if(card) closeCardDetails(card); },
            showFormMessage: (msg) => elements.createFormMessage.textContent = msg,
            closeCreateModal: () => elements.createCommunityModal.style.display = 'none',
            updateLoginDependentUI: (user) => elements.createCommunityButton.style.display = user ? 'inline-flex' : 'none',
            alert: (msg) => window.alert(msg),
            confirm: (msg) => window.confirm(msg),
            reloadPage: () => window.location.reload(),
            updateGlobalUserPoints: (points) => typeof window.updateUserPoints === 'function' && window.updateUserPoints(points),
            scrollToChatBottom,
            getChatInput: () => elements.chatInput_Full,
            clearChatInput: () => { if (elements.chatInput_Full) elements.chatInput_Full.value = ''; },
            disableChat,
            enableChat,
            showChatHistoryLoading,
            clearChatHistory,
            showChatConnectionMessage,
            getDeleteButton: () => elements.deleteCommunityButton_Full,
        });

        // Event Listeners
        elements.createCommunityButton?.addEventListener('click', () => {
            if (!logic.getCurrentUser()) { alert("コミュニティ作成にはログインが必要です。"); return; }
            elements.createCommunityModal.style.display = 'flex';
            elements.createFormMessage.textContent = '';
            elements.createCommunityForm?.reset();
        });

        elements.closeModalButton?.addEventListener('click', () => elements.createCommunityModal.style.display = 'none');
        elements.createCommunityForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            const formData = new FormData(elements.createCommunityForm);
            const payload = { name: formData.get('communityName')?.trim(), description: formData.get('communityDescription')?.trim(), participantsLimit: parseInt(formData.get('communityParticipants'), 10) };
            if (!payload.name) { elements.createFormMessage.textContent = 'コミュニティ名は必須です。'; return; }
            if (payload.name.length > 50) { elements.createFormMessage.textContent = 'コミュニティ名は50文字以内です。'; return; }
            if (payload.description && payload.description.length > 200) { elements.createFormMessage.textContent = '説明は200文字以内です。'; return; }
            if (isNaN(payload.participantsLimit) || payload.participantsLimit < 2 || payload.participantsLimit > 24) { elements.createFormMessage.textContent = '最大参加人数は2～24です。'; return; }
            logic.handleCreateCommunitySubmit(payload, elements.submitCommunityButton);
        });

        elements.closeDetailButton?.addEventListener('click', logic.handleResetCommunityView);

        elements.sendChatButton_Full?.addEventListener('click', logic.handleSendChatMessage);
        elements.chatInput_Full?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey && !elements.chatInput_Full.disabled) { e.preventDefault(); logic.handleSendChatMessage(); } });

        elements.communityListGrid?.addEventListener('click', (event) => {
            const card = event.target.closest('.community-card');
            if (!card || logic.isLoading()) return;
            const communityId = card.dataset.communityId;
            const button = event.target.closest('button');
            const link = event.target.closest('a');

            if (button) {
                event.stopPropagation();
                const communityData = logic.getCommunityById(communityId);
                if (button.classList.contains('card-more-details-button')) {
                    setButtonLoading(button, true, '読込中');
                    logic.handleShowFullDetails(communityId).finally(() => setButtonLoading(button, false));
                    closeCardDetails(card);
                } else if (button.classList.contains('card-join-button')) {
                    logic.handleJoinLeave(communityId, true, button, card);
                } else if (button.classList.contains('card-leave-button')) {
                    if (confirm(`「${escapeHTML(communityData?.name)}」から脱退しますか？`)) {
                        logic.handleJoinLeave(communityId, false, button, card);
                    }
                } else if (button.classList.contains('button-kick')) {
                    const participantId = button.dataset.participantId;
                    const participantName = button.dataset.participantName;
                    logic.handleKickParticipant(communityId, participantId, participantName, button);
                }
            } else if (!link) {
                 const isOpen = card.classList.contains('is-open');
                 if (isOpen) closeCardDetails(card); else openCardDetails(card);
            }
        });

        elements.participantsList_Full?.addEventListener('click', (event) => {
            const button = event.target.closest('button.button-kick');
            const community = logic.getSelectedCommunity();
            if (button && community) {
                event.stopPropagation();
                const communityId = community.id || community._id;
                const participantId = button.dataset.participantId;
                const participantName = button.dataset.participantName;
                logic.handleKickParticipant(communityId, participantId, participantName, button);
            }
        });

        elements.communityDetailSection?.addEventListener('click', (event) => {
             const button = event.target.closest('button');
             if (!button || logic.isLoading()) return;
             const community = logic.getSelectedCommunity();
             if (!community) return;
             const communityId = community.id || community._id;

             if (button === elements.joinCommunityButton_Full) {
                 logic.handleJoinLeave(communityId, true, button);
             } else if (button === elements.leaveCommunityButton_Full) {
                 if (confirm(`「${escapeHTML(community.name)}」から脱退しますか？`)) {
                     logic.handleJoinLeave(communityId, false, button);
                 }
             } else if (button === elements.deleteCommunityButton_Full) {
                 logic.handleDeleteCommunity();
             }
        });


        window.addEventListener('click', (event) => { if (event.target === elements.createCommunityModal) elements.createCommunityModal.style.display = 'none'; });

        window.addEventListener('beforeunload', () => {
             logic.handleResetCommunityView();
         });

        // Login status handling
        if (typeof window.registerUserDataReadyCallback === 'function') {
            window.registerUserDataReadyCallback(logic.handleLoginStatusChange);
        } else {
            console.error("registerUserDataReadyCallback not found. Initializing without user data.");
            logic.handleLoginStatusChange(null);
        }
        if (typeof window.onLoginStatusChange === 'function') {
            window.onLoginStatusChange(logic.handleLoginStatusChange);
        } else {
             console.error("onLoginStatusChange not found. Login status changes might not be handled.");
        }
    }

    // --- Start ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePage);
    } else {
        initializePage();
    }

})();