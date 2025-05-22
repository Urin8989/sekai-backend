// frontend/mypage.js

// chartjs-plugin-datalabels をインポート (モジュールとして使う場合)
// import ChartDataLabels from 'chartjs-plugin-datalabels'; // Node.js環境などではこちら

// ▼▼▼ バックエンドURLを定数として定義 ▼▼▼
    const BACKEND_URL = 'https://www.mariokartbestrivals.com'; // ★★★ Xserver上のバックエンドサーバーのアドレス ★★★
// ▲▲▲ ここまで追加 ▲▲▲

// ▼▼▼ チャート読み込み済みフラグと処理中フラグを追加 ▼▼▼
let chartsLoadedForCurrentUser = false;
let isLoadingCharts = false; // ★ 処理中フラグを追加
// ▲▲▲ ここまで追加 ▲▲▲

// --- DOM要素の取得 (DOMContentLoaded内で取得) ---
let profilePic, profileName, profileRate, profilePoints,
    favCourseDisplay, favCourseInput, userCommentDisplay, userCommentInput, selfIntroDisplay, selfIntroInput,
    editProfileButton, saveProfileButton, cancelEditButton, // ★ cancelEditButton を宣言
    displayModeElements, editModeElements,
    rateHistoryCtx, recentWinRateCtx, overallWinRateCtx,
    rateHistoryPlaceholder, winRatePlaceholder, overallWinRatePlaceholder,
    displayBadgesContainer, editDisplayBadgesButton,
    badgeDexSection, badgeDexGrid, badgeDexLoading, badgeDexCount, badgeDexTotal,
    badgeDexDetail, badgeDexDetailClose, badgeDexDetailImg, badgeDexDetailName,
    badgeDexDetailDesc, badgeDexDetailCondition, badgeDexDetailRate, badgeDexDetailPrice,
    badgeDexDetailOwnedStatus,
    editBadgesModal, closeEditBadgesModalButton, displaySlotsContainer, ownedBadgesGrid,
    saveDisplayBadgesButton, cancelEditDisplayBadgesButton;

// --- チャートインスタンス ---
let rateHistoryChart = null;
let recentWinRateChart = null;
let overallWinRateChart = null;

// --- バッジデータ ---
let allBadgesData = []; // 全バッジ情報を保持
let currentDisplayBadgeSelection = []; // モーダルでの選択状態

// --- API Service (mypage.js 固有) ---
/**
 * 認証が必要なfetchリクエストをラップする関数
 * @param {string} url - リクエストURL
 * @param {object} [options={}] - fetchのオプション
 * @param {boolean} [requiresAuth=true] - 認証トークンが必要か
 * @returns {Promise<any>} - fetchのレスポンス (JSONパース済み)
 */
