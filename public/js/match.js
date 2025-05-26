// frontend/match.js

// --- グローバル変数 ---
let isMatching = false;
let matchmakingStatusInterval = null;
let currentMatchId = null;
let currentOpponentData = null;
let matchWebSocket = null;

// DOM要素 (DOMContentLoaded後に取得)
let matchButton, cancelButton, opponentInfoArea, matchStatusText, opponentProfileSection, opponentPlaceholder, opponentSpinner;
let myProfilePic, myProfileName, myProfileRate, myProfilePoints, myProfileCourseElement, myProfileCommentElement, myProfileBadgesContainer; // ★ myProfileCourse/Comment を Element に変更
let matchChatSection, matchChatMessagesArea, matchChatInput, matchChatSendButton;
let resultReportingArea, startBattleButton, reportResultButtons, reportWinButton, reportLoseButton, battleStatusText;
let resultModal, resultTitle, resultMyRateBefore, resultMyRateAfter, resultRateChange, resultPointsEarned, resultNewPoints, closeResultModalButton;


/**
 * 自分のプロフィール情報をHTMLに表示する
 * @param {object|null} userData - ユーザーデータオブジェクト
 */
function displayMyProfileInfo(userData) {
    console.log("[match.js] displayMyProfileInfo called with user data:", userData ? userData.name : "null");

    if (!myProfilePic || !myProfileName || !myProfileRate || !document.getElementById('my-profile-points')) { // IDで直接確認
        console.error("[match.js] プロフィール表示に必要な主要要素が見つかりません。HTMLのIDを確認してください。");
        return;
    }

    if (userData) {
        myProfilePic.src = userData.picture || 'images/placeholder-avatar.png';
        myProfileName.textContent = userData.name || 'プレイヤー名';
        myProfileRate.textContent = userData.rate ?? '----'; // myProfileRate は stat-value の span
        document.getElementById('my-profile-points').textContent = `${userData.points ?? '----'} P`; // 直接IDで

        const profile = userData.profile || {};
        if (myProfileCourseElement) myProfileCourseElement.textContent = profile.favCourse || '未設定'; // span#my-profile-course
        if (myProfileCommentElement) myProfileCommentElement.textContent = profile.comment || '未設定';   // p#my-profile-comment

        if (myProfileBadgesContainer && typeof window.displayBadges === 'function') {
            const badgeSlots = myProfileBadgesContainer.querySelectorAll('.badge-slot');
            window.displayBadges(badgeSlots, userData.badges || []);
        } else {
            // (フォールバック処理は変更なし)
             console.warn("[match.js] displayBadges or badge container not found. Using fallback for my profile.");
             const badgeSlots = myProfileBadgesContainer?.querySelectorAll('.badge-slot');
             if (badgeSlots) {
                const badgeIds = userData.badges || [];
                badgeSlots.forEach((slot, index) => {
                    slot.innerHTML = '';
                    const badgeId = badgeIds[index];
                    if (badgeId && typeof window.getBadgeImagePath === 'function') {
                        const imgPath = window.getBadgeImagePath(badgeId);
                        const img = document.createElement('img');
                        img.src = imgPath;
                        img.alt = badgeId;
                        slot.appendChild(img);
                        slot.style.opacity = '1';
                    } else {
                        slot.style.opacity = '0.5';
                    }
                });
            }
        }
    } else {
        myProfilePic.src = 'images/placeholder-avatar.png';
        myProfileName.textContent = '---';
        myProfileRate.textContent = '----';
        document.getElementById('my-profile-points').textContent = '---- P';
        if (myProfileCourseElement) myProfileCourseElement.textContent = '---';
        if (myProfileCommentElement) myProfileCommentElement.textContent = '---';
        if (myProfileBadgesContainer) {
            myProfileBadgesContainer.querySelectorAll('.badge-slot').forEach(slot => {
                slot.innerHTML = '';
                slot.style.opacity = '0.5';
            });
        }
    }
}

/**
 * 対戦相手の情報をHTMLに表示する (★ 大幅に修正)
 * @param {object} opponentData - 対戦相手のデータ
 */
