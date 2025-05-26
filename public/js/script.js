// frontend/script.js

// --- グローバル変数 ---
window.MyApp = {
    isUserLoggedIn: undefined,
    lastChartsLoadedForUserId: null,
    currentUserData: null,
    _onUserDataReadyCallbacks: [],
    _onLoginStatusChangeCallbacks: []
};

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.MyApp.BACKEND_URL = 'http://localhost:5000';
    window.MyApp.WEBSOCKET_URL = 'ws://localhost:5000';
} else {
    window.MyApp.BACKEND_URL = 'https://www.mariokartbestrivals.com';
    window.MyApp.WEBSOCKET_URL = 'wss://www.mariokartbestrivals.com';
}

function initializeGoogleSignIn() {
    if (typeof google === 'undefined') {
        console.error("[script.js] initializeGoogleSignIn: Google Identity Services library not loaded.");
        const signInDiv = document.getElementById("g_id_signin");
        if (signInDiv) signInDiv.innerHTML = '<p class="error-text">Googleログインを利用できません。</p>';
        handleUserDataFetched(null);
        return;
    }
    try {
        google.accounts.id.initialize({
            client_id: "326810930641-r6f3qlievpi09n9krlld94762sjr28pd.apps.googleusercontent.com",
            login_uri: `${window.MyApp.BACKEND_URL}/api/auth/google`,
            ux_mode: "redirect",
            auto_select: true,
            cancel_on_tap_outside: false,
        });
        const signInButtonContainer = document.getElementById("g_id_signin");
        if (!signInButtonContainer) {
            console.error("[script.js] initializeGoogleSignIn: Sign-in button container 'g_id_signin' not found.");
            handleUserDataFetched(null);
            return;
        }
        google.accounts.id.renderButton(
            signInButtonContainer,
            { theme: "outline", size: "large", type: "standard", text: "signin_with" }
        );
        if (signInButtonContainer) {
            signInButtonContainer.addEventListener('click', () => {
                sessionStorage.setItem('loginRedirectUrl', window.location.href);
            }, true);
        }
    } catch (error) {
        console.error("[script.js] initializeGoogleSignIn: Error during Google Sign-In initialization:", error);
        const signInDiv = document.getElementById("g_id_signin");
        if (signInDiv) {
            signInDiv.innerHTML = '<p class="error-text">Googleログインの初期化に失敗しました。</p>';
        }
        handleUserDataFetched(null);
    }
}

async function handleCredentialResponse(response) {
    const apiUrl = `${window.MyApp.BACKEND_URL}/api/auth/google`;
    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
        });

        if (!apiResponse.ok) {
            let errorData = { message: `Server error (Status: ${apiResponse.status})` };
            try { errorData = await apiResponse.json(); } catch (e) { /* ignore */ }
            throw new Error(`URL: ${apiUrl} - ${errorData.message || `Server error (Status: ${apiResponse.status})`}`);
        }

        const result = await apiResponse.json();

        if (result && result.userData && result.token) {
            const userDataWithToken = { ...result.userData, token: result.token };
            saveUserData(userDataWithToken);
            handleUserDataFetched(userDataWithToken);
            document.dispatchEvent(new CustomEvent('loginSuccess', { detail: { user: result.userData } }));
        } else {
            throw new Error('Invalid response from server.');
        }
    } catch (error) {
        console.error("[script.js] handleCredentialResponse: Error during token validation or fetching user data:", error);
        alert(`Login failed: ${error.message}`);
        clearUserData();
        handleUserDataFetched(null);
        document.dispatchEvent(new CustomEvent('loginFailed'));
    }
}

function handleLogout() {
    if (typeof google !== 'undefined' && window.MyApp.isUserLoggedIn) {
        try { 
            google.accounts.id.disableAutoSelect();
        } catch (e) {
            console.warn("[script.js] handleLogout: Error disabling Google auto-select:", e);
        }
    }
    clearUserData();
    handleUserDataFetched(null);
    document.dispatchEvent(new CustomEvent('logoutSuccess'));
}

