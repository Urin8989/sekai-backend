// frontend/match_ui.js

// --- グローバル変数 ---
let isMatching = false;
let matchmakingStatusInterval = null;
let currentMatchId = null;
let currentOpponentData = null;
let matchWebSocket = null;
let heartbeatInterval = null;
let matchResultPollingInterval = null;
let isSubmittingResult = false;
let isPollingForResult = false; // 結果ポーリング中フラグ

// DOM要素
let matchButton, cancelButton, opponentInfoArea, matchStatusText, opponentProfileSection, opponentPlaceholder, opponentSpinner;
let myProfilePic, myProfileName, myProfileRate, myProfilePointsElement, myProfileCourseElement, myProfileCommentElement, myProfileBadgesContainer;
let matchChatSection, matchChatMessagesArea, matchChatInput, matchChatSendButton;
let resultReportingArea, startBattleButton, reportResultButtons, reportWinButton, reportLoseButton, cancelBattleButton, battleStatusText;
let resultModal, resultTitle, resultMyRateBefore, resultMyRateAfter, resultRateChange, resultPointsEarned, resultNewPoints, closeResultModalButton;
let lobbyInstructionElement; // ★ ロビー指示要素をグローバルに追加

const MATCH_STATE_KEY = 'mkbrMatchState_v4'; // 状態保存キー (バージョンアップ)

// --- ヘルパー関数 ---

const getDefaultAvatarPath = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '/public/images/default_avatar.svg';
    } else {
        return '/images/default_avatar.svg';
    }
};

const getDefaultBadgePath = () => typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath('__DEFAULT__') : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '/public/images/default_badge.svg' : '/images/default_badge.svg');

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

function scrollToChatBottom(instant = false, areaElement = matchChatMessagesArea) {
    if (!areaElement) return;
    setTimeout(() => {
        areaElement.scrollTo({
            top: areaElement.scrollHeight,
            behavior: instant ? 'instant' : 'smooth'
        });
    }, 50);
}

// --- DOM読み込み完了時の処理 ---

document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    matchButton = document.getElementById('match-button');
    cancelButton = document.getElementById('cancel-match-button');
    opponentInfoArea = document.getElementById('opponent-info');
    matchStatusText = document.getElementById('match-status');
    opponentProfileSection = document.getElementById('opponent-profile');
    opponentPlaceholder = document.getElementById('opponent-placeholder');
    opponentSpinner = document.getElementById('opponent-spinner');
    myProfilePic = document.getElementById('my-profile-pic');
    myProfileName = document.getElementById('my-profile-name');
    myProfileRate = document.getElementById('my-profile-rate');
    myProfilePointsElement = document.getElementById('my-profile-points');
    myProfileCourseElement = document.querySelector('#my-profile .profile-home-course-display .detail-value');
    myProfileCommentElement = document.querySelector('#my-profile .profile-comment-display .detail-comment');
    myProfileBadgesContainer = document.querySelector('#my-profile .profile-badges');
    matchChatSection = document.getElementById('match-chat-section');
    matchChatMessagesArea = document.getElementById('match-chat-messages');
    matchChatInput = document.getElementById('match-chat-input');
    matchChatSendButton = document.getElementById('match-chat-send-button');
    resultReportingArea = document.querySelector('.result-reporting');
    startBattleButton = document.getElementById('start-battle-button');
    reportResultButtons = document.getElementById('report-result-buttons');
    reportWinButton = document.getElementById('report-win-button');
    reportLoseButton = document.getElementById('report-lose-button');
    cancelBattleButton = document.getElementById('cancel-battle-button');
    battleStatusText = document.getElementById('battle-status-text');
    resultModal = document.getElementById('result-modal');
    resultTitle = document.getElementById('result-title');
    resultMyRateBefore = document.getElementById('result-my-rate-before');
    resultMyRateAfter = document.getElementById('result-my-rate-after');
    resultRateChange = document.getElementById('result-rate-change');
    resultPointsEarned = document.getElementById('result-points-earned');
    resultNewPoints = document.getElementById('result-new-points');
    closeResultModalButton = document.getElementById('close-result-modal');
    lobbyInstructionElement = document.getElementById('lobby-creation-instruction'); // ★ ロビー指示要素を取得

    loadStateFromSessionStorage();

    if (typeof window.registerUserDataReadyCallback === 'function') {
        window.registerUserDataReadyCallback((loggedInUserData) => {
            console.log("[match.js] User data ready. Updating UI.");
            updateMatchUI();
            resumePollingBasedOnState();
        });
    } else {
        console.error("[match.js] registerUserDataReadyCallback function not found.");
        updateMatchUI();
    }

    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((user) => {
            if (!window.MyApp?.isUserLoggedIn) {
                console.log("[match.js] User logged out. Clearing state.");
                clearMatchStateAndUI(true);
            } else {
                console.log("[match.js] User logged in. Updating UI and maybe resuming poll.");
                updateMatchUI();
                resumePollingBasedOnState();
            }
        });
    } else {
        console.error("[match.js] onLoginStatusChange function not found.");
    }

    // イベントリスナーの設定 (match_actions.js の関数を呼び出す)
    matchButton?.addEventListener('click', startMatchmaking);
    cancelButton?.addEventListener('click', cancelMatchmakingRequest);
    startBattleButton?.addEventListener('click', () => {
        if (reportResultButtons) reportResultButtons.style.display = 'flex';
        if (startBattleButton) startBattleButton.style.display = 'none';
        if (battleStatusText) battleStatusText.textContent = '対戦結果を選択してください。';
    });
    reportWinButton?.addEventListener('click', () => submitReport('win'));
    reportLoseButton?.addEventListener('click', () => submitReport('lose'));
    cancelBattleButton?.addEventListener('click', cancelBattle);
    closeResultModalButton?.addEventListener('click', closeResultModal);
    matchChatSendButton?.addEventListener('click', sendChatMessage);
    matchChatInput?.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    });

    window.addEventListener('beforeunload', () => {
        saveStateToSessionStorage();
        stopHeartbeat();
        disconnectWebSocket();
    });

    updateMatchUI();
});

