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

// ★★★ ユーザーデータマッピング関数 (共通化) ★★★
function mapUserDataToStandardFormat(rawUserData) {
    if (!rawUserData) {
        return null;
    }

    const mapped = {
        ...rawUserData, // 元のプロパティをすべてコピー
        googleId: rawUserData.googleId || rawUserData.id || rawUserData.sub,
        name: rawUserData.name || rawUserData.displayName || rawUserData.given_name,
        email: rawUserData.email,
        picture: rawUserData.picture,
    };
    return mapped;
}


function initializeGoogleSignIn() {
    if (typeof google === 'undefined') {
        // console.error("[script.js] initializeGoogleSignIn: Google Identity Services library not loaded.");
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
            // console.error("[script.js] initializeGoogleSignIn: Sign-in button container 'g_id_signin' not found.");
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
        // console.error("[script.js] initializeGoogleSignIn: Error during Google Sign-In initialization:", error);
        const signInDiv = document.getElementById("g_id_signin");
        if (signInDiv) {
            signInDiv.innerHTML = '<p class="error-text">Googleログインの初期化に失敗しました。</p>';
        }
        handleUserDataFetched(null);
    }
}

async function handleCredentialResponse(response) {
    // console.log("[script.js handleCredentialResponse] Received credential response (likely not from Google directly with redirect UX):", response);
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
            const mappedUserData = mapUserDataToStandardFormat(result.userData);
            const userDataWithToken = { ...mappedUserData, token: result.token };
            
            // console.log("[script.js handleCredentialResponse] Mapped userDataWithToken from server:", JSON.stringify(userDataWithToken, null, 2));

            saveUserData(userDataWithToken);
            handleUserDataFetched(userDataWithToken);
            document.dispatchEvent(new CustomEvent('loginSuccess', { detail: { user: mappedUserData } }));
        } else {
            throw new Error('Invalid response from server after credential validation.');
        }
    } catch (error) {
        // console.error("[script.js] handleCredentialResponse: Error during token validation or fetching user data:", error);
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
            // console.warn("[script.js] handleLogout: Error disabling Google auto-select or revoking:", e);
        }
    }
    clearUserData();
    handleUserDataFetched(null);
    document.dispatchEvent(new CustomEvent('logoutSuccess'));
}

function saveUserData(userDataWithToken) {
    try {
        if (!userDataWithToken || !userDataWithToken.token) {
            // console.warn("[script.js] saveUserData: Attempting to save user data without a token. UserData:", JSON.stringify(userDataWithToken));
        }
        localStorage.setItem('userData', JSON.stringify(userDataWithToken));
    } catch (e) {
        // console.error("[script.js] saveUserData: Error saving user data to localStorage:", e);
    }
}

function loadUserData() {
    try {
        const storedData = localStorage.getItem('userData');
        return storedData ? JSON.parse(storedData) : null;
    } catch (e) {
        // console.error("[script.js] loadUserData: Error loading or parsing user data from localStorage:", e);
        return null;
    }
}

function clearUserData() {
    try {
        localStorage.removeItem('userData');
    } catch (e) {
        // console.error("[script.js] clearUserData: Error removing user data from localStorage:", e);
    }
}

function updateHeaderUI(userData) {
    const userInfoDiv = document.getElementById('user-info');
    const signInButtonDiv = document.getElementById('g_id_signin');
    const userNameSpan = document.getElementById('header-user-name');
    const userPointsSpan = document.getElementById('header-user-points');
    const logoutButton = document.getElementById('logout-button');

    if (!userInfoDiv || !signInButtonDiv || !userNameSpan || !logoutButton) {
        // console.error("[script.js] updateHeaderUI: One or more header elements not found. This may not be an error on pages without these elements.");
        return;
    }

    if (userData && userData.token) {
        userNameSpan.textContent = userData.name || 'ゲスト'; 
        if (userPointsSpan && typeof userData.points !== 'undefined') {
             userPointsSpan.textContent = `${userData.points} P`;
        } else if (userPointsSpan) {
             userPointsSpan.textContent = `--- P`;
        }
        userInfoDiv.style.display = 'flex';
        signInButtonDiv.style.display = 'none';
        if (!logoutButton.onclick) {
            logoutButton.onclick = handleLogout;
        }
    } else {
        userNameSpan.textContent = '';
        if (userPointsSpan) userPointsSpan.textContent = '';
        userInfoDiv.style.display = 'none';
        signInButtonDiv.style.display = 'block';
    }
}