async function authenticatedFetch(url, options = {}, requiresAuth = true) {
    const headers = { ...options.headers };
    if (requiresAuth) {
        // ★ script.js の getAuthToken を使用
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


// --- 関数定義 ---

/**
 * ユーザーデータを取得して表示する関数
 * @param {string} userId - 取得するユーザーのID (Google ID)
 */
async function fetchUserData(userId) {
    console.log(`[mypage.js] fetchUserData called with userId: ${userId}`);
    try {
        // ★★★ バックエンドのユーザー取得APIエンドポイントに合わせて修正 ★★★
        // 例: /api/users/:userId (googleId)
        const userData = await authenticatedFetch(`${BACKEND_URL}/api/users/${userId}`, {}, false); // 他人のページは認証不要
        console.log(`[mypage.js] Fetched user data for ${userId}:`, userData);
        displayUserProfile(userData); // 取得したユーザーデータを表示
        // ★ ユーザーデータ取得後にチャートをロード
        loadAndRenderCharts(userId);
        // ★ ユーザーデータ取得後にバッジ図鑑を表示
        displayBadgeDex(userData, allBadgesData);
    } catch (error) {
        console.error(`[mypage.js] Error fetching user data for ${userId}:`, error);
        displayErrorState(`ユーザー情報の読み込みに失敗しました: ${error.message}`);
        // ▼▼▼ エラー時もボタン表示を更新 (ログアウト状態として) ▼▼▼
        updateEditButtonsVisibility(false);
        updateBadgeEditButtonVisibility(false);
        // ▲▲▲ 追加 ▲▲▲
    }
}

/**
 * ユーザープロフィール情報をHTMLに表示する関数
 * @param {object|null} userData - 表示するユーザーデータ、またはnull
 */
function displayUserProfile(userData) {
    console.log("[mypage.js] displayUserProfile called with user data:", userData ? userData.name : "null");

    // DOM要素が取得済みか確認
    if (!profilePic || !profileName || !profileRate || !profilePoints) {
        console.error("[mypage.js] プロフィール表示に必要な主要要素が見つかりません。HTMLのIDを確認してください。");
        return;
    }

    if (userData) {
        profilePic.src = userData.picture || 'images/placeholder-avatar.png';
        profileName.textContent = userData.name || 'プレイヤー名';
        profileRate.textContent = userData.rate ?? '----';
        profilePoints.textContent = `${userData.points ?? '----'} P`;

        const profile = userData.profile || {};
        if (favCourseDisplay) favCourseDisplay.textContent = profile.favCourse || '未設定';
        if (userCommentDisplay) userCommentDisplay.textContent = profile.comment || '未設定';
        if (selfIntroDisplay) selfIntroDisplay.textContent = profile.selfIntroduction || '未設定';

        // 表示バッジの決定 (displayBadgesがあればそれを、なければ所有バッジの先頭3つ)
        const badgesToDisplay = userData.displayBadges && userData.displayBadges.length > 0
                              ? userData.displayBadges
                              : userData.badges?.slice(0, 3) || [];
        displayProfileBadges(badgesToDisplay);

        // ▼▼▼ ボタン表示は initializePageData または onLoginStatusChange で行うため、ここでは初期化のみ ▼▼▼
        updateEditButtonsVisibility(false);
        updateBadgeEditButtonVisibility(false);
        // ▲▲▲ 修正 ▲▲▲

        toggleEditMode(false); // 常に表示モードで開始

    } else {
        // データがない場合（ログアウト状態、またはユーザーが見つからない場合）
        displayLoggedOutState(); // ログアウト状態の表示関数を呼び出す
    }
}

/**
 * ログアウト状態のUIを表示する関数
 */
function displayLoggedOutState() {
    console.log('[mypage.js] Displaying logged out state.');
    if (profilePic) profilePic.src = 'images/placeholder-avatar.png';
    if (profileName) profileName.textContent = 'ログインしてください';
    if (profileRate) profileRate.textContent = '----';
    if (profilePoints) profilePoints.textContent = '---- P';
    if (favCourseDisplay) favCourseDisplay.textContent = '未設定';
    if (userCommentDisplay) userCommentDisplay.textContent = '未設定';
    if (selfIntroDisplay) selfIntroDisplay.textContent = '未設定';
    displayProfileBadges([]); // バッジをクリア

    destroyCharts(); // チャートを破棄
    showChartPlaceholder(rateHistoryPlaceholder, 'ログインしてください');
    showChartPlaceholder(winRatePlaceholder, 'ログインしてください');
    showChartPlaceholder(overallWinRatePlaceholder, 'ログインしてください');

    chartsLoadedForCurrentUser = false; // チャート読み込みフラグをリセット
    isLoadingCharts = false; // 処理中フラグをリセット

    updateEditButtonsVisibility(false); // 編集ボタンを非表示
    updateBadgeEditButtonVisibility(false); // バッジ編集ボタンを非表示
    if (badgeDexSection) badgeDexSection.style.display = 'none'; // バッジ図鑑も非表示
    displayModeElements?.forEach(el => el.style.display = ''); // 表示モードに戻す
    editModeElements?.forEach(el => el.style.display = 'none'); // 編集モードは非表示
}

/**
 * エラー状態のUIを表示する関数
 * @param {string} [errorMessage='データの読み込みに失敗しました。'] - 表示するエラーメッセージ
 */
function displayErrorState(errorMessage = 'データの読み込みに失敗しました。') {
    console.log('[mypage.js] Displaying error state.');
    if (profilePic) profilePic.src = 'images/placeholder-avatar.png';
    if (profileName) profileName.textContent = 'データ読込失敗';
    if (profileRate) profileRate.textContent = '----';
    if (profilePoints) profilePoints.textContent = '---- P';
    if (favCourseDisplay) favCourseDisplay.textContent = '読込失敗';
    if (userCommentDisplay) userCommentDisplay.textContent = '読込失敗';
    if (selfIntroDisplay) selfIntroDisplay.textContent = '読込失敗';
    displayProfileBadges([]);

    destroyCharts();
    showChartPlaceholder(rateHistoryPlaceholder, errorMessage);
    showChartPlaceholder(winRatePlaceholder, errorMessage);
    showChartPlaceholder(overallWinRatePlaceholder, errorMessage);

    chartsLoadedForCurrentUser = false;
    isLoadingCharts = false;

    updateEditButtonsVisibility(false);
    updateBadgeEditButtonVisibility(false);
    if (badgeDexSection) badgeDexSection.style.display = 'none';
    displayModeElements?.forEach(el => el.style.display = '');
    editModeElements?.forEach(el => el.style.display = 'none');
}

/**
 * プロフィール欄に表示するバッジを更新する関数
 * @param {string[]} badgeIds - 表示するバッジIDの配列
 */
function displayProfileBadges(badgeIds) {
    if (!displayBadgesContainer) return;
    const badgeSlots = displayBadgesContainer.querySelectorAll('.badge-slot');
    badgeSlots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.remove('filled');
        slot.style.opacity = '0.5'; // デフォルトは半透明
        const badgeId = badgeIds[index];
        if (badgeId && allBadgesData.length > 0) {
            const badgeData = allBadgesData.find(b => b.badgeId === badgeId);
            if (badgeData) {
                const img = document.createElement('img');
                // ★ script.js の getBadgeImagePath を使用
                img.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badgeId) : 'default.png';
                img.alt = badgeData.name;
                slot.appendChild(img);
                slot.classList.add('filled');
                slot.style.opacity = '1'; // 画像があれば不透明に
            }
        }
    });
}

/**
 * 編集ボタンの表示/非表示を制御する関数
 * @param {boolean} isViewingOwnPage - 自分のページを表示しているか
 */
function updateEditButtonsVisibility(isViewingOwnPage) {
    console.log("[mypage.js] updateEditButtonsVisibility called. isViewingOwnPage:", isViewingOwnPage);
    if (editProfileButton) editProfileButton.style.display = isViewingOwnPage ? 'inline-block' : 'none';
    // 保存・キャンセルボタンは編集モードでのみ表示されるので、ここでは非表示のまま
    if (saveProfileButton) saveProfileButton.style.display = 'none';
    if (cancelEditButton) cancelEditButton.style.display = 'none';
}

/**
 * バッジ編集ボタンの表示/非表示を制御する関数
 * @param {boolean} isViewingOwnPage - 自分のページを表示しているか
 */
