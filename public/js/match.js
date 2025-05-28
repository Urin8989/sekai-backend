// frontend/match.js

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

/**
 * 開発環境か本番環境かに応じてデフォルトアバター画像のパスを返します。
 * @returns {string} デフォルトアバター画像のパス
 */
const getDefaultAvatarPath = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '/public/images/default_avatar.svg';
    } else {
        return '/images/default_avatar.svg';
    }
};

/**
 * デフォルトバッジ画像のパスを返します。
 * @returns {string} デフォルトバッジ画像のパス
 */
const getDefaultBadgePath = () => typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath('__DEFAULT__') : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '/public/images/default_badge.svg' : '/images/default_badge.svg');

/**
 * XSS対策のためにHTML文字列をエスケープします。
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

/**
 * チャットエリアを一番下までスクロールします。
 * @param {boolean} instant - 即時スクロールするかどうか
 * @param {HTMLElement} areaElement - スクロール対象の要素
 */
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

    // sessionStorageから状態を読み込み (UI更新はまだしない)
    loadStateFromSessionStorage();

    // ユーザーデータ準備完了時のコールバック登録
    if (typeof window.registerUserDataReadyCallback === 'function') {
        window.registerUserDataReadyCallback((loggedInUserData) => {
            console.log("[match.js] User data ready. Updating UI.");
            updateMatchUI(); // ユーザー情報を含めてUIを更新
            resumePollingBasedOnState(); // 状態に基づいてポーリングを再開
        });
    } else {
        console.error("[match.js] registerUserDataReadyCallback function not found.");
        updateMatchUI(); // とりあえずUI更新
    }

    // ログイン状態変更時のコールバック登録
    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((user) => {
            if (!window.MyApp?.isUserLoggedIn) {
                console.log("[match.js] User logged out. Clearing state.");
                clearMatchStateAndUI(true); // ログアウト時はUIもクリア
            } else {
                console.log("[match.js] User logged in. Updating UI and maybe resuming poll.");
                updateMatchUI(); // ログイン時はUI更新
                resumePollingBasedOnState(); // 状態に基づいてポーリング再開
            }
        });
    } else {
        console.error("[match.js] onLoginStatusChange function not found.");
    }

    // イベントリスナーの設定
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

    // ページ離脱時の処理
    window.addEventListener('beforeunload', () => {
        saveStateToSessionStorage(); // 必ず保存
        stopHeartbeat();
        disconnectWebSocket();
    });

    // 初期UI更新 (DOM読み込み直後、最低限の表示)
    updateMatchUI();
});

// --- 状態管理関数 ---

/**
 * 現在の状態をsessionStorageに保存します。
 */
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

/**
 * sessionStorageから状態を読み込みます。
 */
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
                // battleStatusText は updateMatchUI で復元/設定
            } else if (isMatching) {
                currentMatchId = null; currentOpponentData = null; isPollingForResult = false;
            } else {
                isMatching = false; currentMatchId = null; currentOpponentData = null; isPollingForResult = false;
            }
            // battleStatusText の復元 (UI更新時に反映)
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

/**
 * ログイン状態と復元された状態に基づいてポーリングを再開します。
 */
