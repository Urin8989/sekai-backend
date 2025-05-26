// frontend/shop.js (修正版)

const GACHA_COST_DISPLAY = 200;
let allAvailableBadges = [];
let isInitializingShop = false;
let isGachaAnimating = false;

// DOM要素 (変更なし)
// ... (以前のコードと同じなので省略) ...
let userPointsDisplay, regularShopItemsGrid, regularShopLoading, noRegularItemsMsg,
    limitedShopItemsGrid, limitedShopLoading, noLimitedItemsMsg,
    playGachaButton, gachaCostSpan, gachaErrorMessage,
    gachaResultModal, closeGachaResultButton, gachaButtonSpinner,
    gachaAnimationArea, gachaReels = [], gachaEffectOverlay, gachaKakuteiScreen,
    gachaResultDisplayArea, gachaResultTitle, gachaResultBadgeImg,
    gachaResultName, gachaResultDesc, gachaResultRarityContainer, gachaRarityValue,
    gachaResultNewPoints;

document.addEventListener('DOMContentLoaded', () => {
    userPointsDisplay = document.getElementById('user-points-display');
    regularShopItemsGrid = document.getElementById('shop-regular-items-grid');
    regularShopLoading = document.getElementById('shop-regular-loading');
    noRegularItemsMsg = document.getElementById('no-regular-items');
    limitedShopItemsGrid = document.getElementById('shop-limited-items-grid');
    limitedShopLoading = document.getElementById('shop-limited-loading');
    noLimitedItemsMsg = document.getElementById('no-limited-items');
    playGachaButton = document.getElementById('play-gacha-button');
    gachaCostSpan = document.getElementById('gacha-cost-display');
    gachaErrorMessage = document.getElementById('gacha-error-message');
    gachaResultModal = document.getElementById('gacha-result-modal');
    closeGachaResultButton = document.getElementById('close-gacha-result');
    gachaButtonSpinner = playGachaButton?.querySelector('.spinner-small');
    gachaAnimationArea = document.getElementById('gacha-animation-area');
    if (gachaAnimationArea) {
        document.querySelectorAll('.gacha-reels .reel img').forEach(img => gachaReels.push(img));
    }
    gachaEffectOverlay = document.getElementById('gacha-演出-effect');
    gachaKakuteiScreen = document.getElementById('gacha-確定-演出');
    gachaResultDisplayArea = document.getElementById('gacha-result-display');
    gachaResultTitle = document.getElementById('gacha-result-title');
    gachaResultBadgeImg = document.getElementById('gacha-result-badge-img');
    gachaResultName = document.getElementById('gacha-result-name');
    gachaResultDesc = document.getElementById('gacha-result-desc');
    gachaResultRarityContainer = document.getElementById('gacha-result-rarity-container');
    gachaRarityValue = document.getElementById('gacha-rarity-value');
    gachaResultNewPoints = document.getElementById('gacha-result-new-points');

    if (typeof window.MKBR_GachaAnimations?.initializeGachaAnimationElements === 'function') {
        window.MKBR_GachaAnimations.initializeGachaAnimationElements({
            gachaAnimationArea, gachaReels, gachaEffectOverlay, gachaKakuteiScreen
        });
    } else {
        console.warn("[shop.js] Gacha animation script or its initialize function not found.");
    }
    if (typeof window.registerUserDataReadyCallback === 'function') {
        window.registerUserDataReadyCallback(initializeShop);
    } else {
        console.error("shop.js: registerUserDataReadyCallback is not defined. Initializing without user data.");
        initializeShop(null);
    }
    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange(initializeShop);
    } else {
        console.error("shop.js: onLoginStatusChange is not defined.");
    }
    playGachaButton?.addEventListener('click', handlePlayGacha);
    closeGachaResultButton?.addEventListener('click', closeGachaResultModal);
    gachaResultModal?.addEventListener('click', (event) => {
        if (event.target === gachaResultModal) closeGachaResultModal();
    });
});