function updateBadgeEditButtonVisibility(isViewingOwnPage) {
     console.log("[mypage.js] updateBadgeEditButtonVisibility called. isViewingOwnPage:", isViewingOwnPage);
     if (editDisplayBadgesButton) {
         editDisplayBadgesButton.style.display = isViewingOwnPage ? 'inline-block' : 'none';
     }
}

/**
 * 編集モードのUIに切り替える関数
 * @param {boolean} isEditing - 編集モードにするか
 */
function toggleEditMode(isEditing) {
    console.log("[mypage.js] toggleEditMode called. isEditing:", isEditing);
    displayModeElements?.forEach(el => el.style.display = isEditing ? 'none' : '');
    editModeElements?.forEach(el => el.style.display = isEditing ? '' : 'none');
    if (editProfileButton) editProfileButton.style.display = isEditing ? 'none' : 'inline-block'; // 編集ボタンは逆
    if (saveProfileButton) saveProfileButton.style.display = isEditing ? 'inline-block' : 'none'; // 保存ボタン
    // ▼▼▼ cancelButton の存在チェックを追加 ▼▼▼
    if (cancelEditButton) {
        cancelEditButton.style.display = isEditing ? 'inline-block' : 'none'; // キャンセルボタン
    } else {
        console.warn("[mypage.js] toggleEditMode: cancelEditButton element not found."); // 念のため警告
    }
    // ▲▲▲ cancelButton の存在チェックを追加 ▲▲▲

    // 編集モード開始時に現在の値を入力欄に設定
    if (isEditing) {
        if (favCourseInput && favCourseDisplay) favCourseInput.value = favCourseDisplay.textContent !== '未設定' ? favCourseDisplay.textContent : '';
        if (userCommentInput && userCommentDisplay) userCommentInput.value = userCommentDisplay.textContent !== '未設定' ? userCommentDisplay.textContent : '';
        if (selfIntroInput && selfIntroDisplay) selfIntroInput.value = selfIntroDisplay.textContent !== '未設定' ? selfIntroDisplay.textContent : '';
    }
}

/**
 * プロフィール編集内容をサーバーに保存する関数
 */