function resumePollingBasedOnState() {
    if (window.MyApp?.isUserLoggedIn && typeof window.getAuthToken === 'function' && window.getAuthToken()) {
        if (isMatching && !matchmakingStatusInterval) {
            console.log("[match.js] Resuming matchmaking polling.");
            startPollingMatchStatus();
        } else if (currentMatchId && isPollingForResult && !matchResultPollingInterval) {
            console.log("[match.js] Resuming match result polling.");
            startPollingMatchResult();
        } else if (currentMatchId && currentOpponentData && !isPollingForResult) {
            // ★ リロード後、マッチ成立済みでポーリング前の場合、指示を表示
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

/**
 * すべてのマッチング関連の状態をクリアし、UIをリセットします。
 * @param {boolean} updateUIFlag - UIを更新するかどうか
 */
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
    hideLobbyInstruction(); // ★ 指示を非表示にする

    if (battleStatusText) battleStatusText.textContent = '';
    if (matchChatMessagesArea) matchChatMessagesArea.innerHTML = '';

    if (updateUIFlag) {
        updateMatchUI();
    }
}

// --- UI表示関数 ---

/**
 * ログインユーザーのプロフィール情報を表示します。
 * @param {object | null} userData - ユーザーデータ
 */
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

/**
 * 対戦相手の情報を表示します。
 * @param {object | null} opponentData - 対戦相手データ
 */
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

    // ★★★ 自分のプロフィールと同じ構造でHTMLを生成 ★★★
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

        <div class="profile-badges">
            ${badgesHtml}
        </div>

        <div class="profile-home-course-display">
            <span class="detail-label">ホームコース:</span>
            <span class="detail-value">${escapeHTML(opponentProfile.favCourse) || '---'}</span>
        </div>`;
    opponentInfoArea.dataset.opponentId = opponentData.googleId;
}


/**
 * ★★★ 追加 ★★★
 * マッチング成功時にロビー作成指示を表示し、担当者をランダムに決定する関数
 * @param {object} opponentData - サーバーから受け取った相手プレイヤーの情報 (例: { name: '相手の名前', ... })
 */
function displayLobbyInstructionWithRandomPlayer(opponentData) {
    // 必要なHTML要素を取得
    const myProfileNameElement = document.getElementById('my-profile-name');
    // lobbyInstructionElement はグローバルで取得済み

    // 要素が見つからない場合はエラーを出力して終了
    if (!myProfileNameElement || !lobbyInstructionElement) {
        console.error("ロビー指示の表示に必要なHTML要素が見つかりません。");
        return;
    }

    // 相手の名前を取得
    const opponentName = opponentData ? opponentData.name : null;
    // 自分の名前を取得
    const myName = myProfileNameElement ? myProfileNameElement.textContent : null;

    // 名前が取得できない場合はエラーを出力して終了
    if (!opponentName || !myName || myName === '---' || opponentName === '---') {
        console.error("プレイヤー名が取得できませんでした。");
        lobbyInstructionElement.innerHTML = "マッチングしました！<br>ロビーを作成してください。";
        lobbyInstructionElement.style.display = 'block';
        return;
    }

    // プレイヤー名のリストを作成
    const players = [myName, opponentName];

    // ランダムにインデックスを選択 (0 または 1)
    const selectedPlayerIndex = Math.floor(Math.random() * players.length);

    // 選択されたプレイヤー (ロビー作成担当者) の名前
    const lobbyCreatorName = escapeHTML(players[selectedPlayerIndex]);
    // もう一方のプレイヤー (ロビー名になる相手) の名前
    const lobbyNamePlayer = escapeHTML(players[1 - selectedPlayerIndex]);

    // 指示テキストを更新 (太字で見やすくしています)
    lobbyInstructionElement.innerHTML = `マッチングしました！<br><b>${lobbyCreatorName}</b> さんが、<b>${lobbyNamePlayer}</b> さんの名前をロビー名にしてプライベートロビーを作成してください。`;

    // 指示テキストを表示
    lobbyInstructionElement.style.display = 'block';
}

/**
 * ★★★ 追加 ★★★
 * ロビー作成指示を非表示にする関数
 */
function hideLobbyInstruction() {
    if (lobbyInstructionElement) {
        lobbyInstructionElement.style.display = 'none';
    }
}


/**
 * 現在の状態に基づいてUI全体を更新します。
 */
function updateMatchUI() {
    console.log("[match.js] Updating UI. State:", { isMatching, currentMatchId, isPollingForResult, isSubmittingResult });
    const user = window.MyApp?.currentUserData;
    const loggedIn = !!window.MyApp?.isUserLoggedIn;
    displayMyProfileInfo(user); // ユーザー情報表示を呼び出し

    // --- ヘルパー関数 ---
    const show = (el) => { if (el) el.style.display = (el.tagName === 'SECTION' || el.tagName === 'DIV' || el.id === 'report-result-buttons') ? 'flex' : 'inline-block'; };
    const hide = (el) => { if (el) el.style.display = 'none'; };
    const disable = (el) => { if (el) el.disabled = true; };
    const enable = (el) => { if (el) el.disabled = false; };
    const setText = (el, text) => { if (el) el.textContent = text; };

    // --- UI要素の表示/非表示と状態設定 ---

    // --- デフォルトで非表示/表示 ---
    hide(cancelButton);
    hide(opponentInfoArea); // ★ ここで hide される
    hide(opponentSpinner);
    hide(matchChatSection);
    hide(resultReportingArea);
    hide(startBattleButton);
    hide(reportResultButtons);
    hide(resultModal);
    hide(lobbyInstructionElement); // ★ デフォルトで指示を非表示
    if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
    show(opponentPlaceholder);

    // --- ボタンのデフォルト状態 ---
    enable(reportWinButton); enable(reportLoseButton); enable(cancelBattleButton);
    enable(matchButton);

    if (loggedIn) {
        if (isMatching) {
            // --- マッチング中の表示 ---
            hide(matchButton);
            show(cancelButton); enable(cancelButton);
            show(opponentPlaceholder);
            show(opponentSpinner);
            setText(matchStatusText, '対戦相手を探しています...');
            hide(opponentInfoArea);
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');

        } else if (currentMatchId && currentOpponentData) {
            // --- マッチ成立後の表示 ---
            hide(matchButton); hide(cancelButton);
            hide(opponentSpinner); hide(opponentPlaceholder);
            // show(opponentInfoArea); // ★★★ 変更: show() を使わない ★★★
            if (opponentInfoArea) opponentInfoArea.style.display = 'contents'; // ★★★ 変更: display: contents を設定 ★★★
            show(matchChatSection); show(resultReportingArea);
            if (opponentProfileSection) opponentProfileSection.classList.add('visible');
            setText(matchStatusText, '対戦相手が見つかりました！');
            displayOpponentInfo(currentOpponentData);
            displayLobbyInstructionWithRandomPlayer(currentOpponentData); // ★ マッチ成立時に指示を表示

            // 結果報告ボタンの状態
            if (isSubmittingResult || isPollingForResult) {
                hide(startBattleButton); show(reportResultButtons);
                disable(reportWinButton); disable(reportLoseButton); disable(cancelBattleButton);
                setText(battleStatusText, isSubmittingResult ? '結果送信中...' : '相手の報告を待っています...');
            } else {
                show(startBattleButton); hide(reportResultButtons);
                setText(battleStatusText, '対戦が終了したら結果を報告してください。');
            }
            // WebSocket 接続
            if (!matchWebSocket || matchWebSocket.readyState === WebSocket.CLOSED) connectWebSocket();

        } else {
            // --- ログイン済み、マッチング前の表示 ---
            show(matchButton); enable(matchButton);
            setText(matchButton, 'ライバルを探す');
            setText(matchStatusText, 'ライバルを探しましょう！');
            hide(opponentSpinner);
            show(opponentPlaceholder);
        }
    } else {
        // --- 非ログイン時の表示 ---
        show(matchButton); disable(matchButton);
        setText(matchButton, 'ログインが必要です');
        setText(matchStatusText, '対戦するにはログインしてください。');
        hide(opponentSpinner);
        show(opponentPlaceholder);
    }
}


// --- マッチング API 呼び出し関数 ---

/**
 * 認証付きで fetch を行います。
 * @param {string} url - リクエストURL
 * @param {object} options - fetch オプション
 * @returns {Promise<any>} - fetch のレスポンス (JSON)
 */
async function authenticatedFetch(url, options = {}) {
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    if (!token) throw new Error('ログインが必要です。');

    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
    };

    if (options.body && typeof options.body !== 'string') {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            console.error(`Auth error (${response.status}) for ${url}. Clearing state.`);
            if (typeof window.handleLogout === 'function') window.handleLogout();
            clearMatchStateAndUI(true);
            throw new Error('認証エラーが発生しました。再ログインしてください。');
        }
        let errorData = { message: `Request failed with status ${response.status}` };
        try { errorData = await response.json(); } catch (e) { /* ignore */ }
        throw new Error(errorData.message || `APIリクエスト失敗 (ステータス: ${response.status})`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
        return null; // No Content の場合は null を返す
    }
    return response.json();
}

/**
 * マッチングリクエストを開始します。
 */
async function startMatchmaking() {
    if (isMatching) return;
    if (!window.MyApp?.isUserLoggedIn) {
        alert("マッチングを開始するにはログインしてください。"); return;
    }
    isMatching = true; currentMatchId = null; currentOpponentData = null; isPollingForResult = false;
    updateMatchUI();
    saveStateToSessionStorage();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/request`;
        const result = await authenticatedFetch(apiUrl, { method: 'POST' });

        if (result.status === 'waiting') {
            startPollingMatchStatus();
        } else if (result.status === 'matched') {
            await handleMatchFound(result.opponent, result.matchId);
        } else {
            throw new Error(`予期せぬステータス: ${result.status}`);
        }
    } catch (error) {
        if (matchStatusText) matchStatusText.textContent = `マッチング開始エラー: ${error.message}`;
        clearMatchStateAndUI(true);
    }
}

