// frontend/shop.js

const BACKEND_URL = 'https://www.mariokartbestrivals.com'; // ★★★ Xserver上のバックエンドURL ★★★
const GACHA_COST_DISPLAY = 200; // ★ バックエンドの GACHA_COST と合わせて200に変更

let allAvailableBadges = [];
// ▼▼▼ 処理中フラグを追加 ▼▼▼
let isInitializingShop = false;
// ▲▲▲ 処理中フラグを追加 ▲▲▲

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM要素取得 ---
    const userPointsDisplay = document.getElementById('user-points-display');
    const regularShopItemsGrid = document.getElementById('shop-regular-items-grid');
    const regularShopLoading = document.getElementById('shop-regular-loading');
    const noRegularItemsMsg = document.getElementById('no-regular-items');
    const limitedShopItemsGrid = document.getElementById('shop-limited-items-grid');
    const limitedShopLoading = document.getElementById('shop-limited-loading');
    const noLimitedItemsMsg = document.getElementById('no-limited-items');

    // ▼▼▼ ガチャ関連要素取得 ▼▼▼
    const playGachaButton = document.getElementById('play-gacha-button');
    const gachaCostSpan = document.getElementById('gacha-cost-display'); // ★ HTMLのIDに合わせる
    const gachaErrorMessage = document.getElementById('gacha-error-message');
    const gachaResultModal = document.getElementById('gacha-result-modal');
    const closeGachaResultButton = document.getElementById('close-gacha-result');
    const gachaResultTitle = document.getElementById('gacha-result-title');
    const gachaResultBadgeImg = document.getElementById('gacha-result-badge-img');
    const gachaResultName = document.getElementById('gacha-result-name');
    const gachaResultDesc = document.getElementById('gacha-result-desc');
    const gachaResultRarity = document.getElementById('gacha-result-rarity');
    const gachaRarityValue = document.getElementById('gacha-rarity-value');
    const gachaResultNewPoints = document.getElementById('gacha-result-new-points');
    // ★ HTMLのローディング要素IDに合わせる (play-gacha-button 内の spinner-small を使う例)
    const gachaButtonSpinner = playGachaButton?.querySelector('.spinner-small');
    // ▲▲▲ ガチャ関連要素取得 ▲▲▲

    // --- 初期化処理 ---
    // ページ読み込み時にユーザーデータが準備できたらショップを初期化
    if (typeof window.registerUserDataReadyCallback === 'function') {
        window.registerUserDataReadyCallback(initializeShop);
    } else {
        console.error("shop.js: registerUserDataReadyCallback is not defined in script.js!");
        initializeShop(null); // ユーザーデータ無しで初期化を試みる
    }

    // ▼▼▼ ログイン状態変更時の処理を追加 ▼▼▼
    // ログイン状態が変わるたびにショップを再初期化
    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((userData) => {
            console.log("[shop.js] Login status changed:", userData ? userData.name : "null");
            // ログイン状態が変わったらショップ全体を再初期化
            initializeShop(userData);
        });
    } else {
        console.error("shop.js: onLoginStatusChange is not defined in script.js!");
        // ログイン状態の動的な反映ができないことをユーザーに知らせる必要があれば、ここでUIにメッセージを表示
    }
    // ▲▲▲ ログイン状態変更時の処理を追加 ▲▲▲

    /**
     * ショップページの初期化
     * @param {object|null} userData ログインユーザー情報
     */
    async function initializeShop(userData) {
        // ▼▼▼ 処理中フラグをチェック ▼▼▼
        if (isInitializingShop) {
            console.log("[shop.js] initializeShop skipped: Already initializing.");
            return;
        }
        isInitializingShop = true;
        console.log("[shop.js] Initializing shop with user data:", userData ? userData.name : "null");
        // ▲▲▲ 処理中フラグをチェック ▲▲▲

        // --- 要素存在チェック ---
        if (!userPointsDisplay || !regularShopItemsGrid || !regularShopLoading || !noRegularItemsMsg ||
            !limitedShopItemsGrid || !limitedShopLoading || !noLimitedItemsMsg) {
            console.error("Shop elements not found.");
            isInitializingShop = false; // ★ エラー時もフラグ解除
            return;
        }
        if (!playGachaButton || !gachaCostSpan || !gachaErrorMessage || !gachaResultModal ||
            !closeGachaResultButton || !gachaResultTitle || !gachaResultBadgeImg || !gachaResultName ||
            !gachaResultDesc || !gachaResultRarity || !gachaRarityValue || !gachaResultNewPoints || !gachaButtonSpinner) {
            console.warn("One or more Gacha elements not found. Gacha functionality might be limited.");
        }
        // --- 要素存在チェックここまで ---

        // --- UI初期化 ---
        regularShopLoading.style.display = 'flex';
        limitedShopLoading.style.display = 'flex';
        noRegularItemsMsg.style.display = 'none';
        noLimitedItemsMsg.style.display = 'none';
        regularShopItemsGrid.innerHTML = '';
        limitedShopItemsGrid.innerHTML = '';
        if (gachaErrorMessage) gachaErrorMessage.style.display = 'none';
        if (gachaCostSpan) gachaCostSpan.textContent = GACHA_COST_DISPLAY.toLocaleString();
        // --- UI初期化ここまで ---

        try { // ★ try ブロックを追加
            if (userData) {
                // --- ログイン時の処理 ---
                displayUserPoints(userData.points);
                updateGachaButtonState(userData.points);

                // バッジデータを取得
                await fetchAvailableBadges(); // ★ await を追加

                // --- バッジ分類と表示ロジック ---
                const limitedBadges = allAvailableBadges
                    .filter(b => b.isLimited)
                    .sort((a, b) => a.price - b.price);

                const nonLimitedBadges = allAvailableBadges.filter(b => !b.isLimited);

                const rateBadgeIds = new Set(nonLimitedBadges.filter(b => b.badgeId.startsWith('badge-rate-')).map(b => b.badgeId));
                const matchBadgeIds = new Set(nonLimitedBadges.filter(b => b.badgeId.startsWith('badge-matches-')).map(b => b.badgeId));

                const rateBadges = nonLimitedBadges.filter(b => rateBadgeIds.has(b.badgeId)).sort((a, b) => (a.requiredRate || 0) - (b.requiredRate || 0));
                const matchBadges = nonLimitedBadges.filter(b => matchBadgeIds.has(b.badgeId)).sort((a, b) => (a.requiredMatches || 0) - (b.requiredMatches || 0));
                const normalBadges = nonLimitedBadges.filter(b => !rateBadgeIds.has(b.badgeId) && !matchBadgeIds.has(b.badgeId)).sort((a, b) => a.price - b.price);

                // 通常ショップアイテム表示
                let regularItemsExist = false;
                if (normalBadges.length > 0) {
                    addCategoryHeader(regularShopItemsGrid, "通常バッジ");
                    displayShopItems(userData, normalBadges, regularShopItemsGrid, null);
                    regularItemsExist = true;
                }
                if (rateBadges.length > 0) {
                    addCategoryHeader(regularShopItemsGrid, "レート達成記念");
                    displayShopItems(userData, rateBadges, regularShopItemsGrid, null);
                    regularItemsExist = true;
                }
                if (matchBadges.length > 0) {
                    addCategoryHeader(regularShopItemsGrid, "対戦数記念");
                    displayShopItems(userData, matchBadges, regularShopItemsGrid, null);
                    regularItemsExist = true;
                }
                if (!regularItemsExist && noRegularItemsMsg) {
                    noRegularItemsMsg.style.display = 'block';
                }

                // 期間限定ショップアイテム表示
                displayShopItems(userData, limitedBadges, limitedShopItemsGrid, noLimitedItemsMsg);
                // --- バッジ分類と表示ロジックここまで ---

            } else {
                // --- 未ログイン時の処理 ---
                const loginMessage = '<p class="notice-text">ショップを利用するには<a href="#" onclick="document.getElementById(\'g_id_signin\').click(); return false;">ログイン</a>してください。</p>';
                regularShopItemsGrid.innerHTML = loginMessage;
                limitedShopItemsGrid.innerHTML = loginMessage;
                userPointsDisplay.textContent = '---';
                if (playGachaButton) playGachaButton.disabled = true; // ガチャボタン無効化
            }
        } catch (error) { // ★ catch ブロックを追加
            console.error("Error initializing shop:", error);
            const errorMessage = `<p class="error-text">ショップ情報の読み込みに失敗しました: ${error.message}</p>`;
            regularShopItemsGrid.innerHTML = errorMessage;
            limitedShopItemsGrid.innerHTML = errorMessage;
        } finally { // ★ finally ブロックを追加
            regularShopLoading.style.display = 'none';
            limitedShopLoading.style.display = 'none';
            isInitializingShop = false; // ★ 処理完了時にフラグ解除
            console.log("[shop.js] initializeShop finished."); // ★ 終了ログ
        }
    }

    // ... (displayUserPoints, fetchAvailableBadges, displayShopItems, addCategoryHeader, handlePurchase, setButtonLoading, updatePurchaseButtonStates, ガチャ関連関数 は変更なし) ...
    /**
     * ユーザーポイント表示を更新
     * @param {number} points ポイント数
     */
    function displayUserPoints(points) {
        if (userPointsDisplay) {
            userPointsDisplay.textContent = points !== undefined ? points.toLocaleString() : '---';
        }
    }

    /**
     * 購入可能なバッジ一覧をAPIから取得
     * @returns {Promise<Array>} バッジデータの配列
     */
    async function fetchAvailableBadges() {
        try {
            const apiUrl = `${BACKEND_URL}/api/shop/badges`;
            // ★ ログインしている場合、トークンを送信して購入済み情報を取得するAPIに変更する可能性あり
            // const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
            // const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            // const response = await fetch(apiUrl, { headers });
            const response = await fetch(apiUrl); // 現状は認証不要
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `バッジ情報の取得に失敗しました (ステータス: ${response.status})` }));
                throw new Error(errorData.message || `バッジ情報の取得に失敗しました (ステータス: ${response.status})`);
            }
            const badges = await response.json();
            console.log("Fetched badges:", badges);
            allAvailableBadges = badges; // グローバル変数に保存
            return badges;
        } catch (error) {
            console.error("Error fetching available badges:", error);
            allAvailableBadges = []; // エラー時は空にする
            throw error; // エラーを呼び出し元に伝える
        }
    }

    /**
     * ショップアイテムをグリッドに表示 (常に追記する方式に変更)
     * @param {object} userData ユーザーデータ
     * @param {Array} badges 表示するバッジの配列
     * @param {HTMLElement} gridContainer 表示先のグリッド要素
     * @param {HTMLElement|null} noItemsMsgElement アイテムがない場合に表示するメッセージ要素
     */
    // ▼▼▼ append 引数を削除 ▼▼▼
    function displayShopItems(userData, badges, gridContainer, noItemsMsgElement) {
    // ▲▲▲ append 引数を削除 ▲▲▲

        // アイテムがない場合のメッセージ表示
        if (!badges || badges.length === 0) {
            // ▼▼▼ append チェックを削除 ▼▼▼
            if (noItemsMsgElement) {
            // ▲▲▲ append チェックを削除 ▲▲▲
                noItemsMsgElement.style.display = 'block';
            }
            return; // アイテムがなければここで終了
        } else {
             if (noItemsMsgElement) { // アイテムがあればメッセージ非表示
                 noItemsMsgElement.style.display = 'none';
             }
        }

        // 各バッジアイテムを生成してグリッドに追加
        badges.forEach(badge => {
            const badgeId = badge.badgeId;
            const name = badge.name;
            const description = badge.description;
            const price = badge.price;
            // バッジ画像パス取得 (script.jsの関数を使用)
            const imgPath = typeof window.getBadgeImagePath === 'function'
                            ? window.getBadgeImagePath(badgeId) // script.jsの関数が優先
                            : (badge.img || 'default.png'); // フォールバック (badge.imgもフラットパスを期待)
            const isLimited = badge.isLimited;
            const requiredRate = badge.requiredRate || 0;
            const requiredMatches = badge.requiredMatches || 0;

            // ユーザーの状態に基づいて購入可能か判定
            const isOwned = userData.badges && userData.badges.includes(badgeId);
            const canAfford = userData.points >= price;
            const meetsRateRequirement = requiredRate <= 0 || userData.rate >= requiredRate;
            const meetsMatchRequirement = requiredMatches <= 0 || (userData.matchCount || 0) >= requiredMatches;

            // アイテムカード要素を作成
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('shop-item-card');
            if (isOwned) itemDiv.classList.add('owned');
            if (isLimited) itemDiv.classList.add('limited-item');
            if (!isOwned && !meetsRateRequirement) itemDiv.classList.add('rate-insufficient');
            if (!isOwned && !meetsMatchRequirement) itemDiv.classList.add('matches-insufficient');

            // 購入条件テキスト生成
            let requirementText = '';
            if (requiredRate > 0) {
                requirementText += `<p class="shop-item-requirement">必要レート: ${requiredRate}</p>`;
            }
            if (requiredMatches > 0) {
                requirementText += `<p class="shop-item-requirement">必要対戦数: ${requiredMatches}</p>`;
            }

            // カードのHTML構造
            itemDiv.innerHTML = `
                <div class="shop-item-badge-display">
                    <img src="${imgPath}" alt="${name}">
                </div>
                <div class="shop-item-details">
                    <h3 class="shop-item-name">${name}</h3>
                    <p class="shop-item-description">${description}</p>
                    ${requirementText}
                    <p class="shop-item-price">${price.toLocaleString()} P</p>
                </div>
                <button class="button shop-buy-button" data-badge-id="${badgeId}" ${isOwned ? 'disabled' : ''}>
                    ${isOwned ? '購入済み' : '購入する'}
                </button>
            `;

            // 購入ボタンの状態とイベントリスナーを設定
            const buyButton = itemDiv.querySelector('.shop-buy-button');
            if (!isOwned) { // 未所有の場合のみボタンを有効化する可能性あり
                if (!meetsRateRequirement) {
                    buyButton.disabled = true;
                    buyButton.textContent = 'レート不足';
                } else if (!meetsMatchRequirement) {
                    buyButton.disabled = true;
                    buyButton.textContent = '対戦数不足';
                } else if (!canAfford) {
                    buyButton.disabled = true;
                    buyButton.textContent = 'ポイント不足';
                } else {
                    // 購入可能な場合
                    buyButton.disabled = false;
                    buyButton.textContent = '購入する';
                    buyButton.onclick = () => handlePurchase(badge); // 購入処理関数を紐付け
                }
            } else {
                 buyButton.onclick = null; // 購入済みならクリックイベント不要
            }

            // グリッドにアイテムを追加
            // ▼▼▼ appendChild で常に追加 ▼▼▼
            gridContainer.appendChild(itemDiv);
            // ▲▲▲ appendChild で常に追加 ▲▲▲
        });
    }

    /**
     * グリッドにカテゴリーヘッダーを追加
     * @param {HTMLElement} gridContainer グリッド要素
     * @param {string} title ヘッダータイトル
     */
    function addCategoryHeader(gridContainer, title) {
        const header = document.createElement('h3');
        header.classList.add('shop-category-header');
        header.textContent = title;
        header.style.gridColumn = '1 / -1'; // グリッドの全幅を使う
        gridContainer.appendChild(header);
    }

    /**
     * バッジ購入処理
     * @param {object} badgeToBuy 購入するバッジのデータ
     */
    async function handlePurchase(badgeToBuy) {
        const currentUserData = window.MyApp?.currentUserData;
        if (!currentUserData) {
            alert("購入処理を行うにはログインが必要です。");
            return;
        }

        // 購入条件を再チェック
        const badgeId = badgeToBuy.badgeId;
        const price = badgeToBuy.price;
        const requiredRate = badgeToBuy.requiredRate || 0;
        const requiredMatches = badgeToBuy.requiredMatches || 0;
        const name = badgeToBuy.name;

        const isOwned = currentUserData.badges && currentUserData.badges.includes(badgeId);
        const canAfford = currentUserData.points >= price;
        const meetsRateRequirement = requiredRate <= 0 || currentUserData.rate >= requiredRate;
        const meetsMatchRequirement = requiredMatches <= 0 || (currentUserData.matchCount || 0) >= requiredMatches;

        if (isOwned) { alert('このバッジは既に所有しています。'); return; }
        if (!meetsRateRequirement) { alert(`レートが不足しています。(必要レート: ${requiredRate})`); return; }
        if (!meetsMatchRequirement) { alert(`対戦数が不足しています。(必要対戦数: ${requiredMatches})`); return; }
        if (!canAfford) { alert('ポイントが不足しています。'); return; }

        // 購入確認
        if (confirm(`${name} (${price} P) を購入しますか？`)) {
            const buyButton = document.querySelector(`.shop-buy-button[data-badge-id="${badgeId}"]`);
            setButtonLoading(buyButton, true, '購入処理中...'); // ボタンをローディング状態に

            try {
                // APIリクエスト
                const apiUrl = `${BACKEND_URL}/api/shop/purchase`;
                const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
                if (!token) throw new Error('ログインが必要です。');

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ badgeId: badgeId })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: `購入処理に失敗しました (ステータス: ${response.status})` }));
                    throw new Error(errorData.message || `購入処理に失敗しました (ステータス: ${response.status})`);
                }

                const result = await response.json();
                console.log('Purchase successful:', result);

                // グローバルユーザーデータとUIを更新
                if (window.MyApp?.currentUserData) {
                    // ポイントとバッジリストを更新
                    window.MyApp.currentUserData.points = result.newPoints;
                    window.MyApp.currentUserData.badges = result.updatedBadges;

                    // 更新データをlocalStorageに保存 (script.jsの関数呼び出し)
                    if (typeof window.saveCurrentUserData === 'function') {
                        window.saveCurrentUserData();
                    } else {
                        console.warn("saveCurrentUserData function not found.");
                    }

                    // ヘッダーのポイント表示を更新 (script.jsの関数呼び出し)
                    if (typeof window.updateUserPoints === 'function') {
                        window.updateUserPoints(result.newPoints);
                    } else if (typeof window.updateHeaderUI === 'function') {
                         // updateUserPoints がなければ updateHeaderUI で代用
                         window.updateHeaderUI(window.MyApp.currentUserData);
                    } else {
                        console.warn("updateUserPoints or updateHeaderUI function not found.");
                    }

                    // ショップ内のポイント表示を更新
                    displayUserPoints(result.newPoints);

                    // 購入ボタンの状態を全体的に更新
                    updatePurchaseButtonStates(
                        result.newPoints,
                        window.MyApp.currentUserData.rate,
                        window.MyApp.currentUserData.matchCount || 0,
                        result.updatedBadges
                    );
                    // ガチャボタンの状態も更新
                    updateGachaButtonState(result.newPoints);

                    alert(`${name} を購入しました！`);

                } else {
                    // 通常ここには来ないはずだが、念のため
                    console.warn("window.MyApp.currentUserData is not available after purchase.");
                    alert('購入処理中にエラーが発生しました。ページを更新します。');
                    window.location.reload(); // ページリロードで対応
                }

            } catch (error) {
                console.error('Error purchasing badge:', error);
                alert(`購入に失敗しました: ${error.message}`);
                // エラー発生時もボタン状態を最新に保つ
                updatePurchaseButtonStates(
                    window.MyApp?.currentUserData?.points,
                    window.MyApp?.currentUserData?.rate,
                    window.MyApp?.currentUserData?.matchCount || 0,
                    window.MyApp?.currentUserData?.badges
                );
                updateGachaButtonState(window.MyApp?.currentUserData?.points || 0);
            } finally {
                 setButtonLoading(buyButton, false); // ボタンのローディング解除
            }
        }
    }

    /**
     * ボタンのローディング状態を設定/解除
     * @param {HTMLElement} button 対象ボタン
     * @param {boolean} isLoading ローディング中か
     * @param {string} [loadingText='処理中...'] ローディング中のテキスト
     */
    function setButtonLoading(button, isLoading, loadingText = '処理中...') {
        if (!button) return;
        button.disabled = isLoading;
        if (isLoading) {
            button.dataset.originalText = button.textContent; // 元のテキストを保存
            // スピナーを追加してテキストを設定
            button.innerHTML = `<span class="spinner-small" style="margin-right: 5px;"></span>${loadingText}`;
        } else {
            // 元のテキストに戻す
            button.innerHTML = button.dataset.originalText || '購入する'; // デフォルトテキストを修正
            if (button.dataset.originalText) delete button.dataset.originalText; // 保存したテキストを削除
        }
    }

    /**
     * すべての購入ボタンの状態を更新
     * @param {number} currentPoints 現在のポイント
     * @param {number} currentRate 現在のレート
     * @param {number} currentMatchCount 現在の対戦数
     * @param {Array} ownedBadgeIds 所有バッジIDの配列
     */
    function updatePurchaseButtonStates(currentPoints, currentRate, currentMatchCount, ownedBadgeIds) {
        console.log("[shop.js] Updating purchase button states...");
        if (!allAvailableBadges || allAvailableBadges.length === 0) {
            console.warn("[shop.js] Cannot update button states: allAvailableBadges is empty.");
            return;
        }
        const safeOwnedBadgeIds = ownedBadgeIds || []; // null/undefined対策

        // ページ内の全ての購入ボタンを取得
        document.querySelectorAll('.shop-buy-button').forEach(button => {
            const badgeId = button.dataset.badgeId;
            const badgeData = allAvailableBadges.find(b => b.badgeId === badgeId);
            const card = button.closest('.shop-item-card'); // ボタンが含まれるカード要素

            if (!badgeData || !card) return; // データやカードが見つからない場合はスキップ

            // 最新のユーザー情報で状態を再評価
            const isOwned = safeOwnedBadgeIds.includes(badgeId);
            const requiredRate = badgeData.requiredRate || 0;
            const requiredMatches = badgeData.requiredMatches || 0;
            const price = badgeData.price;
            const meetsRateRequirement = requiredRate <= 0 || currentRate >= requiredRate;
            const meetsMatchRequirement = requiredMatches <= 0 || currentMatchCount >= requiredMatches;
            const canAfford = currentPoints >= price;

            // カードのクラスをリセット
            card.classList.remove('owned', 'rate-insufficient', 'matches-insufficient');
            // ボタンのローディング状態を解除 (念のため)
            setButtonLoading(button, false);

            // ボタンの状態を更新
            if (isOwned) {
                button.disabled = true;
                button.textContent = '購入済み';
                card.classList.add('owned');
                button.onclick = null; // クリックイベント解除
            } else if (!meetsRateRequirement) {
                button.disabled = true;
                button.textContent = 'レート不足';
                card.classList.add('rate-insufficient');
                button.onclick = null;
            } else if (!meetsMatchRequirement) {
                button.disabled = true;
                button.textContent = '対戦数不足';
                card.classList.add('matches-insufficient');
                button.onclick = null;
            } else if (!canAfford) {
                button.disabled = true;
                button.textContent = 'ポイント不足';
                button.onclick = null;
            } else {
                // 購入可能な場合
                button.disabled = false;
                button.textContent = '購入する';
                if (!button.onclick) { // 重複設定を防ぐ
                    button.onclick = () => handlePurchase(badgeData);
                }
            }
        });
        console.log("[shop.js] Purchase button states updated.");
    }

    // --- ▼▼▼ ガチャ関連関数 ▼▼▼ ---

    /**
     * ガチャボタンの状態を更新
     * @param {number} currentPoints 現在のポイント
     */
    function updateGachaButtonState(currentPoints) {
        if (!playGachaButton) return;
        const canPlay = currentPoints >= GACHA_COST_DISPLAY;
        playGachaButton.disabled = !canPlay;
        playGachaButton.title = canPlay ? '' : 'ポイントが不足しています'; // ツールチップ設定
    }

    /**
     * ガチャ実行処理
     */
    async function handlePlayGacha() {
        if (!window.MyApp?.isUserLoggedIn) {
            alert("ガチャを引くにはログインが必要です。");
            return;
        }
        if (playGachaButton.disabled) {
            // ポイント不足などで無効化されている場合は何もしない
            return;
        }

        console.log("[shop.js] Playing gacha...");
        setGachaButtonLoading(true); // ローディング開始
        if (gachaErrorMessage) gachaErrorMessage.style.display = 'none'; // エラーメッセージ非表示

        try {
            // APIリクエスト
            const apiUrl = `${BACKEND_URL}/api/shop/gacha`;
            const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : null;
            if (!token) throw new Error('ログインが必要です。');

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json(); // レスポンスボディをJSONとして解析

            if (!response.ok) {
                // APIがエラーを返した場合
                console.error("Gacha API error:", result);
                throw new Error(result.message || `ガチャの実行に失敗しました (ステータス: ${response.status})`);
            }

            console.log("Gacha successful:", result);

            // グローバルユーザーデータ更新
            if (window.MyApp?.currentUserData) {
                window.MyApp.currentUserData.points = result.newPoints;
                window.MyApp.currentUserData.badges = result.updatedBadges;
                // localStorageに保存
                if (typeof window.saveCurrentUserData === 'function') {
                    window.saveCurrentUserData();
                }
                // ヘッダーUI更新
                if (typeof window.updateUserPoints === 'function') {
                    window.updateUserPoints(result.newPoints);
                }
            }

            // ショップ内のUI更新
            displayUserPoints(result.newPoints); // ポイント表示更新
            updateGachaButtonState(result.newPoints); // ガチャボタン状態更新
            // 購入ボタンの状態も更新 (ガチャで引いたバッジが購入可能リストにあれば「購入済み」にするため)
            updatePurchaseButtonStates(
                result.newPoints,
                window.MyApp?.currentUserData?.rate,
                window.MyApp?.currentUserData?.matchCount || 0,
                result.updatedBadges
            );

            // 結果モーダル表示
            showGachaResultModal(result.wonBadge, result.newPoints);

        } catch (error) {
            console.error('Error playing gacha:', error);
            // エラーメッセージ表示
            if (gachaErrorMessage) {
                gachaErrorMessage.textContent = error.message;
                gachaErrorMessage.style.display = 'block';
            } else {
                alert(`ガチャエラー: ${error.message}`); // フォールバック
            }
            // エラー発生時もポイントを再確認してボタン状態を更新
            updateGachaButtonState(window.MyApp?.currentUserData?.points || 0);
        } finally {
            setGachaButtonLoading(false); // ローディング終了
        }
    }

    /**
     * ガチャボタンのローディング表示を設定/解除
     * @param {boolean} isLoading ローディング中か
     */
    function setGachaButtonLoading(isLoading) {
        if (!playGachaButton || !gachaButtonSpinner) return;
        playGachaButton.disabled = isLoading; // ローディング中は無効化
        gachaButtonSpinner.style.display = isLoading ? 'inline-block' : 'none'; // スピナー表示/非表示

        // ボタンテキストを取得・変更 (スピナーが最初の子要素でない場合を考慮)
        const textNode = Array.from(playGachaButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        if (textNode) {
            // ローディング状態に応じてテキストを変更
            textNode.textContent = isLoading ? ' 処理中...' : ' ガチャを引く';
        }
    }

    /**
     * ガチャ結果モーダルを表示
     * @param {object} wonBadge 獲得したバッジ情報
     * @param {number} newPoints 更新後のポイント
     */
    function showGachaResultModal(wonBadge, newPoints) {
        if (!gachaResultModal || !wonBadge) return; // モーダル要素やバッジ情報がない場合は処理しない

        // バッジ画像パス取得
        const imgPath = typeof window.getBadgeImagePath === 'function'
                        ? window.getBadgeImagePath(wonBadge.badgeId)
                        : (wonBadge.img || 'default.png'); // wonBadge.imgもフラットパスを期待

        // モーダル内の要素に情報を設定
        if (gachaResultBadgeImg) {
            gachaResultBadgeImg.src = imgPath;
            gachaResultBadgeImg.alt = wonBadge.name;
        }
        if (gachaResultName) gachaResultName.textContent = wonBadge.name;
        if (gachaResultDesc) gachaResultDesc.textContent = wonBadge.description;
        if (gachaResultNewPoints) gachaResultNewPoints.textContent = newPoints.toLocaleString();

        // レアリティ表示 (あれば)
        if (gachaResultRarity && gachaRarityValue && wonBadge.rarity) {
            gachaRarityValue.textContent = wonBadge.rarity; // レアリティテキスト設定
            gachaRarityValue.className = `rarity-${wonBadge.rarity}`; // スタイル用クラス設定
            gachaResultRarity.style.display = 'block'; // レアリティ表示要素を表示
        } else if (gachaResultRarity) {
            gachaResultRarity.style.display = 'none'; // レアリティ情報がなければ非表示
        }

        // モーダルを表示
        gachaResultModal.style.display = 'flex';
    }

    /**
     * ガチャ結果モーダルを非表示
     */
    function closeGachaResultModal() {
        if (gachaResultModal) {
            gachaResultModal.style.display = 'none';
        }
    }

    // --- イベントリスナー設定 ---
    // ガチャボタンのクリックイベント
    playGachaButton?.addEventListener('click', handlePlayGacha);
    // ガチャ結果モーダルの閉じるボタン
    closeGachaResultButton?.addEventListener('click', closeGachaResultModal);
    // モーダル外クリックで閉じる
    gachaResultModal?.addEventListener('click', (event) => {
        if (event.target === gachaResultModal) { // モーダルの背景部分をクリックした場合
            closeGachaResultModal();
        }
    });
    // --- ▲▲▲ ガチャ関連関数 ▲▲▲ ---

}); // DOMContentLoaded end