async function saveProfile() {
    const updatedProfile = {
        favCourse: favCourseInput?.value?.trim() || '',
        comment: userCommentInput?.value?.trim() || '',
        selfIntroduction: selfIntroInput?.value?.trim() || '',
    };
    console.log('[mypage.js] Saving profile:', updatedProfile);
    if (saveProfileButton) {
        saveProfileButton.disabled = true;
        saveProfileButton.textContent = '保存中...';
    }
    try {
       const apiUrl = `${BACKEND_URL}/api/users/profile`; // ★ APIエンドポイント確認
       // ★ script.js の getAuthToken を使用
       const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
       if (!token) throw new Error('ログインが必要です。');

        const response = await fetch(apiUrl, {
             method: 'PUT',
             headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${token}`
             },
             body: JSON.stringify(updatedProfile),
         });

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
             throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        console.log('[mypage.js] Profile saved successfully:', result);

        // 表示を更新
        if (favCourseDisplay) favCourseDisplay.textContent = updatedProfile.favCourse || '未設定';
        if (userCommentDisplay) userCommentDisplay.textContent = updatedProfile.comment || '未設定';
        if (selfIntroDisplay) selfIntroDisplay.textContent = updatedProfile.selfIntroduction || '未設定';

        // グローバル状態も更新
        if (window.MyApp?.currentUserData) {
            if (!window.MyApp.currentUserData.profile) {
                window.MyApp.currentUserData.profile = {};
            }
            window.MyApp.currentUserData.profile.favCourse = updatedProfile.favCourse;
            window.MyApp.currentUserData.profile.comment = updatedProfile.comment;
            window.MyApp.currentUserData.profile.selfIntroduction = updatedProfile.selfIntroduction;
            // ★ script.js の saveCurrentUserData を使用
            if (typeof window.saveCurrentUserData === 'function') {
                window.saveCurrentUserData();
            }
        }

        toggleEditMode(false); // 表示モードに戻す
        alert('プロフィールを更新しました。');
    } catch (error) {
        console.error('[mypage.js] Error saving profile:', error);
        alert(`プロフィールの保存に失敗しました: ${error.message}`);
    } finally {
        if (saveProfileButton) {
            saveProfileButton.disabled = false;
            saveProfileButton.textContent = '保存';
        }
    }
}

// ▼▼▼ ページ初期化処理を独立した関数に変更 ▼▼▼
/**
 * ページ読み込み時のユーザーデータロード処理
 * script.js の初期化完了を待ってから処理を開始する
 */
async function initializePageData() {
    console.log("[mypage.js] initializePageData called. Waiting for user data ready callback.");

    // ★ 全バッジ情報を先に取得しておく
    if (badgeDexLoading) badgeDexLoading.style.display = 'flex';
    allBadgesData = await fetchAllBadges(); // fetchAllBadges が新しいAPIを叩くように修正済み
    if (badgeDexLoading) badgeDexLoading.style.display = 'none';
    console.log("[mypage.js] All badges data fetched:", allBadgesData);

    // script.js の初期化完了コールバックを登録
    window.registerUserDataReadyCallback(async (loggedInUserData) => {
        console.log("[mypage.js] User data ready callback executed. User:", loggedInUserData ? loggedInUserData.name : "null");

        const urlParams = new URLSearchParams(window.location.search);
        const userIdFromUrl = urlParams.get('userId');
        console.log("[mypage.js] User data ready callback: userIdFromUrl:", userIdFromUrl);

        let targetUserId = null;
        if (userIdFromUrl) {
            // URLにIDがあれば、そのユーザーを表示対象とする
            targetUserId = userIdFromUrl;
            console.log(`[mypage.js] Target user ID from URL: ${targetUserId}`);
        } else if (loggedInUserData) {
            // URLにIDがなく、ログインしていれば、自分自身を表示対象とする
            targetUserId = loggedInUserData.sub;
            console.log(`[mypage.js] Target user ID is current user: ${targetUserId}`);
        } else {
            // URLにIDがなく、ログインもしていなければ、ログアウト状態を表示
            console.log("[mypage.js] Not logged in and no user ID in URL. Displaying logged out state.");
            displayLoggedOutState();
            displayBadgeDex(null, allBadgesData); // バッジ図鑑は表示
            return; // これ以上処理しない
        }

        // 表示対象ユーザーのデータを取得・表示
        if (targetUserId) {
            chartsLoadedForCurrentUser = false;
            isLoadingCharts = false;
            // ▼▼▼ fetchUserData を呼び出し、完了後にボタン表示を更新 ▼▼▼
            try {
                await fetchUserData(targetUserId); // fetchUserData が完了するのを待つ
                // fetchUserData が完了した後 (displayUserProfile が呼ばれた後) にボタン表示を更新
                const isViewingOwnPage = loggedInUserData && (!userIdFromUrl || userIdFromUrl === loggedInUserData.sub);
                console.log(`[mypage.js] User data ready callback - Updating edit buttons after fetchUserData. isViewingOwnPage: ${isViewingOwnPage}`);
                updateEditButtonsVisibility(isViewingOwnPage);
                updateBadgeEditButtonVisibility(isViewingOwnPage);
            } catch (error) {
                 // fetchUserData 内でエラー処理済みだが、念のため
                 console.error("[mypage.js] Error during initial fetchUserData in ready callback:", error);
                 // エラー時もボタン表示を更新 (ログアウト状態として)
                 updateEditButtonsVisibility(false);
                 updateBadgeEditButtonVisibility(false);
            }
            // ▲▲▲ 修正 ▲▲▲
        } else {
             console.error("[mypage.js] Could not determine target user ID.");
             displayErrorState("表示するユーザーを特定できませんでした。");
        }
    });
}
// ▲▲▲ ページ初期化処理 ▲▲▲

// --- チャート関連 ---
async function loadAndRenderCharts(userId) {
    console.log('[mypage.js] Attempting to load chart data for user:', userId);

    // ★ 既に読み込み中、または読み込み済みならスキップ
    // ▼▼▼ 読み込み済みフラグのチェックを修正 (自分のページの場合のみ適用) ▼▼▼
    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromUrl = urlParams.get('userId');
    const isOwnPage = !userIdFromUrl; // URLにIDがなければ自分のページ
    if (isLoadingCharts || (isOwnPage && chartsLoadedForCurrentUser)) {
        console.log(`[mypage.js] Skipping chart load. isLoading: ${isLoadingCharts}, isLoaded: ${chartsLoadedForCurrentUser}, isOwnPage: ${isOwnPage}`);
        return;
    }
    // ▲▲▲ 修正 ▲▲▲

    if (!userId) {
         console.warn('[mypage.js] Cannot load charts without userId.');
         displayErrorState('ユーザー情報の取得に失敗しました。');
         return;
    }

    isLoadingCharts = true;
    destroyCharts(); // 既存のチャートを破棄

    showChartPlaceholder(rateHistoryPlaceholder, 'レート履歴を読込中...');
    showChartPlaceholder(winRatePlaceholder, '勝率データを読込中...');
    showChartPlaceholder(overallWinRatePlaceholder, '勝率データを読込中...');

    try {
        const apiUrl = `${BACKEND_URL}/api/users/${userId}/stats`; // ★ APIエンドポイント確認
        // ★ script.js の getAuthToken を使用
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        } else {
            console.warn('[mypage.js] Auth token not found for stats request.');
        }
        const response = await fetch(apiUrl, { headers });

        console.log(`[mypage.js] Stats API response status: ${response.status}`);

        if (!response.ok) {
            if (response.status === 403) {
                throw new Error(`統計情報の表示権限がありません。(ステータス: ${response.status})`);
            }
             const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        const statsData = await response.json();
        console.log('[mypage.js] Stats data received:', statsData);

        renderRateHistoryChart(statsData.rateHistory || []);
        renderWinRateCharts(statsData.winRate || {});

        // ▼▼▼ 自分のページの場合のみ読み込み完了フラグを立てる ▼▼▼
        if (isOwnPage) {
            chartsLoadedForCurrentUser = true;
            console.log('[mypage.js] Charts loaded successfully for current user.');
        } else {
             console.log('[mypage.js] Charts loaded successfully for other user.');
        }
        // ▲▲▲ 修正 ▲▲▲

    } catch (error) {
        console.error('[mypage.js] Error loading chart data:', error);
        showChartPlaceholder(rateHistoryPlaceholder, `レート履歴の読み込みエラー: ${error.message}`);
        showChartPlaceholder(winRatePlaceholder, `勝率データの読み込みエラー: ${error.message}`);
        showChartPlaceholder(overallWinRatePlaceholder, `勝率データの読み込みエラー: ${error.message}`);
        chartsLoadedForCurrentUser = false; // ★ エラー時はフラグをリセット
    } finally {
        isLoadingCharts = false; // ★ 処理中フラグを解除
        console.log('[mypage.js] Finished chart loading attempt. isLoadingCharts:', isLoadingCharts); // ★ ログ追加
    }
}

function renderRateHistoryChart(historyData) {
    if (!rateHistoryCtx) return;
    hideChartPlaceholder(rateHistoryPlaceholder);

    if (!historyData || historyData.length === 0) {
        showChartPlaceholder(rateHistoryPlaceholder, 'レート履歴データがありません。');
        return;
    }

    const labels = historyData.map(item => new Date(item.date).toLocaleDateString());
    const data = historyData.map(item => item.rate);

    rateHistoryChart = new Chart(rateHistoryCtx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'レート', data, borderColor: 'rgb(75, 192, 192)', tension: 0.1, fill: false }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: 'rgba(255, 255, 255, 0.7)' } },
                x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.7)' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false },
                datalabels: { display: false }
            }
        }
    });
}

function renderWinRateCharts(winRateData) {
    const winColor = 'rgba(218, 165, 32, 0.8)';
    const winBorderColor = 'rgba(218, 165, 32, 1)';
    const lossColor = 'rgba(105, 105, 105, 0.8)';
    const lossBorderColor = 'rgba(105, 105, 105, 1)';

    if (recentWinRateCtx) {
        const recent = winRateData.recent;
        hideChartPlaceholder(winRatePlaceholder);
        if (recent && (recent.wins > 0 || recent.losses > 0)) {
            recentWinRateChart = new Chart(recentWinRateCtx, {
                type: 'doughnut',
                data: { labels: ['勝利', '敗北'], datasets: [{ label: '直近勝率', data: [recent.wins, recent.losses], backgroundColor: [winColor, lossColor], borderColor: [winBorderColor, lossBorderColor], borderWidth: 1 }] },
                options: { responsive: true, maintainAspectRatio: false, layout: { padding: 15 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: createTooltipLabel } }, datalabels: createDataLabelsConfig() } }
            });
        } else {
            showChartPlaceholder(winRatePlaceholder, '直近の対戦データがありません。');
        }
    }

    if (overallWinRateCtx) {
        const overall = winRateData.overall;
        hideChartPlaceholder(overallWinRatePlaceholder);
        if (overall && (overall.wins > 0 || overall.losses > 0)) {
            overallWinRateChart = new Chart(overallWinRateCtx, {
                type: 'doughnut',
                data: { labels: ['勝利', '敗北'], datasets: [{ label: '全体勝率', data: [overall.wins, overall.losses], backgroundColor: [winColor, lossColor], borderColor: [winBorderColor, lossBorderColor], borderWidth: 1 }] },
                 options: { responsive: true, maintainAspectRatio: false, layout: { padding: 15 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: createTooltipLabel } }, datalabels: createDataLabelsConfig() } }
            });
        } else {
            showChartPlaceholder(overallWinRatePlaceholder, '全体の対戦データがありません。');
        }
    }
}

function destroyCharts() {
    console.log('[mypage.js] Destroying existing charts...');
    if (rateHistoryChart) { rateHistoryChart.destroy(); rateHistoryChart = null; console.log('[mypage.js] Rate history chart destroyed.'); }
    if (recentWinRateChart) { recentWinRateChart.destroy(); recentWinRateChart = null; console.log('[mypage.js] Recent win rate chart destroyed.'); }
    if (overallWinRateChart) { overallWinRateChart.destroy(); overallWinRateChart = null; console.log('[mypage.js] Overall win rate chart destroyed.'); }
}

function showChartPlaceholder(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = 'flex';
        const canvas = element.previousElementSibling;
        if (canvas && canvas.tagName === 'CANVAS') canvas.style.display = 'none';
    }
}

function hideChartPlaceholder(element) {
    if (element) {
        element.style.display = 'none';
        const canvas = element.previousElementSibling;
        if (canvas && canvas.tagName === 'CANVAS') canvas.style.display = '';
    }
}

function createTooltipLabel(context) {
    let label = context.label || '';
    if (label) label += ': ';
    if (context.parsed !== null) {
        const total = context.dataset.data.reduce((a, b) => a + b, 0);
        const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) + '%' : '0%';
        label += `${context.raw} (${percentage})`;
    }
    return label;
}

function createDataLabelsConfig() {
    return { display: true, formatter: (value) => value, color: '#fff', font: { weight: 'bold', size: 14 }, anchor: 'center', align: 'center' };
}

// --- バッジ図鑑関連 ---
async function fetchAllBadges() {
    try {
        // ▼▼▼ APIエンドポイントを修正 ▼▼▼
        const apiUrl = `${BACKEND_URL}/api/badges/all`; // 全てのバッジを取得するAPI
        // ▲▲▲ APIエンドポイントを修正 ▲▲▲
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch badges: ${response.status}`);
        }
        const badges = await response.json();
        // ★ APIレスポンスに合わせて badgeId を使う
        return badges.map(b => ({ ...b }));
    } catch (error) {
        console.error("Error fetching all badges:", error);
        return [];
    }
}