function displayOpponentInfo(opponentData) {
    console.log("[match.js] displayOpponentInfo called with:", opponentData);
    if (!opponentInfoArea) {
        console.warn("[match.js] displayOpponentInfo: opponentInfoArea element not found.");
        return;
    }

    // 新しいHTML構造に合わせてコンテンツを生成
    opponentInfoArea.innerHTML = `
        <img src="${opponentData.picture || 'images/placeholder-avatar.png'}" alt="${opponentData.name || '対戦相手'}" class="profile-avatar">

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
            ${(opponentData.badges && opponentData.badges.length > 0 ? opponentData.badges.slice(0, 3) : Array(3).fill(null))
                .map(badgeId => `
                    <div class="badge-slot" style="opacity: ${badgeId ? 1 : 0.5};">
                        ${badgeId && typeof window.getBadgeImagePath === 'function' ? `<img src="${window.getBadgeImagePath(badgeId)}" alt="${badgeId}">` : '<span></span>'}
                    </div>
                `).join('')}
        </div>

        <div class="profile-home-course-display">
            <span class="detail-label">ホームコース:</span>
            <span class="detail-value">${opponentData.profile?.favCourse || '---'}</span>
        </div>

        <div class="profile-stats" style="display: none !important;">
            </div>
    `;

    // バッジ表示処理 (もしopponentData.badgesの形式がIDの配列なら、共通関数を使う)
    // 上のテンプレートリテラル内で簡易的に処理したが、共通関数を使いたい場合は以下のようにする
    // const opponentBadgesContainer = opponentInfoArea.querySelector('.profile-badges');
    // if (opponentBadgesContainer && typeof window.displayBadges === 'function') {
    //     const badgeSlots = opponentBadgesContainer.querySelectorAll('.badge-slot');
    //     window.displayBadges(badgeSlots, opponentData.badges || []);
    // }

    if (opponentProfileSection) opponentProfileSection.classList.add('visible');
    if (opponentPlaceholder) opponentPlaceholder.style.display = 'none'; // プレースホルダーを非表示
    if (opponentSpinner) opponentSpinner.style.display = 'none';
}


// --- UI更新関数 (変更なし) ---
function updateMatchUI() {
    // (この関数は前のままでOK、displayMyProfileInfoの呼び出しは新しい構造に対応済み)
    const user = window.MyApp?.currentUserData;
    const loggedIn = !!window.MyApp?.isUserLoggedIn;
    console.log("[match.js] updateMatchUI called. Logged in:", loggedIn, "isMatching:", isMatching, "currentMatchId:", currentMatchId);

    displayMyProfileInfo(user); // ★ 自分の情報を更新

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
            if (opponentInfoArea) opponentInfoArea.style.display = 'none'; // ★ opponent-info を非表示
            if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex'; // ★ placeholder を表示
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
            if (opponentPlaceholder) opponentPlaceholder.style.display = 'none';// ★ placeholder を非表示
            if (opponentInfoArea) opponentInfoArea.style.display = 'grid'; // ★ opponent-info を表示 (grid or flex)
            if (matchChatSection) matchChatSection.style.display = 'flex';
            if (!matchWebSocket) {
                connectWebSocket();
            }
        } else {
            if(matchButton) matchButton.textContent = 'ライバルを探す';
            if(matchButton) matchButton.style.display = 'inline-block';
            if(matchButton) matchButton.disabled = false;
            if(cancelButton) cancelButton.style.display = 'none';
            if (matchStatusText) matchStatusText.textContent = 'ボタンを押して対戦相手を探しましょう！';
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
            if (opponentInfoArea) opponentInfoArea.style.display = 'none'; // ★ opponent-info を非表示
            if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex'; // ★ placeholder を表示
            if (opponentSpinner) opponentSpinner.style.display = 'none';
            if (matchChatSection) matchChatSection.style.display = 'none';
            disconnectWebSocket();
        }
    } else {
        // (未ログイン状態の処理は変更なし)
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
        if (opponentInfoArea) opponentInfoArea.style.display = 'none';
        if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
        if (opponentSpinner) opponentSpinner.style.display = 'none';
        if (matchChatSection) matchChatSection.style.display = 'none';
        disconnectWebSocket();
    }
}


