// frontend/index.js

document.addEventListener('DOMContentLoaded', () => {
    const welcomeIntro = document.querySelector('.welcome-intro');
    const indexUserProfileSection = document.getElementById('user-profile-section');
    const loggedInIconHeader = document.querySelector('.logged-in-icon-header');

    const indexProfilePic = indexUserProfileSection ? indexUserProfileSection.querySelector('#profile-pic') : null;
    const indexProfileName = indexUserProfileSection ? indexUserProfileSection.querySelector('#profile-name') : null;
    const indexProfileRate = indexUserProfileSection ? indexUserProfileSection.querySelector('#profile-rate') : null;
    const indexProfilePoints = indexUserProfileSection ? indexUserProfileSection.querySelector('#profile-points') : null;
    const indexProfileBadgesContainer = indexUserProfileSection ? indexUserProfileSection.querySelector('.profile-badges') : null;

    // ★★★ 環境に応じたデフォルトアバターパス (script.js から取得するか、ここで同様に定義) ★★★
    const getDefaultAvatarPath = () => {
        // script.js に MyApp.DEFAULT_AVATAR_PATH のようなものが定義されていればそれを使う
        // ここでは location.hostname で判定する例
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return '/public/images/placeholder-avatar.png';
        } else {
            return '/images/placeholder-avatar.png';
        }
    };

    function updateIndexProfileUI(userData) {
        if (!indexUserProfileSection) return;
        const defaultAvatar = getDefaultAvatarPath(); // ★ 修正

        if (userData) {
            if (indexProfilePic) {
                indexProfilePic.src = userData.picture || defaultAvatar;
                indexProfilePic.alt = `${userData.name || 'プレイヤー'}のプロフィール画像`;
                indexProfilePic.onerror = () => { indexProfilePic.src = defaultAvatar; }; // ★ 修正
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
            // ★★★ script.js の displayBadges を使用 ★★★
            if (indexProfileBadgesContainer && typeof window.displayBadges === 'function') {
                const badgeSlots = indexProfileBadgesContainer.querySelectorAll('.badge-slot');
                const badgesToDisplay = userData.displayBadges && userData.displayBadges.length > 0
                                      ? userData.displayBadges
                                      : (userData.badges ? [...new Set(userData.badges)].slice(0, 3) : []);
                window.displayBadges(badgeSlots, badgesToDisplay);
            } else if (indexProfileBadgesContainer) {
                console.warn("index.js: window.displayBadges function not found or badge container missing.");
            }
        } else {
            if (indexProfilePic) {
                indexProfilePic.src = defaultAvatar; // ★ 修正
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

    function updateUserSpecificContentVisibility() {
        const isLoggedIn = window.MyApp?.isUserLoggedIn === true;
        if (welcomeIntro) {
            welcomeIntro.style.display = isLoggedIn ? 'none' : 'block';
        }
        if (indexUserProfileSection) {
          indexUserProfileSection.style.display = isLoggedIn ? 'block' : 'none';
        }
        if (loggedInIconHeader) {
            loggedInIconHeader.style.display = isLoggedIn ? 'block' : 'none';
        } else {
            console.warn("index.js: loggedInIconHeader element not found.");
        }
    }

    if (typeof window.registerUserDataReadyCallback === 'function') {
        window.registerUserDataReadyCallback((userData) => {
            updateIndexProfileUI(userData);
            updateUserSpecificContentVisibility();
        });
    } else {
        console.error("index.js: registerUserDataReadyCallback is not defined in script.js!");
        updateIndexProfileUI(null);
        updateUserSpecificContentVisibility();
    }

    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((userData) => {
            updateIndexProfileUI(userData);
            updateUserSpecificContentVisibility();
        });
    } else {
        console.error("index.js: onLoginStatusChange is not defined in script.js!");
    }
});