// frontend/match.js

// --- グローバル変数 ---
let isMatching = false;
let matchmakingStatusInterval = null;
let currentMatchId = null;
let currentOpponentData = null;
let matchWebSocket = null; // WebSocket接続用

// ▼▼▼ バックエンド/WebSocket URLを定数として定義 ▼▼▼
    const BACKEND_URL = 'https://www.mariokartbestrivals.com'; // ★★★ Xserver上のHTTPサーバーのアドレス ★★★
    const WEBSOCKET_URL = 'wss://www.mariokartbestrivals.com'; // ★★★ Xserver上のWebSocketサーバーのアドレス (wss) ★★★
// ▲▲▲ ここまで追加 ▲▲▲

// --- DOM要素 ---
// DOMContentLoaded後に取得するように変更（安全のため）
let matchButton;
let cancelButton;
let opponentInfoArea;
let matchStatusText;
let opponentProfileSection;
let opponentPlaceholder;
let opponentSpinner;

// 自分の情報表示用要素
let myProfilePic;
let myProfileName;
let myProfileRate;
let myProfilePoints;
let myProfileCourse;
let myProfileComment;
let myProfileBadgesContainer;

// チャット関連要素
let matchChatSection;
let matchChatMessagesArea;
let matchChatInput;
let matchChatSendButton;

// 結果報告UI関連
let resultReportingArea;
let startBattleButton;
let reportResultButtons;
let reportWinButton;
let reportLoseButton;
let battleStatusText;

// 結果表示モーダル関連
let resultModal;
let resultTitle;
let resultMyRateBefore;
let resultMyRateAfter;
let resultRateChange;
let resultPointsEarned;
let resultNewPoints;
let closeResultModalButton;


// --- 関数定義 ---

/**
 * 自分のプロフィール情報をHTMLに表示する
 * @param {object|null} userData - ユーザーデータオブジェクト
 */
function displayMyProfileInfo(userData) {
    console.log("[match.js] displayMyProfileInfo called with user data:", userData ? userData.name : "null");

    // DOM要素が取得済みか確認
    if (!myProfilePic || !myProfileName || !myProfileRate || !myProfilePoints) {
        console.error("[match.js] プロフィール表示に必要な主要要素が見つかりません。HTMLのIDを確認してください。");
        // 要素が見つからない場合は処理を中断
        return;
    }

    if (userData) {
        myProfilePic.src = userData.picture || 'images/placeholder-avatar.png';
        myProfileName.textContent = userData.name || 'プレイヤー名';
        myProfileRate.textContent = userData.rate ?? '----';
        myProfilePoints.textContent = `${userData.points ?? '----'} P`;
        const profile = userData.profile || {};
        if (myProfileCourse) myProfileCourse.textContent = profile.favCourse || '未設定';
        if (myProfileComment) myProfileComment.textContent = profile.comment || '未設定';

        // バッジ表示処理 (script.jsの共通関数を呼び出す)
        if (myProfileBadgesContainer && typeof window.displayBadges === 'function') {
            const badgeSlots = myProfileBadgesContainer.querySelectorAll('.badge-slot');
            window.displayBadges(badgeSlots, userData.badges || []);
        } else if (myProfileBadgesContainer) {
             console.warn("[match.js] グローバル関数 displayBadges が見つからないか、バッジコンテナがありません。フォールバックを使用します。");
             // フォールバック処理（簡易版）
             const badgeSlots = myProfileBadgesContainer.querySelectorAll('.badge-slot');
             const badgeIds = userData.badges || [];
             badgeSlots.forEach((slot, index) => {
                 slot.innerHTML = '';
                 const badgeId = badgeIds[index];
                 if (badgeId && typeof window.getBadgeImagePath === 'function') {
                     const imgPath = window.getBadgeImagePath(badgeId);
                     const img = document.createElement('img');
                     img.src = imgPath;
                     img.alt = badgeId; // altテキストはバッジ名が理想
                     slot.appendChild(img);
                     slot.style.opacity = '1';
                 } else {
                     slot.style.opacity = '0.5';
                 }
             });
        } else {
            console.warn("[match.js] バッジコンテナが見つかりません。");
        }

    } else {
        // ログアウト状態またはデータなしの場合
        myProfilePic.src = 'images/placeholder-avatar.png';
        myProfileName.textContent = '---';
        myProfileRate.textContent = '----';
        myProfilePoints.textContent = '---- P';
        if (myProfileCourse) myProfileCourse.textContent = '---';
        if (myProfileComment) myProfileComment.textContent = '---';
        if (myProfileBadgesContainer) {
            myProfileBadgesContainer.querySelectorAll('.badge-slot').forEach(slot => {
                slot.innerHTML = '';
                slot.style.opacity = '0.5';
            });
        }
    }
}