async function initializeShop(userData) {
    if (isInitializingShop) return;
    isInitializingShop = true;
    if (!userPointsDisplay) {
        console.error("[shop.js] Shop page core element (userPointsDisplay) not found.");
        isInitializingShop = false;
        return;
    }
    if(regularShopLoading) regularShopLoading.style.display = 'flex';
    if(limitedShopLoading) limitedShopLoading.style.display = 'flex';
    if(noRegularItemsMsg) noRegularItemsMsg.style.display = 'none';
    if(noLimitedItemsMsg) noLimitedItemsMsg.style.display = 'none';
    if(regularShopItemsGrid) regularShopItemsGrid.innerHTML = '';
    if(limitedShopItemsGrid) limitedShopItemsGrid.innerHTML = '';
    if(gachaErrorMessage) gachaErrorMessage.style.display = 'none';
    if(gachaCostSpan) gachaCostSpan.textContent = GACHA_COST_DISPLAY.toLocaleString();
    try {
        const currentUser = window.MyApp?.currentUserData || userData;
        if (currentUser && window.MyApp?.isUserLoggedIn) {
            displayUserPoints(currentUser.points);
            updateGachaButtonState(currentUser.points);
            await fetchAvailableBadges();
            const limitedBadges = allAvailableBadges.filter(b => b.isLimited).sort((a, b) => (a.price || 0) - (b.price || 0));
            const nonLimitedBadges = allAvailableBadges.filter(b => !b.isLimited);
            const rateBadgeIds = new Set(nonLimitedBadges.filter(b => b.badgeId.startsWith('badge-rate-')).map(b => b.badgeId));
            const matchBadgeIds = new Set(nonLimitedBadges.filter(b => b.badgeId.startsWith('badge-matches-')).map(b => b.badgeId));
            const rateBadges = nonLimitedBadges.filter(b => rateBadgeIds.has(b.badgeId)).sort((a, b) => (a.requiredRate || 0) - (b.requiredRate || 0));
            const matchBadges = nonLimitedBadges.filter(b => matchBadgeIds.has(b.badgeId)).sort((a, b) => (a.requiredMatches || 0) - (b.requiredMatches || 0));
            const normalBadges = nonLimitedBadges.filter(b => !rateBadgeIds.has(b.badgeId) && !matchBadgeIds.has(b.badgeId)).sort((a,b) => (a.price || 0) - (b.price||0) || a.name.localeCompare(b.name));
            let regularItemsExist = false;
            if (regularShopItemsGrid) {
                if (normalBadges.length > 0) { addCategoryHeader(regularShopItemsGrid, "通常バッジ"); displayShopItems(currentUser, normalBadges, regularShopItemsGrid, null); regularItemsExist = true; }
                if (rateBadges.length > 0) { addCategoryHeader(regularShopItemsGrid, "レート達成記念"); displayShopItems(currentUser, rateBadges, regularShopItemsGrid, null); regularItemsExist = true; }
                if (matchBadges.length > 0) { addCategoryHeader(regularShopItemsGrid, "対戦数記念"); displayShopItems(currentUser, matchBadges, regularShopItemsGrid, null); regularItemsExist = true; }
                if (!regularItemsExist && noRegularItemsMsg) noRegularItemsMsg.style.display = 'block';
            }
            if (limitedShopItemsGrid) displayShopItems(currentUser, limitedBadges, limitedShopItemsGrid, noLimitedItemsMsg);
        } else {
            const loginMessage = '<p class="notice-text">ショップを利用するには<a href="#" onclick="document.getElementById(\'g_id_signin\').click(); return false;">ログイン</a>してください。</p>';
            if(regularShopItemsGrid) regularShopItemsGrid.innerHTML = loginMessage;
            if(limitedShopItemsGrid) limitedShopItemsGrid.innerHTML = loginMessage;
            if(userPointsDisplay) userPointsDisplay.textContent = '---';
            if (playGachaButton) playGachaButton.disabled = true;
        }
    } catch (error) {
        console.error("[shop.js] Error initializing shop:", error);
        const errorMessageText = `ショップ情報の読み込みに失敗しました: ${error.message}`;
        if(regularShopItemsGrid) regularShopItemsGrid.innerHTML = `<p class="error-text">${errorMessageText}</p>`;
        if(limitedShopItemsGrid) limitedShopItemsGrid.innerHTML = `<p class="error-text">${errorMessageText}</p>`;
    } finally {
        if(regularShopLoading) regularShopLoading.style.display = 'none';
        if(limitedShopLoading) limitedShopLoading.style.display = 'none';
        isInitializingShop = false;
    }
}

function displayUserPoints(points) {
    if (userPointsDisplay) {
        userPointsDisplay.textContent = points !== undefined ? points.toLocaleString() : '---';
    }
}

