// frontend/match.js

// --- グローバル変数 ---
let isMatching = false;
let matchmakingStatusInterval = null;
let currentMatchId = null;
let currentOpponentData = null;
let matchWebSocket = null;
let heartbeatInterval = null;
let matchResultPollingInterval = null; // ★ 結果確認ポーリング用

// DOM要素
let matchButton, cancelButton, opponentInfoArea, matchStatusText, opponentProfileSection, opponentPlaceholder, opponentSpinner;
let myProfilePic, myProfileName, myProfileRate, myProfilePointsElement, myProfileCourseElement, myProfileCommentElement, myProfileBadgesContainer;
let matchChatSection, matchChatMessagesArea, matchChatInput, matchChatSendButton;
let resultReportingArea, startBattleButton, reportResultButtons, reportWinButton, reportLoseButton, cancelBattleButton, battleStatusText; // ★ cancelBattleButton 追加
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
    cancelBattleButton = document.getElementById('cancel-battle-button'); // ★ 追加
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
        window.registerUserDataReadyCallback(() => updateMatchUI(false)); // ★ 初回はリセットしない
    } else {
        console.error("[match.js] registerUserDataReadyCallback function not found.");
        updateMatchUI(false);
    }

    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((user) => {
            updateMatchUI(!window.MyApp?.isUserLoggedIn); // ★ ログアウト時はリセット
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
    reportWinButton?.addEventListener('click', () => submitReport('win')); // ★ 変更
    reportLoseButton?.addEventListener('click', () => submitReport('lose')); // ★ 変更
    cancelBattleButton?.addEventListener('click', cancelBattle); // ★ 追加
    closeResultModalButton?.addEventListener('click', closeResultModal);
    matchChatSendButton?.addEventListener('click', sendChatMessage);
    matchChatInput?.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    });
    window.addEventListener('beforeunload', () => {
        stopHeartbeat();
        disconnectWebSocket();
    });
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

    const opponentProfile = opponentData.profile || {};
    const opponentBadges = opponentData.badges || [];
    const opponentDisplayBadges = opponentData.displayBadges || [];

    const opponentBadgesToDisplay = opponentDisplayBadges.length > 0
                                  ? opponentDisplayBadges
                                  : [...new Set(opponentBadges)].slice(0, 3);

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
            <p class="detail-comment">${opponentProfile.comment || '---'}</p>
        </div>
        <div class="profile-badges">
            ${badgesHtml}
        </div>
        <div class="profile-home-course-display">
            <span class="detail-label">ホームコース:</span>
            <span class="detail-value">${opponentProfile.favCourse || '---'}</span>
        </div>
        <div class="profile-stats" style="display: none !important;"></div>
    `;

    if (opponentProfileSection) opponentProfileSection.classList.add('visible');
    if (opponentPlaceholder) opponentPlaceholder.style.display = 'none';
    if (opponentSpinner) opponentSpinner.style.display = 'none';
}


function updateMatchUI(resetState = false) {
    const user = window.MyApp?.currentUserData;
    const loggedIn = !!window.MyApp?.isUserLoggedIn;
    displayMyProfileInfo(user);

    if (resetState) {
        currentMatchId = null;
        currentOpponentData = null;
        isMatching = false;
        stopPollingMatchStatus();
        stopPollingMatchResult();
        stopHeartbeat();
        disconnectWebSocket();
        if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
        if (opponentInfoArea) opponentInfoArea.innerHTML = '';
        if (opponentInfoArea) opponentInfoArea.style.display = 'none';
        if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
        if (matchChatSection) matchChatSection.style.display = 'none';
        if (resultReportingArea) resultReportingArea.style.display = 'none';
    }

    if (resultReportingArea && !resetState) resultReportingArea.style.display = 'none'; // 通常は隠す
    if (reportResultButtons) reportResultButtons.style.display = 'none';
    if (startBattleButton) startBattleButton.style.display = 'none';
    if (battleStatusText) battleStatusText.textContent = '';
    if (reportWinButton) reportWinButton.disabled = false;
    if (reportLoseButton) reportLoseButton.disabled = false;
    if (cancelBattleButton) cancelBattleButton.disabled = false;


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
            stopHeartbeat();
            disconnectWebSocket();
        } else if (currentMatchId && currentOpponentData) {
            if(matchButton) matchButton.style.display = 'none';
            if(cancelButton) cancelButton.style.display = 'none';
            if (matchStatusText) matchStatusText.textContent = '対戦相手が見つかりました！';
            if (resultReportingArea) resultReportingArea.style.display = 'block';
            if (startBattleButton) startBattleButton.style.display = 'inline-block';
            if (battleStatusText) battleStatusText.textContent = '対戦が終了したら結果を報告してください。';
            if (opponentSpinner) opponentSpinner.style.display = 'none';
            if (opponentPlaceholder) opponentPlaceholder.style.display = 'none';
            if (opponentInfoArea) opponentInfoArea.style.display = 'contents';
            if (matchChatSection) matchChatSection.style.display = 'flex';
            if (!matchWebSocket || matchWebSocket.readyState === WebSocket.CLOSED) {
                connectWebSocket();
            }
            // ポーリング中ならボタン無効化
            if (matchResultPollingInterval) {
                 if (battleStatusText) battleStatusText.textContent = '相手の報告を待っています...';
                 if (startBattleButton) startBattleButton.style.display = 'none';
                 if (reportResultButtons) reportResultButtons.style.display = 'flex';
                 if (reportWinButton) reportWinButton.disabled = true;
                 if (reportLoseButton) reportLoseButton.disabled = true;
                 if (cancelBattleButton) cancelBattleButton.disabled = true;
            }
        } else {
            if(matchButton) matchButton.textContent = 'ライバルを探す';
            if(matchButton) matchButton.style.display = 'inline-block';
            if(matchButton) matchButton.disabled = false;
            if(cancelButton) cancelButton.style.display = 'none';
            if (matchStatusText) matchStatusText.textContent = 'ライバルを探しましょう！';
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
            if (opponentInfoArea) opponentInfoArea.innerHTML = '';
            if (opponentInfoArea) opponentInfoArea.style.display = 'none';
            if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
            if (opponentSpinner) opponentSpinner.style.display = 'none';
            if (matchChatSection) matchChatSection.style.display = 'none';
            stopHeartbeat();
            disconnectWebSocket();
        }
    } else {
        isMatching = false;
        stopPollingMatchStatus();
        stopPollingMatchResult();
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
        stopHeartbeat();
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
        updateMatchUI(true); // ★ UIリセット
    }
}

async function submitReport(result) { // 'win' or 'lose'
    if (!currentMatchId) {
        if (battleStatusText) battleStatusText.textContent = '結果報告エラー: 情報不足'; return;
    }

    const confirmMessage = `対戦結果を「${result === 'win' ? '勝利' : '敗北'}」として申告します。よろしいですか？`;
    if (!confirm(confirmMessage)) {
        return;
    }

    if (battleStatusText) battleStatusText.textContent = '結果送信中...';
    if (reportWinButton) reportWinButton.disabled = true;
    if (reportLoseButton) reportLoseButton.disabled = true;
    if (cancelBattleButton) cancelBattleButton.disabled = true;

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/report`;
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!token) throw new Error("認証トークンなし");
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ matchId: currentMatchId, result: result })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: '結果報告失敗' }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const responseData = await response.json();
        handleReportResponse(responseData);

    } catch (error) {
        if (battleStatusText) battleStatusText.textContent = `結果報告エラー: ${error.message}`;
        if (reportWinButton) reportWinButton.disabled = false;
        if (reportLoseButton) reportLoseButton.disabled = false;
        if (cancelBattleButton) cancelBattleButton.disabled = false;
    }
}

