// frontend/script.js

// --- グローバル変数 ---
// サイト全体で共有される状態を管理するオブジェクト
window.MyApp = {
    isUserLoggedIn: undefined, // undefined: 未確定, true: ログイン中, false: 未ログイン
    currentUserData: null,     // ログイン中のユーザー情報 (トークンも含む)
    _onUserDataReadyCallbacks: [], // ユーザーデータ準備完了コールバック (内部利用)
    _onLoginStatusChangeCallbacks: [] // ログイン状態変化コールバック (内部利用)
};
console.log("[script.js] Initial global state (MyApp):", JSON.stringify(window.MyApp)); // ★ 初期状態ログ

// --- Googleサインイン初期化 ---
/**
 * Google Identity Servicesライブラリを初期化し、サインインボタンを描画する関数
 */
function initializeGoogleSignIn() {
    console.log("[script.js] initializeGoogleSignIn: Starting initialization."); // ★ 開始ログ
    if (typeof google === 'undefined') {
        console.error("[script.js] initializeGoogleSignIn: Google Identity Services library not loaded."); // ★ エラーログ
        const signInDiv = document.getElementById("g_id_signin");
        if (signInDiv) signInDiv.innerHTML = '<p class="error-text">Googleログインを利用できません。</p>';
        handleUserDataFetched(null);
        return;
    }
    try {
        google.accounts.id.initialize({
            client_id: "326810930641-r6f3qlievpi09n9krlld94762sjr28pd.apps.googleusercontent.com", // ★★★ あなたの実際のクライアントID ★★★
            // callback: handleCredentialResponse, // 'redirect' モードでは不要になることが多い
            login_uri: "https://www.mariokartbestrivals.com/api/auth/google", // ★★★ Xserver上のバックエンドコールバックURI ★★★
            ux_mode: "redirect", // ★ 'redirect' モードに変更
            auto_select: true, // 必要に応じて false に変更も検討
            cancel_on_tap_outside: false,
            // it_select_by: 'btn', // ボタンクリックでのみOne Tap UIを表示する場合
        });
        const signInButtonContainer = document.getElementById("g_id_signin");
        if (!signInButtonContainer) {
            console.error("[script.js] initializeGoogleSignIn: Sign-in button container 'g_id_signin' not found."); // ★ 要素取得失敗ログ
            handleUserDataFetched(null); // ボタンがない場合は初期化失敗とみなす
            return;
        }
        google.accounts.id.renderButton(
            signInButtonContainer,
            { theme: "outline", size: "large", type: "standard", text: "signin_with" }
        );
        // ★★★ Googleサインインボタンのコンテナにクリックイベントを設定 ★★★
        if (signInButtonContainer) {
            signInButtonContainer.addEventListener('click', () => {
                // このクリックはGoogleのボタンが押される直前に発生するはず
                sessionStorage.setItem('loginRedirectUrl', window.location.href);
                console.log("[script.js] Google Sign-In container clicked, redirect URL saved:", window.location.href);
            }, true); // キャプチャフェーズで登録して、Googleのボタンより先に実行されるようにする
        }
        console.log("[script.js] initializeGoogleSignIn: Google Sign-In initialized and button rendered."); // ★ 完了ログ
    } catch (error) {
        console.error("[script.js] initializeGoogleSignIn: Error during Google Sign-In initialization:", error); // ★ エラーログ
        const signInDiv = document.getElementById("g_id_signin");
        if (signInDiv) {
            signInDiv.innerHTML = '<p class="error-text">Googleログインの初期化に失敗しました。</p>';
        }
        handleUserDataFetched(null);
    }
}

// --- 認証コールバック ---
/**
 * Googleサインイン成功時に呼び出されるコールバック関数
 * @param {object} response - Googleからの認証レスポンス (IDトークンを含む)
 */