/**
 * UI更新関数 (ログイン状態、マッチング状態に応じてボタンなどを制御)
 * グローバルな window.MyApp から状態を取得する
 */
function updateMatchUI() {
    // ▼▼▼ window.MyApp からユーザーデータを取得 ▼▼▼
    const user = window.MyApp?.currentUserData;
    const loggedIn = !!window.MyApp?.isUserLoggedIn; // undefined, true, false のいずれか
    console.log("[match.js] updateMatchUI called. Logged in:", loggedIn, "User:", user ? user.name : "null");
    // ▲▲▲ 修正 ▲▲▲

    // 自分のプロフィール情報を表示
    displayMyProfileInfo(user);

    // --- 結果報告エリアとボタンの初期化 ---
    // DOM要素が取得済みか確認
    if (resultReportingArea) resultReportingArea.style.display = 'none';
    if (reportResultButtons) reportResultButtons.style.display = 'none';
    if (startBattleButton) startBattleButton.style.display = 'none';
    if (battleStatusText) battleStatusText.textContent = '';
    if (reportWinButton) reportWinButton.disabled = false;
    if (reportLoseButton) reportLoseButton.disabled = false;
    // --- 初期化ここまで ---

    // --- DOM要素取得 (updateMatchUI内で必要なもの) ---
    // DOMContentLoadedで取得済み
    // --- DOM要素取得ここまで ---


    if (loggedIn) {
        if (isMatching) {
            // マッチング中
            if(matchButton) matchButton.style.display = 'none';
            if(cancelButton) cancelButton.style.display = 'inline-block';
            if(cancelButton) cancelButton.disabled = false;
            if (matchStatusText) matchStatusText.textContent = '対戦相手を探しています...';
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
            if (opponentInfoArea) opponentInfoArea.innerHTML = '';
            if (opponentSpinner) opponentSpinner.style.display = 'block';
            if (matchChatSection) matchChatSection.style.display = 'none'; // チャット非表示
            disconnectWebSocket(); // 念のため切断

        } else if (currentMatchId && currentOpponentData) {
            // マッチング成立後
            if(matchButton) matchButton.style.display = 'none';
            if(cancelButton) cancelButton.style.display = 'none';
            // .visible クラスは handleMatchFound で追加済み
            if (matchStatusText) matchStatusText.textContent = '対戦相手が見つかりました！結果を報告してください。';
            if (resultReportingArea) resultReportingArea.style.display = 'block';
            if (startBattleButton) startBattleButton.style.display = 'inline-block';
            if (opponentSpinner) opponentSpinner.style.display = 'none';
            if (matchChatSection) matchChatSection.style.display = 'flex'; // チャット表示
            if (!matchWebSocket) { // WebSocket接続を開始 (まだ接続していなければ)
                connectWebSocket();
            }

        } else {
            // 初期状態 (ログイン済み、マッチング前)
            if(matchButton) matchButton.textContent = 'ライバルを探す';
            if(matchButton) matchButton.style.display = 'inline-block';
            if(matchButton) matchButton.disabled = false;
            if(cancelButton) cancelButton.style.display = 'none';
            if (matchStatusText) matchStatusText.textContent = 'ボタンを押して対戦相手を探しましょう！';
            if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
            if (opponentInfoArea) opponentInfoArea.innerHTML = '';
            if (opponentSpinner) opponentSpinner.style.display = 'none';
            if (matchChatSection) matchChatSection.style.display = 'none'; // チャット非表示
            disconnectWebSocket(); // WebSocket接続を切断
        }
    } else {
        // 未ログイン状態
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
        if (opponentSpinner) opponentSpinner.style.display = 'none';
        if (matchChatSection) matchChatSection.style.display = 'none'; // チャット非表示
        disconnectWebSocket(); // WebSocket接続を切断
    }
}


// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[match.js] DOMContentLoaded");

    // DOM要素をここで取得
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
    myProfilePoints = document.getElementById('my-profile-points');
    myProfileCourse = document.getElementById('my-profile-course');
    myProfileComment = document.getElementById('my-profile-comment');
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


    // 初期UI状態を設定
    if (opponentProfileSection) {
        opponentProfileSection.classList.remove('visible');
    }
    if (opponentSpinner) {
        opponentSpinner.style.display = 'none';
    }
    if (matchChatSection) {
        matchChatSection.style.display = 'none';
    }

    // ユーザーデータ準備完了コールバックを登録
    if (typeof registerUserDataReadyCallback === 'function') {
        registerUserDataReadyCallback((user) => {
            console.log("[match.js] User data ready callback executed:", user ? user.name : "null");
            updateMatchUI(); // 引数なしで呼び出し (内部で window.MyApp を参照)
        });
    } else {
        console.error("[match.js] registerUserDataReadyCallback function not found.");
        // フォールバックとして即時UI更新を試みる（非推奨）
        updateMatchUI();
    }

    // ログイン状態変化コールバックを登録
    if (typeof onLoginStatusChange === 'function') {
        onLoginStatusChange((user) => {
            console.log("[match.js] Login status changed:", user ? user.name : "null");
            updateMatchUI(); // 引数なしで呼び出し (内部で window.MyApp を参照)
            if (!window.MyApp?.isUserLoggedIn) { // ログアウト時の処理
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

    // --- イベントリスナー設定 ---
    matchButton?.addEventListener('click', () => {
        // ボタンがクリックされたらマッチング開始関数を呼び出す
        startMatchmaking();
    });

    cancelButton?.addEventListener('click', cancelMatchmakingRequest);

    startBattleButton?.addEventListener('click', () => {
        if (reportResultButtons) reportResultButtons.style.display = 'flex';
        if (startBattleButton) startBattleButton.style.display = 'none';
        if (battleStatusText) battleStatusText.textContent = '対戦結果を選択してください。';
    });

    reportWinButton?.addEventListener('click', () => {
        reportMatchResult(true);
    });

    reportLoseButton?.addEventListener('click', () => {
        reportMatchResult(false);
    });

    closeResultModalButton?.addEventListener('click', closeResultModal);

    // チャット入力イベントリスナー
    matchChatSendButton?.addEventListener('click', sendChatMessage);
    matchChatInput?.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    });

    // ページ離脱時にWebSocketを切断
    window.addEventListener('beforeunload', disconnectWebSocket);
}); // End of DOMContentLoaded


// --- マッチング関連関数 ---

/**
 * マッチング開始リクエスト
 */