function saveUserData(userDataWithToken) {
    try {
        if (!userDataWithToken || !userDataWithToken.token) {
            console.warn("[script.js] saveUserData: Attempting to save user data without a token.");
        }
        localStorage.setItem('userData', JSON.stringify(userDataWithToken));
    } catch (e) {
        console.error("[script.js] saveUserData: Error saving user data to localStorage:", e);
    }
}

function loadUserData() {
    try {
        const storedData = localStorage.getItem('userData');
        return storedData ? JSON.parse(storedData) : null;
    } catch (e) {
        console.error("[script.js] loadUserData: Error loading or parsing user data from localStorage:", e);
        return null;
    }
}

function clearUserData() {
    try {
        localStorage.removeItem('userData');
    } catch (e) {
        console.error("[script.js] clearUserData: Error removing user data from localStorage:", e);
    }
}

function updateHeaderUI(userData) {
    const userInfoDiv = document.getElementById('user-info');
    const signInButtonDiv = document.getElementById('g_id_signin');
    const userNameSpan = document.getElementById('header-user-name');
    const userPointsSpan = document.getElementById('header-user-points');
    const logoutButton = document.getElementById('logout-button');

    if (!userInfoDiv || !signInButtonDiv || !userNameSpan || !logoutButton) {
        console.error("[script.js] updateHeaderUI: One or more header elements not found.");
        return;
    }

    if (userData) {
        userNameSpan.textContent = userData.name || 'ゲスト';
        if (userPointsSpan) userPointsSpan.textContent = `${userData.points ?? 0} P`;
        userInfoDiv.style.display = 'flex';
        signInButtonDiv.style.display = 'none';
        if (!logoutButton.onclick) {
            logoutButton.onclick = handleLogout;
        }
    } else {
        userInfoDiv.style.display = 'none';
        signInButtonDiv.style.display = 'block';
    }
}

