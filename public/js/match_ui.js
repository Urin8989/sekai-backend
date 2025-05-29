// frontend/match_ui.js

// --- グローバル変数 ---
// UIの状態に直接関連する変数を window オブジェクトにアタッチしてグローバルにする
window.isMatching = false;
window.currentMatchId = null;
window.currentOpponentData = null;
window.isSubmittingResult = false;
window.isPollingForResult = false;
window.currentLobbyCreatorGoogleId = null;

// DOM要素 (これらはこのファイルスコープのまま)
let matchButton, cancelButton, opponentInfoArea, matchStatusText, opponentProfileSection, opponentPlaceholder, opponentSpinner;
let myProfilePic, myProfileName, myProfileRate, myProfilePointsElement, myProfileCourseElement, myProfileCommentElement, myProfileBadgesContainer;
let matchChatSection, matchChatMessagesArea, matchChatInput, matchChatSendButton;
let resultReportingArea, startBattleButton, reportResultButtons, reportWinButton, reportLoseButton, cancelBattleButton, battleStatusText;
let resultModal, resultTitle, resultMyRateBefore, resultMyRateAfter, resultRateChange, resultPointsEarned, resultNewPoints, closeResultModalButton;
let lobbyInstructionElement;

const MATCH_STATE_KEY = 'mkbrMatchState_v4'; // セッションストレージのキー

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
        window.onLoginStatusChange((isUserLoggedIn) => { // 引数名を変更して、window.MyApp.isUserLoggedIn への依存を減らす
            if (!isUserLoggedIn) {
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

    // イベントリスナーは match_actions.js で定義されたグローバル関数を呼び出す
    matchButton?.addEventListener('click', () => { 
        if (typeof startMatchmaking === 'function') startMatchmaking();
        else console.error("startMatchmaking is not defined");
    });
    cancelButton?.addEventListener('click', () => {
        if (typeof cancelMatchmakingRequest === 'function') cancelMatchmakingRequest();
        else console.error("cancelMatchmakingRequest is not defined");
    });
    startBattleButton?.addEventListener('click', () => {
        if (reportResultButtons) reportResultButtons.style.display = 'flex';
        if (startBattleButton) startBattleButton.style.display = 'none';
        if (battleStatusText) battleStatusText.textContent = '';
    });
    reportWinButton?.addEventListener('click', () => {
        if (typeof submitReport === 'function') submitReport('win');
        else console.error("submitReport is not defined");
    });
    reportLoseButton?.addEventListener('click', () => {
        if (typeof submitReport === 'function') submitReport('lose');
        else console.error("submitReport is not defined");
    });
    cancelBattleButton?.addEventListener('click', () => {
        if (typeof cancelBattle === 'function') cancelBattle();
        else console.error("cancelBattle is not defined");
    });
    closeResultModalButton?.addEventListener('click', closeResultModal);

    matchChatSendButton?.addEventListener('click', () => {
        if (typeof sendChatMessage === 'function') sendChatMessage();
        else console.error("sendChatMessage is not defined");
    });
    matchChatInput?.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (typeof sendChatMessage === 'function') sendChatMessage();
            else console.error("sendChatMessage is not defined");
        }
    });

    window.addEventListener('beforeunload', () => {
        saveStateToSessionStorage();
        if (typeof stopHeartbeat === 'function') stopHeartbeat(); // match_actions.js で定義
        if (typeof disconnectWebSocket === 'function') disconnectWebSocket(); // match_actions.js で定義
    });

    updateMatchUI();
});

// --- 状態管理関数 ---

