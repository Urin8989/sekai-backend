// frontend/index.js
console.log('[index.js] ファイルが読み込まれ、実行が開始されました。');
// 以降、元の index.js のコードが続く

document.addEventListener('DOMContentLoaded', () => {
    console.log("index.js loaded");

    // --- index.html 固有の要素を取得 ---
    const welcomeIntro = document.querySelector('.welcome-intro'); // ウェルカムメッセージ
    const indexUserProfileSection = document.getElementById('user-profile-section'); // プロフィールセクション
    const loggedInIconHeader = document.querySelector('.logged-in-icon-header'); // ★ ログイン後メッセージ要素
    // IDが他のページと重複する可能性があるため、親要素から取得する方が安全
    const indexProfilePic = indexUserProfileSection ? indexUserProfileSection.querySelector('#profile-pic') : null;
    const indexProfileName = indexUserProfileSection ? indexUserProfileSection.querySelector('#profile-name') : null;
    const indexProfileRate = indexUserProfileSection ? indexUserProfileSection.querySelector('#profile-rate') : null;
    const indexProfilePoints = indexUserProfileSection ? indexUserProfileSection.querySelector('#profile-points') : null;
    const indexProfileBadgesContainer = indexUserProfileSection ? indexUserProfileSection.querySelector('.profile-badges') : null; // バッジのコンテナを取得

    /**
     * index.html のプロフィールセクションの *内容* を表示/更新する関数
     * @param {object | null} userData - ユーザー情報オブジェクト (nullの場合は内容をクリア)
     */
    function updateIndexProfileUI(userData) {
        // プロフィールセクション自体の表示/非表示は updateUserSpecificContentVisibility で行う
        if (!indexUserProfileSection) return;

        if (userData) {
            // --- ログイン状態の内容表示 ---
            if (indexProfilePic) {
                indexProfilePic.src = userData.picture || 'images/placeholder-avatar.png';
                indexProfilePic.alt = `${userData.name || 'プレイヤー'}のプロフィール画像`;
            }
            if (indexProfileName) {
                indexProfileName.textContent = userData.name || 'プレイヤー名';
            }
            if (indexProfileRate) {
                indexProfileRate.textContent = userData.rate !== undefined ? userData.rate : '----';
            }
            if (indexProfilePoints) {
                indexProfilePoints.textContent = userData.points !== undefined ? `${userData.points.toLocaleString()} P` : '---- P';
            }
            // バッジ表示処理 (script.jsの共通関数を呼び出す)
            if (indexProfileBadgesContainer && typeof window.displayBadges === 'function') {
                const badgeSlots = indexProfileBadgesContainer.querySelectorAll('.badge-slot');
                window.displayBadges(badgeSlots, userData.displayBadges || userData.badges || []); // displayBadges優先、なければbadges
            } else if (indexProfileBadgesContainer) {
                console.warn("index.js: window.displayBadges function not found or badge container missing.");
            }
        } else {
            // --- ログアウト状態の内容クリア (非表示なら不要かも) ---
            if (indexProfilePic) {
                indexProfilePic.src = 'images/placeholder-avatar.png';
                indexProfilePic.alt = 'プロフィール画像';
            }
            if (indexProfileName) indexProfileName.textContent = '';
            if (indexProfileRate) indexProfileRate.textContent = '----';
            if (indexProfilePoints) indexProfilePoints.textContent = '---- P';
            if (indexProfileBadgesContainer && typeof window.displayBadges === 'function') {
                window.displayBadges(indexProfileBadgesContainer.querySelectorAll('.badge-slot'), []);
            }
        }
    }

    /**
     * ログイン状態に応じてウェルカムメッセージ、プロフィール、アイコンヘッダーの表示/非表示を切り替える関数
     */
    function updateUserSpecificContentVisibility() {
        const isLoggedIn = window.MyApp?.isUserLoggedIn === true;
        console.log("index.js: updateUserSpecificContentVisibility called. isLoggedIn:", isLoggedIn);

        if (welcomeIntro) {
            welcomeIntro.style.display = isLoggedIn ? 'none' : 'block';
        }
        if (indexUserProfileSection) {
          indexUserProfileSection.style.display = isLoggedIn ? 'block' : 'none'; // ログインしていれば表示、そうでなければ非表示
        }
        // ▼▼▼ loggedInIconHeader の表示切り替え ▼▼▼
        if (loggedInIconHeader) {
            loggedInIconHeader.style.display = isLoggedIn ? 'block' : 'none'; // ログイン時のみ表示
        } else {
            console.warn("index.js: loggedInIconHeader element not found."); // 要素が見つからない場合の警告
        }
        // ▲▲▲ ここまで ▲▲▲
    }

    // --- 初期表示処理 ---
    if (typeof window.registerUserDataReadyCallback === 'function') {
        window.registerUserDataReadyCallback((userData) => {
            console.log("index.js received user data ready callback with:", userData ? userData.name : null);
            updateIndexProfileUI(userData); // プロフィール内容を更新
            updateUserSpecificContentVisibility(); // ★ 表示/非表示を切り替え
        });
    } else {
        console.error("index.js: registerUserDataReadyCallback is not defined in script.js!");
        updateIndexProfileUI(null);
        updateUserSpecificContentVisibility(); // フォールバック
    }

    // --- script.jsからのイベントを監視 ---
    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((userData) => {
            console.log('index.js received login status change via onLoginStatusChange:', userData ? userData.name : null);
            updateIndexProfileUI(userData); // プロフィール内容を更新
            updateUserSpecificContentVisibility(); // ★ 表示/非表示を切り替え
        });
    } else {
        console.error("index.js: onLoginStatusChange is not defined in script.js!");
        // 代替カスタムイベントリスナー (省略)
    }

    // --- index.html 固有のその他の初期化処理 ---
    // (省略)
});
