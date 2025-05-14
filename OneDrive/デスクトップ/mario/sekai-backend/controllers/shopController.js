// controllers/shopController.js
const Badge = require('../models/Badge');
const User = require('../models/User');

// --- ガチャ設定 ---
const GACHA_COST = 200; // ★ ガチャ1回のコストを200に変更
// ガチャ対象バッジの条件 (createBadge.js の設定に合わせる)
const GACHA_POOL_QUERY = { price: 0, isLimited: false };
// レアリティ別排出重み (数値が大きいほど出やすい。合計値である必要はない)
const RARITY_WEIGHTS = {
    common: 10, // 例: 出やすい
    rare: 3,
    epic: 1,    // 例: 出にくい
};

// --- ▼▼▼ バッジ図鑑用の関数を追加 ▼▼▼ ---
/**
 * バッジ図鑑用に全てのバッジ情報を取得する
 * GET /api/badges/all (新しいルートを想定)
 */
exports.getAllBadgesForDex = async (req, res) => {
    try {
        // 全てのバッジを取得 (期間限定を優先、次に名前順でソート)
        const allBadges = await Badge.find({}).sort({ isLimited: -1, name: 1 });
        res.status(200).json(allBadges);
    } catch (error) {
        console.error('Error fetching all badges for dex:', error);
        res.status(500).json({ message: 'Error fetching all badges', error: error.message });
    }
};
// --- ▲▲▲ バッジ図鑑用の関数を追加 ▲▲▲ ---


/**
 * ガチャを実行するコントローラー関数
 * POST /api/shop/gacha
 */
exports.playGacha = async (req, res) => {
    // 認証ミドルウェア (protect) が適用されているため req.user は存在する想定
    try {
        const user = req.user; // 認証済みユーザー情報

        // 1. ポイントが足りているかチェック
        if (!user || user.points < GACHA_COST) {
            return res.status(400).json({ message: 'ガチャを引くためのポイントが不足しています。' });
        }

        // 2. ガチャ対象のバッジをデータベースから取得
        const gachaPool = await Badge.find(GACHA_POOL_QUERY);
        if (!gachaPool || gachaPool.length === 0) {
            console.error('ガチャの対象となるバッジが見つかりません。createBadge.jsの設定を確認してください。');
            return res.status(500).json({ message: 'ガチャの準備ができていません。' });
        }

        // 3. ユーザーがまだ持っていないバッジを抽出
        const ownedBadges = new Set(user.badges || []);
        const availableBadges = gachaPool.filter(badge => !ownedBadges.has(badge.badgeId));

        // 4. 未所持バッジがない場合 (コンプリート済み)
        if (availableBadges.length === 0) {
            return res.status(400).json({ message: 'おめでとうございます！このガチャから獲得できるバッジは全て集めました！' });
        }

        // 5. 排出するバッジを抽選 (レアリティに基づく重み付け抽選)
        let selectedBadge = null;
        const totalWeight = availableBadges.reduce((sum, badge) => {
            // rarity が未定義の場合は 'common' として扱う
            const rarity = badge.rarity || 'common';
            const weight = RARITY_WEIGHTS[rarity] || RARITY_WEIGHTS.common; // 重みが未定義なら common 扱い
            return sum + weight;
        }, 0);

        if (totalWeight <= 0) {
             console.error('ガチャの重み合計が0以下です。RARITY_WEIGHTSの設定を確認してください。');
             // 重みがない場合はランダムに1つ選ぶフォールバック
             selectedBadge = availableBadges[Math.floor(Math.random() * availableBadges.length)];
        } else {
            let randomNum = Math.random() * totalWeight;
            for (const badge of availableBadges) {
                const rarity = badge.rarity || 'common';
                const weight = RARITY_WEIGHTS[rarity] || RARITY_WEIGHTS.common;
                if (randomNum < weight) {
                    selectedBadge = badge;
                    break;
                }
                randomNum -= weight;
            }
        }


        // フォールバック (万が一抽選できなかった場合、ランダムに1つ選ぶ)
        if (!selectedBadge) {
            console.warn('重み付け抽選でバッジが選択されませんでした。ランダムに選択します。');
            selectedBadge = availableBadges[Math.floor(Math.random() * availableBadges.length)];
        }

        // --- ガチャ実行 ---
        // 6. ユーザーのポイントを減算
        user.points -= GACHA_COST;

        // 7. 獲得したバッジをユーザーの所有リストに追加
        // user.badges が undefined の場合を考慮して初期化
        if (!user.badges) {
            user.badges = [];
        }
        user.badges.push(selectedBadge.badgeId);

        // 8. 変更をデータベースに保存
        await user.save();
        console.log(`User ${user.name} played Gacha and got: ${selectedBadge.name} (${selectedBadge.badgeId})`);

        // 9. フロントエンドに結果を返す
        res.status(200).json({
            message: 'ガチャ成功！新しいバッジを獲得しました！',
            newPoints: user.points, // 更新後のポイント
            wonBadge: { // 獲得したバッジの情報
                badgeId: selectedBadge.badgeId,
                name: selectedBadge.name,
                description: selectedBadge.description,
                img: selectedBadge.img, // 画像パス
                rarity: selectedBadge.rarity || 'common' // レアリティ
            },
            updatedBadges: user.badges, // 更新後の全バッジリスト
        });

    } catch (error) {
        console.error('ガチャ実行中にエラーが発生しました:', error);
        res.status(500).json({ message: 'ガチャの実行中にエラーが発生しました。', error: error.message });
    }
};