// --- 状態管理関数 ---

function saveStateToSessionStorage() {
    const state = {
        isMatching,
        currentMatchId,
        currentOpponentData,
        battleStatusTextContent: battleStatusText ? battleStatusText.textContent : '',
        isPollingForResult,
        isSubmittingResult
    };
    try {
        sessionStorage.setItem(MATCH_STATE_KEY, JSON.stringify(state));
        console.log("[match.js] State saved:", state);
    } catch (e) {
        console.error("Error saving state to sessionStorage:", e);
    }
}

function loadStateFromSessionStorage() {
    try {
        const savedStateString = sessionStorage.getItem(MATCH_STATE_KEY);
        if (savedStateString) {
            const savedState = JSON.parse(savedStateString);
            console.log("[match.js] Loading state:", savedState);

            currentMatchId = savedState.currentMatchId || null;
            currentOpponentData = savedState.currentOpponentData || null;
            isMatching = savedState.isMatching || false;
            isPollingForResult = savedState.isPollingForResult || false;
            isSubmittingResult = false; // リロード時は送信中状態をリセット

            if (currentMatchId && currentOpponentData) {
                isMatching = false;
            } else if (isMatching) {
                currentMatchId = null; currentOpponentData = null; isPollingForResult = false;
            } else {
                isMatching = false; currentMatchId = null; currentOpponentData = null; isPollingForResult = false;
            }
            if (battleStatusText && savedState.battleStatusTextContent) {
                battleStatusText.textContent = savedState.battleStatusTextContent;
            }

        } else {
            console.log("[match.js] No state found.");
            isMatching = false; currentMatchId = null; currentOpponentData = null; isPollingForResult = false; isSubmittingResult = false;
        }
    } catch (e) {
        console.error("Error loading state:", e);
        sessionStorage.removeItem(MATCH_STATE_KEY);
        isMatching = false; currentMatchId = null; currentOpponentData = null; isPollingForResult = false; isSubmittingResult = false;
    }
}