async function handleCredentialResponse(response) {
    console.log("[script.js] handleCredentialResponse: Received credential response.", response.credential ? "Token received" : "No token"); // ★ 開始ログ

        const backendUrl = 'https://www.mariokartbestrivals.com'; // ★★★ Xserver上のバックエンドURL ★★★
    const apiUrl = `${backendUrl}/api/auth/google`;
    console.log(`[script.js] handleCredentialResponse: Sending token to backend: ${apiUrl}`); // ★ API呼び出しログ
    try {
        const apiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
        });

        console.log(`[script.js] handleCredentialResponse: Backend response status: ${apiResponse.status}`); // ★ ステータスログ
        if (!apiResponse.ok) {
            let errorData = { message: `Server error (Status: ${apiResponse.status})` };
            try {
                errorData = await apiResponse.json();
                console.warn("[script.js] handleCredentialResponse: Backend error response body:", errorData); // ★ エラー内容ログ
            } catch (e) {
                console.warn("[script.js] handleCredentialResponse: Failed to parse error response JSON.");
            }
            console.error("[script.js] handleCredentialResponse: Backend validation failed.", errorData); // ★ エラーログ
            throw new Error(`URL: ${apiUrl} - ${errorData.message || `Server error (Status: ${apiResponse.status})`}`);
        }

        const result = await apiResponse.json();
        console.log("[script.js] handleCredentialResponse: Backend response data:", result); // ★ 応答データログ

        if (result && result.userData && result.token) {
            console.log("[script.js] handleCredentialResponse: Login successful. Saving user data with token."); // ★ 成功ログ
            const userDataWithToken = { ...result.userData, token: result.token };
            saveUserData(userDataWithToken);
            console.log("[script.js] handleCredentialResponse: Calling handleUserDataFetched with user data."); // ★ 次の処理ログ
            handleUserDataFetched(userDataWithToken);
            document.dispatchEvent(new CustomEvent('loginSuccess', { detail: { user: result.userData } }));
        } else {
            console.error("[script.js] handleCredentialResponse: Unexpected backend response format.", result); // ★ 形式エラーログ
            throw new Error('Invalid response from server.');
        }

    } catch (error) {
        console.error("[script.js] handleCredentialResponse: Error during token validation or fetching user data:", error); // ★ 包括的エラーログ
        alert(`Login failed: ${error.message}`);
        clearUserData();
        console.log("[script.js] handleCredentialResponse: Calling handleUserDataFetched with null due to error."); // ★ 次の処理ログ
        handleUserDataFetched(null);
        document.dispatchEvent(new CustomEvent('loginFailed'));
    }
    console.log("[script.js] handleCredentialResponse: Finished."); // ★ 終了ログ
}

// --- ログアウト処理 ---
/**
 * ログアウト処理を実行する関数
 */
function handleLogout() {
    console.log("[script.js] handleLogout: Starting logout process."); // ★ 開始ログ
    if (typeof google !== 'undefined' && window.MyApp.isUserLoggedIn) {
        try { // ★ try-catch追加
            google.accounts.id.disableAutoSelect();
            console.log("[script.js] handleLogout: Google auto-select disabled."); // ★ 処理ログ
        } catch (e) {
            console.warn("[script.js] handleLogout: Error disabling Google auto-select:", e); // ★ エラーログ
        }
    }
    clearUserData();
    console.log("[script.js] handleLogout: Calling handleUserDataFetched with null."); // ★ 次の処理ログ
    handleUserDataFetched(null);
    console.log("[script.js] handleLogout: User logged out."); // ★ 完了ログ
    document.dispatchEvent(new CustomEvent('logoutSuccess'));
}

// --- ユーザーデータ処理 (localStorage) ---
/**
 * ユーザーデータ（トークンを含む）をlocalStorageに保存する関数
 * @param {object} userDataWithToken - 保存するユーザーデータとトークンを含むオブジェクト
 */