/**
 * マッチングステータスのポーリングを開始します。
 */
function startPollingMatchStatus() {
    stopPollingMatchStatus();
    isMatching = true; // 念のため
    saveStateToSessionStorage();
    matchmakingStatusInterval = setInterval(async () => {
        if (!isMatching) { stopPollingMatchStatus(); return; }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/status`;
            const result = await authenticatedFetch(apiUrl);
            if (!isMatching) { stopPollingMatchStatus(); return; }

            switch (result.status) {
                case 'waiting': break;
                case 'matched':
                    stopPollingMatchStatus();
                    await handleMatchFound(result.opponent, result.matchId);
                    break;
                case 'timeout':
                case 'not_found':
                    stopPollingMatchStatus();
                    clearMatchStateAndUI(true);
                    if (matchStatusText) matchStatusText.textContent = result.status === 'timeout' ? '時間内に相手が見つかりませんでした。' : 'マッチングが終了しました。';
                    break;
                default:
                    console.warn("[match.js] Unknown status:", result.status);
                    stopPollingMatchStatus();
                    clearMatchStateAndUI(true);
                    break;
            }
        } catch (error) {
            console.error("Error polling matchmaking status:", error);
            stopPollingMatchStatus();
            clearMatchStateAndUI(true);
            if (matchStatusText) matchStatusText.textContent = `状況確認エラー: ${error.message}`;
        }
    }, 3000);
}

/**
 * マッチングステータスのポーリングを停止します。
 */
function stopPollingMatchStatus() {
    if (matchmakingStatusInterval) {
        clearInterval(matchmakingStatusInterval);
        matchmakingStatusInterval = null;
    }
}

/**
 * マッチング成功時の処理を行います。
 * @param {object} opponentData - 対戦相手データ
 * @param {string} matchId - マッチID
 */
async function handleMatchFound(opponentData, matchId) {
    currentOpponentData = opponentData;
    currentMatchId = matchId;
    isMatching = false;
    isPollingForResult = false;
    updateMatchUI(); // ★ UIを更新（ここで指示が表示される）
    saveStateToSessionStorage();

    if (matchChatMessagesArea) {
        matchChatMessagesArea.innerHTML = '<p class="chat-system-message">対戦相手が見つかりました。チャットを開始できます。</p>';
    }
    connectWebSocket();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`;
        await authenticatedFetch(apiUrl, { method: 'POST' });
        console.log("[match.js] Left matchmaking queue after match found.");
    } catch (error) {
        console.error("[match.js] Error leaving matchmaking queue:", error);
    }
}

/**
 * マッチングリクエストをキャンセルします。
 */
async function cancelMatchmakingRequest() {
    if (!isMatching) return;
    stopPollingMatchStatus();
    if (matchStatusText) matchStatusText.textContent = 'キャンセル処理中...';
    if (cancelButton) cancelButton.disabled = true;

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel`;
        await authenticatedFetch(apiUrl, { method: 'POST' });
        if (matchStatusText) matchStatusText.textContent = 'マッチングをキャンセルしました。';
    } catch (error) {
        if (matchStatusText) matchStatusText.textContent = `キャンセルエラー: ${error.message}`;
    } finally {
        clearMatchStateAndUI(true);
    }
}

/**
 * 対戦結果を報告します。
 * @param {'win' | 'lose'} result - 結果 ('win' または 'lose')
 */
async function submitReport(result) {
    if (isSubmittingResult || !currentMatchId) return;
    if (!confirm(`対戦結果を「${result === 'win' ? '勝利' : '敗北'}」として申告しますか？`)) return;

    isSubmittingResult = true;
    hideLobbyInstruction(); // ★ 結果報告開始時に指示を非表示
    updateMatchUI();
    saveStateToSessionStorage();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/report`;
        const responseData = await authenticatedFetch(apiUrl, {
            method: 'POST',
            body: { matchId: currentMatchId, result: result }
        });
        handleReportResponse(responseData);
    } catch (error) {
        if (battleStatusText) battleStatusText.textContent = `結果報告エラー: ${error.message}`;
        isSubmittingResult = false;
        // ★★★ エラー時にボタンを無効化し、2秒後にUIをクリア ★★★
        if (reportWinButton) reportWinButton.disabled = true;
        if (reportLoseButton) reportLoseButton.disabled = true;
        if (cancelBattleButton) cancelBattleButton.disabled = true;
        setTimeout(() => clearMatchStateAndUI(true), 2000);
    }
}