async function startMatchmaking() {
    if (isMatching) {
        console.log("[match.js] startMatchmaking called but already matching.");
        return;
    }

    // ▼▼▼ ログイン状態のチェックを window.MyApp.isUserLoggedIn に修正 ▼▼▼
    // window.MyApp が存在し、かつ isUserLoggedIn が true であるかを確認
    if (!window.MyApp?.isUserLoggedIn) {
        console.warn("[match.js] startMatchmaking called but user is not logged in (checked MyApp.isUserLoggedIn).");
        // ユーザーにログインが必要であることを明確に伝える
        alert("マッチングを開始するにはログインしてください。");
        // UIは既に未ログイン状態になっているはずだが、念のため更新を試みる
        updateMatchUI();
        return; // ログインしていない場合は処理を中断
    }
    // ▲▲▲ 修正 ▲▲▲

    console.log("[match.js] Starting matchmaking process...");

    isMatching = true;
    currentMatchId = null;
    currentOpponentData = null;
    // UIをマッチング中状態に更新 (内部で window.MyApp を参照)
    updateMatchUI();

    // ★★★ script.js の window.getAuthToken を使用 ★★★
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    console.log("[match.js] Auth token:", token ? "Token found" : "Token not found");

    if (!token) {
        console.error("[match.js] No auth token found. Cannot start matchmaking.");
        alert("認証トークンが見つかりません。再ログインしてください。");
        isMatching = false;
        // UIを元に戻す (内部で window.MyApp を参照)
        updateMatchUI();
        return;
    }

    try {
        console.log("[match.js] Sending request to /api/matchmaking/request...");
        const apiUrl = `${BACKEND_URL}/api/matchmaking/request`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log("[match.js] Received response from /api/matchmaking/request:", response.status, response.statusText);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `サーバーからの応答が不正です (ステータス: ${response.status})` }));
            console.error("[match.js] API request failed:", errorData);
            throw new Error(`URL: ${apiUrl} - ${errorData.message || `HTTP error! status: ${response.status}`}`);
        }

        const result = await response.json();
        console.log("[match.js] API request successful, result:", result);

        if (result.status === 'waiting') {
            console.log("[match.js] Status is 'waiting', starting polling.");
            startPollingMatchStatus();
        } else if (result.status === 'matched') {
            console.log("[match.js] Status is 'matched', handling match found.");
            handleMatchFound(result.opponent, result.matchId);
        } else {
            console.error("[match.js] Unexpected status received:", result.status);
            throw new Error(`Unexpected status on request: ${result.status}`);
        }

    } catch (error) {
        console.error("[match.js] Error during startMatchmaking fetch/processing:", error);
        if (matchStatusText) matchStatusText.textContent = `マッチング開始エラー: ${error.message}`;
        isMatching = false;
        // UIを元に戻す (内部で window.MyApp を参照)
        updateMatchUI();
    }
}

/**
 * マッチングステータスのポーリングを開始
 */