async function checkInitialLoginState() {
    const storedUserDataWithToken = loadUserData();
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const userDataStringFromUrl = urlParams.get('userData');

    if (tokenFromUrl && userDataStringFromUrl) {
        try {
            const userDataFromUrl = JSON.parse(decodeURIComponent(userDataStringFromUrl));
            const userDataWithTokenFromUrl = { ...userDataFromUrl, token: decodeURIComponent(tokenFromUrl) };
            saveUserData(userDataWithTokenFromUrl);
            const redirectUrl = sessionStorage.getItem('loginRedirectUrl');
            sessionStorage.removeItem('loginRedirectUrl');
            const currentPageWithoutQuery = window.location.href.split('?')[0];
            if (redirectUrl && redirectUrl.split('?')[0] !== currentPageWithoutQuery) {
                window.location.href = redirectUrl;
                return; 
            }
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            handleUserDataFetched(userDataWithTokenFromUrl);
            return;
        } catch (error) {
            console.error("[script.js] checkInitialLoginState: Error parsing user data from URL:", error);
        }
    }

    if (storedUserDataWithToken && storedUserDataWithToken.token) {
        const verifyUrl = `${window.MyApp.BACKEND_URL}/api/auth/verify`;
        try {
            const verifyResponse = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${storedUserDataWithToken.token}` }
            });
            if (verifyResponse.ok) {
                const verifiedUserData = await verifyResponse.json();
                const dataToUse = { ...(verifiedUserData.userData || storedUserDataWithToken), token: verifiedUserData.token || storedUserDataWithToken.token };
                saveUserData(dataToUse);
                handleUserDataFetched(dataToUse);
            } else {
                clearUserData();
                handleUserDataFetched(null);
            }
        } catch (error) {
            console.error("[script.js] checkInitialLoginState: Error during token verification:", error);
            handleUserDataFetched(null);
        }
    } else {
        if (storedUserDataWithToken && !storedUserDataWithToken.token) {
            clearUserData();
        }
        handleUserDataFetched(null);
    }
}

function handleUserDataFetched(userDataWithToken) {
    const isLoggedInNow = !!(userDataWithToken && userDataWithToken.token);
    const loginStateChanged = window.MyApp.isUserLoggedIn === undefined || window.MyApp.isUserLoggedIn !== isLoggedInNow;

    window.MyApp.isUserLoggedIn = isLoggedInNow;
    window.MyApp.currentUserData = userDataWithToken;
    updateHeaderUI(userDataWithToken);

    if (loginStateChanged) {
        executeCallbacks(window.MyApp._onUserDataReadyCallbacks, userDataWithToken);
        window.MyApp._onUserDataReadyCallbacks.length = 0; 
        executeCallbacks(window.MyApp._onLoginStatusChangeCallbacks, userDataWithToken);
    }
}

window.registerUserDataReadyCallback = (callback) => {
    if (typeof callback !== 'function') return;
    if (typeof window.MyApp.isUserLoggedIn !== 'undefined') {
        try { callback(window.MyApp.currentUserData); } catch (error) { console.error("[script.js] Error executing ready callback immediately:", error); }
    } else {
        window.MyApp._onUserDataReadyCallbacks.push(callback);
    }
};

window.onLoginStatusChange = (callback) => {
    if (typeof callback === 'function') {
        window.MyApp._onLoginStatusChangeCallbacks.push(callback);
        if (typeof window.MyApp.isUserLoggedIn !== 'undefined') {
            try { callback(window.MyApp.currentUserData); } catch(e) { console.error("[script.js] Error executing status change callback immediately:", e); }
        }
    }
};

function executeCallbacks(callbacks, arg) {
    [...callbacks].forEach((callback, index) => {
        try { callback(arg); } catch (error) { console.error(`[script.js] Error executing callback ${index + 1}:`, error); }
    });
}

function setupNavigationMenu() {
    const toggleButton = document.getElementById('nav-menu-toggle');
    const menu = document.getElementById('main-navigation-menu');

    if (toggleButton && menu) {
        toggleButton.addEventListener('click', () => {
            const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
            toggleButton.setAttribute('aria-expanded', !isExpanded);
            menu.setAttribute('aria-hidden', isExpanded);
            menu.classList.toggle('is-open');
        });
        document.addEventListener('click', (event) => {
            if (!menu.contains(event.target) && !toggleButton.contains(event.target) && menu.classList.contains('is-open')) {
                toggleButton.setAttribute('aria-expanded', 'false');
                menu.setAttribute('aria-hidden', 'true');
                menu.classList.remove('is-open');
            }
        });
    }
}

window.onload = async () => {
    initializeGoogleSignIn();
    try {
        await checkInitialLoginState();
    } catch (error) {
        console.error("[script.js] window.onload: Error during checkInitialLoginState:", error);
    }
    setupNavigationMenu();
};

window.saveCurrentUserData = () => {
    if (window.MyApp.currentUserData) {
        saveUserData(window.MyApp.currentUserData);
    }
};

window.getAuthToken = () => {
    return window.MyApp.currentUserData?.token || null;
};

// ★★★ バッジ画像パス取得用関数 (修正済み) ★★★
window.getBadgeImagePath = (badgeId) => {
    // createBadge.js の img プロパティに格納されているファイル名を使用します。
    const badgeFileMap = {
        // --- ガチャ対象: 基本バッジ ---
        'badge-gold': 'badge-gold.svg',
        'badge-safe-driver': 'badge-safe-driver.svg',
        'badge-speedster': 'badge-speedster.svg',

        // --- レート達成記念バッジ ---
        'badge-rate-1600': 'badge-rate-1600.svg',
        'badge-rate-1700': 'badge-rate-1700.svg',
        'badge-rate-1800': 'badge-rate-1800.svg',
        'badge-rate-1900': 'badge-rate-1900.svg',
        'badge-rate-2000': 'badge-rate-2000.svg',

        // --- 対戦数記念バッジ ---
        'badge-matches-100': 'badge-100matches.svg',
        'badge-matches-300': 'badge-300matches.svg',
        'badge-matches-1000': 'badge-1000matches.svg',
        'badge-matches-5000': 'badge-5000matches.svg',
        'badge-matches-10000': 'badge-10000matches.svg',

        // --- 期間限定バッジ ---
        'badge-event-2024spring': 'badge-event-2024spring.svg',
        'badge-event-halloween': 'badge-event-halloween.svg',
        'badge-event-newyear': 'badge-event-newyear.svg',

        // --- ガチャ対象: 動物バッジ (createBadge.js の定義に合わせる) ---
        'badge-animal-cat': 'badge-animal-cat.jpg',    // 修正 (例: animal-neko.jpg -> badge-animal-cat.svg)
        'badge-animal-dog': 'badge-animal-dog.jpg',    // 修正
        'badge-animal-rabbit': 'badge-animal-rabbit.jpg',// 修正
        'badge-animal-wolf': 'badge-animal-wolf.jpg',  // 修正
        'badge-animal-eagle': 'badge-animal-eagle.jpg', // 修正
        'badge-animal-bear': 'badge-animal-bear.jpg',  // 修正
        'badge-animal-fox': 'badge-animal-fox.jpg',    // 修正

        // --- ガチャ対象: 宝石バッジ ---
        'badge-gem-ruby': 'badge-gem-ruby.svg',
        'badge-gem-sapphire': 'badge-gem-sapphire.svg',
        'badge-gem-emerald': 'badge-gem-emerald.svg',
        'badge-gem-diamond': 'badge-gem-diamond.svg',
        'badge-gem-amethyst': 'badge-gem-amethyst.svg',
        'badge-gem-topaz': 'badge-gem-topaz.svg',
        'badge-gem-pearl': 'badge-gem-pearl.svg',
    };

    // 画像ファイルが public/images/ 直下にあるため、パスプレフィックスを修正
    // ブラウザがリクエストするURLを考慮し、サーバーのルートからの絶対パス形式にする
    const commonPathPrefix = '/public/images/';
    const defaultFileName = 'default_badge.svg'; // 統一されたデフォルトファイル名

    const fileName = badgeFileMap[badgeId];

    if (fileName) {
        return commonPathPrefix + fileName;
    } else {
        // console.warn(`[script.js] getBadgeImagePath: No specific file mapping for badgeId: ${badgeId}. Using default.`);
        return commonPathPrefix + defaultFileName;
    }
};
// ★★★ 修正ここまで ★★★

window.displayBadges = (badgeSlots, badgeIds) => {
    if (!badgeSlots || badgeSlots.length === 0) return;
    if (!Array.isArray(badgeIds)) badgeIds = [];
    
    // 正しいデフォルトパスをここで定義（getBadgeImagePathと共通化できるとより良い）
    const defaultImagePath = '/public/images/default_badge.svg';

    badgeSlots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.remove('filled');
        slot.style.opacity = '0.5';
        const badgeId = badgeIds[index];
        if (badgeId) {
            const imgPath = window.getBadgeImagePath(badgeId); // 修正された関数を呼び出す
            const img = document.createElement('img');
            img.src = imgPath;
            img.alt = badgeId; 
            img.onerror = () => { 
                // getBadgeImagePathがデフォルトを返すので、このonerrorは最終手段
                if (img.src !== defaultImagePath) { // 無限ループ防止
                   img.src = defaultImagePath;
                }
            };
            slot.appendChild(img);
            slot.classList.add('filled');
            slot.style.opacity = '1';
        }
    });
};

window.updateUserPoints = (newPoints) => {
    if (window.MyApp.currentUserData) {
        window.MyApp.currentUserData.points = newPoints;
        saveUserData(window.MyApp.currentUserData);
        updateHeaderUI(window.MyApp.currentUserData);
        document.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { newPoints } }));
    }
};