/**
 * 対戦をキャンセルします。
 */
async function cancelBattle() {
    if (isSubmittingResult || !currentMatchId) return;
    if (!confirm("この対戦をキャンセルしますか？\nレートは変動しません。")) return;

    isSubmittingResult = true;
    hideLobbyInstruction(); // ★ 対戦キャンセル開始時に指示を非表示
    updateMatchUI();
    saveStateToSessionStorage();

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/cancel-match`;
        const responseData = await authenticatedFetch(apiUrl, {
            method: 'POST',
            body: { matchId: currentMatchId }
        });
        handleReportResponse(responseData);
    } catch (error) {
        if (battleStatusText) battleStatusText.textContent = `キャンセルエラー: ${error.message}`;
        isSubmittingResult = false;
        // ★★★ エラー時にボタンを無効化し、2秒後にUIをクリア ★★★
        if (reportWinButton) reportWinButton.disabled = true;
        if (reportLoseButton) reportLoseButton.disabled = true;
        if (cancelBattleButton) cancelBattleButton.disabled = true;
        setTimeout(() => clearMatchStateAndUI(true), 2000);
    }
}

/**
 * サーバーからの結果報告レスポンスを処理します。
 * @param {object} responseData - サーバーからのレスポンスデータ
 */
function handleReportResponse(responseData) {
    stopPollingMatchResult();
    disconnectWebSocket();
    stopHeartbeat();
    isSubmittingResult = false; // 送信完了
    hideLobbyInstruction(); // ★ レスポンス処理時にも念のため非表示

    switch (responseData.status) {
        case 'waiting':
            isPollingForResult = true;
            startPollingMatchResult();
            break;
        case 'finished':
            isPollingForResult = false;
            const originalRate = responseData.resultData?.originalRate ?? window.MyApp?.currentUserData?.rate;
            updateGlobalUserData(responseData.resultData.newRate, responseData.resultData.newPoints);
            showResultModal(responseData.resultData.didWin, responseData.resultData, originalRate);
            break;
        case 'disputed':
            isPollingForResult = false;
            if (battleStatusText) battleStatusText.textContent = '報告が一致しませんでした。この対戦は無効になります。';
            setTimeout(() => clearMatchStateAndUI(true), 2000); // ★★★ 待機時間を2秒に変更 ★★★
            break;
        case 'cancelled':
            isPollingForResult = false;
            if (battleStatusText) battleStatusText.textContent = '対戦がキャンセルされました。';
            setTimeout(() => clearMatchStateAndUI(true), 2000); // ★★★ 待機時間を2秒に変更 ★★★
            break;
        default:
            isPollingForResult = false;
            if (battleStatusText) battleStatusText.textContent = `不明な応答 (${responseData.status}) を受信。`;
            setTimeout(() => clearMatchStateAndUI(true), 2000); // ★★★ 待機時間を2秒に変更 ★★★
            break;
    }
    updateMatchUI(); // UI更新
    saveStateToSessionStorage(); // 状態保存
}

/**
 * ユーザーのグローバルデータを更新します。
 * @param {number} newRate - 新しいレート
 * @param {number} newPoints - 新しいポイント
 */
function updateGlobalUserData(newRate, newPoints) {
    if (window.MyApp?.currentUserData) {
        window.MyApp.currentUserData.rate = newRate;
        window.MyApp.currentUserData.points = newPoints;
        if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
        if (typeof window.updateUserPoints === 'function') window.updateUserPoints(newPoints);
        displayMyProfileInfo(window.MyApp.currentUserData);
    }
}

/**
 * マッチ結果のポーリングを開始します。
 */
function startPollingMatchResult() {
    stopPollingMatchResult();
    isPollingForResult = true;
    saveStateToSessionStorage();
    matchResultPollingInterval = setInterval(async () => {
        if (!currentMatchId || !isPollingForResult) { stopPollingMatchResult(); return; }
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/matchmaking/match-status/${currentMatchId}`;
            const result = await authenticatedFetch(apiUrl);
            if (!currentMatchId || !isPollingForResult) { stopPollingMatchResult(); return; }

            if (result.status !== 'matched' && result.status !== 'reported_one') {
                stopPollingMatchResult();
                handleReportResponse(result);
            }
        } catch (error) {
            console.error("Error polling match result:", error);
            stopPollingMatchResult();
            // ★★★ エラー時もUIをクリア ★★★
            if (battleStatusText) battleStatusText.textContent = `結果確認エラー: ${error.message}`;
            setTimeout(() => clearMatchStateAndUI(true), 2000);
        }
    }, 5000);
}