function saveUserData(userDataWithToken) {
    console.log("[script.js] saveUserData: Attempting to save data:", userDataWithToken ? "Data present" : "Data is null/undefined"); // ★ 開始ログ
    try {
        if (!userDataWithToken || !userDataWithToken.token) {
            console.warn("[script.js] saveUserData: Attempting to save user data without a token.");
            // throw new Error("Cannot save user data without a token."); // 必要ならエラーにする
        }
        localStorage.setItem('userData', JSON.stringify(userDataWithToken));
        console.log("[script.js] saveUserData: User data (with token) saved to localStorage."); // ★ 完了ログ
    } catch (e) {
        console.error("[script.js] saveUserData: Error saving user data to localStorage:", e); // ★ エラーログ
    }
}

/**
 * localStorageからユーザーデータ（トークンを含む）を読み込む関数
 * @returns {object|null} 読み込んだユーザーデータオブジェクト、またはデータがない場合はnull
 */
function loadUserData() {
    console.log("[script.js] loadUserData: Attempting to load data from localStorage."); // ★ 開始ログ
    try {
        const storedData = localStorage.getItem('userData');
        const parsedData = storedData ? JSON.parse(storedData) : null;
        console.log("[script.js] loadUserData: Data loaded from localStorage:", parsedData ? "Data found" : "No data found"); // ★ 結果ログ
        return parsedData;
    } catch (e) {
        console.error("[script.js] loadUserData: Error loading or parsing user data from localStorage:", e); // ★ エラーログ
        // ★ エラー発生時は念のためlocalStorageをクリアするのも手
        // localStorage.removeItem('userData');
        return null;
    }
}

/**
 * localStorageからユーザーデータを削除する関数
 */
function clearUserData() {
    console.log("[script.js] clearUserData: Attempting to remove data from localStorage."); // ★ 開始ログ
    try {
        localStorage.removeItem('userData');
        console.log("[script.js] clearUserData: User data removed from localStorage."); // ★ 完了ログ
    } catch (e) {
        console.error("[script.js] clearUserData: Error removing user data from localStorage:", e); // ★ エラーログ
    }
}

// --- UI更新 ---
/**
 * ヘッダーのUI要素を更新する関数
 * @param {object|null} userData - 表示するユーザーデータ (トークンは含まないプロフィール部分でも可)
 */
function updateHeaderUI(userData) {
    console.log("[script.js] updateHeaderUI: Updating header UI. User data:", userData ? userData.name : "Logged out"); // ★ 開始ログ
    const userInfoDiv = document.getElementById('user-info');
    const signInButtonDiv = document.getElementById('g_id_signin');
    const userNameSpan = document.getElementById('header-user-name');
    const userPointsSpan = document.getElementById('header-user-points');
    const logoutButton = document.getElementById('logout-button');

    // ★ 要素取得チェックを追加
    if (!userInfoDiv || !signInButtonDiv || !userNameSpan || !logoutButton) {
        console.error("[script.js] updateHeaderUI: One or more header elements not found. Check IDs: user-info, g_id_signin, header-user-name, logout-button");
        return;
    }

    if (userData) {
        userNameSpan.textContent = userData.name || 'ゲスト';
        if (userPointsSpan) userPointsSpan.textContent = `${userData.points ?? 0} P`; // ポイント要素はオプション
        else console.warn("[script.js] updateHeaderUI: header-user-points element not found.");
        userInfoDiv.style.display = 'flex';
        signInButtonDiv.style.display = 'none';
        if (!logoutButton.onclick) { // イベントリスナーの重複設定を防ぐ
            logoutButton.onclick = handleLogout;
            console.log("[script.js] updateHeaderUI: Logout button event listener attached."); // ★ リスナー設定ログ
        }
        console.log("[script.js] updateHeaderUI: Displaying logged-in state."); // ★ 状態ログ
    } else {
        userInfoDiv.style.display = 'none';
        signInButtonDiv.style.display = 'block';
        // ★ ログアウト時にリスナーを削除する（必須ではないが、よりクリーン）
        // if (logoutButton) logoutButton.onclick = null;
        console.log("[script.js] updateHeaderUI: Displaying logged-out state."); // ★ 状態ログ
    }
    console.log("[script.js] updateHeaderUI: Finished."); // ★ 終了ログ
}

