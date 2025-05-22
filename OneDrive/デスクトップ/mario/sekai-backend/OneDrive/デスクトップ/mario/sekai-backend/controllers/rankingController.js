// controllers/rankingController.js
const User = require('../models/User');

exports.getRanking = async (req, res) => {
    const { type = 'rate', search = '', page = 1, limit = 15 } = req.query;
    try {
        const query = {};
        if (search) query.name = { $regex: search, $options: 'i' };

        const sortOptions = {};
        if (type === 'matches') {
            sortOptions.matchCount = -1; // 対戦数降順
        } else {
            sortOptions.rate = -1; // レート降順 (デフォルト)
        }
        sortOptions.name = 1; // 同率の場合は名前昇順

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        const users = await User.find(query)
                                .sort(sortOptions)
                                .skip(skip)
                                .limit(limitNum)
                                .select('googleId name picture rate matchCount'); // 必要な情報のみ

        const totalUsers = await User.countDocuments(query);

        // フロントが期待する形式に整形 (rankプロパティを追加)
        const rankingData = users.map((user, index) => ({
            rank: skip + index + 1,
            sub: user.googleId, // フロントの dataset.userId 用
            name: user.name,
            picture: user.picture,
            rate: user.rate,
            matches: user.matchCount,
        }));

        res.status(200).json({
            ranking: rankingData,
            currentPage: pageNum,
            totalPages: Math.ceil(totalUsers / limitNum),
            totalUsers: totalUsers
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching ranking', error: error.message });
    }
};