/**
 * マッチ結果のポーリングを停止します。
 */
function stopPollingMatchResult() {
    if (matchResultPollingInterval) {
        clearInterval(matchResultPollingInterval);
        matchResultPollingInterval = null;
    }
}

/**
 * 結果表示モーダルを表示します。
 * @param {boolean} didWin - 勝利したかどうか
 * @param {object} resultData - 結果データ
 * @param {number} originalRate - 元のレート
 */
function showResultModal(didWin, resultData, originalRate) {
    if (!resultModal) return;
    hideLobbyInstruction(); // ★ 結果表示時に指示を非表示
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

    // ★★★ 4秒後に自動でモーダルを閉じる ★★★
    setTimeout(() => {
        if (resultModal && resultModal.style.display === 'flex') {
            closeResultModal();
        }
    }, 4000);
}

/**
 * 結果表示モーダルを閉じます。
 */
function closeResultModal() {
    if (resultModal && resultModal.style.display !== 'none') { // ★ 二重実行防止
        resultModal.style.display = 'none';
        clearMatchStateAndUI(true); // モーダルを閉じたら完全にクリア
    }
}


// --- WebSocket (チャット) 関連 ---

/**
 * チャットメッセージをエリアに追加します。
 * @param {string} messageText - メッセージ本文
 * @param {boolean} isMyMessage - 自分のメッセージか
 * @param {string} senderName - 送信者名
 */
