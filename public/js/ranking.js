// frontend/ranking.js

// ▼▼▼ バックエンドURLを定数として定義 ▼▼▼
    const BACKEND_URL = 'https://www.mariokartbestrivals.com'; // ★★★ Xserver上のサーバーアドレス ★★★
// ▲▲▲ ここまで追加 ▲▲▲

// --- グローバル変数・状態管理 ---
let currentRankingType = 'rate'; // 'rate' or 'matches'
let currentSearchQuery = '';
let currentPage = 1;
const itemsPerPage = 15; // 1ページあたりの表示件数 (APIと合わせる)
let totalPages = 1;
// let rankingCache = { ... }; // キャッシュは一旦削除 (必要なら後で再実装)
// let fullRankingData = []; // 検索用全データも不要に (API側で処理)

// --- DOM要素の取得 ---
const podiumElements = {
    '1st': {
        pic: document.getElementById('podium-1st-pic'),
        name: document.getElementById('podium-1st-name'),
        value: document.getElementById('podium-1st-rate')
    },
    '2nd': {
        pic: document.getElementById('podium-2nd-pic'),
        name: document.getElementById('podium-2nd-name'),
        value: document.getElementById('podium-2nd-rate')
    },
    '3rd': {
        pic: document.getElementById('podium-3rd-pic'),
        name: document.getElementById('podium-3rd-name'),
        value: document.getElementById('podium-3rd-rate')
    }
};
const searchInput = document.getElementById('ranking-search-input');
const searchButton = document.getElementById('ranking-search-button');
const rankTypeButtons = document.querySelectorAll('.ranking-type-selector button');
const rankingTableBody = document.getElementById('ranking-table-body');
const loadingIndicator = document.getElementById('ranking-loading');
const noResultsIndicator = document.getElementById('ranking-no-results');
const paginationContainer = document.getElementById('ranking-pagination');

// --- 関数定義 ---

/**
 * バックエンドからランキングデータを取得する
 * @param {string} type 'rate' or 'matches'
 * @param {number} page 取得するページ番号
 * @param {string} search 検索クエリ
 * @returns {Promise<{ranking: Array<object>, currentPage: number, totalPages: number, totalUsers: number}>} APIからのレスポンスデータ
 */
async function fetchRankingData(type, page, search) {
    console.log(`Fetching ranking data - Type: ${type}, Page: ${page}, Search: "${search}"`);
    loadingIndicator.style.display = 'block'; // ローディング表示開始
    noResultsIndicator.style.display = 'none';
    paginationContainer.style.display = 'none';

    try {
        // APIエンドポイントを構築 (クエリパラメータを追加)
        const apiUrl = `${BACKEND_URL}/api/ranking?type=${type}&page=${page}&limit=${itemsPerPage}&search=${encodeURIComponent(search)}`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("API Response Data:", data);

        // APIからのデータをそのまま返す (ページネーション情報も含む)
        return data;

    } catch (error) {
        console.error(`Error fetching ranking data:`, error);
        noResultsIndicator.textContent = `データの読み込みに失敗しました: ${error.message}`;
        noResultsIndicator.style.display = 'block';
        // エラー時は空のデータを返すか、エラーを投げる
        return { ranking: [], currentPage: 1, totalPages: 0, totalUsers: 0 }; // 空データを返す例
        // throw error; // エラーを投げる場合
    } finally {
        loadingIndicator.style.display = 'none'; // ローディング表示終了
    }
}

// applyFiltersAndPagination 関数は不要になったため削除

/**
 * 表彰台を表示/更新する
 * @param {Array<object>} topPlayers 上位プレイヤーデータ (最大3名)
 * @param {string} type 'rate' or 'matches'
 */
function displayPodium(topPlayers, type) {
    const places = ['1st', '2nd', '3rd'];
    places.forEach((place, index) => {
        const player = topPlayers[index];
        const elements = podiumElements[place];

        if (player && elements) {
            elements.pic.src = player.picture || 'images/placeholder-avatar.png';
            elements.pic.alt = player.name || 'プレイヤー';
            elements.name.textContent = player.name || 'プレイヤー';
            elements.value.textContent = type === 'rate'
                ? (player.rate ?? '----')
                : (player.matches ?? '--');
        } else if (elements) {
            elements.pic.src = 'images/placeholder-avatar.png';
            elements.pic.alt = `${index + 1}位`;
            elements.name.textContent = `${index + 1}位プレイヤー`;
            elements.value.textContent = '----';
        }
    });
}

