// frontend/mypage.js

let chartsLoadedForCurrentUser = false;
let isLoadingCharts = false;
let isFetchingUserData = false;

// DOM要素の取得
let profilePic, profileName, profileRate, profilePoints,
    favCourseDisplay, favCourseInput, userCommentDisplay, userCommentInput, selfIntroDisplay, selfIntroInput,
    editProfileButton, saveProfileButton, cancelEditButton,
    displayModeElements, editModeElements,
    rateHistoryCtx, recentWinRateCtx, overallWinRateCtx,
    rateHistoryPlaceholder, winRatePlaceholder, overallWinRatePlaceholder,
    displayBadgesContainer, editDisplayBadgesButton,
    badgeDexSection, badgeDexGrid, badgeDexLoading, badgeDexCount, badgeDexTotal,
    badgeDexDetail, badgeDexDetailClose, badgeDexDetailImg, badgeDexDetailName,
    badgeDexDetailDesc, badgeDexDetailRarity,
    badgeDexDetailCondition, badgeDexDetailRate, badgeDexDetailPrice,
    badgeDexDetailOwnedStatus,
    editBadgesModal, closeEditBadgesModalButton, displaySlotsContainer, ownedBadgesGrid,
    saveDisplayBadgesButton, cancelEditDisplayBadgesButton;

let rateHistoryChart = null;
let recentWinRateChart = null;
let overallWinRateChart = null;

let allBadgesData = [];
let currentDisplayBadgeSelection = [];

// ★★★ 環境に応じたデフォルト画像パスを script.js から取得する想定 ★★★
// もし script.js で MyApp.DEFAULT_BADGE_PATH のようなグローバル変数を設定していればそれを使う。
// ここでは getBadgeImagePath に不正なIDを渡してデフォルトパスを取得する。
const getDefaultBadgePath = () => typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath('__INVALID_ID_FOR_DEFAULT__') : '/images/default_badge.svg';
const getDefaultAvatarPath = () => {
    // script.jsのgetBadgeImagePathと同様のロジックで環境判定するか、
    // script.jsで MyApp.DEFAULT_AVATAR_PATH のようなグローバル変数を設定してそれを使う。
    // ここでは、サーバーのルートからの絶対パスとして解決されることを期待。
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '/public/images/default_avatar.svg';
    } else {
        return '/images/default_avatar.svg';
    }
};
async function authenticatedFetch(url, options = {}, requiresAuth = true) {
    const headers = { ...options.headers };
    if (requiresAuth) {
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
            const error = new Error(message);
            error.status = response.status; error.data = errorData; throw error;
        }
        if (response.status === 204 || response.headers.get('content-length') === '0') return null;
        return response.json();
    } catch (error) {
        throw error;
    }
}

async function fetchUserData(userId) {
    if (isFetchingUserData) {
        return;
    }
    isFetchingUserData = true;
    try {
        const userData = await authenticatedFetch(`${window.MyApp.BACKEND_URL}/api/users/${userId}`, {}, false);
        displayUserProfile(userData);
        await loadAndRenderCharts(userId);
        // allBadgesData は initializePageData で取得済みなので、ここでは userData のみを渡す
        displayBadgeDex(userData, allBadgesData);
    } catch (error) {
        console.error(`[mypage.js] Error fetching user data for ${userId}:`, error);
        displayErrorState(`ユーザー情報の読み込みに失敗しました: ${error.message}`);
        updateEditButtonsVisibility(false);
        updateBadgeEditButtonVisibility(false);
    } finally {
        isFetchingUserData = false;
    }
}

