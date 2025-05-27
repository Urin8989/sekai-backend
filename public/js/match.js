// frontend/match.js

// --- グローバル変数 ---
let isMatching = false;
let matchmakingStatusInterval = null;
let currentMatchId = null;
let currentOpponentData = null;
let matchWebSocket = null;

// DOM要素
let matchButton, cancelButton, opponentInfoArea, matchStatusText, opponentProfileSection, opponentPlaceholder, opponentSpinner;
let myProfilePic, myProfileName, myProfileRate, myProfilePointsElement, myProfileCourseElement, myProfileCommentElement, myProfileBadgesContainer;
let matchChatSection, matchChatMessagesArea, matchChatInput, matchChatSendButton;
let resultReportingArea, startBattleButton, reportResultButtons, reportWinButton, reportLoseButton, battleStatusText;
let resultModal, resultTitle, resultMyRateBefore, resultMyRateAfter, resultRateChange, resultPointsEarned, resultNewPoints, closeResultModalButton;

const getDefaultAvatarPath = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '/public/images/default_avatar.svg';
    } else {
        return '/images/default_avatar.svg';
    }
};
const getDefaultBadgePath = () => typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath('__DEFAULT__') : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '/public/images/default_badge.svg' : '/images/default_badge.svg');


document.addEventListener('DOMContentLoaded', () => {
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
    battleStatusText = document.getElementById('battle-status-text');

    resultModal = document.getElementById('result-modal');
    resultTitle = document.getElementById('result-title');
    resultMyRateBefore = document.getElementById('result-my-rate-before');
    resultMyRateAfter = document.getElementById('result-my-rate-after');
    resultRateChange = document.getElementById('result-rate-change');
    resultPointsEarned = document.getElementById('result-points-earned');
    resultNewPoints = document.getElementById('result-new-points');
    closeResultModalButton = document.getElementById('close-result-modal');

    if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
    if (opponentInfoArea) opponentInfoArea.style.display = 'none';
    if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
    if (opponentSpinner) opponentSpinner.style.display = 'none';
    if (matchChatSection) matchChatSection.style.display = 'none';
    if (matchStatusText && !window.MyApp?.isUserLoggedIn && !isMatching) {
        matchStatusText.textContent = '対戦するにはログインしてください。';
    }

    if (typeof window.registerUserDataReadyCallback === 'function') {
        window.registerUserDataReadyCallback(updateMatchUI);
    } else {
        console.error("[match.js] registerUserDataReadyCallback function not found.");
        updateMatchUI();
    }

    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((user) => {
            updateMatchUI();
            if (!window.MyApp?.isUserLoggedIn) {
                isMatching = false;
                stopPollingMatchStatus();
                currentMatchId = null;
                currentOpponentData = null;
                disconnectWebSocket();
            }
        });
    } else {
        console.error("[match.js] onLoginStatusChange function not found.");
    }

    matchButton?.addEventListener('click', startMatchmaking);
    cancelButton?.addEventListener('click', cancelMatchmakingRequest);
    startBattleButton?.addEventListener('click', () => {
        if (reportResultButtons) reportResultButtons.style.display = 'flex';
        if (startBattleButton) startBattleButton.style.display = 'none';
        if (battleStatusText) battleStatusText.textContent = '対戦結果を選択してください。';
    });
    reportWinButton?.addEventListener('click', () => reportMatchResult(true));
    reportLoseButton?.addEventListener('click', () => reportMatchResult(false));
    closeResultModalButton?.addEventListener('click', closeResultModal);
    matchChatSendButton?.addEventListener('click', sendChatMessage);
    matchChatInput?.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    });
    window.addEventListener('beforeunload', disconnectWebSocket);
});