function appendChatMessage(messageText, isMyMessage, senderName = '相手') {
    if (!matchChatMessagesArea) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('match-chat-message');

    // ★★★ チャットデザイン修正版に合わせて変更 ★★★
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
    // ★★★ 変更ここまで ★★★

    matchChatMessagesArea.appendChild(messageDiv);
    scrollToChatBottom(false);
}

/**
 * チャットメッセージを送信します。
 */
function sendChatMessage() {
    if (!matchChatInput || !matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) {
        if (!matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) alert("チャットサーバーに接続されていません。");
        return;
    }
    const messageText = matchChatInput.value.trim();
    if (messageText && currentMatchId) {
        const messagePayload = { type: 'MATCH_CHAT_MESSAGE', matchId: currentMatchId, text: messageText };
        matchWebSocket.send(JSON.stringify(messagePayload));
        appendChatMessage(messageText, true, window.MyApp?.currentUserData?.name || '自分'); // ★ 自分の名前を渡す
        matchChatInput.value = '';
    }
}

/**
 * WebSocket ハートビートを開始します。
 */
function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (matchWebSocket && matchWebSocket.readyState === WebSocket.OPEN) {
            try { matchWebSocket.send(JSON.stringify({ type: 'PING' })); }
            catch (e) { console.error("Failed to send PING:", e); stopHeartbeat(); }
        } else { stopHeartbeat(); }
    }, 30000);
}