function displayUserProfile(userData) {
    if (!profilePic || !profileName || !profileRate || !profilePoints) {
        console.error("[mypage.js] プロフィール表示に必要な主要要素が見つかりません。HTMLのIDを確認してください。");
        return;
    }

    const defaultAvatar = getDefaultAvatarPath();

    if (userData) {
        profilePic.src = userData.picture || defaultAvatar;
        profilePic.onerror = () => { profilePic.src = defaultAvatar; };
        profileName.textContent = userData.name || 'プレイヤー名';
        profileRate.textContent = userData.rate ?? '----';
        profilePoints.textContent = `${userData.points ?? '----'} P`;

        const profile = userData.profile || {};
        if (favCourseDisplay) favCourseDisplay.textContent = profile.favCourse || '未設定';
        if (userCommentDisplay) userCommentDisplay.textContent = profile.comment || '未設定';
        if (selfIntroDisplay) selfIntroDisplay.textContent = profile.selfIntroduction || '未設定';

        const badgesToDisplay = userData.displayBadges && userData.displayBadges.length > 0
                              ? userData.displayBadges
                              : (userData.badges ? [...new Set(userData.badges)].slice(0, 3) : []);
        // script.js の displayBadges を使用
        if (displayBadgesContainer && typeof window.displayBadges === 'function') {
            const badgeSlots = displayBadgesContainer.querySelectorAll('.badge-slot');
            window.displayBadges(badgeSlots, badgesToDisplay);
        }

        // ボタン表示は initializePageData または onLoginStatusChange で行うため、ここでは操作しない
        // updateEditButtonsVisibility(false);
        // updateBadgeEditButtonVisibility(false);
        toggleEditMode(false);

    } else {
        displayLoggedOutState();
    }
}

function displayLoggedOutState() {
    const defaultAvatar = getDefaultAvatarPath();
    if (profilePic) profilePic.src = defaultAvatar;
    if (profileName) profileName.textContent = 'ログインしてください';
    if (profileRate) profileRate.textContent = '----';
    if (profilePoints) profilePoints.textContent = '---- P';
    if (favCourseDisplay) favCourseDisplay.textContent = '未設定';
    if (userCommentDisplay) userCommentDisplay.textContent = '未設定';
    if (selfIntroDisplay) selfIntroDisplay.textContent = '未設定';

    if (displayBadgesContainer && typeof window.displayBadges === 'function') {
        const badgeSlots = displayBadgesContainer.querySelectorAll('.badge-slot');
        window.displayBadges(badgeSlots, []);
    }

    destroyCharts();
    showChartPlaceholder(rateHistoryPlaceholder, 'ログインしてください');
    showChartPlaceholder(winRatePlaceholder, 'ログインしてください');
    showChartPlaceholder(overallWinRatePlaceholder, 'ログインしてください');

    chartsLoadedForCurrentUser = false;
    isLoadingCharts = false;
    if (window.MyApp) window.MyApp.lastChartsLoadedForUserId = null;

    updateEditButtonsVisibility(false);
    updateBadgeEditButtonVisibility(false);
    if (badgeDexSection) badgeDexSection.style.display = 'block'; // 図鑑はエラーやログアウト時も表示枠は維持
    displayBadgeDex(null, allBadgesData); // ユーザーデータなしで図鑑表示を試みる

    displayModeElements?.forEach(el => el.style.display = '');
    editModeElements?.forEach(el => el.style.display = 'none');
}

function displayErrorState(errorMessage = 'データの読み込みに失敗しました。') {
    const defaultAvatar = getDefaultAvatarPath();
    if (profilePic) profilePic.src = defaultAvatar;
    if (profileName) profileName.textContent = 'データ読込失敗';
    // ... (他の要素も同様にデフォルト値を設定)
    if (displayBadgesContainer && typeof window.displayBadges === 'function') {
        const badgeSlots = displayBadgesContainer.querySelectorAll('.badge-slot');
        window.displayBadges(badgeSlots, []);
    }
    destroyCharts();
    // ... (プレースホルダー表示)
    updateEditButtonsVisibility(false);
    updateBadgeEditButtonVisibility(false);
    if (badgeDexSection) badgeDexSection.style.display = 'block';
    displayBadgeDex(null, allBadgesData);
}

// displayProfileBadges 関数は script.js の window.displayBadges に置き換えられたため削除