/**
 * ランキングデータをテーブルに表示する
 * @param {Array<object>} rankingData 表示するランキングデータ (APIから取得したもの)
 */
function displayRankingTable(rankingData) {
    if (!rankingTableBody) return;
    rankingTableBody.innerHTML = ''; // テーブル内容をクリア

    const currentUserSub = window.currentUserData ? window.currentUserData.sub : null;

    if (!rankingData || rankingData.length === 0) {
        noResultsIndicator.style.display = 'block';
        noResultsIndicator.textContent = currentSearchQuery ? '検索結果が見つかりませんでした。' : 'ランキングデータがありません。';
        return;
    }
    noResultsIndicator.style.display = 'none';

    rankingData.forEach((player) => {
        const row = document.createElement('tr');
        // APIレスポンスの `sub` を userId として使用
        row.dataset.userId = player.sub;

        if (currentUserSub && player.sub === currentUserSub) {
            row.classList.add('current-user-rank');
        }

        row.innerHTML = `
            <td class="rank-col">${player.rank ?? '-'}</td>
            <td class="name-col">
                <img src="${player.picture || 'images/placeholder-avatar.png'}" alt="${player.name || '不明'}" class="rank-avatar">
                <span>${player.name || 'プレイヤー'}</span>
            </td>
            <td class="rate-col">${player.rate ?? '----'}</td>
            <td class="matches-col">${player.matches ?? '--'}</td>
        `;
        rankingTableBody.appendChild(row);
    });
}

/**
 * ページネーションUIを生成・更新する
 * @param {number} total 総ページ数 (APIから取得)
 * @param {number} current 現在のページ (APIから取得)
 */
function setupPagination(total, current) {
    if (!paginationContainer) return;
    paginationContainer.innerHTML = '';

    if (total <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    paginationContainer.style.display = 'flex';

    // 「前へ」ボタン
    const prevButton = document.createElement('button');
    prevButton.textContent = '前へ';
    prevButton.classList.add('button', 'button-secondary');
    prevButton.disabled = current === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateRankingView(); // APIを再呼び出し
        }
    });
    paginationContainer.appendChild(prevButton);

    // ページ番号ボタン
    const maxPagesToShow = 5;
    let startPage = Math.max(1, current - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(total, startPage + maxPagesToShow - 1);
    startPage = Math.max(1, endPage - maxPagesToShow + 1);

    if (startPage > 1) {
        const firstPageButton = document.createElement('button');
        firstPageButton.textContent = '1';
        firstPageButton.classList.add('button', 'button-secondary');
        firstPageButton.addEventListener('click', () => { currentPage = 1; updateRankingView(); });
        paginationContainer.appendChild(firstPageButton);
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.style.padding = '0 8px';
            ellipsis.style.alignSelf = 'center';
            paginationContainer.appendChild(ellipsis);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.classList.add('button', 'button-secondary');
        if (i === current) {
            pageButton.classList.add('active');
            pageButton.disabled = true;
        } else {
            pageButton.addEventListener('click', () => {
                currentPage = i;
                updateRankingView(); // APIを再呼び出し
            });
        }
        paginationContainer.appendChild(pageButton);
    }

     if (endPage < total) {
        if (endPage < total - 1) {
             const ellipsis = document.createElement('span');
             ellipsis.textContent = '...';
             ellipsis.style.padding = '0 8px';
             ellipsis.style.alignSelf = 'center';
             paginationContainer.appendChild(ellipsis);
        }
        const lastPageButton = document.createElement('button');
        lastPageButton.textContent = total;
        lastPageButton.classList.add('button', 'button-secondary');
        lastPageButton.addEventListener('click', () => { currentPage = total; updateRankingView(); });
        paginationContainer.appendChild(lastPageButton);
    }

    // 「次へ」ボタン
    const nextButton = document.createElement('button');
    nextButton.textContent = '次へ';
    nextButton.classList.add('button', 'button-secondary');
    nextButton.disabled = current === total;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updateRankingView(); // APIを再呼び出し
        }
    });
    paginationContainer.appendChild(nextButton);
}