/**
 * WebSocket ハートビートを停止します。
 */
function stopHeartbeat() {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

/**
 * WebSocket サーバーに接続します。
 */
function connectWebSocket() {
    if (matchWebSocket && (matchWebSocket.readyState === WebSocket.OPEN || matchWebSocket.readyState === WebSocket.CONNECTING)) return;
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    const wsUrl = window.MyApp?.WEBSOCKET_URL;

    if (!currentMatchId || !token || !wsUrl) {
        appendChatMessage("チャット接続情報が不足またはURL未設定です。", false, "システム"); return;
    }

    const fullWsUrl = `${wsUrl.replace(/\/$/, '')}/?token=${token}&matchId=${currentMatchId}`;
    console.log(`[match.js] Connecting to WebSocket: ${fullWsUrl}`);
    appendChatMessage("チャットサーバーに接続中...", false, "システム");

    try {
        matchWebSocket = new WebSocket(fullWsUrl);
        matchWebSocket.onopen = () => { appendChatMessage("チャットに接続しました。", false, "システム"); startHeartbeat(); };
        matchWebSocket.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data);
                if (messageData.type === 'PONG') return;
                // ★★★ チャットデザイン修正版に合わせて変更 ★★★
                if (messageData.type === 'MATCH_CHAT_MESSAGE' && messageData.text && messageData.senderId !== window.MyApp?.currentUserData?.googleId) { // ★ senderId を googleId と比較
                    appendChatMessage(messageData.text, false, messageData.senderName || '相手');
                } else if (messageData.type === 'SYSTEM_MESSAGE') {
                    appendChatMessage(messageData.text, false, "システム");
                } else if (messageData.type === 'ERROR') {
                     appendChatMessage(`エラー: ${messageData.message}`, false, "システム");
                }
                // ★★★ 変更ここまで ★★★
            } catch (e) { console.error("WS message parse error:", e); }
        };
        matchWebSocket.onerror = (error) => { console.error("WS error:", error); appendChatMessage("チャット接続エラー。", false, "システム"); };
        matchWebSocket.onclose = (event) => {
            stopHeartbeat();
            if (event.code !== 1000 && currentMatchId) { // 正常終了以外で、まだマッチ中の場合
                appendChatMessage(`チャット接続が切れました (Code: ${event.code})`, false, "システム");
            }
            matchWebSocket = null;
        };
    } catch (error) { console.error("WS creation error:", error); appendChatMessage("チャット接続失敗。", false, "システム"); }
}

/**
 * WebSocket 接続を切断します。
 */
function disconnectWebSocket() {
    stopHeartbeat();
    if (matchWebSocket) {
        matchWebSocket.close(1000, "Client requested disconnect");
        matchWebSocket = null;
    }
}