function updateEditButtonsVisibility(isViewingOwnPage) {
    if (editProfileButton) editProfileButton.style.display = isViewingOwnPage ? 'inline-block' : 'none';
    if (saveProfileButton) saveProfileButton.style.display = 'none';
    if (cancelEditButton) cancelEditButton.style.display = 'none';
}

function updateBadgeEditButtonVisibility(isViewingOwnPage) {
     if (editDisplayBadgesButton) {
         editDisplayBadgesButton.style.display = isViewingOwnPage ? 'inline-block' : 'none';
     }
}

function toggleEditMode(isEditing) {
    const isOwnPage = !!(window.MyApp?.currentUserData &&
                       (new URLSearchParams(window.location.search).get('userId') === window.MyApp.currentUserData.sub ||
                        !new URLSearchParams(window.location.search).get('userId')));
    displayModeElements?.forEach(el => el.style.display = isEditing ? 'none' : '');
    editModeElements?.forEach(el => el.style.display = isEditing ? '' : 'none');
    if (editProfileButton) editProfileButton.style.display = isEditing || !isOwnPage ? 'none' : 'inline-block';
    if (saveProfileButton) saveProfileButton.style.display = isEditing && isOwnPage ? 'inline-block' : 'none';
    if (cancelEditButton) cancelEditButton.style.display = isEditing && isOwnPage ? 'inline-block' : 'none';
    if (isEditing && isOwnPage) {
        if (favCourseInput && favCourseDisplay) favCourseInput.value = favCourseDisplay.textContent !== '未設定' ? favCourseDisplay.textContent : '';
        if (userCommentInput && userCommentDisplay) userCommentInput.value = userCommentDisplay.textContent !== '未設定' ? userCommentDisplay.textContent : '';
        if (selfIntroInput && selfIntroDisplay) selfIntroInput.value = selfIntroDisplay.textContent !== '未設定' ? selfIntroDisplay.textContent : '';
    }
}

async function saveProfile() {
    const updatedProfile = {
        favCourse: favCourseInput?.value?.trim() || '',
        comment: userCommentInput?.value?.trim() || '',
        selfIntroduction: selfIntroInput?.value?.trim() || '',
    };
    if (saveProfileButton) { saveProfileButton.disabled = true; saveProfileButton.textContent = '保存中...'; }
    try {
       const apiUrl = `${window.MyApp.BACKEND_URL}/api/users/profile`;
       const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
       if (!token) throw new Error('ログインが必要です。');
        const response = await fetch(apiUrl, {
             method: 'PUT',
             headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
             body: JSON.stringify(updatedProfile),
         });
        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
             throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        // const result = await response.json(); // result は使っていない
        if (favCourseDisplay) favCourseDisplay.textContent = updatedProfile.favCourse || '未設定';
        if (userCommentDisplay) userCommentDisplay.textContent = updatedProfile.comment || '未設定';
        if (selfIntroDisplay) selfIntroDisplay.textContent = updatedProfile.selfIntroduction || '未設定';
        if (window.MyApp?.currentUserData) {
            if (!window.MyApp.currentUserData.profile) window.MyApp.currentUserData.profile = {};
            Object.assign(window.MyApp.currentUserData.profile, updatedProfile);
            if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
        }
        toggleEditMode(false);
        alert('プロフィールを更新しました。');
    } catch (error) {
        console.error('[mypage.js] Error saving profile:', error);
        alert(`プロフィールの保存に失敗しました: ${error.message}`);
    } finally {
        if (saveProfileButton) { saveProfileButton.disabled = false; saveProfileButton.textContent = '保存';}
    }
}