// --- 初期ログイン状態チェック ---
/**
 * ページ読み込み時にlocalStorageを確認し、必要ならトークンを検証してログイン状態を判定する関数
 */
async function checkInitialLoginState() {
    console.log("[script.js] checkInitialLoginState: Checking initial login state."); // ★ 開始ログ
    const storedUserDataWithToken = loadUserData();

    // ★★★ URLクエリパラメータからトークンとユーザーデータを取得して保存 ★★★
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const userDataStringFromUrl = urlParams.get('userData');

    if (tokenFromUrl && userDataStringFromUrl) {
        console.log("[script.js] checkInitialLoginState: Token and user data found in URL parameters.");
        try {
            const userDataFromUrl = JSON.parse(decodeURIComponent(userDataStringFromUrl));
            const userDataWithTokenFromUrl = { ...userDataFromUrl, token: decodeURIComponent(tokenFromUrl) };
            saveUserData(userDataWithTokenFromUrl); // localStorageに保存
            console.log("[script.js] checkInitialLoginState: User data from URL saved to localStorage."); // ★ ログ変更

            // ★★★ ログイン後のリダイレクト処理 ★★★
            const redirectUrl = sessionStorage.getItem('loginRedirectUrl');
            sessionStorage.removeItem('loginRedirectUrl'); // 使用後は削除
            // 現在のURLからクエリパラメータを除いたものと比較
            const currentPageWithoutQuery = window.location.href.split('?')[0];
            if (redirectUrl && redirectUrl.split('?')[0] !== currentPageWithoutQuery) {
                console.log("[script.js] checkInitialLoginState: Redirecting to stored URL:", redirectUrl);
                window.location.href = redirectUrl; // 保存されたURLにリダイレクト
                return; // リダイレクトするので以降の処理は不要
            }
            // リダイレクトしない場合は、URLからパラメータを削除してUI更新
            window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
            handleUserDataFetched(userDataWithTokenFromUrl); // UI更新 (リダイレクトしない場合)
            return; // localStorageからの再読み込みや検証はスキップ (リダイレクトしない場合)
        } catch (error) {
            console.error("[script.js] checkInitialLoginState: Error parsing user data from URL:", error);
            // エラーが発生した場合は通常のフローに進む（localStorageからの読み込みを試みる）
        }
    }
    // ★★★ URLクエリパラメータ処理ここまで ★★★

    if (storedUserDataWithToken && storedUserDataWithToken.token) {
        console.log("[script.js] checkInitialLoginState: Stored user data (with token) found:", storedUserDataWithToken.name); // ★ データ発見ログ

        // ★★★ バックエンドでトークンを検証 (推奨) ★★★
            const backendUrl = 'https://www.mariokartbestrivals.com'; // ★★★ Xserver上のバックエンドURL ★★★
        const verifyUrl = `${backendUrl}/api/auth/verify`; // ★★★ 検証用APIエンドポイント (要実装) ★★★
        try {
            console.log(`[script.js] checkInitialLoginState: Verifying token with backend: ${verifyUrl}`); // ★ 検証開始ログ
            const verifyResponse = await fetch(verifyUrl, {
                method: 'POST', // または GET
                headers: { 'Authorization': `Bearer ${storedUserDataWithToken.token}` }
            });
            console.log(`[script.js] checkInitialLoginState: Token verification response status: ${verifyResponse.status}`); // ★ 検証結果ステータス

            if (verifyResponse.ok) {
                const verifiedUserData = await verifyResponse.json();
                console.log("[script.js] checkInitialLoginState: Token is valid. Verified data:", verifiedUserData.name); // ★ 検証成功ログ
                // ★ 検証APIが返すデータ構造に合わせて調整
                const dataToUse = { ...(verifiedUserData.userData || storedUserDataWithToken), token: verifiedUserData.token || storedUserDataWithToken.token };
                console.log("[script.js] checkInitialLoginState: Saving potentially updated user data."); // ★ 保存前ログ
                saveUserData(dataToUse);
                console.log("[script.js] checkInitialLoginState: Calling handleUserDataFetched with verified data."); // ★ 次の処理ログ
                handleUserDataFetched(dataToUse);
            } else {
                console.warn("[script.js] checkInitialLoginState: Stored token is invalid. Status:", verifyResponse.status); // ★ 検証失敗ログ
                clearUserData();
                console.log("[script.js] checkInitialLoginState: Calling handleUserDataFetched with null due to invalid token."); // ★ 次の処理ログ
                handleUserDataFetched(null);
            }
        } catch (error) {
            console.error("[script.js] checkInitialLoginState: Error during token verification:", error); // ★ 検証エラーログ
            // ★ オフライン時などの考慮
            console.warn("[script.js] checkInitialLoginState: Proceeding as logged out due to verification error."); // ★ フォールバックログ
            handleUserDataFetched(null); // 安全策
        }
        // ★★★ トークン検証ここまで ★★★

    } else {
        console.log("[script.js] checkInitialLoginState: No valid stored user data found."); // ★ データなしログ
        if (storedUserDataWithToken && !storedUserDataWithToken.token) {
            console.warn("[script.js] checkInitialLoginState: Stored user data found but missing token. Clearing data."); // ★ トークンなし警告
            clearUserData();
        }
        console.log("[script.js] checkInitialLoginState: Calling handleUserDataFetched with null."); // ★ 次の処理ログ
        handleUserDataFetched(null);
    }
    console.log("[script.js] checkInitialLoginState: Finished."); // ★ 終了ログ
}