async function cancelBattle() {
    if (!currentMatchId) {
        if (battleStatusText) battleStatusText.textContent = 'キャンセルエラー: 情報不足'; return;
    }

    if (!confirm("この対戦をキャンセルしますか？\nレートは変動しません。")) {
        return;
    }

    if (battleStatusText) battleStatusText.textContent = 'キャンセル処理中...';
    if (reportWinButton) reportWinButton.disabled = true;
    if (reportLoseButton) reportLoseButton.disabled = true;
    if (cancelBattleButton) cancelBattleButton.disabled = true;

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel-match`;
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!token) throw new Error("認証トークンなし");
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ matchId: currentMatchId })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'キャンセル失敗' }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const responseData = await response.json();
        handleReportResponse(responseData);

    } catch (error) {
        if (battleStatusText) battleStatusText.textContent = `キャンセルエラー: ${error.message}`;
        if (reportWinButton) reportWinButton.disabled = false;
        if (reportLoseButton) reportLoseButton.disabled = false;
        if (cancelBattleButton) cancelBattleButton.disabled = false;
    }
}

function handleReportResponse(responseData) {
    stopPollingMatchResult(); // まずポーリングを止める
    disconnectWebSocket(); // チャットも終了
    stopHeartbeat();

    switch (responseData.status) {
        case 'waiting':
            if (battleStatusText) battleStatusText.textContent = '相手の報告を待っています...';
            if (startBattleButton) startBattleButton.style.display = 'none';
            if (reportResultButtons) reportResultButtons.style.display = 'flex';
            if (reportWinButton) reportWinButton.disabled = true;
            if (reportLoseButton) reportLoseButton.disabled = true;
            if (cancelBattleButton) cancelBattleButton.disabled = true;
            startPollingMatchResult(); // ポーリング開始
            break;
        case 'finished':
            if (battleStatusText) battleStatusText.textContent = '対戦結果が確定しました！';
            updateGlobalUserData(responseData.resultData.newRate, responseData.resultData.newPoints, responseData.resultData.originalRate);
            showResultModal(responseData.resultData.didWin, responseData.resultData, responseData.resultData.originalRate);
            break;
        case 'disputed':
            if (battleStatusText) battleStatusText.textContent = '報告が一致しませんでした。この対戦は無効(レート変動なし)になります。';
            if (startBattleButton) startBattleButton.style.display = 'none';
            if (reportResultButtons) reportResultButtons.style.display = 'none';
            setTimeout(() => {
                updateMatchUI(true);
            }, 3000);
            break;
        case 'cancelled':
            if (battleStatusText) battleStatusText.textContent = '対戦がキャンセルされました。レート変動はありません。';
            if (startBattleButton) startBattleButton.style.display = 'none';
            if (reportResultButtons) reportResultButtons.style.display = 'none';
            setTimeout(() => {
                updateMatchUI(true);
            }, 3000);
            break;
        default:
             if (battleStatusText) battleStatusText.textContent = '不明な応答を受信しました。';
             break;
    }
}

function updateGlobalUserData(newRate, newPoints) {
    if (window.MyApp?.currentUserData) {
        window.MyApp.currentUserData.rate = newRate;
        window.MyApp.currentUserData.points = newPoints;
        if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
        if (typeof window.updateUserPoints === 'function') window.updateUserPoints(newPoints);
        displayMyProfileInfo(window.MyApp.currentUserData);
    }
}

function startPollingMatchResult() {
    stopPollingMatchResult();
    matchResultPollingInterval = setInterval(async () => {
        if (!currentMatchId) {
            stopPollingMatchResult();
            return;
        }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/match-status/${currentMatchId}`;
            const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
            if (!token) { stopPollingMatchResult(); return; }
            const response = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${token}` } });

            if (response.ok) {
                const result = await response.json();
                if (result.status !== 'matched' && result.status !== 'reported_one') {
                    stopPollingMatchResult();
                    handleReportResponse(result);
                }
            } else if (response.status === 404) {
                 if (battleStatusText) battleStatusText.textContent = 'マッチが見つかりません。';
                 stopPollingMatchResult();
                 setTimeout(() => updateMatchUI(true), 3000);
            } else {
                console.warn("Match status poll failed:", response.status);
                // エラーが続いたら停止するなどの処理を検討
                // stopPollingMatchResult();
            }
        } catch (error) {
            console.error("Error polling match status:", error);
            stopPollingMatchResult();
        }
    }, 5000);
}

function stopPollingMatchResult() {
    if (matchResultPollingInterval) {
        clearInterval(matchResultPollingInterval);
        matchResultPollingInterval = null;
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
    updateMatchUI(true);
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
        const messagePayload = { type: 'MATCH_CHAT_MESSAGE', matchId: currentMatchId, text: messageText };
        matchWebSocket.send(JSON.stringify(messagePayload));
        appendChatMessage(messageText, true);
        matchChatInput.value = '';
    }
}

function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (matchWebSocket && matchWebSocket.readyState === WebSocket.OPEN) {
            try {
                matchWebSocket.send(JSON.stringify({ type: 'PING' }));
            } catch (e) {
                console.error("Failed to send PING:", e);
                stopHeartbeat();
            }
        } else {
            stopHeartbeat();
        }
    }, 30000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function connectWebSocket() {
    if (matchWebSocket && (matchWebSocket.readyState === WebSocket.OPEN || matchWebSocket.readyState === WebSocket.CONNECTING)) return;
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    if (!currentMatchId || !token) {
        appendChatMessage("チャット接続情報が不足しています。", false, "システム"); return;
    }

    let baseUrl = window.MyApp.WEBSOCKET_URL;
    let path = "";

    if (!baseUrl) {
        console.error("WebSocket URL is not defined in window.MyApp.WEBSOCKET_URL");
        appendChatMessage("チャット接続URL設定エラー。", false, "システム");
        return;
    }

    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

    const isProduction = !(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (isProduction && (window.location.hostname === 'www.mariokartbestrivals.com' || window.location.hostname === 'mariokartbestrivals.com')) {
         path = "ws/";
    }

    if (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://')) {
        console.error("WebSocket URL must start with ws:// or wss://", baseUrl);
        appendChatMessage("チャット接続URL設定エラー。", false, "システム");
        return;
    }

    const wsUrl = `${baseUrl}${path}?token=${token}&matchId=${currentMatchId}`;

    const environment = isProduction ? 'production' : 'local';
    console.log(`MATCH_WS_DEBUG (${environment}): Attempting to connect to:`, wsUrl);
    // ... (デバッグログ) ...

    appendChatMessage("チャットサーバーに接続中...", false, "システム");
    try {
        matchWebSocket = new WebSocket(wsUrl);
        matchWebSocket.onopen = () => {
            appendChatMessage("チャットに接続しました。", false, "システム");
            startHeartbeat();
        };
        matchWebSocket.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data);
                if (messageData.type === 'PONG') { return; } // PONGは無視

                if (messageData.type === 'MATCH_CHAT_MESSAGE' && messageData.text) {
                    const senderName = messageData.senderName || '相手';
                    if (messageData.senderId !== window.MyApp?.currentUserData?.sub) {
                         appendChatMessage(messageData.text, false, senderName);
                    }
                } else if (messageData.type === 'SYSTEM_MESSAGE') {
                    appendChatMessage(messageData.text, false, "システム");
                } else if (messageData.type === 'OPPONENT_DISCONNECTED') {
                    appendChatMessage("相手が切断しました。", false, "システム");
                }
            } catch (e) { console.error("Match WebSocket message parse error:", e); }
        };
        matchWebSocket.onerror = (error) => { console.error("Match WebSocket error:", error); appendChatMessage("チャット接続エラーが発生しました。", false, "システム");};
        matchWebSocket.onclose = (event) => {
            stopHeartbeat();
            const wasConnected = !!matchWebSocket;
            matchWebSocket = null;
            // 結果確定前ならメッセージ表示 (確定後は不要)
            if (event.code !== 1000 && currentMatchId && !matchResultPollingInterval) {
                 appendChatMessage(`チャット接続が切れました (Code: ${event.code})`, false, "システム");
            } else if (currentMatchId && !matchResultPollingInterval) {
                 appendChatMessage("チャットから切断しました。", false, "システム");
            }
        };
    } catch (error) { console.error("Match WebSocket creation error:", error); appendChatMessage("チャット接続に失敗しました。", false, "システム");}
}

function disconnectWebSocket() {
    stopHeartbeat();
    if (matchWebSocket) {
        matchWebSocket.close(1000, "Client requested disconnect");
        matchWebSocket = null;
    }
}