async function fetchAvailableBadges() {
    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/shop/badges`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `バッジ情報取得エラー (${response.status})` }));
            throw new Error(errorData.message);
        }
        allAvailableBadges = await response.json() || [];
        return allAvailableBadges;
    } catch (error) {
        console.error("[shop.js] Error fetching available badges:", error);
        allAvailableBadges = [];
        const errorMsg = `バッジ情報の読み込みに失敗: ${error.message}`;
        if (noRegularItemsMsg) { noRegularItemsMsg.textContent = errorMsg; noRegularItemsMsg.style.display = 'block';}
        if (noLimitedItemsMsg) { noLimitedItemsMsg.textContent = errorMsg; noLimitedItemsMsg.style.display = 'block';}
        throw error;
    }
}

function displayShopItems(currentUserData, badges, gridContainer, noItemsMsgElement) {
    if (!gridContainer) return;
    const isGridEmptyOrOnlyHeaders = Array.from(gridContainer.children).every(child => child.classList.contains('shop-category-header'));
    if (!badges || badges.length === 0) {
        if (noItemsMsgElement && isGridEmptyOrOnlyHeaders) noItemsMsgElement.style.display = 'block';
        return;
    }
    if (noItemsMsgElement) noItemsMsgElement.style.display = 'none';

    badges.forEach(badge => {
        const { badgeId, name, description, price, img, isLimited, requiredRate = 0, requiredMatches = 0 } = badge;
        
        // ★★★ script.js の getBadgeImagePath を使用して一貫性を保つ ★★★
        const primaryImagePath = typeof window.getBadgeImagePath === 'function' 
                               ? window.getBadgeImagePath(badgeId) 
                               : `/public/images/${img || `${badgeId}.svg`}`; // フォールバック
        const fallbackImagePath = '/public/images/default_badge.svg';

        const isOwned = currentUserData?.badges?.includes(badgeId);
        const canAfford = currentUserData?.points >= price;
        const meetsRateRequirement = requiredRate <= 0 || (currentUserData?.rate || 0) >= requiredRate;
        const meetsMatchRequirement = requiredMatches <= 0 || (currentUserData?.matchCount || 0) >= requiredMatches;

        const itemDiv = document.createElement('div');
        itemDiv.classList.add('shop-item-card');
        if (isOwned) itemDiv.classList.add('owned');
        if (isLimited) itemDiv.classList.add('limited-item');
        if (!isOwned && !meetsRateRequirement) itemDiv.classList.add('rate-insufficient');
        if (!isOwned && !meetsMatchRequirement) itemDiv.classList.add('matches-insufficient');

        let requirementText = '';
        if (requiredRate > 0) requirementText += `<p class="shop-item-requirement">必要レート: ${requiredRate}</p>`;
        if (requiredMatches > 0) requirementText += `<p class="shop-item-requirement">必要対戦数: ${requiredMatches}</p>`;

        itemDiv.innerHTML = `
            <div class="shop-item-badge-display"><img src="${primaryImagePath}" alt="${name || 'バッジ'}" onerror="this.onerror=null; this.src='${fallbackImagePath}';"></div>
            <div class="shop-item-details">
                <h3 class="shop-item-name">${name || 'バッジ名なし'}</h3>
                ${description ? `<p class="shop-item-description">${description}</p>` : ''}
                ${requirementText}
                <p class="shop-item-price">${price ? price.toLocaleString() : '---'} P</p>
            </div>
            <button class="button shop-buy-button" data-badge-id="${badgeId}">
                ${isOwned ? '購入済み' : '購入する'}
            </button>
        `;
        const buyButton = itemDiv.querySelector('.shop-buy-button');
        updateSinglePurchaseButtonState(buyButton, badge, currentUserData);
        gridContainer.appendChild(itemDiv);
    });
}

function addCategoryHeader(gridContainer, title) {
    if (!gridContainer) return;
    const header = document.createElement('h3');
    header.className = 'shop-category-header';
    header.textContent = title;
    header.style.gridColumn = '1 / -1';
    gridContainer.appendChild(header);
}

async function handlePurchase(badgeToBuy) {
    const currentUserData = window.MyApp?.currentUserData;
    if (!currentUserData) { alert("購入するにはログインが必要です。"); return; }
    const { badgeId, name, price } = badgeToBuy;
    const requiredRate = badgeToBuy.requiredRate || 0;
    const requiredMatches = badgeToBuy.requiredMatches || 0;
    const isOwned = currentUserData.badges?.includes(badgeId);
    if (isOwned) { alert('このバッジは既に所有しています。'); return; }
    if (requiredRate > 0 && (currentUserData.rate || 0) < requiredRate) { alert(`レートが不足しています (必要レート: ${requiredRate})`); return; }
    if (requiredMatches > 0 && (currentUserData.matchCount || 0) < requiredMatches) { alert(`対戦数が不足しています (必要対戦数: ${requiredMatches})`); return; }
    if (currentUserData.points < price) { alert('ポイントが不足しています。'); return; }

    if (confirm(`${name} (${price.toLocaleString()} P) を購入しますか？`)) {
        const buyButton = document.querySelector(`.shop-buy-button[data-badge-id="${badgeId}"]`);
        setButtonLoading(buyButton, true, '購入処理中...');
        try {
            const apiUrl = `${window.MyApp.BACKEND_URL}/api/shop/purchase`;
            const token = window.getAuthToken?.();
            if (!token) throw new Error('ログインが必要です。');
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ badgeId })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '購入処理に失敗しました。');
            if (window.MyApp?.currentUserData) {
                window.MyApp.currentUserData.points = result.newPoints;
                window.MyApp.currentUserData.badges = result.updatedBadges;
                window.saveCurrentUserData?.();
                window.updateUserPoints?.(result.newPoints);
            }
            displayUserPoints(result.newPoints);
            updatePurchaseButtonStates(window.MyApp?.currentUserData);
            updateGachaButtonState(result.newPoints);
            alert(`${name} を購入しました！`);
        } catch (error) {
            console.error('[shop.js] Error purchasing badge:', error);
            alert(`購入に失敗しました: ${error.message}`);
            updatePurchaseButtonStates(window.MyApp?.currentUserData);
            updateGachaButtonState(window.MyApp?.currentUserData?.points || 0);
        } finally {
            setButtonLoading(buyButton, false);
        }
    }
}

function setButtonLoading(button, isLoading, loadingText = '処理中...') {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        if (!button.dataset.originalContent && button.querySelector('.spinner-small')) {
            button.dataset.originalContent = button.innerHTML;
        }
        button.innerHTML = `<span class="spinner-small" style="display: inline-block; margin-right: 8px;"></span>${loadingText}`;
    } else {
        button.disabled = false; 
        if (button.dataset.originalContent) {
            button.innerHTML = button.dataset.originalContent;
            delete button.dataset.originalContent;
        } else {
             if (button.id === 'play-gacha-button') updateGachaButtonState(window.MyApp?.currentUserData?.points || 0);
             else if (button.classList.contains('shop-buy-button')) {
                 const badgeId = button.dataset.badgeId;
                 const badge = allAvailableBadges.find(b => b.badgeId === badgeId);
                 const user = window.MyApp?.currentUserData;
                 if (badge && user) updateSinglePurchaseButtonState(button, badge, user);
                 else button.textContent = '購入する';
             } else button.textContent = '操作';
        }
         // 状態に応じてボタンの有効/無効を再設定
        if (button.id === 'play-gacha-button') updateGachaButtonState(window.MyApp?.currentUserData?.points || 0);
        else if (button.classList.contains('shop-buy-button')) {
            const badgeId = button.dataset.badgeId;
            const badge = allAvailableBadges.find(b => b.badgeId === badgeId);
            if(badge) updateSinglePurchaseButtonState(button, badge, window.MyApp?.currentUserData);
        }
    }
}

function updatePurchaseButtonStates(currentUserData) {
    if (!allAvailableBadges || allAvailableBadges.length === 0) return;
    const buttons = document.querySelectorAll('.shop-buy-button');
    if (!buttons.length) return;
    if (!currentUserData || !window.MyApp?.isUserLoggedIn) {
        buttons.forEach(button => {
            button.disabled = true; button.textContent = 'ログインして購入';
            const card = button.closest('.shop-item-card');
            if(card) card.classList.remove('owned', 'rate-insufficient', 'matches-insufficient');
        });
        return;
    }
    buttons.forEach(button => {
        const badgeId = button.dataset.badgeId;
        const badgeData = allAvailableBadges.find(b => b.badgeId === badgeId);
        if (badgeData) updateSinglePurchaseButtonState(button, badgeData, currentUserData);
    });
}

function updateSinglePurchaseButtonState(button, badge, currentUserData) {
    if (!button || !badge) return;
    const { badgeId, price, requiredRate = 0, requiredMatches = 0 } = badge;
    const { points: currentPoints = 0, rate: currentRate = 0, matchCount: currentMatchCount = 0, badges: ownedBadgeIds = [] } = currentUserData || {};
    const card = button.closest('.shop-item-card');
    if(!card) return;
    const isOwned = ownedBadgeIds.includes(badgeId);
    const meetsRateRequirement = requiredRate <= 0 || currentRate >= requiredRate;
    const meetsMatchRequirement = requiredMatches <= 0 || currentMatchCount >= requiredMatches;
    const canAfford = currentPoints >= price;
    card.classList.remove('owned', 'rate-insufficient', 'matches-insufficient');
    if (isOwned) { button.disabled = true; button.textContent = '購入済み'; card.classList.add('owned'); button.onclick = null; }
    else if (!meetsRateRequirement) { button.disabled = true; button.textContent = 'レート不足'; card.classList.add('rate-insufficient'); button.onclick = null; }
    else if (!meetsMatchRequirement) { button.disabled = true; button.textContent = '対戦数不足'; card.classList.add('matches-insufficient'); button.onclick = null; }
    else if (!canAfford) { button.disabled = true; button.textContent = 'ポイント不足'; button.onclick = null; }
    else { button.disabled = false; button.textContent = '購入する'; button.onclick = () => handlePurchase(badge); }
}

function updateGachaButtonState(currentPoints) {
    if (!playGachaButton || !gachaCostSpan) return;
    const canPlay = currentPoints >= GACHA_COST_DISPLAY && !isGachaAnimating;
    playGachaButton.disabled = !canPlay;
    const costText = GACHA_COST_DISPLAY.toLocaleString();
    const spinnerHtml = `<span class="spinner-small" style="display: ${isGachaAnimating && playGachaButton.disabled ? 'inline-block' : 'none'}; margin-left: 8px;"></span>`;
    playGachaButton.innerHTML = `ガチャを引く (<span id="gacha-cost-display">${costText}</span> P)${spinnerHtml}`;
    playGachaButton.title = isGachaAnimating ? '演出中...' : (!canPlay && currentPoints < GACHA_COST_DISPLAY ? 'ポイントが不足しています' : '');
}

function setGachaButtonLoading(isLoading, loadingText = '処理中...') {
    if (!playGachaButton) return;
    if (isLoading) {
        playGachaButton.disabled = true;
        playGachaButton.innerHTML = `<span class="spinner-small" style="display: inline-block; margin-right: 8px;"></span>${loadingText}`;
    } else {
        updateGachaButtonState(window.MyApp?.currentUserData?.points || 0);
    }
}

async function handlePlayGacha() {
    if (!window.MyApp?.isUserLoggedIn || playGachaButton.disabled || isGachaAnimating) {
        if(!window.MyApp?.isUserLoggedIn) alert("ガチャを引くにはログインが必要です。");
        return;
    }
    isGachaAnimating = true;
    setGachaButtonLoading(true, 'ガチャ実行中...');
    if (gachaErrorMessage) gachaErrorMessage.style.display = 'none';
    try {
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/shop/gacha`;
        const token = window.getAuthToken?.();
        if (!token) throw new Error('ログインが必要です。');
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }});
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || `ガチャ失敗 (${response.status})`);
        const wonBadge = result.wonBadge;
        if (!wonBadge || !wonBadge.badgeId) throw new Error('ガチャ結果のバッジ情報が不正です。');
        if (gachaResultModal) gachaResultModal.style.display = 'flex';
        if (gachaAnimationArea) gachaAnimationArea.style.display = 'flex';
        if (gachaResultDisplayArea) { gachaResultDisplayArea.style.display = 'none'; gachaResultDisplayArea.classList.remove('show');}
        if (typeof window.MKBR_GachaAnimations?.playPreGachaAnimation === 'function') {
            const highRarities = ['epic', 'legendary'];
            if (wonBadge.rarity && highRarities.includes(wonBadge.rarity.toLowerCase())) {
                await window.MKBR_GachaAnimations.playPreGachaAnimation(wonBadge.rarity.toUpperCase(), gachaKakuteiScreen);
            }
        }
        if (typeof window.MKBR_GachaAnimations?.playMainReelAnimation === 'function') {
            // ★★★ ガチャアニメーションに渡すバッジリストはガチャプールから取得するべき。
            //     ひとまず空配列を渡すが、必要に応じてバックエンドから取得したガチャプール情報を渡す。
            let gachaPoolForAnimation = []; 
            // if (window.MyApp?.allGachaPoolBadges) { // 例えばこのようにグローバルに保持する場合
            //    gachaPoolForAnimation = window.MyApp.allGachaPoolBadges;
            // }
            await window.MKBR_GachaAnimations.playMainReelAnimation(wonBadge, gachaReels, gachaPoolForAnimation); 
        }
        if (window.MyApp?.currentUserData) {
            window.MyApp.currentUserData.points = result.newPoints;
            window.MyApp.currentUserData.badges = result.updatedBadges;
            window.saveCurrentUserData?.();
            window.updateUserPoints?.(result.newPoints);
        }
        displayUserPoints(result.newPoints);
        updatePurchaseButtonStates(window.MyApp?.currentUserData);
        if (gachaAnimationArea) gachaAnimationArea.style.display = 'none';
        if (gachaResultDisplayArea) { gachaResultDisplayArea.style.display = 'block'; gachaResultDisplayArea.classList.add('show'); }
        showGachaResultDetails(wonBadge, result.newPoints);
    } catch (error) {
        console.error('[ERROR_GACHA_FE] Error playing gacha:', error);
        if (gachaErrorMessage) { gachaErrorMessage.textContent = error.message; gachaErrorMessage.style.display = 'block';}
        else alert(`ガチャエラー: ${error.message}`);
        if (gachaAnimationArea) gachaAnimationArea.style.display = 'none';
        if (gachaResultDisplayArea) gachaResultDisplayArea.style.display = 'none';
        if (gachaResultModal) gachaResultModal.style.display = 'none';
    } finally {
        isGachaAnimating = false;
        setGachaButtonLoading(false);
    }
}