// --- ユーザーデータ準備完了処理 ---
/**
 * ユーザーデータの状態が確定した時に呼び出される関数
 * @param {object|null} userDataWithToken - 確定したユーザーデータ（トークン含む）、またはnull
 */
function handleUserDataFetched(userDataWithToken) {
    console.log("[script.js] handleUserDataFetched: Called with user data:", userDataWithToken ? userDataWithToken.name : "null"); // ★ 開始ログ
    const isLoggedInNow = !!(userDataWithToken && userDataWithToken.token);
    const loginStateChanged = window.MyApp.isUserLoggedIn === undefined || window.MyApp.isUserLoggedIn !== isLoggedInNow;
    console.log(`[script.js] handleUserDataFetched: isLoggedIn: ${isLoggedInNow}, State changed: ${loginStateChanged}`); // ★ 状態ログ

    // グローバル状態を更新
    window.MyApp.isUserLoggedIn = isLoggedInNow;
    window.MyApp.currentUserData = userDataWithToken;
    console.log("[script.js] handleUserDataFetched: Global state updated.", { isUserLoggedIn: window.MyApp.isUserLoggedIn, currentUserData: window.MyApp.currentUserData ? window.MyApp.currentUserData.name : null }); // ★ 更新後ログ

    // ヘッダーUI更新
    updateHeaderUI(userDataWithToken);

    if (loginStateChanged) {
        console.log("[script.js] handleUserDataFetched: Login state changed or first determination. Executing callbacks."); // ★ コールバック実行前ログ

        // ユーザーデータ準備完了コールバックを実行
        console.log(`[script.js] handleUserDataFetched: Executing ${window.MyApp._onUserDataReadyCallbacks.length} ready callbacks.`); // ★ コールバック数ログ
        executeCallbacks(window.MyApp._onUserDataReadyCallbacks, userDataWithToken);
        window.MyApp._onUserDataReadyCallbacks.length = 0; // 一度実行したらクリア

        // ログイン状態変化コールバックを実行
        console.log(`[script.js] handleUserDataFetched: Executing ${window.MyApp._onLoginStatusChangeCallbacks.length} status change callbacks.`); // ★ コールバック数ログ
        executeCallbacks(window.MyApp._onLoginStatusChangeCallbacks, userDataWithToken);
    } else {
        console.log("[script.js] handleUserDataFetched: Login state did not change."); // ★ 状態変化なしログ
    }
    console.log("[script.js] handleUserDataFetched: Finished."); // ★ 終了ログ
}