function startPollingMatchStatus() {
    if (matchmakingStatusInterval) {
        clearInterval(matchmakingStatusInterval);
    }

    matchmakingStatusInterval = setInterval(async () => {
        if (!isMatching) {
            stopPollingMatchStatus();
            return;
        }

        try {
            const apiUrl = `${BACKEND_URL}/api/matchmaking/status`;
            // ★★★ script.js の window.getAuthToken を使用 ★★★
            const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
            if (!token) {
                console.error("[match.js] Authentication token not found for polling. Stopping polling.");
                // トークンがない場合はログアウト状態とみなし、ポーリングを停止
                isMatching = false;
                updateMatchUI(); // UIを未ログイン状態に更新
                stopPollingMatchStatus();
                return;
            }

            const response = await fetch(apiUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log("[match.js] Not found in queue (404), stopping polling.");
                    if (matchStatusText) matchStatusText.textContent = 'マッチングが終了しました。';
                    isMatching = false;
                    updateMatchUI(); // UIを初期状態に戻す
                    stopPollingMatchStatus();
                    return;
                }
                // 401 Unauthorized の場合もログアウト処理が必要
                if (response.status === 401 && typeof window.handleLogout === 'function') {
                     console.warn("[match.js] Polling received 401 Unauthorized. Initiating logout.");
                     window.handleLogout(); // script.js のログアウト関数を呼び出す
                     isMatching = false;
                     stopPollingMatchStatus();
                     return;
                }
                const errorData = await response.json().catch(() => ({ message: 'Status check failed' }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            switch (result.status) {
                case 'waiting':
                    console.log("[match.js] Matchmaking status: waiting...");
                    break;
                case 'matched':
                    console.log("[match.js] Matchmaking status: matched!");
                    handleMatchFound(result.opponent, result.matchId);
                    stopPollingMatchStatus();
                    break;
                case 'timeout':
                    console.log("[match.js] Matchmaking status: timeout.");
                    if (matchStatusText) matchStatusText.textContent = '時間内に相手が見つかりませんでした。';
                    isMatching = false;
                    updateMatchUI(); // UIを初期状態に戻す
                    stopPollingMatchStatus();
                    break;
                case 'not_found':
                     console.log("[match.js] Not found in queue (status: not_found), stopping polling.");
                     if (matchStatusText) matchStatusText.textContent = 'マッチングが終了しました。';
                     isMatching = false;
                     updateMatchUI(); // UIを初期状態に戻す
                     stopPollingMatchStatus();
                     break;
                default:
                    console.warn("[match.js] Unknown matchmaking status received:", result.status);
                    break;
            }

        } catch (error) {
            console.error("[match.js] Error polling matchmaking status:", error);
            if (matchStatusText) matchStatusText.textContent = `状況確認エラー: ${error.message}`;
            // エラー発生時も念のためポーリングを停止するか検討
            // stopPollingMatchStatus();
            // isMatching = false;
            // updateMatchUI();
        }
    }, 3000); // 3秒間隔でポーリング
}

/**
 * マッチングステータスのポーリングを停止
 */
function stopPollingMatchStatus() {
    if (matchmakingStatusInterval) {
        clearInterval(matchmakingStatusInterval);
        matchmakingStatusInterval = null;
        console.log("[match.js] Matchmaking status polling stopped.");
    }
}

/**
 * マッチング成立時の処理
 * @param {object} opponentData 対戦相手情報
 * @param {string} matchId マッチID
 */
function handleMatchFound(opponentData, matchId) {
    console.log("[match.js] handleMatchFound called. Opponent:", opponentData, "Match ID:", matchId);
    currentOpponentData = opponentData;
    currentMatchId = matchId;
    isMatching = false;

    // UIをマッチング成立状態に更新
    updateMatchUI();

    // 対戦相手情報を表示
    displayOpponentInfo(opponentData);

    // チャットメッセージエリアをクリアして初期メッセージ表示
    if (matchChatMessagesArea) {
        matchChatMessagesArea.innerHTML = '<p class="chat-system-message">対戦相手が見つかりました。チャットを開始できます。</p>';
    }

    // WebSocket接続を開始 (updateMatchUI 内でも呼ばれるが、ここでも明示的に)
    connectWebSocket();
}

/**
 * 対戦相手情報を表示する関数
 * @param {object} opponentData - 相手情報オブジェクト { name, picture, rate }
 */
function displayOpponentInfo(opponentData) {
    console.log("[match.js] displayOpponentInfo called with:", opponentData);
    if (!opponentInfoArea) {
        console.warn("[match.js] displayOpponentInfo: opponentInfoArea element not found.");
        return;
    }
    opponentInfoArea.innerHTML = `
        <h3>対戦相手</h3>
        <div class="opponent-details">
            <img id="opponent-pic" src="${opponentData.picture || 'images/placeholder-avatar.png'}" alt="${opponentData.name || '対戦相手'}" class="opponent-avatar">
            <div>
                <p id="opponent-name">${opponentData.name || '対戦相手'}</p>
                <p id="opponent-rate">Rate: ${opponentData.rate !== undefined ? opponentData.rate : '----'}</p>
            </div>
        </div>
    `;
    if (opponentProfileSection) {
        opponentProfileSection.classList.add('visible');
    }
}

/**
 * マッチングキャンセル処理
 */
async function cancelMatchmakingRequest() {
    if (!isMatching) {
        console.log("[match.js] cancelMatchmakingRequest called but not currently matching.");
        return;
    }

    console.log("[match.js] Cancelling matchmaking...");
    stopPollingMatchStatus(); // ポーリングを停止

    // UIをキャンセル処理中状態に更新 (任意)
    if (matchStatusText) matchStatusText.textContent = 'キャンセル処理中...';
    if (cancelButton) cancelButton.disabled = true;

    try {
        const apiUrl = `${BACKEND_URL}/api/matchmaking/cancel`;
        // ★★★ script.js の window.getAuthToken を使用 ★★★
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!token) throw new Error("Authentication token not found for cancellation.");

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Cancel request failed' }));
            if (response.status === 400) {
                 console.warn("[match.js] Cannot cancel (Status 400): " + errorData.message);
                 // 既にマッチング済みなどの理由でキャンセルできなかった場合
                 if (matchStatusText) matchStatusText.textContent = `キャンセルできませんでした: ${errorData.message}`;
            } else if (response.status === 401 && typeof window.handleLogout === 'function') {
                 console.warn("[match.js] Cancel request received 401 Unauthorized. Initiating logout.");
                 window.handleLogout(); // script.js のログアウト関数を呼び出す
                 return; // ログアウト処理に任せる
            }
            else {
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
        } else {
             console.log("[match.js] Matchmaking cancelled successfully.");
             if (matchStatusText) matchStatusText.textContent = 'マッチングをキャンセルしました。';
        }


    } catch (error) {
        console.error("[match.js] Error cancelling matchmaking:", error);
        if (matchStatusText) matchStatusText.textContent = `キャンセルエラー: ${error.message}`;
    } finally {
        // 状態とUIをリセット
        isMatching = false;
        currentMatchId = null;
        currentOpponentData = null;
        if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
        if (opponentInfoArea) opponentInfoArea.innerHTML = '';
        updateMatchUI(); // UIを初期状態に戻す (内部で window.MyApp を参照)
        disconnectWebSocket(); // WebSocket切断
    }
}

// --- 結果報告関連関数 ---

/**
 * 対戦結果をサーバーに送信する
 * @param {boolean} didWin - 勝利したかどうか
 */
async function reportMatchResult(didWin) {
    if (!currentMatchId || !window.MyApp?.currentUserData) {
        console.error("[match.js] Cannot report result: Match ID or user data missing.");
        if (battleStatusText) battleStatusText.textContent = '結果報告エラー: 必要な情報がありません。';
        return;
    }

    if (battleStatusText) battleStatusText.textContent = '結果を送信中...';
    if (reportWinButton) reportWinButton.disabled = true;
    if (reportLoseButton) reportLoseButton.disabled = true;
    disconnectWebSocket(); // 結果報告前にWebSocket切断

    try {
        const apiUrl = `${BACKEND_URL}/api/matchmaking/result`;
        // ★★★ script.js の window.getAuthToken を使用 ★★★
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!token) throw new Error("Authentication token not found for reporting result.");

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                matchId: currentMatchId,
                didWin: didWin
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Result reporting failed' }));
             if (response.status === 401 && typeof window.handleLogout === 'function') {
                 console.warn("[match.js] Result report received 401 Unauthorized. Initiating logout.");
                 window.handleLogout(); // script.js のログアウト関数を呼び出す
                 return; // ログアウト処理に任せる
            }
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const resultData = await response.json();
        console.log("[match.js] Match result reported successfully:", resultData);

        // 結果報告前のレートを取得 (UI表示用)
        const originalRate = window.MyApp?.currentUserData?.rate;

        // グローバルユーザーデータを更新 (script.js の関数を呼び出す)
        if (window.MyApp?.currentUserData) {
            window.MyApp.currentUserData.rate = resultData.newRate;
            window.MyApp.currentUserData.points = resultData.newPoints;
            // ★★★ script.js の window.saveCurrentUserData を使用 ★★★
            if (typeof window.saveCurrentUserData === 'function') {
                window.saveCurrentUserData();
            } else {
                 console.warn("[match.js] Global function 'saveCurrentUserData' not found.");
            }
            // ヘッダーUIのポイントも更新 (script.js の関数を呼び出す)
            if (typeof window.updateUserPoints === 'function') {
                 window.updateUserPoints(resultData.newPoints);
            } else {
                 console.warn("[match.js] Global function 'updateUserPoints' not found.");
            }
        }


        showResultModal(didWin, resultData, originalRate);

        // マッチング状態をリセット
        currentMatchId = null;
        currentOpponentData = null;

    } catch (error) {
        console.error("[match.js] Error reporting match result:", error);
        if (battleStatusText) battleStatusText.textContent = `結果報告エラー: ${error.message}`;
        // エラー発生時はボタンを再度有効化
        if (reportWinButton) reportWinButton.disabled = false;
        if (reportLoseButton) reportLoseButton.disabled = false;
    }
}