function displayMyProfileInfo(userData) {
    if (!myProfilePic || !myProfileName || !myProfileRate || !myProfilePointsElement) {
        console.error("[match.js] プロフィール表示に必要な主要要素が見つかりません。");
        return;
    }
    const defaultAvatar = getDefaultAvatarPath();
    const defaultBadgeImg = getDefaultBadgePath();

    if (userData) {
        myProfilePic.src = userData.picture || defaultAvatar;
        myProfilePic.onerror = () => { myProfilePic.src = defaultAvatar; };
        myProfileName.textContent = userData.name || 'プレイヤー名';
        myProfileRate.textContent = userData.rate ?? '----';
        myProfilePointsElement.textContent = `${userData.points ?? '----'} P`;

        const profile = userData.profile || {};
        if (myProfileCourseElement) myProfileCourseElement.textContent = profile.favCourse || '未設定';
        if (myProfileCommentElement) myProfileCommentElement.textContent = profile.comment || '未設定';

        if (myProfileBadgesContainer && typeof window.displayBadges === 'function') {
            const badgeSlots = myProfileBadgesContainer.querySelectorAll('.badge-slot');
            const badgesToDisplay = userData.displayBadges && userData.displayBadges.length > 0
                                  ? userData.displayBadges
                                  : (userData.badges ? [...new Set(userData.badges)].slice(0, 3) : []);
            window.displayBadges(badgeSlots, badgesToDisplay);
        } else if (myProfileBadgesContainer) {
            const badgeSlots = myProfileBadgesContainer.querySelectorAll('.badge-slot');
            const badgesToDisplay = userData.displayBadges && userData.displayBadges.length > 0
                                  ? userData.displayBadges
                                  : (userData.badges ? [...new Set(userData.badges)].slice(0, 3) : []);
            badgeSlots.forEach((slot, i) => {
                slot.innerHTML = '';
                const badgeId = badgesToDisplay[i];
                if(badgeId && typeof window.getBadgeImagePath === 'function'){
                    const img = document.createElement('img');
                    img.src = window.getBadgeImagePath(badgeId);
                    img.alt = badgeId;
                    img.onerror = () => {img.src = defaultBadgeImg;};
                    slot.appendChild(img);
                    slot.style.opacity = '1';
                    slot.classList.add('filled');
                } else {
                    slot.style.opacity = '0.5';
                    slot.classList.remove('filled');
                }
            });
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
    if (!opponentInfoArea) {
        console.warn("[match.js] displayOpponentInfo: opponentInfoArea element not found.");
        return;
    }
    const defaultAvatar = getDefaultAvatarPath();
    const defaultBadgeImg = getDefaultBadgePath();

    const opponentBadgesToDisplay = opponentData.displayBadges && opponentData.displayBadges.length > 0
                                  ? opponentData.displayBadges
                                  : (opponentData.badges ? [...new Set(opponentData.badges)].slice(0, 3) : []);

    let badgesHtml = '';
    if (typeof window.getBadgeImagePath === 'function') {
        badgesHtml = opponentBadgesToDisplay.map(badgeId => {
            const imgPath = window.getBadgeImagePath(badgeId);
            const badgeName = badgeId;
            return `
                <div class="badge-slot filled" style="opacity: 1;">
                    <img src="${imgPath}" alt="${badgeName}" onerror="this.onerror=null; this.src='${defaultBadgeImg}';">
                </div>`;
        }).join('');
        for (let i = opponentBadgesToDisplay.length; i < 3; i++) {
            badgesHtml += `<div class="badge-slot" style="opacity: 0.5;"><span></span></div>`;
        }
    } else {
        for (let i = 0; i < 3; i++) {
            badgesHtml += `<div class="badge-slot" style="opacity: 0.5;"><span></span></div>`;
        }
    }

    opponentInfoArea.innerHTML = `
        <img src="${opponentData.picture || defaultAvatar}" alt="${opponentData.name || '対戦相手'}" class="profile-avatar" onerror="this.onerror=null; this.src='${defaultAvatar}';">
        <div class="profile-name-rate">
            <h3>${opponentData.name || '対戦相手'}</h3>
            <div class="stat-item profile-rate-display">
                <span class="stat-label">レート</span>
                <span class="stat-value">${opponentData.rate ?? '----'}</span>
            </div>
        </div>
        <div class="profile-comment-display">
            <span class="detail-label">対戦コメント:</span>
            <p class="detail-comment">${opponentData.profile?.comment || '---'}</p>
        </div>
        <div class="profile-badges">
            ${badgesHtml}
        </div>
        <div class="profile-home-course-display">
            <span class="detail-label">ホームコース:</span>
            <span class="detail-value">${opponentData.profile?.favCourse || '---'}</span>
        </div>
        <div class="profile-stats" style="display: none !important;"></div>
    `;

    if (opponentProfileSection) opponentProfileSection.classList.add('visible');
    if (opponentPlaceholder) opponentPlaceholder.style.display = 'none';
    if (opponentSpinner) opponentSpinner.style.display = 'none';
}

function updateMatchUI() {
    const user = window.MyApp?.currentUserData;
    const loggedIn = !!window.MyApp?.isUserLoggedIn;
    displayMyProfileInfo(user);

    if (resultReportingArea) resultReportingArea.style.display = 'none';
    if (reportResultButtons) reportResultButtons.style.display = 'none';
    if (startBattleButton) startBattleButton.style.display = 'none';
    if (battleStatusText) battleStatusText.textContent = '';
    if (reportWinButton) reportWinButton.disabled = false;
    if (reportLoseButton) reportLoseButton.disabled = false;

    if (loggedIn) {
        if (isMatching) {
            if(matchButton) matchButton.style.display = 'none';
            if(cancelButton) cancelButton.style.display = 'inline-block';
            if(cancelButton) cancelButton.disabled = false;
            if (matchStatusText) matchStatusText.textContent = '対戦相手を探しています...';
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
            if (opponentInfoArea) opponentInfoArea.innerHTML = '';
            if (opponentInfoArea) opponentInfoArea.style.display = 'none';
            if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
            if (opponentSpinner) opponentSpinner.style.display = 'block';
            if (matchChatSection) matchChatSection.style.display = 'none';
            disconnectWebSocket();
        } else if (currentMatchId && currentOpponentData) {
            if(matchButton) matchButton.style.display = 'none';
            if(cancelButton) cancelButton.style.display = 'none';
            if (matchStatusText) matchStatusText.textContent = '対戦相手が見つかりました！結果を報告してください。';
            if (resultReportingArea) resultReportingArea.style.display = 'block';
            if (startBattleButton) startBattleButton.style.display = 'inline-block';
            if (opponentSpinner) opponentSpinner.style.display = 'none';
            if (opponentPlaceholder) opponentPlaceholder.style.display = 'none';
            if (opponentInfoArea) opponentInfoArea.style.display = 'grid';
            if (matchChatSection) matchChatSection.style.display = 'flex';
            if (!matchWebSocket || matchWebSocket.readyState === WebSocket.CLOSED) {
                connectWebSocket();
            }
        } else {
            if(matchButton) matchButton.textContent = 'ライバルを探す';
            if(matchButton) matchButton.style.display = 'inline-block';
            if(matchButton) matchButton.disabled = false;
            if(cancelButton) cancelButton.style.display = 'none';
            if (matchStatusText) matchStatusText.textContent = ''; 
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
            if (opponentInfoArea) opponentInfoArea.innerHTML = '';
            if (opponentInfoArea) opponentInfoArea.style.display = 'none';
            if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
            if (opponentSpinner) opponentSpinner.style.display = 'none';
            if (matchChatSection) matchChatSection.style.display = 'none';
            disconnectWebSocket();
        }
    } else {
        isMatching = false;
        stopPollingMatchStatus();
        currentMatchId = null;
        currentOpponentData = null;
        if(matchButton) matchButton.textContent = 'ログインが必要です';
        if(matchButton) matchButton.style.display = 'inline-block';
        if(matchButton) matchButton.disabled = true;
        if(cancelButton) cancelButton.style.display = 'none';
        if (matchStatusText) matchStatusText.textContent = '対戦するにはログインしてください。';
        if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
        if (opponentInfoArea) opponentInfoArea.innerHTML = '';
        if (opponentInfoArea) opponentInfoArea.style.display = 'none';
        if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
        if (opponentSpinner) opponentSpinner.style.display = 'none';
        if (matchChatSection) matchChatSection.style.display = 'none';
        disconnectWebSocket();
    }
}

async function startMatchmaking() {
    if (isMatching) return;
    if (!window.MyApp?.isUserLoggedIn) {
        alert("マッチングを開始するにはログインしてください。"); updateMatchUI(); return;
    }
    isMatching = true; currentMatchId = null; currentOpponentData = null; updateMatchUI();
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    if (!token) {
        alert("認証トークンが見つかりません。再ログインしてください。"); isMatching = false; updateMatchUI(); return;
    }
    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/request`;
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `サーバー応答エラー (ステータス: ${response.status})` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.status === 'waiting') startPollingMatchStatus();
        else if (result.status === 'matched') handleMatchFound(result.opponent, result.matchId);
        else throw new Error(`予期せぬステータス: ${result.status}`);
    } catch (error) {
        if (matchStatusText) matchStatusText.textContent = `マッチング開始エラー: ${error.message}`;
        isMatching = false; updateMatchUI();
    }
}

function startPollingMatchStatus() {
    if (matchmakingStatusInterval) clearInterval(matchmakingStatusInterval);
    matchmakingStatusInterval = setInterval(async () => {
        if (!isMatching) { stopPollingMatchStatus(); return; }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/status`;
            const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
            if (!token) { isMatching = false; updateMatchUI(); stopPollingMatchStatus(); return; }
            const response = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) {
                if (response.status === 404 || response.status === 400) {
                    if (matchStatusText) matchStatusText.textContent = 'マッチングが終了しました。';
                    isMatching = false; updateMatchUI(); stopPollingMatchStatus(); return;
                }
                if (response.status === 401 && typeof window.handleLogout === 'function') { window.handleLogout(); isMatching = false; stopPollingMatchStatus(); return; }
                const errorData = await response.json().catch(() => ({ message: '状況確認失敗' }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            switch (result.status) {
                case 'waiting': break;
                case 'matched': handleMatchFound(result.opponent, result.matchId); stopPollingMatchStatus(); break;
                case 'timeout':
                    if (matchStatusText) matchStatusText.textContent = '時間内に相手が見つかりませんでした。';
                    isMatching = false; updateMatchUI(); stopPollingMatchStatus(); break;
                case 'not_found':
                     if (matchStatusText) matchStatusText.textContent = 'マッチングが終了しました。';
                     isMatching = false; updateMatchUI(); stopPollingMatchStatus(); break;
                default: console.warn("[match.js] Unknown status:", result.status); break;
            }
        } catch (error) { if (matchStatusText) matchStatusText.textContent = `状況確認エラー: ${error.message}`; }
    }, 3000);
}

function stopPollingMatchStatus() {
    if (matchmakingStatusInterval) { clearInterval(matchmakingStatusInterval); matchmakingStatusInterval = null; }
}

function handleMatchFound(opponentData, matchId) {
    currentOpponentData = opponentData; currentMatchId = matchId; isMatching = false;
    displayOpponentInfo(opponentData);
    updateMatchUI();
    if (matchChatMessagesArea) matchChatMessagesArea.innerHTML = '<p class="chat-system-message">対戦相手が見つかりました。チャットを開始できます。</p>';
    connectWebSocket();
}

async function cancelMatchmakingRequest() {
    if (!isMatching) return;
    stopPollingMatchStatus(); if (matchStatusText) matchStatusText.textContent = 'キャンセル処理中...'; if (cancelButton) cancelButton.disabled = true;
    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`;
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!token) throw new Error("認証トークンなし");
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'キャンセル失敗' }));
            if (response.status === 400) { if (matchStatusText) matchStatusText.textContent = `キャンセルできません: ${errorData.message}`; }
            else if (response.status === 401 && typeof window.handleLogout === 'function') { window.handleLogout(); return; }
            else throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        } else { if (matchStatusText) matchStatusText.textContent = 'マッチングをキャンセルしました。'; }
    } catch (error) { if (matchStatusText) matchStatusText.textContent = `キャンセルエラー: ${error.message}`;
    } finally {
        isMatching = false; currentMatchId = null; currentOpponentData = null;
        if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
        if (opponentInfoArea) opponentInfoArea.innerHTML = '';
        if (opponentInfoArea) opponentInfoArea.style.display = 'none';
        if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
        updateMatchUI(); disconnectWebSocket();
    }
}

async function reportMatchResult(didWin) {
    if (!currentMatchId || !window.MyApp?.currentUserData) {
        if (battleStatusText) battleStatusText.textContent = '結果報告エラー: 情報不足'; return;
    }
    if (battleStatusText) battleStatusText.textContent = '結果送信中...';
    if (reportWinButton) reportWinButton.disabled = true; if (reportLoseButton) reportLoseButton.disabled = true;
    disconnectWebSocket();
    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/result`;
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!token) throw new Error("認証トークンなし");
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ matchId: currentMatchId, didWin: didWin })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: '結果報告失敗' }));
            if (response.status === 401 && typeof window.handleLogout === 'function') { window.handleLogout(); return; }
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const resultData = await response.json();
        const originalRate = window.MyApp?.currentUserData?.rate;
        if (window.MyApp?.currentUserData) {
            window.MyApp.currentUserData.rate = resultData.newRate;
            window.MyApp.currentUserData.points = resultData.newPoints;
            if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
            if (typeof window.updateUserPoints === 'function') window.updateUserPoints(resultData.newPoints);
        }
        showResultModal(didWin, resultData, originalRate);
        currentMatchId = null; currentOpponentData = null;
    } catch (error) {
        if (battleStatusText) battleStatusText.textContent = `結果報告エラー: ${error.message}`;
        if (reportWinButton) reportWinButton.disabled = false; if (reportLoseButton) reportLoseButton.disabled = false;
    }
}