// --- コールバック登録関数 (グローバルアクセス用) ---

/**
 * ユーザーデータの準備が完了した時に一度だけ実行されるコールバックを登録する
 * @param {function(object|null)} callback - ユーザーデータ（トークン含むオブジェクト、またはnull）を引数に取る関数
 */
window.registerUserDataReadyCallback = (callback) => {
    console.log("[script.js] window.registerUserDataReadyCallback: Registering ready callback."); // ★ 登録ログ
    if (typeof callback !== 'function') {
        console.warn("[script.js] window.registerUserDataReadyCallback: Invalid callback provided."); // ★ 無効コールバック警告
        return;
    }
    if (typeof window.MyApp.isUserLoggedIn !== 'undefined') {
        console.log("[script.js] window.registerUserDataReadyCallback: User data state already determined. Executing ready callback immediately."); // ★ 即時実行ログ
        try {
            callback(window.MyApp.currentUserData);
        } catch (error) {
            console.error("[script.js] window.registerUserDataReadyCallback: Error executing ready callback immediately:", error); // ★ 即時実行エラーログ
        }
    } else {
        console.log("[script.js] window.registerUserDataReadyCallback: User data state not determined yet. Adding ready callback to queue."); // ★ キュー追加ログ
        window.MyApp._onUserDataReadyCallbacks.push(callback);
    }
};

/**
 * ログイン状態が変化するたびに実行されるコールバックを登録する
 * @param {function(object|null)} callback - ユーザーデータ（トークン含むオブジェクト、またはnull）を引数に取る関数
 */
window.onLoginStatusChange = (callback) => {
    console.log("[script.js] window.onLoginStatusChange: Registering status change callback."); // ★ 登録ログ
    if (typeof callback === 'function') {
        window.MyApp._onLoginStatusChangeCallbacks.push(callback);
        if (typeof window.MyApp.isUserLoggedIn !== 'undefined') {
            console.log("[script.js] window.onLoginStatusChange: Login state already determined. Executing status change callback immediately for registration."); // ★ 即時実行ログ
            try {
                callback(window.MyApp.currentUserData);
            } catch(e) {
                console.error("[script.js] window.onLoginStatusChange: Error executing status change callback immediately:", e); // ★ 即時実行エラーログ
            }
        }
    } else {
        console.warn("[script.js] window.onLoginStatusChange: Invalid callback provided."); // ★ 無効コールバック警告
    }
};

// --- コールバック実行関数 (内部利用) ---
/**
 * 登録されたコールバック関数の配列を実行する
 * @param {Array<function>} callbacks - 実行するコールバック関数の配列
 * @param {any} arg - コールバック関数に渡す引数
 */
function executeCallbacks(callbacks, arg) {
    console.log(`[script.js] executeCallbacks: Executing ${callbacks.length} callbacks. Argument:`, arg ? arg.name : "null"); // ★ 開始ログ
    // 配列のコピーを反復処理
    [...callbacks].forEach((callback, index) => {
        try {
            console.log(`[script.js] executeCallbacks: Executing callback ${index + 1}`); // ★ 個別実行ログ
            callback(arg);
        } catch (error) {
            console.error(`[script.js] executeCallbacks: Error executing callback ${index + 1}:`, error); // ★ 個別エラーログ
        }
    });
    console.log("[script.js] executeCallbacks: Finished executing callbacks."); // ★ 終了ログ
}