/**
 * 対戦結果モーダルを表示する
 * @param {boolean} didWin - 勝利したか
 * @param {object} resultData - APIからのレスポンスデータ
 * @param {number} originalRate - 結果報告前のレート
 */
function showResultModal(didWin, resultData, originalRate) {
    console.log("[match.js] showResultModal called.");
    if (!resultModal) {
        console.warn("[match.js] showResultModal: resultModal element not found.");
        return;
    }

    if (resultTitle) resultTitle.textContent = didWin ? '勝利！' : '敗北...';
    if (resultMyRateBefore) resultMyRateBefore.textContent = originalRate ?? '----';
    if (resultMyRateAfter) resultMyRateAfter.textContent = resultData.newRate ?? '----';
    if (resultRateChange) {
        const change = resultData.rateChange ?? 0;
        resultRateChange.textContent = `${change >= 0 ? '+' : ''}${change}`;
        resultRateChange.style.color = change >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    }
    if (resultPointsEarned) resultPointsEarned.textContent = resultData.pointsEarned ?? '--';
    if (resultNewPoints) resultNewPoints.textContent = resultData.newPoints ?? '----';

    resultModal.style.display = 'flex';
}

/**
 * 対戦結果モーダルを閉じる
 */
function closeResultModal() {
    console.log("[match.js] closeResultModal called.");
    if (resultModal) {
        resultModal.style.display = 'none';
    }
    // UIを初期状態に戻す
    const opponentProfileSection = document.getElementById('opponent-profile');
    if (opponentProfileSection) opponentProfileSection.classList.remove('visible');
    const opponentInfoArea = document.getElementById('opponent-info');
    if (opponentInfoArea) opponentInfoArea.innerHTML = '';
    updateMatchUI(); // UIを初期状態に戻す (内部で window.MyApp を参照)
}


