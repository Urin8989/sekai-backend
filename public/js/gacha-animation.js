// js/gacha-animation.js

let GACHA_DOM_ELEMENTS = { // 格納用オブジェクト名を変更 (GACHA_ANIM_ELEMENTS から)
    gachaAnimationArea: null,
    gachaReels: [], // これは img 要素の配列
    gachaEffectOverlay: null,
    gachaKakuteiScreen: null
};

/**
 * ガチャ演出関連のDOM要素を初期化 (shop.jsから呼び出される想定)
 * @param {object} elementsFromShop - shop.jsで取得したDOM要素のオブジェクト
 */
function initializeGachaAnimationElements(elementsFromShop) {
    GACHA_DOM_ELEMENTS.gachaAnimationArea = elementsFromShop.gachaAnimationArea;
    GACHA_DOM_ELEMENTS.gachaReels = elementsFromShop.gachaReels || [];
    GACHA_DOM_ELEMENTS.gachaEffectOverlay = elementsFromShop.gachaEffectOverlay;
    GACHA_DOM_ELEMENTS.gachaKakuteiScreen = elementsFromShop.gachaKakuteiScreen;
    console.log("[GachaAnim] Elements initialized:", GACHA_DOM_ELEMENTS);
}

/**
 * 高レアリティ事前演出 (Promiseを返す)
 * @param {string} rarity 獲得バッジのレアリティ
 */
async function playPreGachaAnimation(rarity) {
    console.log(`[GachaAnim] Playing pre-gacha animation for rarity: ${rarity}`);
    return new Promise(resolve => {
        if (GACHA_DOM_ELEMENTS.gachaKakuteiScreen) {
            GACHA_DOM_ELEMENTS.gachaKakuteiScreen.innerHTML = `<p>${rarity} チャンス！</p>`;
            GACHA_DOM_ELEMENTS.gachaKakuteiScreen.style.display = 'flex';
            GACHA_DOM_ELEMENTS.gachaKakuteiScreen.classList.add('show');

            setTimeout(() => {
                GACHA_DOM_ELEMENTS.gachaKakuteiScreen.classList.remove('show');
                setTimeout(() => {
                    GACHA_DOM_ELEMENTS.gachaKakuteiScreen.style.display = 'none';
                    resolve();
                }, 500);
            }, 1800);
        } else {
            console.warn("[GachaAnim] Kakutei screen element not found for pre-animation.");
            resolve();
        }
    });
}

/**
 * メインリール演出 (Promiseを返す)
 * @param {object} finalBadge 最終的に表示する獲得バッジ
 * @param {Array} availableBadges アニメーションに使用するバッジの全リスト (shop.jsから渡される)
 */
async function playMainReelAnimation(finalBadge, availableBadges) {
    console.log("[GachaAnim] Playing main reel animation for badge:", finalBadge.name);
    return new Promise(resolve => {
        const reelImageElements = GACHA_DOM_ELEMENTS.gachaReels;

        if (!reelImageElements || reelImageElements.length === 0) {
            console.warn("[GachaAnim] Reel elements not found for animation.");
            resolve();
            return;
        }
        // ... (以降のロジックは reelImageElements を使用)
        if (!availableBadges || availableBadges.length === 0) {
            console.warn("[GachaAnim] Available badges not provided for reel animation.");
            reelImageElements.forEach(reelImg => {
                const finalImgPath = typeof window.getBadgeImagePath === 'function'
                                    ? window.getBadgeImagePath(finalBadge.badgeId)
                                    : (finalBadge.img || `images/badges/${finalBadge.badgeId}.svg` || 'images/badges/placeholder_badge.png');
                reelImg.src = finalImgPath;
                reelImg.alt = finalBadge.name;
            });
            setTimeout(resolve, 500);
            return;
        }

        const reelAnimationTime = 60;
        const totalSpinsPerReel = 25 + Math.floor(Math.random() * 10);
        const stopDelayIncrement = 250;
        let reelsFinished = 0;

        reelImageElements.forEach((reelImg, reelIndex) => {
            let currentSpin = 0;
            reelImg.style.transition = 'none';
            reelImg.style.transform = 'translateY(0)';

            const spin = () => {
                if (currentSpin < totalSpinsPerReel + (reelIndex * (reelImageElements.length > 1 ? 3 : 0))) {
                    const randomIndex = Math.floor(Math.random() * availableBadges.length);
                    const randomBadge = availableBadges[randomIndex];
                    reelImg.src = typeof window.getBadgeImagePath === 'function'
                                ? window.getBadgeImagePath(randomBadge.badgeId)
                                : (randomBadge.img || `images/badges/${randomBadge.badgeId}.svg` || 'images/badges/placeholder_badge.png');
                    reelImg.alt = randomBadge.name;
                    currentSpin++;
                    setTimeout(spin, reelAnimationTime);
                } else {
                    let displayBadge = finalBadge;
                    if (reelImageElements.length > 1 && reelIndex !== Math.floor(reelImageElements.length / 2)) {
                        const nearRarityBadges = availableBadges.filter(b => b.rarity === finalBadge.rarity || b.rarity === getPreviousRarity(finalBadge.rarity));
                        displayBadge = nearRarityBadges.length > 0 ? nearRarityBadges[Math.floor(Math.random() * nearRarityBadges.length)] : finalBadge;
                    }
                    const finalImgPath = typeof window.getBadgeImagePath === 'function'
                                        ? window.getBadgeImagePath(displayBadge.badgeId)
                                        : (displayBadge.img || `images/badges/${displayBadge.badgeId}.svg` || 'images/badges/placeholder_badge.png');
                    reelImg.src = finalImgPath;
                    reelImg.alt = displayBadge.name;

                    reelImg.style.transition = 'transform 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)';
                    reelImg.style.transform = 'translateY(-10px)';
                    setTimeout(() => {
                        reelImg.style.transform = 'translateY(5px)';
                        setTimeout(() => {
                            reelImg.style.transform = 'translateY(0)';
                            triggerFlashEffect(reelIndex === Math.floor(reelImageElements.length / 2) ? 'gold' : 'white');
                            reelsFinished++;
                            if (reelsFinished === reelImageElements.length) {
                                setTimeout(resolve, 400);
                            }
                        }, 100);
                    }, 100);
                }
            };
            setTimeout(spin, reelIndex * stopDelayIncrement);
        });
        if (reelImageElements.length === 0) resolve();
    });
}

function triggerFlashEffect(type = 'white') {
    if (GACHA_DOM_ELEMENTS.gachaEffectOverlay) {
        GACHA_DOM_ELEMENTS.gachaEffectOverlay.className = 'gacha-effect-overlay';
        void GACHA_DOM_ELEMENTS.gachaEffectOverlay.offsetWidth;
        GACHA_DOM_ELEMENTS.gachaEffectOverlay.classList.add(type === 'gold' ? 'flash-gold' : 'flash-white');
    } else {
        console.warn("[GachaAnim] Gacha effect overlay element not found for flash effect.");
    }
}

function getPreviousRarity(rarity) {
    const rarities = ['common', 'rare', 'epic', 'legendary'];
    const currentIndex = rarities.indexOf(rarity?.toLowerCase());
    return currentIndex > 0 ? rarities[currentIndex - 1] : 'common';
}

window.MKBR_GachaAnimations = {
    initializeGachaAnimationElements,
    playPreGachaAnimation,
    playMainReelAnimation,
    triggerFlashEffect
};