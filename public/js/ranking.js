// frontend/ranking.js

// バックエンドURLは script.js の window.MyApp.BACKEND_URL を参照

// --- グローバル変数・状態管理 ---
let currentRankingType = 'rate'; // 'rate' or 'matches'
let currentSearchQuery = '';
let currentPage = 1;
const itemsPerPage = 15; // 1ページあたりの表示件数 (APIと合わせる)
let totalPages = 1;

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
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    if (noResultsIndicator) noResultsIndicator.style.display = 'none';
    if (paginationContainer) paginationContainer.style.display = 'none';

    try {
        // APIエンドポイントを構築 (クエリパラメータを追加)
        const apiUrl = `${window.MyApp.BACKEND_URL}/api/ranking?type=${type}&page=${page}&limit=${itemsPerPage}&search=${encodeURIComponent(search)}`;

        const response = await fetch(apiUrl);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("API Response Data:", data);

        return data;

    } catch (error) {
        console.error(`Error fetching ranking data:`, error);
        if (noResultsIndicator) {
            noResultsIndicator.textContent = `データの読み込みに失敗しました: ${error.message}`;
            noResultsIndicator.style.display = 'block';
        }
        return { ranking: [], currentPage: 1, totalPages: 0, totalUsers: 0 };
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}

/**
 * 表彰台を表示/更新する
 * @param {Array<object>} topPlayers 上位プレイヤーデータ (最大3名)
 * @param {string} type 'rate' or 'matches'
 */
function displayPodium(topPlayers, type) {
    const places = ['1st', '2nd', '3rd'];
    places.forEach((place, index) => {
        const player = topPlayers[index]; // 1ページ目のデータから取得
        const elements = podiumElements[place];

        if (elements) { // DOM要素が存在するか確認
            if (player) {
                if (elements.pic) {
                    elements.pic.src = player.picture || 'images/placeholder-avatar.png';
                    elements.pic.alt = player.name || 'プレイヤー';
                }
                if (elements.name) elements.name.textContent = player.name || 'プレイヤー';
                if (elements.value) {
                    elements.value.textContent = type === 'rate'
                        ? (player.rate ?? '----')
                        : (player.matches ?? '--');
                }
            } else {
                // プレイヤーデータがない場合はプレースホルダー表示
                if (elements.pic) {
                    elements.pic.src = 'images/placeholder-avatar.png';
                    elements.pic.alt = `${index + 1}位`;
                }
                if (elements.name) elements.name.textContent = `${index + 1}位プレイヤー`;
                if (elements.value) elements.value.textContent = '----';
            }
        }
    });
}

/**
 * ランキングデータをテーブルに表示する
 * @param {Array<object>} rankingData 表示するランキングデータ (APIから取得したもの)
 */
function displayRankingTable(rankingData) {
    if (!rankingTableBody) return;
    rankingTableBody.innerHTML = '';

    const currentUserSub = window.MyApp?.currentUserData?.sub;

    if (!rankingData || rankingData.length === 0) {
        if (noResultsIndicator) {
            noResultsIndicator.style.display = 'block';
            noResultsIndicator.textContent = currentSearchQuery ? '検索結果が見つかりませんでした。' : 'ランキングデータがありません。';
        }
        return;
    }
    if (noResultsIndicator) noResultsIndicator.style.display = 'none';

    rankingData.forEach((player) => {
        const row = document.createElement('tr');
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

    const createPageButton = (text, pageNum, isDisabled = false, isActive = false) => {
        const button = document.createElement('button');
        button.textContent = text;
        button.classList.add('button', 'button-secondary');
        if (isDisabled) button.disabled = true;
        if (isActive) button.classList.add('active');
        button.addEventListener('click', () => {
            currentPage = pageNum;
            updateRankingView();
        });
        return button;
    };

    const createEllipsis = () => {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.style.padding = '0 8px';
        ellipsis.style.alignSelf = 'center';
        return ellipsis;
    };

    // 「前へ」ボタン
    paginationContainer.appendChild(createPageButton('前へ', current - 1, current === 1));

    // ページ番号ボタン
    const maxPagesToShow = 5;
    let startPage = Math.max(1, current - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(total, startPage + maxPagesToShow - 1);
    startPage = Math.max(1, endPage - maxPagesToShow + 1); // endPage に合わせて startPage を再調整

    if (startPage > 1) {
        paginationContainer.appendChild(createPageButton('1', 1));
        if (startPage > 2) {
            paginationContainer.appendChild(createEllipsis());
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationContainer.appendChild(createPageButton(i.toString(), i, i === current, i === current));
    }

     if (endPage < total) {
        if (endPage < total - 1) {
            paginationContainer.appendChild(createEllipsis());
        }
        paginationContainer.appendChild(createPageButton(total.toString(), total));
    }

    // 「次へ」ボタン
    paginationContainer.appendChild(createPageButton('次へ', current + 1, current === total));
}


/**
 * ランキング表示全体を更新する (API呼び出しとUI更新)
 */
async function updateRankingView() {
    try {
        const data = await fetchRankingData(currentRankingType, currentPage, currentSearchQuery);

        currentPage = data.currentPage;
        totalPages = data.totalPages;

        // 表彰台表示: 常にAPIから返されたランキングデータの先頭3名を表示
        // (APIが常にソート済みで、かつ検索結果もソート済みであることを期待)
        displayPodium(data.ranking.slice(0, 3), currentRankingType);

        displayRankingTable(data.ranking);
        setupPagination(data.totalPages, data.currentPage);

    } catch (error) {
        console.error("Error updating ranking view:", error);
        // fetchRankingData内でエラー表示済み
    }
}

/**
 * 検索処理
 */
function handleSearch() {
    currentSearchQuery = searchInput.value.trim();
    currentPage = 1;
    updateRankingView();
}

/**
 * ランキング種別変更処理
 * @param {string} newType 'rate' or 'matches'
 */
function handleTypeChange(newType) {
    if (newType === currentRankingType) {
        if (currentSearchQuery !== '') {
            currentSearchQuery = '';
            if (searchInput) searchInput.value = '';
            currentPage = 1;
            updateRankingView();
        }
        return;
    }
    currentRankingType = newType;
    currentPage = 1;
    // currentSearchQuery は維持する（種別変更時に検索クエリをリセットしない仕様）

    rankTypeButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.rankType === newType);
    });
    updateRankingView();
}

/**
 * テーブル行クリック処理 (マイページへ遷移)
 * @param {Event} event
 */
function handleRowClick(event) {
    const clickedRow = event.target.closest('tr');
    if (clickedRow && clickedRow.dataset.userId) {
        const userId = clickedRow.dataset.userId;
        console.log(`User ID: ${userId} row clicked. Navigating to mypage.`);
        window.location.href = `mypage.html?userId=${encodeURIComponent(userId)}`;
    }
}

// --- イベントリスナー設定 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("ランキングページ読み込み完了");

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

    // 初期表示
    updateRankingView();

    // ログイン状態の変化を監視
    if (typeof window.onLoginStatusChange === 'function') {
        window.onLoginStatusChange((user) => {
            console.log("ログイン状態変更検知 (ランキングページ)");
            const currentUserSub = user ? user.sub : null;
            if (rankingTableBody) {
                const rows = rankingTableBody.querySelectorAll('tr');
                rows.forEach(row => {
                    row.classList.toggle('current-user-rank', currentUserSub && row.dataset.userId === currentUserSub);
                });
            }
        });
    } else {
        console.warn("onLoginStatusChange 関数が定義されていません。ログイン状態の動的な反映は行われません。");
    }
});
