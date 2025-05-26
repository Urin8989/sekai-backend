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
    console.log(`Workspaceing ranking data - Type: ${type}, Page: ${page}, Search: "${search}"`);
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    if (noResultsIndicator) noResultsIndicator.style.display = 'none';
    if (paginationContainer) paginationContainer.style.display = 'none';

    try {
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
        const player = topPlayers[index];
        const elements = podiumElements[place];

        if (elements) {
            if (player) {
                if (elements.pic) {
                    elements.pic.src = player.picture || getDefaultAvatarPath(); // getDefaultAvatarPath を使用
                    elements.pic.alt = player.name || 'プレイヤー';
                    elements.pic.onerror = () => { elements.pic.src = getDefaultAvatarPath(); };
                }
                if (elements.name) elements.name.textContent = player.name || 'プレイヤー';
                if (elements.value) {
                    elements.value.textContent = type === 'rate'
                        ? (player.rate ?? '----')
                        : (player.matches ?? '--');
                }
            } else {
                if (elements.pic) {
                    elements.pic.src = getDefaultAvatarPath();
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
 * @param {Array<object>} rankingData 表示するランキングデータ
 */
function displayRankingTable(rankingData) {
    if (!rankingTableBody) return;
    rankingTableBody.innerHTML = '';
    const currentUserSub = window.MyApp?.currentUserData?.sub;
    const defaultAvatar = getDefaultAvatarPath();

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
        const imgSrc = player.picture || defaultAvatar;
        row.innerHTML = `
            <td class="rank-col">${player.rank ?? '-'}</td>
            <td class="name-col">
                <img src="${imgSrc}" alt="${player.name || '不明'}" class="rank-avatar" onerror="this.onerror=null; this.src='${defaultAvatar}';">
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
 * @param {number} total 総ページ数
 * @param {number} current 現在のページ
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

    paginationContainer.appendChild(createPageButton('前へ', current - 1, current === 1));
    const maxPagesToShow = 5;
    let startPage = Math.max(1, current - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(total, startPage + maxPagesToShow - 1);
    startPage = Math.max(1, endPage - maxPagesToShow + 1);

    if (startPage > 1) {
        paginationContainer.appendChild(createPageButton('1', 1));
        if (startPage > 2) paginationContainer.appendChild(createEllipsis());
    }
    for (let i = startPage; i <= endPage; i++) {
        paginationContainer.appendChild(createPageButton(i.toString(), i, false, i === current));
    }
    if (endPage < total) {
        if (endPage < total - 1) paginationContainer.appendChild(createEllipsis());
        paginationContainer.appendChild(createPageButton(total.toString(), total));
    }
    paginationContainer.appendChild(createPageButton('次へ', current + 1, current === total));
}

/**
 * ランキング表示全体を更新する
 */
async function updateRankingView() {
    try {
        const data = await fetchRankingData(currentRankingType, currentPage, currentSearchQuery);
        currentPage = data.currentPage;
        totalPages = data.totalPages;
        displayPodium(data.ranking.slice(0, 3), currentRankingType);
        displayRankingTable(data.ranking);
        setupPagination(data.totalPages, data.currentPage);
    } catch (error) {
        console.error("Error updating ranking view:", error);
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

    rankTypeButtons.forEach(button => {
        button.classList.toggle('active', button.dataset.rankType === newType);
    });

    // ▼▼▼ bodyにクラスを付け替える処理を追加 ▼▼▼
    document.body.classList.remove('show-ranking-rate', 'show-ranking-matches');
    if (newType === 'rate') {
        document.body.classList.add('show-ranking-rate');
    } else if (newType === 'matches') {
        document.body.classList.add('show-ranking-matches');
    }
    // ▲▲▲ ここまで ▲▲▲

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

// デフォルトアバターパス取得関数 (script.js にはないのでここで定義)
const getDefaultAvatarPath = () => {
    // script.jsのgetBadgeImagePathと同様のロジックで環境判定するか、
    // script.jsで MyApp.DEFAULT_AVATAR_PATH のようなグローバル変数を設定してそれを使う。
    // ここでは、サーバーのルートからの絶対パスとして解決されることを期待。
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '/public/images/default_avatar.svg';
    } else {
        return '/images/default_avatar.svg';
    }
};

// --- イベントリスナー設定 ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("ランキングページ読み込み完了");

    if (searchButton) {
        searchButton.addEventListener('click', handleSearch);
    }
    if (searchInput) {
        searchInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') handleSearch();
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

    // ▼▼▼ 初期表示時のクラス設定を追加 ▼▼▼
    if (currentRankingType === 'rate') {
        document.body.classList.add('show-ranking-rate');
    } else if (currentRankingType === 'matches') {
        document.body.classList.add('show-ranking-matches');
    }
    // ▲▲▲ ここまで ▲▲▲

    updateRankingView(); // 初期表示

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
        console.warn("onLoginStatusChange 関数が定義されていません。");
    }
});