function displayBadgeDex(userData, allBadges) {
    if (!badgeDexSection || !badgeDexGrid || !badgeDexLoading || !badgeDexCount || !badgeDexTotal) return;
    badgeDexSection.style.display = 'block'; // 図鑑セクションは常に表示
    if (badgeDexLoading) badgeDexLoading.style.display = 'none'; // ローディング非表示
    badgeDexGrid.innerHTML = '';
    const ownedBadgeIds = new Set(userData?.badges || []);
    let ownedCount = 0;

    if (allBadges.length === 0) {
        badgeDexGrid.innerHTML = '<p>バッジ情報がありません。</p>';
        badgeDexCount.textContent = 0;
        badgeDexTotal.textContent = 0;
        return;
    }

    allBadges.forEach(badge => {
        const isOwned = ownedBadgeIds.has(badge.badgeId);
        if (isOwned) ownedCount++;
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('badge-dex-item');
        if (!isOwned) itemDiv.classList.add('not-owned');
        itemDiv.dataset.badgeId = badge.badgeId;
        const img = document.createElement('img');
        // ★ script.js の getBadgeImagePath を使用
        img.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badge.badgeId) : 'default.png';
        img.alt = badge.name;
        itemDiv.appendChild(img);
        itemDiv.addEventListener('click', () => showBadgeDetail(badge, isOwned));
        badgeDexGrid.appendChild(itemDiv);
    });
    badgeDexCount.textContent = ownedCount;
    badgeDexTotal.textContent = allBadges.length;
}

