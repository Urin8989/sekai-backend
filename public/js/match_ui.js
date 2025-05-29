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
let currentLobbyCreatorGoogleId = null; // ★ ロビー作成者のGoogle ID

// DOM要素
let matchButton, cancelButton, opponentInfoArea, matchStatusText, opponentProfileSection, opponentPlaceholder, opponentSpinner;
let myProfilePic, myProfileName, myProfileRate, myProfilePointsElement, myProfileCourseElement, myProfileCommentElement, myProfileBadgesContainer;
let matchChatSection, matchChatMessagesArea, matchChatInput, matchChatSendButton;
let resultReportingArea, startBattleButton, reportResultButtons, reportWinButton, reportLoseButton, cancelBattleButton, battleStatusText;
let resultModal, resultTitle, resultMyRateBefore, resultMyRateAfter, resultRateChange, resultPointsEarned, resultNewPoints, closeResultModalButton;
let lobbyInstructionElement;

const MATCH_STATE_KEY = 'mkbrMatchState_v4';

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
    lobbyInstructionElement = document.getElementById('lobby-creation-instruction');

    loadStateFromSessionStorage();

    if (typeof window.registerUserDataReadyCallback === 'function') {
        window.registerUserDataReadyCallback((loggedInUserData) => {
            console.log("[match_ui.js] User data ready. Updating UI.");
            updateMatchUI();
            resumePollingBasedOnState();
        });
    } else {
        console.error("[match_ui.js] registerUserDataReadyCallback function not found.");
        updateMatchUI();
    }

    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((user) => {
            if (!window.MyApp?.isUserLoggedIn) {
                console.log("[match_ui.js] User logged out. Clearing state.");
                clearMatchStateAndUI(true);
            } else {
                console.log("[match_ui.js] User logged in. Updating UI and maybe resuming poll.");
                updateMatchUI();
                resumePollingBasedOnState();
            }
        });
    } else {
        console.error("[match_ui.js] onLoginStatusChange function not found.");
    }

    matchButton?.addEventListener('click', startMatchmaking);
    cancelButton?.addEventListener('click', cancelMatchmakingRequest);
    startBattleButton?.addEventListener('click', () => {
        if (reportResultButtons) reportResultButtons.style.display = 'flex';
        if (startBattleButton) startBattleButton.style.display = 'none';
        if (battleStatusText) battleStatusText.textContent = '';
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
        isSubmittingResult,
        currentLobbyCreatorGoogleId,
    };
    try {
        sessionStorage.setItem(MATCH_STATE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error("Error saving state to sessionStorage:", e);
    }
}

function loadStateFromSessionStorage() {
    try {
        const savedStateString = sessionStorage.getItem(MATCH_STATE_KEY);
        if (savedStateString) {
            const savedState = JSON.parse(savedStateString);
            currentMatchId = savedState.currentMatchId || null;
            currentOpponentData = savedState.currentOpponentData || null;
            isMatching = savedState.isMatching || false;
            isPollingForResult = savedState.isPollingForResult || false;
            isSubmittingResult = false;
            currentLobbyCreatorGoogleId = savedState.currentLobbyCreatorGoogleId || null;

            if (currentMatchId && currentOpponentData) {
                isMatching = false;
            } else if (isMatching) {
                currentMatchId = null; currentOpponentData = null; isPollingForResult = false; currentLobbyCreatorGoogleId = null;
            } else {
                 isMatching = false; currentMatchId = null; currentOpponentData = null; isPollingForResult = false; currentLobbyCreatorGoogleId = null;
            }

            if (battleStatusText && savedState.battleStatusTextContent) {
                const textsToRemove = [
                    '対戦が終了したら結果を報告してください。',
                    '対戦結果を選択してください。'
                ];
                if (!textsToRemove.includes(savedState.battleStatusTextContent)) {
                    battleStatusText.textContent = savedState.battleStatusTextContent;
                } else {
                    battleStatusText.textContent = '';
                }
            }
        } else {
            isMatching = false; currentMatchId = null; currentOpponentData = null; isPollingForResult = false; isSubmittingResult = false;
            currentLobbyCreatorGoogleId = null;
        }
    } catch (e) {
        console.error("Error loading state:", e);
        sessionStorage.removeItem(MATCH_STATE_KEY);
        isMatching = false; currentMatchId = null; currentOpponentData = null; isPollingForResult = false; isSubmittingResult = false;
        currentLobbyCreatorGoogleId = null;
    }
}

function resumePollingBasedOnState() {
    if (window.MyApp?.isUserLoggedIn && typeof window.getAuthToken === 'function' && window.getAuthToken()) {
        if (isMatching && !matchmakingStatusInterval) {
            startPollingMatchStatus();
        } else if (currentMatchId && isPollingForResult && !matchResultPollingInterval) {
            startPollingMatchResult();
        }
        updateMatchUI();
    } else if (!window.MyApp?.isUserLoggedIn && (isMatching || currentMatchId)) {
        clearMatchStateAndUI(true);
    }
}

function clearMatchStateAndUI(updateUIFlag = true) {
    sessionStorage.removeItem(MATCH_STATE_KEY);
    isMatching = false;
    currentMatchId = null;
    currentOpponentData = null;
    isSubmittingResult = false;
    isPollingForResult = false;
    currentLobbyCreatorGoogleId = null;

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

function resetCurrentLobbyCreator() {
    currentLobbyCreatorGoogleId = null;
    console.log("[match_ui.js] Lobby creator ID has been reset.");
}
window.resetCurrentLobbyCreator = resetCurrentLobbyCreator;

// --- UI表示関数 ---

function displayMyProfileInfo(userData) {
    if (!myProfilePic || !myProfileName || !myProfileRate || !myProfilePointsElement) return;
    const defaultAvatar = getDefaultAvatarPath();

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
            const badgesToDisplay = userData.displayBadges?.length > 0
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
    const opponentBadgesToDisplay = (opponentData.displayBadges?.length > 0 ? opponentData.displayBadges : [...new Set(opponentData.badges || [])].slice(0, 3));

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

function determineAndDisplayLobbyCreator(opponentData) {
    if (!lobbyInstructionElement) {
        console.error("[determineAndDisplayLobbyCreator] ロビー指示の表示に必要なHTML要素(lobbyInstructionElement)が見つかりません。");
        return;
    }

    if (!opponentData || !opponentData.googleId) {
        // console.log("[determineAndDisplayLobbyCreator] opponentData または opponentData.googleId が未定義です。", opponentData);
        lobbyInstructionElement.innerHTML = "対戦相手の情報を読み込み中です...";
        lobbyInstructionElement.style.display = 'block';
        return;
    }

    if (!window.MyApp?.currentUserData || !window.MyApp.currentUserData.googleId) {
        // console.log("[determineAndDisplayLobbyCreator] currentUserData または currentUserData.googleId が未定義です。", window.MyApp?.currentUserData);
        lobbyInstructionElement.innerHTML = "ユーザー情報を読み込み中です...";
        lobbyInstructionElement.style.display = 'block';
        return;
    }

    const myGoogleId = window.MyApp.currentUserData.googleId;
    const opponentGoogleId = opponentData.googleId;
    let lobbyCreatorName = "";

    if (!currentLobbyCreatorGoogleId || (currentLobbyCreatorGoogleId !== myGoogleId && currentLobbyCreatorGoogleId !== opponentGoogleId)) {
        // console.log("[determineAndDisplayLobbyCreator] ロビー作成者を決定します。 MyID:", myGoogleId, "OpponentID:", opponentGoogleId, "CurrentLobbyCreatorID:", currentLobbyCreatorGoogleId);
        if (myGoogleId < opponentGoogleId) {
            currentLobbyCreatorGoogleId = myGoogleId;
        } else if (opponentGoogleId < myGoogleId) {
            currentLobbyCreatorGoogleId = opponentGoogleId;
        } else {
            console.warn("[determineAndDisplayLobbyCreator] Google IDが一致しました。自分のIDを優先します。");
            currentLobbyCreatorGoogleId = myGoogleId;
        }
    }

    if (currentLobbyCreatorGoogleId === myGoogleId) {
        lobbyCreatorName = escapeHTML(window.MyApp.currentUserData.name) || "あなた";
    } else if (currentLobbyCreatorGoogleId === opponentGoogleId) {
        lobbyCreatorName = escapeHTML(opponentData.name) || "相手";
    } else {
        console.error("[determineAndDisplayLobbyCreator] ロビー作成者名を表示できませんでした。決定されたID:", currentLobbyCreatorGoogleId, "MyID:", myGoogleId, "OpponentID:", opponentGoogleId);
        lobbyInstructionElement.innerHTML = "ロビー作成者の情報を確認できませんでした。ページを再読み込みしてみてください。";
        lobbyInstructionElement.style.display = 'block';
        return;
    }

    lobbyInstructionElement.innerHTML = `マッチングしました！<br><b>${lobbyCreatorName}</b> さん、ロビーを作成してください。`;
    lobbyInstructionElement.style.display = 'block';
}


function hideLobbyInstruction() {
    if (lobbyInstructionElement) lobbyInstructionElement.style.display = 'none';
}

function updateMatchUI() {
    console.log("[match_ui.js] Updating UI. State:", { isMatching, currentMatchId, currentOpponentData, isPollingForResult, isSubmittingResult, currentLobbyCreatorGoogleId });
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
            determineAndDisplayLobbyCreator(currentOpponentData);

            if (isSubmittingResult || isPollingForResult) {
                hide(startBattleButton); show(reportResultButtons);
                disable(reportWinButton); disable(reportLoseButton); disable(cancelBattleButton);
                if (isSubmittingResult) {
                    setText(battleStatusText, '結果送信中...');
                } else if (isPollingForResult) {
                    setText(battleStatusText, '相手の報告を待っています...');
                } else {
                    setText(battleStatusText, '');
                }
            } else {
                show(startBattleButton); hide(reportResultButtons);
                setText(battleStatusText, '');
            }
            if (!matchWebSocket || matchWebSocket.readyState === WebSocket.CLOSED) connectWebSocket();
        } else {
            show(matchButton); enable(matchButton); setText(matchButton, 'ライバルを探す');
            setText(matchStatusText, 'ライバルを探しましょう！');
            hide(opponentSpinner); show(opponentPlaceholder);
            hide(lobbyInstructionElement);
        }
    } else {
        show(matchButton); disable(matchButton); setText(matchButton, 'ログインが必要です');
        setText(matchStatusText, '対戦するにはログインしてください。');
        hide(opponentSpinner); show(opponentPlaceholder);
        hide(lobbyInstructionElement);
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