function saveStateToSessionStorage() {
    const state = {
        isMatching: window.isMatching, // window. から取得
        currentMatchId: window.currentMatchId,
        currentOpponentData: window.currentOpponentData,
        battleStatusTextContent: battleStatusText ? battleStatusText.textContent : '',
        isPollingForResult: window.isPollingForResult,
        isSubmittingResult: window.isSubmittingResult,
        currentLobbyCreatorGoogleId: window.currentLobbyCreatorGoogleId,
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
            window.currentMatchId = savedState.currentMatchId || null;
            window.currentOpponentData = savedState.currentOpponentData || null;
            window.isMatching = savedState.isMatching || false;
            window.isPollingForResult = savedState.isPollingForResult || false;
            window.isSubmittingResult = false; // リロード時は常にfalse
            window.currentLobbyCreatorGoogleId = savedState.currentLobbyCreatorGoogleId || null;

            if (window.currentMatchId && window.currentOpponentData) {
                window.isMatching = false;
            } else if (window.isMatching) {
                window.currentMatchId = null; window.currentOpponentData = null; window.isPollingForResult = false; window.currentLobbyCreatorGoogleId = null;
            } else {
                 window.isMatching = false; window.currentMatchId = null; window.currentOpponentData = null; window.isPollingForResult = false; window.currentLobbyCreatorGoogleId = null;
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
            window.isMatching = false; window.currentMatchId = null; window.currentOpponentData = null; window.isPollingForResult = false; window.isSubmittingResult = false;
            window.currentLobbyCreatorGoogleId = null;
        }
    } catch (e) {
        console.error("Error loading state from sessionStorage:", e);
        sessionStorage.removeItem(MATCH_STATE_KEY);
        window.isMatching = false; window.currentMatchId = null; window.currentOpponentData = null; window.isPollingForResult = false; window.isSubmittingResult = false;
        window.currentLobbyCreatorGoogleId = null;
    }
}

function resumePollingBasedOnState() {
    if (window.MyApp?.isUserLoggedIn && typeof window.getAuthToken === 'function' && window.getAuthToken()) {
        // startPollingMatchStatus と startPollingMatchResult は match_actions.js で定義されているグローバル関数を期待
        if (window.isMatching && typeof window.matchmakingStatusInterval === 'undefined' && typeof startPollingMatchStatus === 'function') { // matchmakingStatusInterval は match_actions.js で管理
            startPollingMatchStatus();
        } else if (window.currentMatchId && window.isPollingForResult && typeof window.matchResultPollingInterval === 'undefined' && typeof startPollingMatchResult === 'function') { // matchResultPollingInterval は match_actions.js で管理
            startPollingMatchResult();
        }
        updateMatchUI();
    } else if (!window.MyApp?.isUserLoggedIn && (window.isMatching || window.currentMatchId)) {
        clearMatchStateAndUI(true);
    }
}

function clearMatchStateAndUI(updateUIFlag = true) {
    sessionStorage.removeItem(MATCH_STATE_KEY);
    window.isMatching = false;
    window.currentMatchId = null;
    window.currentOpponentData = null;
    window.isSubmittingResult = false;
    window.isPollingForResult = false;
    window.currentLobbyCreatorGoogleId = null;

    // stopPolling関数群は match_actions.js で定義されているグローバル関数を期待
    if (typeof stopPollingMatchStatus === 'function') stopPollingMatchStatus();
    if (typeof stopPollingMatchResult === 'function') stopPollingMatchResult();
    if (typeof stopHeartbeat === 'function') stopHeartbeat();
    if (typeof disconnectWebSocket === 'function') disconnectWebSocket();

    hideLobbyInstruction();

    if (battleStatusText) battleStatusText.textContent = '';
    if (matchChatMessagesArea) matchChatMessagesArea.innerHTML = '';

    if (updateUIFlag) {
        updateMatchUI();
    }
}

// match_actions.js から呼び出されるためグローバルに公開
function resetCurrentLobbyCreator() {
    window.currentLobbyCreatorGoogleId = null;
    console.log("[match_ui.js] Lobby creator ID has been reset.");
}
window.resetCurrentLobbyCreator = resetCurrentLobbyCreator; // グローバル関数として登録

// --- UI表示関数 ---