function showBadgeDetail(badgeData, isOwned) {
    if (!badgeDexDetail || !badgeDexDetailImg || !badgeDexDetailName || !badgeDexDetailDesc ||
        !badgeDexDetailCondition || !badgeDexDetailRate || !badgeDexDetailPrice || !badgeDexDetailOwnedStatus) return;
    // ★ script.js の getBadgeImagePath を使用
    badgeDexDetailImg.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badgeData.badgeId) : 'default.png';
    badgeDexDetailName.textContent = badgeData.name;
    badgeDexDetailDesc.textContent = badgeData.description || '説明なし';

    // 取得条件を生成
    let conditions = [];
    if (badgeData.requiredRate > 0) conditions.push(`レート ${badgeData.requiredRate} 以上`);
    if (badgeData.requiredMatches > 0) conditions.push(`対戦数 ${badgeData.requiredMatches} 以上`);
    if (badgeData.price > 0) conditions.push(`ショップで購入 (${badgeData.price.toLocaleString()} P)`);
    if (badgeData.price === 0 && !badgeData.requiredRate && !badgeData.requiredMatches) conditions.push('ガチャで入手');
    if (badgeData.isLimited) conditions.push('期間限定');
    badgeDexDetailCondition.textContent = conditions.length > 0 ? conditions.join(', ') : '---';

    // 不要な情報を非表示にするか、内容を調整
    badgeDexDetailRate.style.display = badgeData.requiredRate > 0 ? 'block' : 'none';
    badgeDexDetailRate.textContent = `必要レート: ${badgeData.requiredRate}`;
    badgeDexDetailPrice.style.display = badgeData.price > 0 ? 'block' : 'none';
    badgeDexDetailPrice.textContent = `ショップ価格: ${badgeData.price.toLocaleString()} P`;

    if (isOwned) {
        badgeDexDetailOwnedStatus.textContent = '取得済み';
        badgeDexDetailOwnedStatus.className = 'owned-status owned';
    } else {
        badgeDexDetailOwnedStatus.textContent = '未取得';
        badgeDexDetailOwnedStatus.className = 'owned-status not-owned';
    }
    badgeDexDetail.style.display = 'flex';
}

function hideBadgeDetail() {
    if (badgeDexDetail) badgeDexDetail.style.display = 'none';
}

// --- 表示バッジ編集モーダル関連 ---
function openEditDisplayBadgesModal(userData) {
    if (!editBadgesModal || !displaySlotsContainer || !ownedBadgesGrid || !userData) return;
    currentDisplayBadgeSelection = [...(userData.displayBadges || [])]; // 現在の表示バッジをコピー
    renderDisplaySlots(); // 選択スロットを描画
    renderOwnedBadgesGrid(userData.badges || []); // 所有バッジ一覧を描画
    editBadgesModal.style.display = 'flex'; // モーダル表示
}

function closeEditDisplayBadgesModal() {
    if (editBadgesModal) editBadgesModal.style.display = 'none';
}

function renderDisplaySlots() {
    if (!displaySlotsContainer) return;
    const slots = displaySlotsContainer.querySelectorAll('.display-slot');
    slots.forEach((slot, index) => {
        slot.innerHTML = ''; // スロットをクリア
        slot.classList.remove('filled');
        slot.onclick = null; // クリックイベントをリセット
        const badgeId = currentDisplayBadgeSelection[index];
        if (badgeId && allBadgesData.length > 0) {
            const badgeData = allBadgesData.find(b => b.badgeId === badgeId);
            if (badgeData) {
                const img = document.createElement('img');
                // ★ script.js の getBadgeImagePath を使用
                img.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badgeId) : 'default.png';
                img.alt = badgeData.name;
                slot.appendChild(img);
                slot.classList.add('filled');
                // 削除ボタンを追加
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-badge-from-slot';
                removeBtn.innerHTML = '&times;'; // ×印
                removeBtn.onclick = (e) => { e.stopPropagation(); removeBadgeFromSlot(index); }; // クリックで削除
                slot.appendChild(removeBtn);
            }
        } else {
             // 空のスロットにクリックイベントを設定 (バッジ追加用)
             // slot.onclick = () => { /* 必要なら空スロットクリック時の処理 */ };
        }
    });
}

function renderOwnedBadgesGrid(ownedBadgeIds) {
    if (!ownedBadgesGrid || allBadgesData.length === 0) return;
    ownedBadgesGrid.innerHTML = '';
    if (ownedBadgeIds.length === 0) {
        ownedBadgesGrid.innerHTML = '<p>所持しているバッジがありません。</p>';
        return;
    }
    ownedBadgeIds.forEach(badgeId => {
        const badgeData = allBadgesData.find(b => b.badgeId === badgeId);
        if (badgeData) {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('badge-item');
            itemDiv.dataset.badgeId = badgeId;
            const img = document.createElement('img');
            // ★ script.js の getBadgeImagePath を使用
            img.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badgeId) : 'default.png';
            img.alt = badgeData.name;
            itemDiv.appendChild(img);

            // 既に表示スロットで選択されているか確認
            if (currentDisplayBadgeSelection.includes(badgeId)) {
                itemDiv.classList.add('selected'); // 選択済みスタイル
                itemDiv.onclick = null; // クリック不可
            } else {
                itemDiv.classList.remove('selected');
                itemDiv.onclick = () => addBadgeToSlot(badgeId); // クリックでスロットに追加
            }
            ownedBadgesGrid.appendChild(itemDiv);
        }
    });
}