/**
 * ランキング表示全体を更新する (API呼び出しとUI更新)
 */
async function updateRankingView() {
    // ローディング表示などは fetchRankingData 内で行う
    try {
        // APIからデータを取得
        const data = await fetchRankingData(currentRankingType, currentPage, currentSearchQuery);

        // グローバルなページネーション情報を更新
        currentPage = data.currentPage;
        totalPages = data.totalPages;

        // 表彰台表示 (検索クエリがなく、1ページ目の場合のみ)
        // APIが常にソート済みデータを返すなら、取得したデータの先頭3件で良い
        if (!currentSearchQuery && currentPage === 1 && data.ranking.length > 0) {
            displayPodium(data.ranking.slice(0, 3), currentRankingType);
        } else {
            // 検索中や2ページ目以降は表彰台をクリア
            displayPodium([], currentRankingType);
        }

        // テーブル表示
        displayRankingTable(data.ranking);

        // ページネーションUI更新
        setupPagination(data.totalPages, data.currentPage);

    } catch (error) {
        // fetchRankingData内でエラー表示済みなので、ここでは追加処理不要
        console.error("Error updating ranking view:", error);
    }
}

/**
 * 検索処理
 */
function handleSearch() {
    currentSearchQuery = searchInput.value.trim();
    currentPage = 1; // 検索時は1ページ目に戻る
    updateRankingView(); // APIを呼び出して更新
}

/**
 * ランキング種別変更処理
 * @param {string} newType 'rate' or 'matches'
 */
function handleTypeChange(newType) {
    if (newType === currentRankingType) {
        // 同じボタンが押された場合、検索をリセットする挙動は維持
        if (currentSearchQuery !== '') {
            console.log(`Resetting search because the same type button (${newType}) was clicked.`);
            currentSearchQuery = '';
            searchInput.value = '';
            currentPage = 1;
            // この後 updateRankingView が呼ばれる
        } else {
            console.log(`Same type button (${newType}) clicked, no search query. Doing nothing.`);
            return; // 何もせず終了
        }
    } else {
        // 異なる種別が選択された場合
        currentRankingType = newType;
        currentPage = 1;
        // currentSearchQuery = ''; // 種別変更時に検索をリセットするかどうかは仕様による
        // searchInput.value = '';

        // ボタンのアクティブ状態を更新
        rankTypeButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.rankType === newType);
        });
    }

    updateRankingView(); // APIを呼び出して更新
}

/**
 * テーブル行クリック処理 (マイページへ遷移)
 * @param {Event} event
 */
function handleRowClick(event) {
    const clickedRow = event.target.closest('tr');
    // APIレスポンスの `sub` (Google ID) を userId として使用
    if (clickedRow && clickedRow.dataset.userId) {
        const userId = clickedRow.dataset.userId;
        console.log(`User ID: ${userId} row clicked. Navigating to mypage.`);
        window.location.href = `mypage.html?userId=${encodeURIComponent(userId)}`;
    }
}

// --- イベントリスナー設定 ---

if (searchButton) {
    searchButton.addEventListener('click', handleSearch);
}
if (searchInput) {
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    });
}

rankTypeButtons.forEach(button => {
    button.addEventListener('click', () => {
        handleTypeChange(button.dataset.rankType);
    });
});

if (rankingTableBody) {
    rankingTableBody.addEventListener('click', handleRowClick);
}

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("ランキングページ読み込み完了");

    // 初期表示 (デフォルトはレート順、1ページ目、検索なし)
    updateRankingView();

    // ログイン状態の変化を監視
    if (typeof onLoginStatusChange === 'function') {
        onLoginStatusChange((user) => {
            console.log("ログイン状態変更検知 (ランキングページ)");
            // 自分のランクをハイライトするためにテーブルを再描画（API呼び出しは不要）
            const currentUserSub = user ? user.sub : null;
            const rows = rankingTableBody.querySelectorAll('tr');
            rows.forEach(row => {
                row.classList.toggle('current-user-rank', currentUserSub && row.dataset.userId === currentUserSub);
            });
        });
    } else {
        console.warn("onLoginStatusChange 関数が定義されていません。ログイン状態の動的な反映は行われません。");
    }
});
