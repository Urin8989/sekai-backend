// createBadge.js
const mongoose = require('mongoose');
const config = require('./config/setting');
const Badge = require('./models/Badge');
const connectDB = require('./config/db');

const badgesData = [
  // --- ガチャ対象: 基本バッジ ---
 

  // --- ガチャ対象外: レート達成記念バッジ ---
  {
    badgeId: 'badge-rate-1600',
    name: 'レート1600達成',
    description: 'レート1600に到達した証。さらなる高みへ！',
    price: 1600, // ガチャ対象外 (価格は残す or 別のフラグ)
    img: 'badge-rate-1600.svg',
    isLimited: false,
    requiredRate: 1600,
    requiredMatches: 0
  },
  {
    badgeId: 'badge-rate-1700',
    name: 'レート1700達成',
    description: 'レート1700の領域へ。熟練の技が光る。',
    price: 1700, // ガチャ対象外
    img: 'badge-rate-1700.svg',
    isLimited: false,
    requiredRate: 1700,
    requiredMatches: 0
  },
  {
    badgeId: 'badge-rate-1800',
    name: 'レート1800達成',
    description: 'レート1800到達！トッププレイヤーへの登竜門。',
    price: 1800, // ガチャ対象外
    img: 'badge-rate-1800.svg',
    isLimited: false,
    requiredRate: 1800,
    requiredMatches: 0
  },
  {
    badgeId: 'badge-rate-1900',
    name: 'レート1900達成',
    description: 'レート1900！頂点はもう目前。',
    price: 1900, // ガチャ対象外
    img: 'badge-rate-1900.svg',
    isLimited: false,
    requiredRate: 1900,
    requiredMatches: 0
  },
  {
    badgeId: 'badge-rate-2000',
    name: 'レート2000達成',
    description: 'レート2000の頂きへ！伝説の始まり。',
    price: 2000, // ガチャ対象外
    img: 'badge-rate-2000.svg',
    isLimited: false,
    requiredRate: 2000,
    requiredMatches: 0
  },

  // --- ガチャ対象外: 対戦数記念バッジ ---
  {
    badgeId: 'badge-matches-100',
    name: '100戦記念',
    description: '100回の対戦を経験したベテランの印。',
    price: 1000, // ガチャ対象外
    img: 'badge-100matches.svg',
    isLimited: false,
    requiredRate: 0,
    requiredMatches: 100
  },
  {
    badgeId: 'badge-matches-300',
    name: '300戦記念',
    description: '300回の激戦を乗り越えた歴戦の証。',
    price: 1500, // ガチャ対象外
    img: 'badge-300matches.svg',
    isLimited: false,
    requiredRate: 0,
    requiredMatches: 300
  },
  {
    badgeId: 'badge-matches-1000',
    name: '1000戦記念',
    description: '1000戦達成！数多のライバルと競い合った勲章。',
    price: 3000, // ガチャ対象外
    img: 'badge-1000matches.svg',
    isLimited: false,
    requiredRate: 0,
    requiredMatches: 1000
  },
  {
    badgeId: 'badge-matches-5000',
    name: '5000戦記念',
    description: '5000戦もの対戦を走り抜けた伝説的な記録。',
    price: 5000, // ガチャ対象外
    img: 'badge-5000matches.svg',
    isLimited: false,
    requiredRate: 0,
    requiredMatches: 5000
  },
  {
    badgeId: 'badge-matches-10000',
    name: '10000戦記念',
    description: '10000戦達成！もはや生きる伝説。',
    price: 10000, // ガチャ対象外
    img: 'badge-10000matches.svg',
    isLimited: false,
    requiredRate: 0,
    requiredMatches: 10000
  },

  // --- ガチャ対象外: 期間限定バッジ ---
  

  // --- ガチャ対象: 新しい動物バッジ ---
  { badgeId: 'badge-animal-cat', name: '気まぐれキャット', description: '猫のように自由気ままな走りの証。', price: 0, img: 'badge-animal-cat.jpg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'common' },
  { badgeId: 'badge-animal-dog', name: '忠犬レーサー', description: '信頼できる相棒のような安定した走り。', price: 0, img: 'badge-animal-dog.jpg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'common' },
  { badgeId: 'badge-animal-rabbit', name: '脱兎のごとく', description: '驚異的な加速力を持つ証。', price: 0, img: 'badge-animal-rabbit.jpg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'rare' },
  { badgeId: 'badge-animal-wolf', name: '孤高の狼', description: '単独走行で真価を発揮する。', price: 0, img: 'badge-animal-wolf.jpg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'rare' },
  { badgeId: 'badge-animal-eagle', name: 'イーグルアイ', description: 'コース全体を見渡す広い視野を持つ。', price: 0, img: 'badge-animal-eagle.jpg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'epic' },
  { badgeId: 'badge-animal-bear', name: 'パワフルベア', description: '力強い走りで他を圧倒する。', price: 0, img: 'badge-animal-bear.jpg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'rare' },
  { badgeId: 'badge-animal-fox', name: '賢者のキツネ', description: '巧みな戦略で勝利を掴む。', price: 0, img: 'badge-animal-fox.jpg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'epic' },
  // ... (さらに動物バッジを追加)

  // --- ガチャ対象: 新しい宝石バッジ ---
  { badgeId: 'badge-gem-ruby', name: '情熱のルビー', description: '燃えるような情熱を秘めた走り。', price: 0, img: 'badge-gem-ruby.svg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'rare' },
  { badgeId: 'badge-gem-sapphire', name: '冷静のサファイア', description: '常に冷静沈着な判断ができる証。', price: 0, img: 'badge-gem-sapphire.svg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'rare' },
  { badgeId: 'badge-gem-emerald', name: '癒やしのエメラルド', description: '安定感のあるスムーズな走り。', price: 0, img: 'badge-gem-emerald.svg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'rare' },
  { badgeId: 'badge-gem-diamond', name: '不屈のダイヤモンド', description: 'どんな逆境にも負けない強さを持つ。', price: 0, img: 'badge-gem-diamond.svg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'epic' },
  { badgeId: 'badge-gem-amethyst', name: '神秘のアメジスト', description: '予測不能なトリッキーな走り。', price: 0, img: 'badge-gem-amethyst.svg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'legendary' },
  { badgeId: 'badge-gem-topaz', name: '閃光のトパーズ', description: '一瞬の隙を突く鋭い走り。', price: 0, img: 'badge-gem-topaz.svg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'rare' },
  { badgeId: 'badge-gem-pearl', name: '純粋なパール', description: '洗練された美しい走り。', price: 0, img: 'badge-gem-pearl.svg', isLimited: false, requiredRate: 0, requiredMatches: 0, rarity: 'common' },
  // ... (さらに宝石バッジを追加)

  // --- 廃止するバッジ (コメントアウトまたは削除) ---
  // { badgeId: 'badge-streak-5', ... },
  // { badgeId: 'badge-top10', ... },
];

const seedDB = async () => {
    try {
        await connectDB();
        console.log('MongoDB Connected for seeding...');

        // --- 不要なバッジの削除処理 ---
        console.log('Checking for obsolete badges in the database...');
        const validBadgeIdsInScript = new Set();
        badgesData.forEach(badgeData => {
            if (badgeData.badgeId && typeof badgeData.badgeId === 'string' && badgeData.badgeId.trim() !== '') {
                validBadgeIdsInScript.add(badgeData.badgeId.trim());
            }
        });
        console.log(`Found ${validBadgeIdsInScript.size} valid badge IDs in the script.`);

        const existingBadgesInDB = await Badge.find({}, 'badgeId').lean();
        const existingBadgeIdsInDB = new Set(existingBadgesInDB.map(badge => badge.badgeId));
        console.log(`Found ${existingBadgeIdsInDB.size} badge IDs in the database.`);

        const idsToDelete = [];
        existingBadgeIdsInDB.forEach(dbId => {
            if (!validBadgeIdsInScript.has(dbId)) {
                idsToDelete.push(dbId);
            }
        });

        if (idsToDelete.length > 0) {
            console.log(`Found ${idsToDelete.length} obsolete badges to delete:`, idsToDelete);
            const deleteResult = await Badge.deleteMany({ badgeId: { $in: idsToDelete } });
            console.log(`Deleted ${deleteResult.deletedCount} obsolete badges from the database.`);
        } else {
            console.log('No obsolete badges found in the database.');
        }
        // --- 不要なバッジの削除処理ここまで ---

        // --- 既存の Upsert 処理 ---
        console.log('Upserting badges from the script...');
        let upsertedCount = 0;
        let skippedCount = 0;
        for (const badgeData of badgesData) {
            if (!badgeData.badgeId || typeof badgeData.badgeId !== 'string' || badgeData.badgeId.trim() === '') {
                console.warn(`Skipping badge data due to missing or invalid badgeId:`, badgeData.name || '(No name)');
                skippedCount++;
                continue;
            }

            // デフォルト値の設定
            badgeData.requiredMatches = badgeData.requiredMatches || 0;
            badgeData.requiredRate = badgeData.requiredRate || 0;
            // レアリティがない場合は 'common' をデフォルトに (ガチャ対象のみ)
            if (badgeData.price === 0 && !badgeData.rarity) {
                badgeData.rarity = 'common';
            }

            const result = await Badge.updateOne(
                { badgeId: badgeData.badgeId },
                { $set: badgeData },
                { upsert: true }
            );

            if (result.upsertedCount > 0) {
                console.log(`Inserted new badge: ${badgeData.badgeId}`);
                upsertedCount++;
            } else if (result.modifiedCount > 0) {
                console.log(`Updated existing badge: ${badgeData.badgeId}`);
                upsertedCount++;
            } else if (result.matchedCount > 0) {
                // console.log(`Badge already up-to-date: ${badgeData.badgeId}`);
            } else {
                 console.warn(`Badge processing result unknown for: ${badgeData.badgeId}`, result);
            }
        }
        console.log(`Finished upserting badges. Processed: ${upsertedCount}, Skipped: ${skippedCount}.`);
        // --- Upsert 処理ここまで ---

    } catch (err) {
        console.error('Error during badge seeding process:', err);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('MongoDB connection closed.');
        } else {
            console.log('MongoDB connection already closed or not established.');
        }
    }
};

seedDB();