function showGachaResultDetails(wonBadge, newPoints) {
    if (!gachaResultDisplayArea || !wonBadge) return;

    // ★★★ script.js の getBadgeImagePath を使用して一貫性を保つ ★★★
    const primaryImagePath = typeof window.getBadgeImagePath === 'function' 
                           ? window.getBadgeImagePath(wonBadge.badgeId) 
                           : `/public/images/${wonBadge.img || `${wonBadge.badgeId}.svg`}`; // フォールバック
    const fallbackImagePath = '/public/images/default_badge.svg';

    if (gachaResultTitle) gachaResultTitle.textContent = "バッジ獲得！";
    if (gachaResultBadgeImg) {
        gachaResultBadgeImg.src = primaryImagePath;
        gachaResultBadgeImg.alt = wonBadge.name;
        gachaResultBadgeImg.onerror = () => { 
            gachaResultBadgeImg.src = fallbackImagePath;
        };
    }
    if (gachaResultName) gachaResultName.textContent = wonBadge.name;
    if (gachaResultDesc) gachaResultDesc.textContent = wonBadge.description;
    if (gachaResultNewPoints) gachaResultNewPoints.textContent = newPoints.toLocaleString();

    if (gachaResultRarityContainer && gachaRarityValue && wonBadge.rarity) {
        const rarityString = (typeof wonBadge.rarity === 'string') ? wonBadge.rarity.toLowerCase() : 'common';
        const displayRarityText = rarityString.toUpperCase();
        gachaRarityValue.textContent = displayRarityText;
        gachaRarityValue.className = 'rarity-value'; 
        gachaRarityValue.classList.add(`rarity-${rarityString}`); 
        if (rarityString === 'legendary' || rarityString === 'ssr') {
            gachaRarityValue.classList.add('rainbow');
        } else {
            gachaRarityValue.classList.remove('rainbow');
        }
        gachaResultRarityContainer.style.display = 'block';
    } else if (gachaResultRarityContainer) {
        gachaResultRarityContainer.style.display = 'none';
    }
}

function closeGachaResultModal() {
    if (gachaResultModal) gachaResultModal.style.display = 'none';
    if (isGachaAnimating) {
        isGachaAnimating = false;
        setGachaButtonLoading(false); 
    }
    if (gachaResultDisplayArea) gachaResultDisplayArea.classList.remove('show');
}

// ★★★ window.getBadgeImagePath は script.js でグローバルに定義されることを推奨 ★★★
// shop.js 内でのフォールバック定義は、他のスクリプトとの整合性の問題を生む可能性があるため削除。
// 必ず script.js で getBadgeImagePath が定義・ロードされるようにしてください。
// もし script.js に getBadgeImagePath がない場合は、前の回答の script.js の定義を script.js に配置してください。