async function checkInitialLoginState() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const userDataStringFromUrl = urlParams.get('userData');

    if (tokenFromUrl && userDataStringFromUrl) {
        // console.log("[script.js checkInitialLoginState] Found token and user data in URL params.");
        try {
            const rawUserDataFromUrl = JSON.parse(decodeURIComponent(userDataStringFromUrl));
            const mappedUserDataFromUrl = mapUserDataToStandardFormat(rawUserDataFromUrl);
            const userDataWithTokenFromUrl = { ...mappedUserDataFromUrl, token: decodeURIComponent(tokenFromUrl) };
            
            // console.log("[script.js checkInitialLoginState] Mapped userDataWithToken from URL:", JSON.stringify(userDataWithTokenFromUrl, null, 2));

            saveUserData(userDataWithTokenFromUrl);
            
            const redirectUrl = sessionStorage.getItem('loginRedirectUrl');
            sessionStorage.removeItem('loginRedirectUrl');
            const cleanUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, cleanUrl);

            handleUserDataFetched(userDataWithTokenFromUrl);

            if (redirectUrl && new URL(redirectUrl).pathname !== new URL(window.location.href).pathname) {
                 // console.log(`[script.js checkInitialLoginState] Redirecting to original URL: ${redirectUrl}`);
                 window.location.href = redirectUrl;
                 return;
            }
            return;
        } catch (error) {
            // console.error("[script.js] checkInitialLoginState: Error parsing or processing user data from URL:", error);
            clearUserData();
        }
    }

    const storedUserDataWithToken = loadUserData();
    if (storedUserDataWithToken && storedUserDataWithToken.token) {
        // console.log("[script.js checkInitialLoginState] Found user data in localStorage. Verifying token...");
        const verifyUrl = `${window.MyApp.BACKEND_URL}/api/auth/verify`;
        try {
            const verifyResponse = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${storedUserDataWithToken.token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (verifyResponse.ok) {
                const verifiedResult = await verifyResponse.json();
                // console.log("[script.js checkInitialLoginState] Token verification successful. Server response:", JSON.stringify(verifiedResult, null, 2));
                
                const rawUserDataToMap = verifiedResult.userData || storedUserDataWithToken;
                const mappedUserData = mapUserDataToStandardFormat(rawUserDataToMap);
                
                const currentToken = verifiedResult.token || storedUserDataWithToken.token;
                const dataToUse = { ...mappedUserData, token: currentToken };
                
                saveUserData(dataToUse);
                handleUserDataFetched(dataToUse);
            } else {
                // console.warn("[script.js] checkInitialLoginState: Token verification failed or token expired. Status:", verifyResponse.status);
                clearUserData();
                handleUserDataFetched(null);
            }
        } catch (error) {
            // console.error("[script.js] checkInitialLoginState: Error during token verification:", error);
            clearUserData();
            handleUserDataFetched(null);
        }
    } else {
        // console.log("[script.js checkInitialLoginState] No user data in localStorage or no token found.");
        if (storedUserDataWithToken && !storedUserDataWithToken.token) {
            clearUserData();
        }
        handleUserDataFetched(null);
    }
}

function handleUserDataFetched(userDataWithToken) {
    // console.log("[script.js handleUserDataFetched] Called with userDataWithToken (raw):", userDataWithToken);
    // try {
    //     console.log("[script.js handleUserDataFetched] Called with userDataWithToken (JSON):", JSON.stringify(userDataWithToken, null, 2));
    // } catch(e) {
    //     // console.warn("[script.js handleUserDataFetched] Could not stringify userDataWithToken for logging.", e);
    // }

    const isLoggedInNow = !!(userDataWithToken && userDataWithToken.token && userDataWithToken.googleId && userDataWithToken.name);
    const loginStateChanged = window.MyApp.isUserLoggedIn === undefined || window.MyApp.isUserLoggedIn !== isLoggedInNow;

    window.MyApp.isUserLoggedIn = isLoggedInNow;
    window.MyApp.currentUserData = userDataWithToken; 
    
    // console.log("[script.js handleUserDataFetched] MyApp.isUserLoggedIn set to:", window.MyApp.isUserLoggedIn);
    // console.log("[script.js handleUserDataFetched] MyApp.currentUserData set to (JSON):", JSON.stringify(window.MyApp.currentUserData, null, 2));

    updateHeaderUI(window.MyApp.currentUserData);

    if (loginStateChanged || (isLoggedInNow && window.MyApp._onUserDataReadyCallbacks.length > 0 && window.MyApp.isUserLoggedIn !== undefined)) {
        // console.log("[script.js handleUserDataFetched] Executing onUserDataReadyCallbacks.");
        executeCallbacks(window.MyApp._onUserDataReadyCallbacks, window.MyApp.currentUserData);
    }
    if (loginStateChanged) {
        // console.log("[script.js handleUserDataFetched] Executing onLoginStatusChangeCallbacks.");
        executeCallbacks(window.MyApp._onLoginStatusChangeCallbacks, window.MyApp.currentUserData);
    }
}

window.registerUserDataReadyCallback = (callback) => {
    if (typeof callback !== 'function') return;
    if (typeof window.MyApp.isUserLoggedIn !== 'undefined') {
        // console.log("[script.js registerUserDataReadyCallback] Executing callback immediately as user data state is known.");
        try { callback(window.MyApp.currentUserData); } catch (error) { /* console.error("[script.js] Error executing ready callback immediately:", error); */ }
    } else {
        // console.log("[script.js registerUserDataReadyCallback] Pushing callback as user data state is not yet known.");
        window.MyApp._onUserDataReadyCallbacks.push(callback);
    }
};