function resumePollingBasedOnState() {
    if (window.MyApp?.isUserLoggedIn && typeof window.getAuthToken === 'function' && window.getAuthToken()) {
        if (isMatching && !matchmakingStatusInterval) {
            console.log("[match.js] Resuming matchmaking polling.");
            startPollingMatchStatus();
        } else if (currentMatchId && isPollingForResult && !matchResultPollingInterval) {
            console.log("[match.js] Resuming match result polling.");
            startPollingMatchResult();
        } else if (currentMatchId && currentOpponentData && !isPollingForResult) {
            displayLobbyInstructionWithRandomPlayer(currentOpponentData);
        }
    } else {
        console.log("[match.js] Not logged in or no token, cannot resume polling.");
        if (!window.MyApp?.isUserLoggedIn && (isMatching || currentMatchId)) {
            console.warn("[match.js] Clearing state: User not logged in on resume attempt.");
            clearMatchStateAndUI(true);
        }
    }
}

function clearMatchStateAndUI(updateUIFlag = true) {
    console.log("[match.js] Clearing match state.");
    sessionStorage.removeItem(MATCH_STATE_KEY);
    isMatching = false;
    currentMatchId = null;
    currentOpponentData = null;
    isSubmittingResult = false;
    isPollingForResult = false;

    stopPollingMatchStatus();
    stopPollingMatchResult();
    stopHeartbeat();
    disconnectWebSocket();
    hideLobbyInstruction();

    if (battleStatusText) battleStatusText.textContent = '';
    if (matchChatMessagesArea) matchChatMessagesArea.innerHTML = '';

    if (updateUIFlag) {
        updateMatchUI();
    }
}

// --- UI表示関数 ---

function displayMyProfileInfo(userData) {
    if (!myProfilePic || !myProfileName || !myProfileRate || !myProfilePointsElement) {
        return;
    }
    const defaultAvatar = getDefaultAvatarPath();
    const defaultBadgeImg = getDefaultBadgePath();

    if (userData) {
        myProfilePic.src = userData.picture || defaultAvatar;
        myProfilePic.onerror = () => { myProfilePic.src = defaultAvatar; };
        myProfileName.textContent = escapeHTML(userData.name) || 'プレイヤー名';
        myProfileRate.textContent = userData.rate ?? '----';
        myProfilePointsElement.textContent = `${userData.points ?? '----'} P`;
        const profile = userData.profile || {};
        if (myProfileCourseElement) myProfileCourseElement.textContent = escapeHTML(profile.favCourse) || '未設定';
        if (myProfileCommentElement) myProfileCommentElement.textContent = escapeHTML(profile.comment) || '未設定';

        if (myProfileBadgesContainer && typeof window.displayBadges === 'function') {
            const badgeSlots = myProfileBadgesContainer.querySelectorAll('.badge-slot');
            const badgesToDisplay = userData.displayBadges && userData.displayBadges.length > 0
                ? userData.displayBadges
                : (userData.badges ? [...new Set(userData.badges)].slice(0, 3) : []);
            window.displayBadges(badgeSlots, badgesToDisplay);
        }
    } else {
        myProfilePic.src = defaultAvatar;
        myProfileName.textContent = '---';
        myProfileRate.textContent = '----';
        myProfilePointsElement.textContent = '---- P';
        if (myProfileCourseElement) myProfileCourseElement.textContent = '---';
        if (myProfileCommentElement) myProfileCommentElement.textContent = '---';
        if (myProfileBadgesContainer && typeof window.displayBadges === 'function') {
            const badgeSlots = myProfileBadgesContainer.querySelectorAll('.badge-slot');
            window.displayBadges(badgeSlots, []);
        }
    }
}