// --- 初期化 (DOM要素取得部分を修正) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[match.js] DOMContentLoaded");

    matchButton = document.getElementById('match-button');
    cancelButton = document.getElementById('cancel-match-button');
    opponentInfoArea = document.getElementById('opponent-info'); // これは相手情報全体のコンテナ
    matchStatusText = document.getElementById('match-status');
    opponentProfileSection = document.getElementById('opponent-profile'); // opponent-info を含む section
    opponentPlaceholder = document.getElementById('opponent-placeholder');
    opponentSpinner = document.getElementById('opponent-spinner');

    // 自分の情報表示用要素
    myProfilePic = document.getElementById('my-profile-pic');
    myProfileName = document.getElementById('my-profile-name');
    myProfileRate = document.getElementById('my-profile-rate'); // これはレート値のspan
    // myProfilePoints は displayMyProfileInfo内で直接ID指定
    myProfileCourseElement = document.querySelector('#my-profile .profile-home-course-display .detail-value'); // ★ セレクタ変更
    myProfileCommentElement = document.querySelector('#my-profile .profile-comment-display .detail-comment'); // ★ セレクタ変更
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

    // 初期UI状態設定
    if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
    if (opponentInfoArea) opponentInfoArea.style.display = 'none';
    if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex'; // ★ 初期はプレースホルダー表示
    if (opponentSpinner) opponentSpinner.style.display = 'none';
    if (matchChatSection) matchChatSection.style.display = 'none';
    if (matchStatusText && !window.MyApp?.isUserLoggedIn && !isMatching) {
        matchStatusText.textContent = '対戦するにはログインしてください。';
    }


    if (typeof registerUserDataReadyCallback === 'function') {
        registerUserDataReadyCallback((user) => {
            console.log("[match.js] User data ready callback executed:", user ? user.name : "null");
            updateMatchUI();
        });
    } else {
        console.error("[match.js] registerUserDataReadyCallback function not found.");
        updateMatchUI(); // fallback
    }

    if (typeof onLoginStatusChange === 'function') {
        onLoginStatusChange((user) => {
            console.log("[match.js] Login status changed:", user ? user.name : "null");
            updateMatchUI();
            if (!window.MyApp?.isUserLoggedIn) {
                console.log("[match.js] User logged out, resetting matchmaking state.");
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

    // イベントリスナー (変更なし)
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


// --- マッチング関連関数 (startMatchmaking, startPollingMatchStatus, stopPollingMatchStatus, handleMatchFound, cancelMatchmakingRequest は変更なし) ---
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
                if (response.status === 404 || response.status === 400) { // 400も追加 (キューにない場合など)
                    if (matchStatusText) matchStatusText.textContent = 'マッチングが終了しました。';
                    isMatching = false; updateMatchUI(); stopPollingMatchStatus(); return;
                }
                if (response.status === 401 && typeof window.handleLogout === 'function') { window.handleLogout(); isMatching = false; stopPollingMatchStatus(); return; }
                const errorData = await response.json().catch(() => ({ message: '状況確認失敗' }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            switch (result.status) {
                case 'waiting': console.log("[match.js] Matchmaking status: waiting..."); break;
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
    console.log("[match.js] Match found. Opponent:", opponentData, "Match ID:", matchId);
    currentOpponentData = opponentData; currentMatchId = matchId; isMatching = false;
    displayOpponentInfo(opponentData); // ★ opponent-info を更新
    updateMatchUI(); // ★ UI全体を更新
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
        if (opponentInfoArea) opponentInfoArea.style.display = 'none'; // ★ opponent-infoを非表示に戻す
        if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex'; // ★ placeholderを表示に戻す
        updateMatchUI(); disconnectWebSocket();
    }
}

// --- 結果報告関連関数 (reportMatchResult, showResultModal, closeResultModal は変更なし) ---
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
        resultRateChange.style.color = change >= 0 ? (didWin ? 'var(--color-success, green)' : 'var(--color-warning, orange)') : 'var(--color-danger, red)'; // 勝敗で色分け
    }
    if (resultPointsEarned) resultPointsEarned.textContent = resultData.pointsEarned ?? '--';
    if (resultNewPoints) resultNewPoints.textContent = resultData.newPoints ?? '----';
    resultModal.style.display = 'flex';
}

function closeResultModal() {
    if (resultModal) resultModal.style.display = 'none';
    if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
    if (opponentInfoArea) opponentInfoArea.style.display = 'none';
    if (opponentPlaceholder) opponentPlaceholder.style.display = 'flex';
    updateMatchUI();
}


// --- チャット関連関数 (appendChatMessage, sendChatMessage, connectWebSocket, disconnectWebSocket は変更なし) ---
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
        const messagePayload = { type: 'chat_message', matchId: currentMatchId, text: messageText };
        matchWebSocket.send(JSON.stringify(messagePayload));
        appendChatMessage(messageText, true);
        matchChatInput.value = '';
    }
}

function connectWebSocket() {
    if (matchWebSocket && matchWebSocket.readyState === WebSocket.OPEN) return;
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    if (!currentMatchId || !token) {
        appendChatMessage("チャット接続情報なし。", false, "システム"); return;
    }
    const wsUrl = `${window.MyApp.WEBSOCKET_URL}?token=${token}&matchId=${currentMatchId}`;
    appendChatMessage("チャット接続中...", false, "システム");
    try {
        matchWebSocket = new WebSocket(wsUrl);
        matchWebSocket.onopen = () => appendChatMessage("接続しました。", false, "システム");
        matchWebSocket.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data);
                if (messageData.type === 'chat_message' && messageData.text) {
                    const senderName = messageData.senderName || '相手';
                    const isMyMsg = messageData.senderId === window.MyApp?.currentUserData?.sub;
                    if (!isMyMsg) appendChatMessage(messageData.text, false, senderName);
                } else if (messageData.type === 'system_message') {
                    appendChatMessage(messageData.text, false, "システム");
                } else if (messageData.type === 'opponent_disconnected') {
                    appendChatMessage("相手が切断しました。", false, "システム");
                }
            } catch (e) { console.error("WS message parse error:", e); }
        };
        matchWebSocket.onerror = (error) => { console.error("WS error:", error); appendChatMessage("チャット接続エラー。", false, "システム");};
        matchWebSocket.onclose = (event) => {
            if (event.code !== 1000) appendChatMessage(`チャット切断 (Code: ${event.code})`, false, "システム");
            matchWebSocket = null;
        };
    } catch (error) { console.error("WS create error:", error); appendChatMessage("チャット接続失敗。", false, "システム");}
}

function disconnectWebSocket() {
    if (matchWebSocket) { matchWebSocket.close(1000, "Client disconnect"); matchWebSocket = null; }
}


// フォールバック displayBadges (変更なし)
if (typeof window.displayBadges === 'undefined') {
    window.displayBadges = function(badgeSlots, badgeIds) {
        // ... (変更なし)
    };
}