// --- 既存のショップ機能 ---

/**
 * 販売中のバッジ一覧取得 (ショップ用)
 * GET /api/shop/badges
 */
exports.getAvailableBadges = async (req, res) => {
    try {
        // price > 0 のバッジのみ取得 (ガチャ対象外)
        // isLimited: -1 で期間限定を優先、price: 1 で価格昇順
        const badges = await Badge.find({ price: { $gt: 0 } }).sort({ isLimited: -1, price: 1 });
        res.status(200).json(badges);
    } catch (error) {
        console.error('Error fetching purchasable badges:', error); // エラーログを改善
        res.status(500).json({ message: 'Error fetching purchasable badges', error: error.message });
    }
};

/**
 * バッジ購入処理
 * POST /api/shop/purchase
 */
exports.purchaseBadge = async (req, res) => {
    // 認証ミドルウェア (protect) が適用されているため req.user は存在する想定
    try {
        const user = req.user;
        const { badgeId } = req.body;

        if (!badgeId) { // badgeId が送られてきているか基本的なチェック
            return res.status(400).json({ message: '購入するバッジのIDを指定してください。' });
        }

        const badgeToBuy = await Badge.findOne({ badgeId });
        if (!badgeToBuy) {
            return res.status(404).json({ message: '指定されたバッジが見つかりません。' });
        }

        // ガチャ対象のバッジは購入できないようにする (price === 0)
        if (badgeToBuy.price <= 0) {
            return res.status(400).json({ message: 'このバッジはガチャでのみ入手可能です。' });
        }

        // 1. 既に所有しているかチェック
        if (user.badges && user.badges.includes(badgeId)) {
            return res.status(400).json({ message: 'このバッジは既に所有しています。' });
        }

        // 2. ポイントが足りているかチェック
        if (user.points < badgeToBuy.price) {
            return res.status(400).json({ message: 'ポイントが不足しています。' });
        }

        // 3. レート制限をチェック (requiredRate > 0 の場合のみ)
        if (badgeToBuy.requiredRate > 0 && user.rate < badgeToBuy.requiredRate) {
            return res.status(400).json({ message: `レートが不足しています。必要レート: ${badgeToBuy.requiredRate}` });
        }

        // 4. 対戦数制限をチェック (requiredMatches > 0 の場合のみ)
        console.log(`[Shop Purchase Check] User: ${user.name}, Badge: ${badgeId}`);
        console.log(` ---> User Match Count: ${user.matchCount} (Type: ${typeof user.matchCount})`);
        console.log(` ---> Badge Required Matches: ${badgeToBuy.requiredMatches} (Type: ${typeof badgeToBuy.requiredMatches})`);

        if (badgeToBuy.requiredMatches > 0 && (user.matchCount || 0) < badgeToBuy.requiredMatches) {
            console.log(`[Shop Purchase Check] FAILED: Matches insufficient.`);
            return res.status(400).json({ message: `対戦数が不足しています。必要対戦数: ${badgeToBuy.requiredMatches}` });
        }

        // --- 購入実行 ---
        user.points -= badgeToBuy.price;
        if (!user.badges) {
            user.badges = [];
        }
        user.badges.push(badgeId);

        await user.save();
        console.log(`User ${user.name} purchased badge: ${badgeId}`);

        res.status(200).json({
            message: 'バッジを購入しました！',
            newPoints: user.points,
            purchasedBadgeId: badgeId,
            updatedBadges: user.badges,
        });

    } catch (error) {
        console.error('バッジ購入処理中にエラーが発生しました:', error);
        res.status(500).json({ message: 'バッジの購入処理中にエラーが発生しました。', error: error.message });
    }
};