window.onLoginStatusChange = (callback) => {
    if (typeof callback === 'function') {
        window.MyApp._onLoginStatusChangeCallbacks.push(callback);
        if (typeof window.MyApp.isUserLoggedIn !== 'undefined') {
            //  console.log("[script.js onLoginStatusChange] Executing callback immediately with current login status.");
            try { callback(window.MyApp.isUserLoggedIn); }
            catch(e) { /* console.error("[script.js] Error executing status change callback immediately:", e); */ }
        }
    }
};

function executeCallbacks(callbacks, arg) {
    const callbacksToExecute = [...callbacks];
    callbacksToExecute.forEach((callback, index) => {
        try { 
            callback(arg); 
        } catch (error) { 
            // console.error(`[script.js] Error executing callback ${index + 1}:`, error); 
        }
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
    // console.log("[script.js window.onload] Initializing...");
    initializeGoogleSignIn();
    try {
        await checkInitialLoginState();
        // console.log("[script.js window.onload] checkInitialLoginState finished. Current MyApp.currentUserData:", JSON.stringify(window.MyApp.currentUserData, null, 2));
    } catch (error) {
        // console.error("[script.js] window.onload: Error during checkInitialLoginState:", error);
    }
    setupNavigationMenu();
    // console.log("[script.js window.onload] Initialization complete.");
};

window.saveCurrentUserData = () => {
    if (window.MyApp.currentUserData) {
        saveUserData(window.MyApp.currentUserData);
    }
};

window.getAuthToken = () => {
    return window.MyApp.currentUserData?.token || null;
};

window.getBadgeImagePath = (badgeId) => {
    const badgeFileMap = {
        'badge-gold': 'badge-gold.svg',
        'badge-safe-driver': 'badge-safe-driver.svg',
        'badge-speedster': 'badge-speedster.svg',
        'badge-rate-1600': 'badge-rate-1600.svg',
        'badge-rate-1700': 'badge-rate-1700.svg',
        'badge-rate-1800': 'badge-rate-1800.svg',
        'badge-rate-1900': 'badge-rate-1900.svg',
        'badge-rate-2000': 'badge-rate-2000.svg',
        'badge-matches-100': 'badge-100matches.svg',
        'badge-matches-300': 'badge-300matches.svg',
        'badge-matches-1000': 'badge-1000matches.svg',
        'badge-matches-5000': 'badge-5000matches.svg',
        'badge-matches-10000': 'badge-10000matches.svg',
        'badge-event-2024spring': 'badge-event-2024spring.svg',
        'badge-event-halloween': 'badge-event-halloween.svg',
        'badge-event-newyear': 'badge-event-newyear.svg',
        'badge-animal-cat': 'badge-animal-cat.jpg',
        'badge-animal-dog': 'badge-animal-dog.jpg',
        'badge-animal-rabbit': 'badge-animal-rabbit.jpg',
        'badge-animal-wolf': 'badge-animal-wolf.jpg',
        'badge-animal-eagle': 'badge-animal-eagle.jpg',
        'badge-animal-bear': 'badge-animal-bear.jpg',
        'badge-animal-fox': 'badge-animal-fox.jpg',
        'badge-gem-ruby': 'badge-gem-ruby.svg',
        'badge-gem-sapphire': 'badge-gem-sapphire.svg',
        'badge-gem-emerald': 'badge-gem-emerald.svg',
        'badge-gem-diamond': 'badge-gem-diamond.svg',
        'badge-gem-amethyst': 'badge-gem-amethyst.svg',
        'badge-gem-topaz': 'badge-gem-topaz.svg',
        'badge-gem-pearl': 'badge-gem-pearl.svg',
    };

    let commonPathPrefix;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        commonPathPrefix = '/public/images/';
    } else {
        commonPathPrefix = '/images/';
    }
    const defaultFileName = 'default_badge.svg';
    const fileName = badgeFileMap[badgeId];

    if (fileName) {
        return commonPathPrefix + fileName;
    } else {
        return commonPathPrefix + defaultFileName;
    }
};

window.displayBadges = (badgeSlots, badgeIds) => {
    if (!badgeSlots || badgeSlots.length === 0) return;
    if (!Array.isArray(badgeIds)) badgeIds = [];

    const defaultImagePath = window.getBadgeImagePath('__non_existent_badge_id_for_default__');

    badgeSlots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.remove('filled');
        slot.style.opacity = '0.5';
        const badgeId = badgeIds[index];
        if (badgeId) {
            const imgPath = window.getBadgeImagePath(badgeId);
            const img = document.createElement('img');
            img.src = imgPath;
            img.alt = badgeId; 
            img.onerror = () => {
                if (img.src !== defaultImagePath) {
                   img.src = defaultImagePath;
                } else {
                    img.onerror = null; 
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