function showResultModal(didWin, resultData, originalRate) {
    if (!resultModal) return;
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
}

function closeResultModal() {
    if (resultModal) resultModal.style.display = 'none';
    if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
    if (opponentInfoArea) opponentInfoArea.innerHTML = '';
    if (opponentInfoArea) opponentInfoArea.style.display = 'none';
    if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
    updateMatchUI();
}

function appendChatMessage(messageText, isMyMessage, senderName = '相手') {
    if (!matchChatMessagesArea) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('match-chat-message');
    if (senderName === 'システム') messageDiv.classList.add('chat-system-message');
    else messageDiv.classList.add(isMyMessage ? 'my-message' : 'opponent-message');
    const sanitizedText = messageText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const textNode = document.createTextNode(sanitizedText);
    messageDiv.appendChild(textNode);
    matchChatMessagesArea.appendChild(messageDiv);
    matchChatMessagesArea.scrollTop = matchChatMessagesArea.scrollHeight;
}

function sendChatMessage() {
    if (!matchChatInput || !matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) {
        if (!matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) alert("チャットサーバーに接続されていません。");
        return;
    }
    const messageText = matchChatInput.value.trim();
    if (messageText && currentMatchId) {
        const messagePayload = { type: 'MATCH_CHAT_MESSAGE', matchId: currentMatchId, text: messageText }; // サーバーの WebSocketMessageTypes.MATCH_CHAT_MESSAGE に合わせる
        matchWebSocket.send(JSON.stringify(messagePayload));
        appendChatMessage(messageText, true);
        matchChatInput.value = '';
    }
}