// --- ナビゲーションメニュー ---
/**
 * ハンバーガーメニューの動作を設定する関数
 */
function setupNavigationMenu() {
    console.log("[script.js] setupNavigationMenu: Setting up navigation menu."); // ★ 開始ログ
    const toggleButton = document.getElementById('nav-menu-toggle');
    const menu = document.getElementById('main-navigation-menu');

    if (toggleButton && menu) {
        toggleButton.addEventListener('click', () => {
            const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
            console.log(`[script.js] Navigation menu toggled. New state: ${!isExpanded ? 'open' : 'closed'}`); // ★ トグルログ
            toggleButton.setAttribute('aria-expanded', !isExpanded);
            menu.setAttribute('aria-hidden', isExpanded);
            menu.classList.toggle('is-open');
        });
        document.addEventListener('click', (event) => {
            if (!menu.contains(event.target) && !toggleButton.contains(event.target) && menu.classList.contains('is-open')) {
                console.log("[script.js] Click outside navigation menu detected. Closing menu."); // ★ 外側クリックログ
                toggleButton.setAttribute('aria-expanded', 'false');
                menu.setAttribute('aria-hidden', 'true');
                menu.classList.remove('is-open');
            }
        });
        console.log("[script.js] setupNavigationMenu: Navigation menu setup complete."); // ★ 完了ログ
    } else {
        console.warn("[script.js] setupNavigationMenu: Navigation menu toggle button or menu element not found."); // ★ 要素なし警告
    }
}

// --- グローバル初期化 ---
window.onload = async () => {
    console.log("[script.js] window.onload: Event triggered."); // ★ 開始ログ
    initializeGoogleSignIn();
    // ★ await を使って checkInitialLoginState の完了を待つ
    try {
        await checkInitialLoginState();
        console.log("[script.js] window.onload: checkInitialLoginState completed."); // ★ 完了ログ
    } catch (error) {
        console.error("[script.js] window.onload: Error during checkInitialLoginState:", error); // ★ エラーログ
        // エラーが発生しても、他の初期化は試みる
    }
    setupNavigationMenu();
    console.log("[script.js] window.onload: All initialization tasks finished."); // ★ 完了ログ
};

// --- グローバル関数登録 (他のスクリプトから利用) ---

// ユーザーデータ保存用
window.saveCurrentUserData = () => {
    console.log("[script.js] window.saveCurrentUserData: Called."); // ★ 呼び出しログ
    if (window.MyApp.currentUserData) {
        saveUserData(window.MyApp.currentUserData);
        console.log("[script.js] window.saveCurrentUserData: User data saved globally."); // ★ 保存完了ログ
    } else {
        console.warn("[script.js] window.saveCurrentUserData: Called but window.MyApp.currentUserData is null."); // ★ データなし警告
    }
};

// 認証トークン取得用
window.getAuthToken = () => {
    const token = window.MyApp.currentUserData?.token || null;
    // console.log("[script.js] getAuthToken: Called, returning:", token ? "token found" : "token not found"); // ★ 頻繁なのでコメントアウト推奨
    return token;
};

// バッジ画像パス取得用
// frontend/script.js

// ... (他のコード) ...

// frontend/script.js

// ... (他のコード) ...

