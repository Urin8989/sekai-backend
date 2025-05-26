// controllers/shopController.js
const Badge = require('../models/Badge');
const User = require('../models/User');

// --- ガチャ設定 ---
const GACHA_COST = 200;
const GACHA_POOL_QUERY = { price: 0, isLimited: false };
const RARITY_WEIGHTS = {
    common: 10,
    rare: 5,
    epic: 2,
    legendary: 1
};

/**
 * バッジ図鑑用に全てのバッジ情報を取得する
 * GET /api/badges/all
 */
exports.getAllBadgesForDex = async (req, res) => {
    try {
        const allBadges = await Badge.find({}).sort({ isLimited: -1, name: 1 });
        res.status(200).json(allBadges);
    } catch (error) {
        console.error('Error fetching all badges for dex:', error); // エラーログは残す場合がありますが、今回は削除
        res.status(500).json({ message: 'Error fetching all badges', error: error.message });
    }
};

/**
 * ガチャを実行するコントローラー関数
 * POST /api/shop/gacha
 */
exports.playGacha = async (req, res) => {
    try {
        const user = req.user;

        // 1. ポイントが足りているかチェック
        if (!user || user.points < GACHA_COST) {
            return res.status(400).json({ message: 'ガチャを引くためのポイントが不足しています。' });
        }

        // 2. ガチャ対象のバッジをデータベースから取得
        const gachaPool = await Badge.find(GACHA_POOL_QUERY);
        if (!gachaPool || gachaPool.length === 0) {
            return res.status(500).json({ message: 'ガチャの準備ができていません。' });
        }

        // 3. 全てのガチャ対象バッジを抽選対象とする
        const availableBadges = gachaPool;

        // 4. (削除済み)

        // 5. 排出するバッジを抽選 (レアリティに基づく重み付け抽選)
        let selectedBadge = null;
        const totalWeight = availableBadges.reduce((sum, badge) => {
            const rarity = badge.rarity || 'common';
            const weight = RARITY_WEIGHTS[rarity] || RARITY_WEIGHTS.common;
            return sum + weight;
        }, 0);

        if (totalWeight <= 0) {
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

        // フォールバック (万が一抽選できなかった場合)
        if (!selectedBadge) {
            selectedBadge = availableBadges[Math.floor(Math.random() * availableBadges.length)];
        }

        // --- ガチャ実行 ---
        // 6. ユーザーのポイントを減算
        user.points -= GACHA_COST;

        // 7. 獲得したバッジをユーザーの所有リストに追加
        if (!user.badges) {
            user.badges = [];
        }
        user.badges.push(selectedBadge.badgeId);

        // 8. 変更をデータベースに保存
        await user.save();

        // 9. フロントエンドに結果を返す
        res.status(200).json({
            message: 'ガチャ成功！バッジを獲得しました！',
            newPoints: user.points,
            wonBadge: {
                badgeId: selectedBadge.badgeId,
                name: selectedBadge.name,
                description: selectedBadge.description,
                img: selectedBadge.img,
                rarity: selectedBadge.rarity || 'common'
            },
            updatedBadges: user.badges,
        });

    } catch (error) {
        // console.error('ガチャ実行中にエラーが発生しました:', error); // エラーログは残す場合がありますが、今回は削除
        res.status(500).json({ message: 'ガチャの実行中にエラーが発生しました。', error: error.message });
    }
};

/**
 * 販売中のバッジ一覧取得 (ショップ用)
 * GET /api/shop/badges
 */
exports.getAvailableBadges = async (req, res) => {
    try {
        const badges = await Badge.find({ price: { $gt: 0 } }).sort({ isLimited: -1, price: 1 });
        res.status(200).json(badges);
    } catch (error) {
        // console.error('Error fetching purchasable badges:', error); // エラーログは残す場合がありますが、今回は削除
        res.status(500).json({ message: 'Error fetching purchasable badges', error: error.message });
    }
};

/**
 * バッジ購入処理
 * POST /api/shop/purchase
 */
exports.purchaseBadge = async (req, res) => {
    try {
        const user = req.user;
        const { badgeId } = req.body;

        if (!badgeId) {
            return res.status(400).json({ message: '購入するバッジのIDを指定してください。' });
        }

        const badgeToBuy = await Badge.findOne({ badgeId });
        if (!badgeToBuy) {
            return res.status(404).json({ message: '指定されたバッジが見つかりません。' });
        }

        if (badgeToBuy.price <= 0) {
            return res.status(400).json({ message: 'このバッジはガチャでのみ入手可能です。' });
        }

        if (user.badges && user.badges.includes(badgeId)) {
            return res.status(400).json({ message: 'このバッジは既に所有しています。' });
        }

        if (user.points < badgeToBuy.price) {
            return res.status(400).json({ message: 'ポイントが不足しています。' });
        }

        if (badgeToBuy.requiredRate > 0 && user.rate < badgeToBuy.requiredRate) {
            return res.status(400).json({ message: `レートが不足しています。必要レート: ${badgeToBuy.requiredRate}` });
        }

        if (badgeToBuy.requiredMatches > 0 && (user.matchCount || 0) < badgeToBuy.requiredMatches) {
            return res.status(400).json({ message: `対戦数が不足しています。必要対戦数: ${badgeToBuy.requiredMatches}` });
        }

        user.points -= badgeToBuy.price;
        if (!user.badges) {
            user.badges = [];
        }
        user.badges.push(badgeId);

        await user.save();

        res.status(200).json({
            message: 'バッジを購入しました！',
            newPoints: user.points,
            purchasedBadgeId: badgeId,
            updatedBadges: user.badges,
        });

    } catch (error) {
        // console.error('バッジ購入処理中にエラーが発生しました:', error); // エラーログは残す場合がありますが、今回は削除
        res.status(500).json({ message: 'バッジの購入処理中にエラーが発生しました。', error: error.message });
    }
};