async function initializePageData() {
    if (badgeDexLoading) badgeDexLoading.style.display = 'flex';
    allBadgesData = await fetchAllBadges();
    if (badgeDexLoading) badgeDexLoading.style.display = 'none';

    window.registerUserDataReadyCallback(async (loggedInUserData) => {
        const urlParams = new URLSearchParams(window.location.search);
        const userIdFromUrl = urlParams.get('userId');
        let targetUserId = userIdFromUrl || loggedInUserData?.sub;

        if (!targetUserId) {
            displayLoggedOutState(); return;
        }
        if (window.MyApp?.lastChartsLoadedForUserId !== targetUserId) chartsLoadedForCurrentUser = false;
        isLoadingCharts = false;
        try {
            await fetchUserData(targetUserId);
            const isViewingOwnPage = !!(loggedInUserData && (!userIdFromUrl || userIdFromUrl === loggedInUserData.sub));
            updateEditButtonsVisibility(isViewingOwnPage);
            updateBadgeEditButtonVisibility(isViewingOwnPage);
        } catch (error) {
             console.error("[mypage.js] Error during initial fetchUserData in ready callback:", error);
             updateEditButtonsVisibility(false);
             updateBadgeEditButtonVisibility(false);
        }
    });
}

async function loadAndRenderCharts(userId) {
    const urlParams = new URLSearchParams(window.location.search);
    const userIdFromUrl = urlParams.get('userId');
    const isOwnPage = !userIdFromUrl && window.MyApp?.currentUserData?.sub === userId;

    if (isLoadingCharts || (chartsLoadedForCurrentUser && window.MyApp?.lastChartsLoadedForUserId === userId)) return;
    if (!userId) { displayErrorState('ユーザー情報の取得に失敗しました。'); return; }

    isLoadingCharts = true;
    destroyCharts();
    showChartPlaceholder(rateHistoryPlaceholder, 'レート履歴を読み込み中...');
    showChartPlaceholder(winRatePlaceholder, '勝率データを読込中...');
    showChartPlaceholder(overallWinRatePlaceholder, '勝率データを読込中...');

    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/users/${userId}/stats`;
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        const headers = {};
        if (isOwnPage && token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(apiUrl, { headers });
        if (!response.ok) {
            if (response.status === 403) throw new Error(`統計情報の表示権限がありません。(ステータス: ${response.status})`);
            const errorText = await response.text();
            throw new Error(`統計情報取得エラー (ステータス: ${response.status}, メッセージ: ${errorText || 'N/A'})`);
        }
        const statsData = await response.json();
        renderRateHistoryChart(statsData.rateHistory || []);
        renderWinRateCharts(statsData.winRate || {});
        if (window.MyApp) window.MyApp.lastChartsLoadedForUserId = userId;
        if (isOwnPage) chartsLoadedForCurrentUser = true;
    } catch (error) {
        console.error('[mypage.js] Error loading chart data:', error);
        showChartPlaceholder(rateHistoryPlaceholder, `レート履歴: ${error.message}`);
        showChartPlaceholder(winRatePlaceholder, `勝率(直近): ${error.message}`);
        showChartPlaceholder(overallWinRatePlaceholder, `勝率(全体): ${error.message}`);
        if (window.MyApp) window.MyApp.lastChartsLoadedForUserId = null;
        chartsLoadedForCurrentUser = false;
    } finally {
        isLoadingCharts = false;
    }
}

function renderRateHistoryChart(historyData) {
    const canvasEl = document.getElementById('rate-history-chart');
    if (!canvasEl) { showChartPlaceholder(rateHistoryPlaceholder, 'レート履歴チャートの準備ができません。'); return; }
    rateHistoryCtx = canvasEl.getContext('2d');
    hideChartPlaceholder(rateHistoryPlaceholder);
    if (!historyData || historyData.length === 0) { showChartPlaceholder(rateHistoryPlaceholder, 'レート履歴データがありません。'); return; }
    const labels = historyData.map(item => new Date(item.date).toLocaleDateString());
    const data = historyData.map(item => item.rate);
    rateHistoryChart = new Chart(rateHistoryCtx, {
        type: 'line', data: { labels, datasets: [{ label: 'レート', data, borderColor: 'rgb(75, 192, 192)', tension: 0.1, fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.7)' } }, x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.7)' } } }, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false }, datalabels: { display: false } } }
    });
}

function renderWinRateCharts(winRateData) {
    const winColor = 'rgba(218,165,32,0.8)', winBorderColor = 'rgba(218,165,32,1)';
    const lossColor = 'rgba(105,105,105,0.8)', lossBorderColor = 'rgba(105,105,105,1)';
    const commonOptions = { responsive: true, maintainAspectRatio: false, layout: { padding: 15 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: createTooltipLabel } }, datalabels: createDataLabelsConfig() } };

    const recentCanvas = document.getElementById('recent-winrate-chart');
    if (recentCanvas) {
        recentWinRateCtx = recentCanvas.getContext('2d');
        const recent = winRateData.recent;
        hideChartPlaceholder(winRatePlaceholder);
        if (recent && (recent.wins > 0 || recent.losses > 0)) {
            recentWinRateChart = new Chart(recentWinRateCtx, { type: 'doughnut', data: { labels: ['勝利', '敗北'], datasets: [{ data: [recent.wins, recent.losses], backgroundColor: [winColor, lossColor], borderColor: [winBorderColor, lossBorderColor], borderWidth: 1 }] }, options: commonOptions });
        } else { showChartPlaceholder(winRatePlaceholder, '直近の対戦データがありません。'); }
    } else { showChartPlaceholder(winRatePlaceholder, '勝率チャート(直近)の準備ができません。'); }

    const overallCanvas = document.getElementById('overall-winrate-chart');
    if (overallCanvas) {
        overallWinRateCtx = overallCanvas.getContext('2d');
        const overall = winRateData.overall;
        hideChartPlaceholder(overallWinRatePlaceholder);
        if (overall && (overall.wins > 0 || overall.losses > 0)) {
            overallWinRateChart = new Chart(overallWinRateCtx, { type: 'doughnut', data: { labels: ['勝利', '敗北'], datasets: [{ data: [overall.wins, overall.losses], backgroundColor: [winColor, lossColor], borderColor: [winBorderColor, lossBorderColor], borderWidth: 1 }] }, options: commonOptions });
        } else { showChartPlaceholder(overallWinRatePlaceholder, '全体の対戦データがありません。'); }
    } else { showChartPlaceholder(overallWinRatePlaceholder, '勝率チャート(全体)の準備ができません。'); }
}

function destroyCharts() {
    const destroyAndRecreateCanvas = (chartInstance, canvasId, placeholderId) => {
        if (chartInstance) {
            const canvas = chartInstance.canvas; const parent = canvas.parentElement;
            chartInstance.destroy();
            if (parent && canvas) parent.removeChild(canvas);
            if (parent) {
                const newCanvas = document.createElement('canvas'); newCanvas.id = canvasId;
                const placeholder = document.getElementById(placeholderId);
                if (placeholder) { parent.insertBefore(newCanvas, placeholder); return newCanvas.getContext('2d'); }
            }
        }
        const existingCanvas = document.getElementById(canvasId);
        if (existingCanvas) return existingCanvas.getContext('2d');
        const placeholderEl = document.getElementById(placeholderId);
        const parentEl = placeholderEl?.parentElement;
        if(parentEl) {
            const newCanvas = document.createElement('canvas'); newCanvas.id = canvasId;
            parentEl.insertBefore(newCanvas, placeholderEl); return newCanvas.getContext('2d');
        }
        return null;
    };
    rateHistoryCtx = destroyAndRecreateCanvas(rateHistoryChart, 'rate-history-chart', 'rateHistoryChartPlaceholder'); rateHistoryChart = null;
    recentWinRateCtx = destroyAndRecreateCanvas(recentWinRateChart, 'recent-winrate-chart', 'winRateChartPlaceholder'); recentWinRateChart = null;
    overallWinRateCtx = destroyAndRecreateCanvas(overallWinRateChart, 'overall-winrate-chart', 'overallWinRateChartPlaceholder'); overallWinRateChart = null;
}

function showChartPlaceholder(element, message) {
    if (element) {
        element.textContent = message; element.style.display = 'flex';
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
    let label = context.label || ''; if (label) label += ': ';
    if (context.parsed !== null) {
        const total = context.dataset.data.reduce((a, b) => a + b, 0);
        const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) + '%' : '0%';
        label += `${context.raw} (${percentage})`;
    } return label;
}

function createDataLabelsConfig() { return { display: true, formatter: (value) => value, color: '#fff', font: { weight: 'bold', size: 14 }, anchor: 'center', align: 'center' }; }

async function fetchAllBadges() {
    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/badges/all`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`Failed to fetch badges: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Error fetching all badges:", error); return [];
    }
}

function displayBadgeDex(userData, allBadges) {
    if (!badgeDexSection || !badgeDexGrid || !badgeDexLoading || !badgeDexCount || !badgeDexTotal) return;
    badgeDexSection.style.display = 'block';
    if (badgeDexLoading) badgeDexLoading.style.display = 'none';
    badgeDexGrid.innerHTML = '';
    const ownedBadgeIds = new Set(userData?.badges || []);
    let ownedCount = 0;
    const defaultImgPath = getDefaultBadgePath(); // ★ 修正

    if (allBadges.length === 0) {
        badgeDexGrid.innerHTML = '<p>バッジ情報がありません。</p>';
        badgeDexCount.textContent = 0; badgeDexTotal.textContent = 0; return;
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
        img.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badge.badgeId) : defaultImgPath;
        img.alt = badge.name;
        img.onerror = () => { img.src = defaultImgPath; }; // ★ 修正
        itemDiv.appendChild(img);
        itemDiv.addEventListener('click', () => showBadgeDetail(badge, isOwned));
        badgeDexGrid.appendChild(itemDiv);
    });
    badgeDexCount.textContent = ownedCount;
    badgeDexTotal.textContent = allBadges.length;
}

function showBadgeDetail(badgeData, isOwned) {
    if (!badgeDexDetail || !badgeDexDetailImg || !badgeDexDetailName || !badgeDexDetailDesc ||
        !badgeDexDetailCondition || !badgeDexDetailRate || !badgeDexDetailPrice || !badgeDexDetailOwnedStatus ||
        !badgeDexDetailRarity) return;

    const defaultImgPath = getDefaultBadgePath(); // ★ 修正

    // ★ script.js の getBadgeImagePath を使用
    badgeDexDetailImg.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badgeData.badgeId) : defaultImgPath;
    badgeDexDetailImg.onerror = () => { badgeDexDetailImg.src = defaultImgPath; }; // ★ 修正
    badgeDexDetailName.textContent = badgeData.name;
    badgeDexDetailDesc.textContent = badgeData.description || '説明なし';

    let conditions = [];
    if (badgeData.requiredRate > 0) conditions.push(`レート ${badgeData.requiredRate} 以上`);
    if (badgeData.requiredMatches > 0) conditions.push(`対戦数 ${badgeData.requiredMatches} 以上`);
    if (badgeData.price > 0) conditions.push(`ショップで購入 (${badgeData.price.toLocaleString()} P)`);
    if (badgeData.price === 0 && !badgeData.requiredRate && !badgeData.requiredMatches && !badgeData.isLimited) conditions.push('ガチャで入手');
    if (badgeData.isLimited) conditions.push('期間限定');
    badgeDexDetailCondition.textContent = conditions.length > 0 ? conditions.join(', ') : '---';

    badgeDexDetailRate.style.display = badgeData.requiredRate > 0 ? 'block' : 'none';
    badgeDexDetailRate.textContent = `必要レート: ${badgeData.requiredRate}`;
    badgeDexDetailPrice.style.display = badgeData.price > 0 ? 'block' : 'none';
    badgeDexDetailPrice.textContent = `ショップ価格: ${badgeData.price.toLocaleString()} P`;

    if (badgeDexDetailRarity && badgeData.rarity) {
        const rarityString = badgeData.rarity.toLowerCase();
        const displayRarityText = rarityString.toUpperCase();
        const applyRainbowEffect = rarityString === 'legendary' || rarityString === 'ssr';
        badgeDexDetailRarity.innerHTML = `レアリティ: <span class="rarity-value rarity-${rarityString} ${applyRainbowEffect ? 'rainbow' : ''}">${displayRarityText}</span>`;
        badgeDexDetailRarity.style.display = 'block';
    } else if (badgeDexDetailRarity) {
        badgeDexDetailRarity.style.display = 'none';
    }

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

function openEditDisplayBadgesModal(userData) {
    if (!editBadgesModal || !displaySlotsContainer || !ownedBadgesGrid || !userData) return;
    currentDisplayBadgeSelection = [...(userData.displayBadges || [])];
    renderDisplaySlots();
    renderOwnedBadgesGrid(userData.badges || []);
    editBadgesModal.style.display = 'flex';
}

function closeEditDisplayBadgesModal() {
    if (editBadgesModal) editBadgesModal.style.display = 'none';
}

function renderDisplaySlots() {
    if (!displaySlotsContainer) return;
    const slots = displaySlotsContainer.querySelectorAll('.display-slot');
    const defaultImgPath = getDefaultBadgePath(); // ★ 修正

    slots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.remove('filled');
        slot.onclick = null;
        const badgeId = currentDisplayBadgeSelection[index];
        if (badgeId && allBadgesData.length > 0) {
            const badgeData = allBadgesData.find(b => b.badgeId === badgeId);
            if (badgeData) {
                const img = document.createElement('img');
                img.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badgeId) : defaultImgPath;
                img.alt = badgeData.name;
                img.onerror = () => { img.src = defaultImgPath; }; // ★ 修正
                slot.appendChild(img);
                slot.classList.add('filled');
                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-badge-from-slot';
                removeBtn.innerHTML = '&times;';
                removeBtn.onclick = (e) => { e.stopPropagation(); removeBadgeFromSlot(index); };
                slot.appendChild(removeBtn);
            }
        }
    });
}

function renderOwnedBadgesGrid(ownedBadgeIdsParams) {
    if (!ownedBadgesGrid || allBadgesData.length === 0) return;
    ownedBadgesGrid.innerHTML = '';
    const uniqueOwnedIds = [...new Set(ownedBadgeIdsParams)];
    const defaultImgPath = getDefaultBadgePath(); // ★ 修正

    if (uniqueOwnedIds.length === 0) {
        ownedBadgesGrid.innerHTML = '<p>所持しているバッジがありません。</p>'; return;
    }
    uniqueOwnedIds.forEach(badgeId => {
        const badgeData = allBadgesData.find(b => b.badgeId === badgeId);
        if (badgeData) {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('badge-item');
            itemDiv.dataset.badgeId = badgeId;
            const img = document.createElement('img');
            img.src = typeof window.getBadgeImagePath === 'function' ? window.getBadgeImagePath(badgeId) : defaultImgPath;
            img.alt = badgeData.name;
            img.onerror = () => { img.src = defaultImgPath; }; // ★ 修正
            itemDiv.appendChild(img);
            if (currentDisplayBadgeSelection.includes(badgeId)) {
                itemDiv.classList.add('selected'); itemDiv.onclick = null;
            } else {
                itemDiv.classList.remove('selected'); itemDiv.onclick = () => addBadgeToSlot(badgeId);
            }
            ownedBadgesGrid.appendChild(itemDiv);
        }
    });
}

function addBadgeToSlot(badgeId) {
    if (currentDisplayBadgeSelection.length >= 3) { alert('表示できるバッジは3つまでです。'); return; }
    if (currentDisplayBadgeSelection.includes(badgeId)) return;
    currentDisplayBadgeSelection.push(badgeId);
    renderDisplaySlots();
    renderOwnedBadgesGrid(window.MyApp?.currentUserData?.badges || []);
}

function removeBadgeFromSlot(slotIndex) {
    if (slotIndex >= 0 && slotIndex < currentDisplayBadgeSelection.length) {
        currentDisplayBadgeSelection.splice(slotIndex, 1);
        renderDisplaySlots();
        renderOwnedBadgesGrid(window.MyApp?.currentUserData?.badges || []);
    }
}

async function saveDisplayBadges() {
    if (saveDisplayBadgesButton) { saveDisplayBadgesButton.disabled = true; saveDisplayBadgesButton.textContent = '保存中...'; }
    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/users/profile/display-badges`;
        const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
        if (!token) throw new Error("ログインが必要です。");
        const response = await fetch(apiUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ displayBadges: currentDisplayBadgeSelection }) });
        if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.message || `保存に失敗しました (ステータス: ${response.status})`); }
        const result = await response.json();
        if (window.MyApp?.currentUserData) {
            window.MyApp.currentUserData.displayBadges = result.displayBadges || currentDisplayBadgeSelection;
            if (typeof window.saveCurrentUserData === 'function') window.saveCurrentUserData();
        }
        // ★★★ script.js の displayBadges を使用 ★★★
        if (displayBadgesContainer && typeof window.displayBadges === 'function') {
            const badgeSlots = displayBadgesContainer.querySelectorAll('.badge-slot');
            window.displayBadges(badgeSlots, window.MyApp?.currentUserData?.displayBadges || []);
        }
        closeEditDisplayBadgesModal();
        alert('表示バッジを更新しました。');
    } catch (error) {
        console.error("Error saving display badges:", error); alert(`表示バッジの保存に失敗しました: ${error.message}`);
    } finally {
        if (saveDisplayBadgesButton) { saveDisplayBadgesButton.disabled = false; saveDisplayBadgesButton.textContent = '保存する'; }
    }
}