function addBadgeToSlot(badgeId) {
    if (currentDisplayBadgeSelection.length >= 3) {
        alert('表示できるバッジは3つまでです。');
        return;
    }
    if (currentDisplayBadgeSelection.includes(badgeId)) return; // 既に追加済み
    currentDisplayBadgeSelection.push(badgeId); // 選択リストに追加
    renderDisplaySlots(); // スロット再描画
    renderOwnedBadgesGrid(window.MyApp?.currentUserData?.badges || []); // 所有バッジグリッド再描画 (選択状態反映)
}

function removeBadgeFromSlot(slotIndex) {
    if (slotIndex >= 0 && slotIndex < currentDisplayBadgeSelection.length) {
        currentDisplayBadgeSelection.splice(slotIndex, 1); // 選択リストから削除
        renderDisplaySlots(); // スロット再描画
        renderOwnedBadgesGrid(window.MyApp?.currentUserData?.badges || []); // 所有バッジグリッド再描画
    }
}

async function saveDisplayBadges() {
    console.log("Saving display badges:", currentDisplayBadgeSelection);
    if (saveDisplayBadgesButton) {
        saveDisplayBadgesButton.disabled = true;
        saveDisplayBadgesButton.textContent = '保存中...';
    }
    try {
        const apiUrl = `${BACKEND_URL}/api/users/profile/display-badges`; // ★ APIエンドポイント確認
        // ★ script.js の getAuthToken を使用
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!token) throw new Error("ログインが必要です。");

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ displayBadges: currentDisplayBadgeSelection })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `保存に失敗しました (ステータス: ${response.status})`);
        }
        const result = await response.json();
        console.log("Display badges saved successfully:", result);

        // グローバル状態を更新
        if (window.MyApp?.currentUserData) {
            window.MyApp.currentUserData.displayBadges = result.displayBadges || currentDisplayBadgeSelection;
            // ★ script.js の saveCurrentUserData を使用
            if (typeof window.saveCurrentUserData === 'function') {
                window.saveCurrentUserData();
            }
        }
        // プロフィール欄のバッジ表示を更新
        displayProfileBadges(window.MyApp?.currentUserData?.displayBadges || []);
        closeEditDisplayBadgesModal(); // モーダルを閉じる
        alert('表示バッジを更新しました。');
    } catch (error) {
        console.error("Error saving display badges:", error);
        alert(`表示バッジの保存に失敗しました: ${error.message}`);
    } finally {
        if (saveDisplayBadgesButton) {
            saveDisplayBadgesButton.disabled = false;
            saveDisplayBadgesButton.textContent = '保存する';
        }
    }
}

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[mypage.js] DOMContentLoaded");

    // --- DOM要素の取得 ---
    profilePic = document.getElementById('profile-pic');
    profileName = document.getElementById('profile-name');
    profileRate = document.getElementById('profile-rate');
    profilePoints = document.getElementById('profile-points');
    favCourseDisplay = document.getElementById('fav-course-display');
    favCourseInput = document.getElementById('fav-course-input');
    userCommentDisplay = document.getElementById('user-comment-display');
    userCommentInput = document.getElementById('user-comment-input');
    selfIntroDisplay = document.getElementById('self-intro-display');
    selfIntroInput = document.getElementById('self-intro-input');
    editProfileButton = document.getElementById('edit-profile-button');
    saveProfileButton = document.getElementById('save-profile-button');
    cancelEditButton = document.getElementById('cancel-edit-button');
    displayModeElements = document.querySelectorAll('.display-mode');
    editModeElements = document.querySelectorAll('.edit-mode');
    rateHistoryCtx = document.getElementById('rate-history-chart')?.getContext('2d');
    recentWinRateCtx = document.getElementById('recent-winrate-chart')?.getContext('2d');
    overallWinRateCtx = document.getElementById('overall-winrate-chart')?.getContext('2d');
    rateHistoryPlaceholder = document.getElementById('rateHistoryChartPlaceholder');
    winRatePlaceholder = document.getElementById('winRateChartPlaceholder');
    overallWinRatePlaceholder = document.getElementById('overallWinRateChartPlaceholder');
    displayBadgesContainer = document.getElementById('display-badges');
    editDisplayBadgesButton = document.getElementById('edit-display-badges-button');
    badgeDexSection = document.getElementById('badge-dex');
    badgeDexGrid = document.getElementById('badge-dex-grid');
    badgeDexLoading = document.getElementById('badge-dex-loading');
    badgeDexCount = document.getElementById('badge-dex-count');
    badgeDexTotal = document.getElementById('badge-dex-total');
    badgeDexDetail = document.getElementById('badge-dex-detail');
    badgeDexDetailClose = document.getElementById('badge-dex-detail-close');
    badgeDexDetailImg = document.getElementById('badge-dex-detail-img');
    badgeDexDetailName = document.getElementById('badge-dex-detail-name');
    badgeDexDetailDesc = document.getElementById('badge-dex-detail-desc');
    badgeDexDetailCondition = document.getElementById('badge-dex-detail-condition');
    badgeDexDetailRate = document.getElementById('badge-dex-detail-rate');
    badgeDexDetailPrice = document.getElementById('badge-dex-detail-price');
    badgeDexDetailOwnedStatus = document.getElementById('badge-dex-detail-owned-status');
    editBadgesModal = document.getElementById('edit-display-badges-modal');
    closeEditBadgesModalButton = document.getElementById('close-edit-badges-modal');
    displaySlotsContainer = document.getElementById('display-slots');
    ownedBadgesGrid = document.getElementById('owned-badges-grid');
    saveDisplayBadgesButton = document.getElementById('save-display-badges-button');
    cancelEditDisplayBadgesButton = document.getElementById('cancel-edit-display-badges-button');

    // プラグイン登録
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
        console.log('[mypage.js] ChartDataLabels registered.');
    } else {
        console.warn('[mypage.js] ChartDataLabels not found.');
    }

    // 初期状態表示
    displayLoggedOutState();

    // ▼▼▼ ページ読み込み時のデータロード処理を実行 ▼▼▼
    initializePageData();
    // ▲▲▲ 変更 ▲▲▲

    // ログイン状態変化コールバックを登録
    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange(async (loggedInUserData) => {
            console.log("[mypage.js] Login status changed:", loggedInUserData ? loggedInUserData.name : "null");

            const urlParams = new URLSearchParams(window.location.search);
            const userIdFromUrl = urlParams.get('userId');
            console.log("[mypage.js] Login status changed callback: userIdFromUrl:", userIdFromUrl);

            // ★ 全バッジ情報が未取得なら取得 (念のため)
            if (allBadgesData.length === 0) {
                if (badgeDexLoading) badgeDexLoading.style.display = 'flex';
                allBadgesData = await fetchAllBadges();
                if (badgeDexLoading) badgeDexLoading.style.display = 'none';
                console.log("[mypage.js] All badges data fetched in login status change.");
            }

            // ▼▼▼ ロジック修正 ▼▼▼
            if (loggedInUserData && !userIdFromUrl) {
                // 自分のページでログイン状態になった場合
                console.log("[mypage.js] Login status changed to logged in (no URL param). Fetching current user profile.");
                // ★ 常に fetchUserData を呼び出す前にフラグをリセット
                chartsLoadedForCurrentUser = false;
                isLoadingCharts = false;
                try { // ★ try-catch を追加
                    await fetchUserData(loggedInUserData.sub); // ★ await を追加して完了を待つ
                    // ★ fetchUserData 完了後にボタン表示を更新
                    console.log("[mypage.js] Login status change - Updating edit buttons after fetchUserData. isViewingOwnPage: true");
                    updateEditButtonsVisibility(true);
                    updateBadgeEditButtonVisibility(true); // ★ ここで再度 true で呼び出す
                } catch (error) {
                    console.error("[mypage.js] Error during fetchUserData in login status change callback:", error);
                    // エラー時もボタン表示を更新 (ログアウト状態として)
                    updateEditButtonsVisibility(false);
                    updateBadgeEditButtonVisibility(false);
                }
            } else if (!loggedInUserData && !userIdFromUrl) {
                 // 自分のページでログアウト状態になった場合
                 console.log("[mypage.js] Login status changed to logged out (no URL param). Displaying default.");
                 displayLoggedOutState();
                 displayBadgeDex(null, allBadgesData);
            } else if (userIdFromUrl) {
                 // 他人のページ表示中にログイン/ログアウトした場合
                 console.log("[mypage.js] Login status changed, URL param exists. Updating edit buttons and badge dex.");
                 const isViewingOwnPage = loggedInUserData && userIdFromUrl === loggedInUserData.sub;
                 // ★ ボタン表示更新を fetchUserData の前に移動 (fetchUserData 内でリセットされる可能性があるため)
                 updateEditButtonsVisibility(isViewingOwnPage);
                 updateBadgeEditButtonVisibility(isViewingOwnPage);
                 try {
                     // 他人のページのデータを取得してバッジ図鑑などを更新
                     const targetUser = await authenticatedFetch(`${BACKEND_URL}/api/users/${userIdFromUrl}`, {}, false);
                     displayBadgeDex(targetUser, allBadgesData);
                     // 必要であれば、ここで再度 fetchUserData(userIdFromUrl) を await で呼び出し、
                     // その後に再度ボタン表示を更新することも検討できますが、
                     // 他人のページでは通常ボタンは表示されないため、現状のままでも良いかもしれません。
                 } catch (error) {
                     console.error(`[mypage.js] Error fetching target user data (${userIdFromUrl}) for badge dex update after login status change:`, error);
                     displayBadgeDex(null, allBadgesData);
                     updateEditButtonsVisibility(false); // エラー時は非表示
                     updateBadgeEditButtonVisibility(false);
                 }
            }
            // ▲▲▲ ロジック修正 ▲▲▲
        });
    } else {
        console.error("[mypage.js] onLoginStatusChange function not found.");
    }

    // --- イベントリスナー設定 ---
    editProfileButton?.addEventListener('click', () => toggleEditMode(true));
    cancelEditButton?.addEventListener('click', () => toggleEditMode(false));
    saveProfileButton?.addEventListener('click', saveProfile);
    badgeDexDetailClose?.addEventListener('click', hideBadgeDetail);
    editDisplayBadgesButton?.addEventListener('click', () => {
        if (window.MyApp?.currentUserData) {
            openEditDisplayBadgesModal(window.MyApp.currentUserData);
        } else {
            alert("ログインが必要です。");
        }
    });
    closeEditBadgesModalButton?.addEventListener('click', closeEditDisplayBadgesModal);
    cancelEditDisplayBadgesButton?.addEventListener('click', closeEditDisplayBadgesModal);
    saveDisplayBadgesButton?.addEventListener('click', saveDisplayBadges);

}); // End of DOMContentLoaded