function displayOpponentInfo(opponentData) {
    if (!opponentInfoArea || !opponentData) return;
    const defaultAvatar = getDefaultAvatarPath();
    const defaultBadgeImg = getDefaultBadgePath();
    const opponentProfile = opponentData.profile || {};
    const opponentBadges = opponentData.badges || [];
    const opponentDisplayBadges = opponentData.displayBadges || [];
    const opponentBadgesToDisplay = opponentDisplayBadges.length > 0 ? opponentDisplayBadges : [...new Set(opponentBadges)].slice(0, 3);

    let badgesHtml = opponentBadgesToDisplay.map(badgeId => {
        const imgPath = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badgeId) : defaultBadgeImg;
        return `<div class="badge-slot filled"><img src="${imgPath}" alt="${escapeHTML(badgeId)}" onerror="this.onerror=null; this.src='${defaultBadgeImg}';"></div>`;
    }).join('');
    badgesHtml += Array(3 - opponentBadgesToDisplay.length).fill('<div class="badge-slot"></div>').join('');

    opponentInfoArea.innerHTML = `
        <img src="${opponentData.picture || defaultAvatar}" alt="${escapeHTML(opponentData.name)}" class="profile-avatar" onerror="this.onerror=null; this.src='${defaultAvatar}';">
        <div class="profile-name-rate">
            <h3>${escapeHTML(opponentData.name)}</h3>
            <div class="stat-item profile-rate-display">
                <span class="stat-label">レート</span>
                <span class="stat-value">${opponentData.rate ?? '----'}</span>
            </div>
        </div>
        <div class="profile-comment-display">
            <span class="detail-label">一言コメント:</span>
            <p class="detail-comment">${escapeHTML(opponentProfile.comment) || '---'}</p>
        </div>
        <div class="profile-badges">${badgesHtml}</div>
        <div class="profile-home-course-display">
            <span class="detail-label">ホームコース:</span>
            <span class="detail-value">${escapeHTML(opponentProfile.favCourse) || '---'}</span>
        </div>`;
    opponentInfoArea.dataset.opponentId = opponentData.googleId;
}

function displayLobbyInstructionWithRandomPlayer(opponentData) {
    const myProfileNameElement = document.getElementById('my-profile-name');
    if (!myProfileNameElement || !lobbyInstructionElement) {
        console.error("ロビー指示の表示に必要なHTML要素が見つかりません。");
        return;
    }
    const opponentName = opponentData ? opponentData.name : null;
    const myName = myProfileNameElement ? myProfileNameElement.textContent : null;
    if (!opponentName || !myName || myName === '---' || opponentName === '---') {
        lobbyInstructionElement.innerHTML = "マッチングしました！<br>ロビーを作成してください。";
        lobbyInstructionElement.style.display = 'block';
        return;
    }
    const players = [myName, opponentName];
    const selectedPlayerIndex = Math.floor(Math.random() * players.length);
    const lobbyCreatorName = escapeHTML(players[selectedPlayerIndex]);
    const lobbyNamePlayer = escapeHTML(players[1 - selectedPlayerIndex]);
    lobbyInstructionElement.innerHTML = `マッチングしました！<br><b>${lobbyCreatorName}</b> さんが、<b>${lobbyNamePlayer}</b> さんの名前をロビー名にしてプライベートロビーを作成してください。`;
    lobbyInstructionElement.style.display = 'block';
}

function hideLobbyInstruction() {
    if (lobbyInstructionElement) {
        lobbyInstructionElement.style.display = 'none';
    }
}

function updateMatchUI() {
    console.log("[match.js] Updating UI. State:", { isMatching, currentMatchId, isPollingForResult, isSubmittingResult });
    const user = window.MyApp?.currentUserData;
    const loggedIn = !!window.MyApp?.isUserLoggedIn;
    displayMyProfileInfo(user);

    const show = (el) => { if (el) el.style.display = (el.tagName === 'SECTION' || el.tagName === 'DIV' || el.id === 'report-result-buttons') ? 'flex' : 'inline-block'; };
    const hide = (el) => { if (el) el.style.display = 'none'; };
    const disable = (el) => { if (el) el.disabled = true; };
    const enable = (el) => { if (el) el.disabled = false; };
    const setText = (el, text) => { if (el) el.textContent = text; };

    hide(cancelButton); hide(opponentInfoArea); hide(opponentSpinner);
    hide(matchChatSection); hide(resultReportingArea); hide(startBattleButton);
    hide(reportResultButtons); hide(resultModal); hide(lobbyInstructionElement);
    if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
    show(opponentPlaceholder);

    enable(reportWinButton); enable(reportLoseButton); enable(cancelBattleButton);
    enable(matchButton);

    if (loggedIn) {
        if (isMatching) {
            hide(matchButton); show(cancelButton); enable(cancelButton);
            show(opponentPlaceholder); show(opponentSpinner);
            setText(matchStatusText, '対戦相手を探しています...');
            hide(opponentInfoArea);
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
        } else if (currentMatchId && currentOpponentData) {
            hide(matchButton); hide(cancelButton); hide(opponentSpinner); hide(opponentPlaceholder);
            if (opponentInfoArea) opponentInfoArea.style.display = 'contents';
            show(matchChatSection); show(resultReportingArea);
            if (opponentProfileSection) opponentProfileSection.classList.add('visible');
            setText(matchStatusText, '対戦相手が見つかりました！');
            displayOpponentInfo(currentOpponentData);
            displayLobbyInstructionWithRandomPlayer(currentOpponentData);

            if (isSubmittingResult || isPollingForResult) {
                hide(startBattleButton); show(reportResultButtons);
                disable(reportWinButton); disable(reportLoseButton); disable(cancelBattleButton);
                setText(battleStatusText, isSubmittingResult ? '結果送信中...' : '相手の報告を待っています...');
            } else {
                show(startBattleButton); hide(reportResultButtons);
                setText(battleStatusText, '対戦が終了したら結果を報告してください。');
            }
            if (!matchWebSocket || matchWebSocket.readyState === WebSocket.CLOSED) connectWebSocket();
        } else {
            show(matchButton); enable(matchButton); setText(matchButton, 'ライバルを探す');
            setText(matchStatusText, 'ライバルを探しましょう！');
            hide(opponentSpinner); show(opponentPlaceholder);
        }
    } else {
        show(matchButton); disable(matchButton); setText(matchButton, 'ログインが必要です');
        setText(matchStatusText, '対戦するにはログインしてください。');
        hide(opponentSpinner); show(opponentPlaceholder);
    }
}