// バッジ画像パス取得用 (SVGファイルパスを返すように修正)
window.getBadgeImagePath = (badgeId) => {
    const badgeMap = {
        // --- ガチャ対象: 基本バッジ ---
        'badge-gold': 'images/badge-gold.svg',
        'badge-safe-driver': 'images/badge-safe-driver.svg',
        'badge-speedster': 'images/badge-speedster.svg',

        // --- レート達成記念バッジ ---
        'badge-rate-1600': 'images/badge-rate-1600.svg',
        'badge-rate-1700': 'images/badge-rate-1700.svg',
        'badge-rate-1800': 'images/badge-rate-1800.svg',
        'badge-rate-1900': 'images/badge-rate-1900.svg',
        'badge-rate-2000': 'images/badge-rate-2000.svg',

        // --- 対戦数記念バッジ ---
        'badge-matches-100': 'images/badge-100matches.svg',
        'badge-matches-300': 'images/badge-300matches.svg',
        'badge-matches-1000': 'images/badge-1000matches.svg',
        'badge-matches-5000': 'images/badge-5000matches.svg',
        'badge-matches-10000': 'images/badge-10000matches.svg',

        // --- 期間限定バッジ ---
        'badge-event-2024spring': 'images/badge-event-2024spring.svg',
        'badge-event-halloween': 'images/badge-event-halloween.svg',
        'badge-event-newyear': 'images/badge-event-newyear.svg',

        // --- ガチャ対象: 動物バッジ ---
        'badge-animal-cat': 'images/animal-neko.jpg',
        'badge-animal-dog': 'images/animal-inu.jpg',
        'badge-animal-rabbit': 'images/animal-usagi.jpg',
        'badge-animal-wolf': 'images/animal-ookami.jpg',
        'badge-animal-eagle': 'images/animal-taka.jpg',
        'badge-animal-bear': 'images/animal-kuma.jpg',
        'badge-animal-fox': 'images/animal-kitsune.jpg',

        // --- ガチャ対象: 宝石バッジ ---
        'badge-gem-ruby': 'images/badge-gem-ruby.svg',
        'badge-gem-sapphire': 'images/badge-gem-sapphire.svg',
        'badge-gem-emerald': 'images/badge-gem-emerald.svg',
        'badge-gem-diamond': 'images/badge-gem-diamond.svg',
        'badge-gem-amethyst': 'images/badge-gem-amethyst.svg',
        'badge-gem-topaz': 'images/badge-gem-topaz.svg',
        'badge-gem-pearl': 'images/badge-gem-pearl.svg',
    };
    // デフォルト画像
    const defaultPath = 'images/default.svg'; // default.svg を images/ に用意する場合 (これは既に修正済みでしたね)

    const path = badgeMap[badgeId] || defaultPath;
    // console.log(`[script.js] getBadgeImagePath: ID=${badgeId}, Path=${path}`);
    return path;
};


// ... (他のコード) ...



// バッジ表示用
window.displayBadges = (badgeSlots, badgeIds) => {
    // console.log("[script.js] displayBadges: Called with slots:", badgeSlots.length, "and IDs:", badgeIds); // ★ 頻繁なのでコメントアウト推奨
    if (!badgeSlots || badgeSlots.length === 0) return;
    if (!Array.isArray(badgeIds)) badgeIds = [];
    badgeSlots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.remove('filled');
        slot.style.opacity = '0.5';
        const badgeId = badgeIds[index];
        if (badgeId) {
            const imgPath = window.getBadgeImagePath(badgeId);
            const img = document.createElement('img');
            img.src = imgPath;
            img.alt = badgeId; // ★ 可能ならバッジ名を取得
            slot.appendChild(img);
            slot.classList.add('filled');
            slot.style.opacity = '1';
        }
    });
};

// ポイント更新用
window.updateUserPoints = (newPoints) => {
    console.log(`[script.js] window.updateUserPoints: Updating points to ${newPoints}.`); // ★ 開始ログ
    if (window.MyApp.currentUserData) {
        window.MyApp.currentUserData.points = newPoints;
        saveUserData(window.MyApp.currentUserData);
        updateHeaderUI(window.MyApp.currentUserData);
        document.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { newPoints } }));
        console.log("[script.js] window.updateUserPoints: Points updated successfully."); // ★ 完了ログ
    } else {
        console.warn("[script.js] window.updateUserPoints: currentUserData is null, cannot update points."); // ★ データなし警告
    }
};