// --- チャット関連関数 ---

/**
 * チャットメッセージを表示エリアに追加する
 * @param {string} messageText - 表示するメッセージ本文
 * @param {boolean} isMyMessage - 自分のメッセージかどうか
 * @param {string} [senderName] - 送信者名 (相手またはシステムの場合)
 */
function appendChatMessage(messageText, isMyMessage, senderName = '相手') {
    if (!matchChatMessagesArea) {
        console.warn("[match.js] appendChatMessage: matchChatMessagesArea element not found.");
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('match-chat-message');

    if (senderName === 'システム') {
        messageDiv.classList.add('chat-system-message');
    } else {
        messageDiv.classList.add(isMyMessage ? 'my-message' : 'opponent-message');
    }

    // サニタイズ（簡易版）
    const sanitizedText = messageText.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // メッセージ内容を設定
    const textNode = document.createTextNode(sanitizedText);
    messageDiv.appendChild(textNode);

    matchChatMessagesArea.appendChild(messageDiv);

    // 自動スクロール
    matchChatMessagesArea.scrollTop = matchChatMessagesArea.scrollHeight;
}

/**
 * チャットメッセージを送信する
 */
function sendChatMessage() {
    if (!matchChatInput || !matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) {
        console.warn("[match.js] sendChatMessage: Cannot send chat message due to invalid state.");
        if (!matchWebSocket || matchWebSocket.readyState !== WebSocket.OPEN) alert("チャットサーバーに接続されていません。");
        return;
    }
    const messageText = matchChatInput.value.trim();

    if (messageText && currentMatchId) {
        console.log(`[match.js] Sending message: ${messageText}`);

        // WebSocketでサーバーにメッセージを送信
        const messagePayload = {
            type: 'chat_message',
            matchId: currentMatchId, // バックエンドで認証に使われる想定
            text: messageText
        };
        matchWebSocket.send(JSON.stringify(messagePayload));

        // 自分の画面にメッセージを表示 (サーバーからのエコーバックを待たずに表示)
        appendChatMessage(messageText, true);

        matchChatInput.value = ''; // 入力欄をクリア
    }
}

/**
 * WebSocket接続を開始する
 */
function connectWebSocket() {
    if (matchWebSocket && matchWebSocket.readyState === WebSocket.OPEN) {
        console.log("[match.js] WebSocket already connected.");
        return;
    }
    // ★★★ script.js の window.getAuthToken を使用 ★★★
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
    if (!currentMatchId || !token) {
        console.error("[match.js] connectWebSocket: Cannot connect WebSocket: Missing matchId or auth token.");
        appendChatMessage("チャット接続に必要な情報がありません。", false, "システム");
        return;
    }

    // WebSocketサーバーのURL (トークンとMatchIDをクエリパラメータで渡す例)
    const wsUrl = `${WEBSOCKET_URL}?token=${token}&matchId=${currentMatchId}`;

    console.log(`[match.js] Connecting to WebSocket: ${wsUrl}`);
    appendChatMessage("チャットサーバーに接続中...", false, "システム");

    try {
        matchWebSocket = new WebSocket(wsUrl);

        matchWebSocket.onopen = () => {
            console.log("[match.js] WebSocket connection opened.");
            appendChatMessage("接続しました。", false, "システム");
        };

        matchWebSocket.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data);
                console.log("[match.js] WebSocket message received:", messageData);

                if (messageData.type === 'chat_message' && messageData.text) {
                    // サーバーは送信者ID(senderId)と名前(senderName)を付与して送り返す想定
                    const senderName = messageData.senderName || '相手';
                    // ★★★ window.MyApp からユーザーデータを取得して比較 ★★★
                    const isMyMsg = messageData.senderId === window.MyApp?.currentUserData?.sub; // Google ID (sub) で比較

                    if (!isMyMsg) { // 自分のメッセージは送信時に表示済みなので、相手のメッセージのみ表示
                         appendChatMessage(messageData.text, false, senderName);
                    }
                } else if (messageData.type === 'system_message') {
                    appendChatMessage(messageData.text, false, "システム");
                } else if (messageData.type === 'opponent_disconnected') {
                    appendChatMessage("対戦相手が切断しました。", false, "システム");
                    // 必要に応じてUIを変更 (例: 結果報告ボタンを無効化)
                }
                // 他のメッセージタイプも処理
            } catch (e) {
                console.error("[match.js] Error parsing WebSocket message:", e);
            }
        };

        matchWebSocket.onerror = (error) => {
            console.error("[match.js] WebSocket error:", error);
            appendChatMessage("チャット接続エラーが発生しました。", false, "システム");
        };

        matchWebSocket.onclose = (event) => {
            console.log("[match.js] WebSocket connection closed:", event.code, event.reason);
            // 意図的な切断でない場合のみメッセージ表示
            if (event.code !== 1000) { // 1000は正常終了
                 appendChatMessage(`チャット接続が切れました (Code: ${event.code})`, false, "システム");
            }
            matchWebSocket = null;
            // 接続が切れたらUIを更新 (例: マッチング前の状態に戻すか、エラー表示)
            // isMatching = false; // 状況による
            // currentMatchId = null;
            // currentOpponentData = null;
            // updateMatchUI();
        };

    } catch (error) {
        console.error("[match.js] Failed to create WebSocket connection:", error);
        appendChatMessage("チャットサーバーへの接続に失敗しました。", false, "システム");
    }
}