function showResultModal(didWin, resultData, originalRate) {
    if (!resultModal) return;
    hideLobbyInstruction();
    if (resultTitle) resultTitle.textContent = didWin ? '勝利！' : '敗北...';
    if (resultMyRateBefore) resultMyRateBefore.textContent = originalRate ?? '----';
    if (resultMyRateAfter) resultMyRateAfter.textContent = resultData.newRate ?? '----';
    if (resultRateChange) {
        const change = resultData.rateChange ?? 0;
        resultRateChange.textContent = `${change >= 0 ? '+' : ''}${change}`;
        resultRateChange.style.color = change >= 0 ? (didWin ? 'var(--color-success, green)' : 'var(--color-warning, orange)') : 'var(--color-danger, red)';
    }
    if (resultPointsEarned) resultPointsEarned.textContent = resultData.pointsEarned ?? '--';
    if (resultNewPoints) resultNewPoints.textContent = resultData.newPoints ?? '----';
    resultModal.style.display = 'flex';
    saveStateToSessionStorage();

    setTimeout(() => {
        if (resultModal && resultModal.style.display === 'flex') {
            closeResultModal();
        }
    }, 4000);
}

function closeResultModal() {
    if (resultModal && resultModal.style.display !== 'none') {
        resultModal.style.display = 'none';
        clearMatchStateAndUI(true);
    }
}

function appendChatMessage(messageText, isMyMessage, senderName = '相手') {
    if (!matchChatMessagesArea) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('match-chat-message');

    const isSystem = senderName === 'システム';
    const sender = window.MyApp?.currentUserData;
    const opponent = currentOpponentData;

    if (isSystem) {
        messageDiv.classList.add('system-message');
        messageDiv.innerHTML = `<span class="message-text">${escapeHTML(messageText)}</span>`;
    } else {
        const senderAvatar = isMyMessage ? (sender?.picture || getDefaultAvatarPath()) : (opponent?.picture || getDefaultAvatarPath());
        const senderDisplayName = isMyMessage ? (sender?.name || '自分') : (opponent?.name || '相手');
        const messageClass = isMyMessage ? 'own-message' : 'opponent-message';
        const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        messageDiv.classList.add(messageClass);
        messageDiv.innerHTML = `
            <div class="message-sender">
                <img src="${senderAvatar}" alt="${escapeHTML(senderDisplayName)}" class="chat-avatar" onerror="this.onerror=null; this.src='${getDefaultAvatarPath()}';">
            </div>
            <div class="message-content-wrapper">
                <div class="message-meta">
                    <span class="message-sender-name">${escapeHTML(senderDisplayName)}</span>
                    <span class="message-timestamp">${timestamp}</span>
                </div>
                <p class="message-text">${escapeHTML(messageText)}</p>
            </div>`;
    }

    matchChatMessagesArea.appendChild(messageDiv);
    scrollToChatBottom(false);
}