document.addEventListener('DOMContentLoaded', () => {
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
    rateHistoryCtx = null;
    recentWinRateCtx = null;
    overallWinRateCtx = null;
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
    badgeDexDetailRarity = document.getElementById('badge-dex-detail-rarity');
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

    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    } else {
        console.warn('[mypage.js] Chart or ChartDataLabels not found.');
    }
    displayLoggedOutState();
    initializePageData();

    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange(async (loggedInUserData) => {
            const urlParams = new URLSearchParams(window.location.search);
            const userIdFromUrl = urlParams.get('userId');
            if (allBadgesData.length === 0) {
                if (badgeDexLoading) badgeDexLoading.style.display = 'flex';
                allBadgesData = await fetchAllBadges();
                if (badgeDexLoading) badgeDexLoading.style.display = 'none';
            }
            let targetUserId = userIdFromUrl || loggedInUserData?.sub;
            let isOwnPageCurrent = !userIdFromUrl || (loggedInUserData && userIdFromUrl === loggedInUserData.sub);
            if (targetUserId) {
                if (window.MyApp?.lastChartsLoadedForUserId !== targetUserId) chartsLoadedForCurrentUser = false;
                isLoadingCharts = false;
                try {
                    await fetchUserData(targetUserId);
                    updateEditButtonsVisibility(isOwnPageCurrent);
                    updateBadgeEditButtonVisibility(isOwnPageCurrent);
                } catch (error) {
                    console.error("[mypage.js] Error in onLoginStatusChange > fetchUserData:", error);
                    updateEditButtonsVisibility(false);
                    updateBadgeEditButtonVisibility(false);
                }
            } else {
                 displayLoggedOutState();
            }
        });
    } else {
        console.error("[mypage.js] onLoginStatusChange function not found.");
    }

    editProfileButton?.addEventListener('click', () => toggleEditMode(true));
    cancelEditButton?.addEventListener('click', () => toggleEditMode(false));
    saveProfileButton?.addEventListener('click', saveProfile);
    badgeDexDetailClose?.addEventListener('click', hideBadgeDetail);
    editDisplayBadgesButton?.addEventListener('click', () => { if (window.MyApp?.currentUserData) openEditDisplayBadgesModal(window.MyApp.currentUserData); else alert("ログインが必要です。"); });
    closeEditBadgesModalButton?.addEventListener('click', closeEditDisplayBadgesModal);
    cancelEditDisplayBadgesButton?.addEventListener('click', closeEditDisplayBadgesModal);
    saveDisplayBadgesButton?.addEventListener('click', saveDisplayBadges);
});

// ★★★ mypage.js から window.getBadgeImagePath の再定義を削除 ★★★
// (script.js にあるグローバルな定義を使用する)