/**
 * WebSocket接続を切断する
 */
function disconnectWebSocket() {
    if (matchWebSocket) {
        console.log("[match.js] Closing WebSocket connection.");
        // 正常終了コード(1000)を指定してクローズ
        matchWebSocket.close(1000, "Client initiated disconnect");
        matchWebSocket = null;
    }
}


// --- ヘルパー関数 ---

// script.js に displayBadges がない場合のフォールバック実装
// ★ displayBadges は script.js に実装済みなので、このフォールバックは不要かもしれません
// ★ ただし、念のため残しておくのは安全です
if (typeof window.displayBadges === 'undefined') {
    window.displayBadges = function(badgeSlots, badgeIds) {
        console.warn("[match.js] Using fallback displayBadges.");
        if (!badgeSlots || badgeSlots.length === 0) return;
        badgeSlots.forEach((slot, index) => {
            slot.innerHTML = '';
            const badgeId = badgeIds && badgeIds[index] ? badgeIds[index] : null;
            if (badgeId && typeof window.getBadgeImagePath === 'function') {
                const imgPath = window.getBadgeImagePath(badgeId);
                const img = document.createElement('img');
                img.src = imgPath;
                img.alt = badgeId; // altテキストはバッジ名が理想
                slot.appendChild(img);
                slot.style.opacity = '1';
            } else {
                slot.style.opacity = '0.5';
            }
        });
    };
}