function connectWebSocket() {
    if (matchWebSocket && (matchWebSocket.readyState === WebSocket.OPEN || matchWebSocket.readyState === WebSocket.CONNECTING)) return;
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    if (!currentMatchId || !token) {
        appendChatMessage("チャット接続情報が不足しています。", false, "システム"); return;
    }

    // ▼▼▼ ★★★ ここから修正 ★★★ ▼▼▼
    let baseUrl = window.MyApp.WEBSOCKET_URL; 
    let path = ""; 

    if (baseUrl && !baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    if (window.location.hostname === 'www.mariokartbestrivals.com' || window.location.hostname === 'mariokartbestrivals.com') {
        path = "ws/"; 
    }
    // ▲▲▲ ★★★ ここまで修正 ★★★ ▲▲▲
    
    const wsUrl = `${baseUrl}${path}?token=${token}&matchId=${currentMatchId}`; 

    const environment = (window.location.hostname === 'www.mariokartbestrivals.com' || window.location.hostname === 'mariokartbestrivals.com') ? 'production' : 'local';
    console.log(`MATCH_WS_DEBUG (${environment}): Attempting to connect to:`, wsUrl);
    console.log(`MATCH_WS_DEBUG (${environment}): window.MyApp.WEBSOCKET_URL type:`, typeof window.MyApp.WEBSOCKET_URL, "value:", window.MyApp.WEBSOCKET_URL);
    console.log(`MATCH_WS_DEBUG (${environment}): token type:`, typeof token, "value:", token ? token.substring(0,10)+"..." : token);
    console.log(`MATCH_WS_DEBUG (${environment}): currentMatchId type:`, typeof currentMatchId, "value:", currentMatchId);

    appendChatMessage("チャットサーバーに接続中...", false, "システム");
    try {
        matchWebSocket = new WebSocket(wsUrl);
        matchWebSocket.onopen = () => appendChatMessage("チャットに接続しました。", false, "システム");
        matchWebSocket.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data);
                // server.js の WebSocketMessageTypes.MATCH_CHAT_MESSAGE と WebSocketMessageTypes.SYSTEM_MESSAGE に合わせる
                if (messageData.type === 'MATCH_CHAT_MESSAGE' && messageData.text) { 
                    const senderName = messageData.senderName || '相手';
                    if (messageData.senderId !== window.MyApp?.currentUserData?.sub) { 
                         appendChatMessage(messageData.text, false, senderName);
                    }
                } else if (messageData.type === 'SYSTEM_MESSAGE') { 
                    appendChatMessage(messageData.text, false, "システム");
                } else if (messageData.type === 'OPPONENT_DISCONNECTED') { // server.js の WebSocketMessageTypes.OPPONENT_DISCONNECTED
                    appendChatMessage("相手が切断しました。", false, "システム");
                }
            } catch (e) { console.error("Match WebSocket message parse error:", e); }
        };
        matchWebSocket.onerror = (error) => { console.error("Match WebSocket error:", error); appendChatMessage("チャット接続エラーが発生しました。", false, "システム");};
        matchWebSocket.onclose = (event) => {
            if (event.code !== 1000) { 
                 appendChatMessage(`チャット接続が切れました (Code: ${event.code})`, false, "システム");
            } else {
                 appendChatMessage("チャットから切断しました。", false, "システム");
            }
            matchWebSocket = null;
        };
    } catch (error) { console.error("Match WebSocket creation error:", error); appendChatMessage("チャット接続に失敗しました。", false, "システム");}
}

function disconnectWebSocket() {
    if (matchWebSocket) {
        matchWebSocket.close(1000, "Client requested disconnect");
        matchWebSocket = null;
    }
}