function displayMyProfileInfo(userData) {
    if (!myProfilePic || !myProfileName || !myProfileRate) return; // myProfilePointsElement はオプションに
    const defaultAvatar = getDefaultAvatarPath();

    if (userData) {
        myProfilePic.src = userData.picture || defaultAvatar;
        myProfilePic.onerror = () => { myProfilePic.src = defaultAvatar; };
        myProfileName.textContent = escapeHTML(userData.name) || 'プレイヤー名';
        myProfileRate.textContent = userData.rate ?? '----';
        if (myProfilePointsElement) myProfilePointsElement.textContent = `${userData.points ?? '----'} P`;
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
        if (myProfilePointsElement) myProfilePointsElement.textContent = '---- P';
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

function determineAndDisplayLobbyCreator(opponentDataToDisplay) { // 引数名変更
    if (!lobbyInstructionElement) {
        console.error("[match_ui.js determineAndDisplayLobbyCreator] lobbyInstructionElement not found.");
        return;
    }

    // window.currentOpponentData を使うのではなく、引数で渡されたデータを使用
    if (!opponentDataToDisplay || !opponentDataToDisplay.googleId) {
        lobbyInstructionElement.innerHTML = "対戦相手の情報を読み込み中です...";
        lobbyInstructionElement.style.display = 'block';
        return;
    }

    if (!window.MyApp?.currentUserData || !window.MyApp.currentUserData.googleId) {
        lobbyInstructionElement.innerHTML = "ユーザー情報を読み込み中です...";
        lobbyInstructionElement.style.display = 'block';
        return;
    }

    const myGoogleId = window.MyApp.currentUserData.googleId;
    const opponentGoogleId = opponentDataToDisplay.googleId; // 引数のデータを使用
    let lobbyCreatorName = "";

    // window.currentLobbyCreatorGoogleId を使用
    if (!window.currentLobbyCreatorGoogleId || (window.currentLobbyCreatorGoogleId !== myGoogleId && window.currentLobbyCreatorGoogleId !== opponentGoogleId)) {
        if (myGoogleId < opponentGoogleId) {
            window.currentLobbyCreatorGoogleId = myGoogleId;
        } else if (opponentGoogleId < myGoogleId) {
            window.currentLobbyCreatorGoogleId = opponentGoogleId;
        } else {
            console.warn("[match_ui.js determineAndDisplayLobbyCreator] Google IDs are identical. Defaulting to current user.");
            window.currentLobbyCreatorGoogleId = myGoogleId;
        }
    }

    if (window.currentLobbyCreatorGoogleId === myGoogleId) {
        lobbyCreatorName = escapeHTML(window.MyApp.currentUserData.name) || "あなた";
    } else if (window.currentLobbyCreatorGoogleId === opponentGoogleId) {
        lobbyCreatorName = escapeHTML(opponentDataToDisplay.name) || "相手"; // 引数のデータを使用
    } else {
        console.error("[match_ui.js determineAndDisplayLobbyCreator] Could not determine lobby creator name. DeterminedID:", window.currentLobbyCreatorGoogleId, "MyID:", myGoogleId, "OpponentID:", opponentGoogleId);
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
    console.log("[match_ui.js] updateMatchUI called. Current window.isMatching:", window.isMatching);
    console.log("[match_ui.js] Updating UI. State:", { 
        isMatching: window.isMatching, 
        currentMatchId: window.currentMatchId, 
        currentOpponentData: window.currentOpponentData, 
        isPollingForResult: window.isPollingForResult, 
        isSubmittingResult: window.isSubmittingResult, 
        currentLobbyCreatorGoogleId: window.currentLobbyCreatorGoogleId 
    });
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
        if (window.isMatching) {
            hide(matchButton); show(cancelButton); enable(cancelButton);
            show(opponentPlaceholder); show(opponentSpinner);
            setText(matchStatusText, '対戦相手を探しています...');
            hide(opponentInfoArea);
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
            hide(lobbyInstructionElement);
        } else if (window.currentMatchId && window.currentOpponentData) {
            hide(matchButton); hide(cancelButton); hide(opponentSpinner); hide(opponentPlaceholder);
            if (opponentInfoArea) opponentInfoArea.style.display = 'contents';
            show(matchChatSection); show(resultReportingArea);
            if (opponentProfileSection) opponentProfileSection.classList.add('visible');
            setText(matchStatusText, '対戦相手が見つかりました！');
            displayOpponentInfo(window.currentOpponentData); // window. から取得
            determineAndDisplayLobbyCreator(window.currentOpponentData); // window. から取得したデータを渡す

            if (window.isSubmittingResult || window.isPollingForResult) {
                hide(startBattleButton); show(reportResultButtons);
                disable(reportWinButton); disable(reportLoseButton); disable(cancelBattleButton);
                if (window.isSubmittingResult) {
                    setText(battleStatusText, '結果送信中...');
                } else if (window.isPollingForResult) {
                    setText(battleStatusText, '相手の報告を待っています...');
                } else {
                    // このelseブロックは通常到達しないが、念のためbattleStatusTextをクリア
                    if (battleStatusText && battleStatusText.textContent === '結果送信中...' || battleStatusText.textContent === '相手の報告を待っています...') {
                        //setText(battleStatusText, ''); // 状態と矛盾するテキストならクリア
                    }
                }
            } else {
                show(startBattleButton); hide(reportResultButtons);
                // battleStatusText は handleReportResponse でエラー等が表示される可能性があるので、ここではクリアしない方が良い場合もある。
                // ただし、マッチ直後で報告前なら空でよい。
                if (battleStatusText && !battleStatusText.textContent.includes("エラー") && !battleStatusText.textContent.includes("キャンセル") && !battleStatusText.textContent.includes("無効")) {
                   setText(battleStatusText, '');
                }
            }
             // connectWebSocket は match_actions.js で定義されたグローバル関数を期待
            if (typeof window.matchWebSocket === 'undefined' || (window.matchWebSocket && window.matchWebSocket.readyState === WebSocket.CLOSED)) { // matchWebSocket は match_actions.js で管理されるグローバル変数
                if (typeof connectWebSocket === 'function') connectWebSocket();
            }
        } else { // ログイン済みだが、マッチング前
            show(matchButton); enable(matchButton); setText(matchButton, 'ライバルを探す');
            setText(matchStatusText, 'ライバルを探しましょう！');
            hide(opponentSpinner); show(opponentPlaceholder);
            hide(lobbyInstructionElement);
            if(battleStatusText) battleStatusText.textContent = ''; // 以前のメッセージをクリア
        }
    } else { // 未ログイン時
        show(matchButton); disable(matchButton); setText(matchButton, 'ログインが必要です');
        setText(matchStatusText, '対戦するにはログインしてください。');
        hide(opponentSpinner); show(opponentPlaceholder);
        hide(lobbyInstructionElement);
        if(battleStatusText) battleStatusText.textContent = '';
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
    }, 6000);
}

function closeResultModal() {
    if (resultModal && resultModal.style.display !== 'none') {
        resultModal.style.display = 'none';
        clearMatchStateAndUI(true);
    }
}

// appendChatMessage は match_actions.js からも呼ばれる想定であればグローバルにするか、
// match_ui.js内でのみ使うならこのままで良い。現状は match_actions.js からも呼ばれる想定。
function appendChatMessage(messageText, isMyMessage, senderName = '相手') {
    if (!matchChatMessagesArea) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('match-chat-message');

    const isSystem = senderName === 'システム';
    const sender = window.MyApp?.currentUserData;
    const opponent = window.currentOpponentData; // window. から取得

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
// match_actions.js から使えるようにグローバルに公開
window.appendChatMessage = appendChatMessage;