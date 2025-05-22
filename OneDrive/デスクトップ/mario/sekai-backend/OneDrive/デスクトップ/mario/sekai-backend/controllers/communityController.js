// controllers/communityController.js
const Community = require('../models/Community');
const User = require('../models/User');
const CommunityChatMessage = require('../models/CommunityChatMessage');
const mongoose = require('mongoose'); // ObjectIdの比較などに必要

// --- コミュニティ一覧取得 ---
exports.getCommunities = async (req, res) => {
    try {
        const communities = await Community.find()
            .populate('organizer', 'name googleId picture') // 主催者情報を取得
            .sort({ createdAt: -1 }); // 例: 作成日時の降順

        // フロントエンドが期待する形式に整形
        const communitiesWithDetails = communities.map(community => {
            const communityObj = community.toObject({ virtuals: true }); // 仮想プロパティを含める

            return {
                id: communityObj._id, // MongoDBの_idをidとして返す
                name: communityObj.name,
                description: communityObj.description,
                organizerId: communityObj.organizer?._id, // ObjectId (必要なら)
                organizerGoogleId: communityObj.organizer?.googleId, // ★ フロントエンドが利用
                organizerName: communityObj.organizer?.name || '不明', // ★ フロントエンドが利用
                organizerPicture: communityObj.organizer?.picture, // ★ フロントエンドが利用
                participantsLimit: communityObj.participantsLimit,
                currentParticipants: communityObj.currentParticipantsCount, // ★ 仮想プロパティを使用
                joinPoints: communityObj.joinPoints,
                createdAt: communityObj.createdAt,
            };
        });

        res.status(200).json(communitiesWithDetails);
    } catch (error) {
        console.error('Error fetching communities:', error);
        res.status(500).json({ message: 'Error fetching communities', error: error.message });
    }
};

// --- コミュニティ作成 ---
exports.createCommunity = async (req, res) => {
    // protectミドルウェアにより req.user は存在する想定
    try {
        // ▼▼▼ フロントエンドからのフィールド名に合わせる ▼▼▼
        const { name, description, participantsLimit } = req.body;
        // ▲▲▲ 修正 ▲▲▲
        const organizerId = req.user._id; // 認証ユーザーのMongoDB ID

        // バリデーション (基本的なもの)
        // ★ サニタイズ (簡易版: HTMLタグ除去)
        const sanitize = (str) => typeof str === 'string' ? str.replace(/<[^>]*>?/gm, '') : str;
        // ▼▼▼ フロントエンドからのフィールド名に合わせる ▼▼▼
        if (!name || !participantsLimit) {
            return res.status(400).json({ message: 'Community name and participants limit are required.' });
        }
        if (name.length > 50) return res.status(400).json({ message: 'コミュニティ名は50文字以内で入力してください。' });
        if (description && description.length > 200) return res.status(400).json({ message: 'コミュニティ説明は200文字以内で入力してください。' });
        const limit = parseInt(participantsLimit, 10);
        // ▲▲▲ 修正 ▲▲▲
        if (isNaN(limit) || limit < 2 || limit > 24) {
            return res.status(400).json({ message: 'Participants limit must be between 2 and 24.' });
        }

        const newCommunity = new Community({
            name: sanitize(name), // ★ サニタイズ
            description: sanitize(description), // ★ サニタイズ
            organizer: organizerId,
            participantsLimit: limit,
            participants: [organizerId], // 作成者を最初の参加者として追加
            // joinPoints: 0, // 必要なら設定
        });

        const savedCommunity = await newCommunity.save();

        // populateして返す (フロントエンドが必要な情報を付与)
        const populatedCommunity = await Community.findById(savedCommunity._id)
                                            .populate('organizer', 'name googleId picture');

        // フロントエンドが期待する形式に整形
        const responseCommunity = {
            id: populatedCommunity._id,
            name: populatedCommunity.name,
            description: populatedCommunity.description,
            organizerId: populatedCommunity.organizer?._id,
            organizerGoogleId: populatedCommunity.organizer?.googleId,
            organizerName: populatedCommunity.organizer?.name || '不明',
            organizerPicture: populatedCommunity.organizer?.picture,
            participantsLimit: populatedCommunity.participantsLimit,
            currentParticipants: populatedCommunity.participants.length,
            joinPoints: populatedCommunity.joinPoints,
            createdAt: populatedCommunity.createdAt,
        };


        console.log(`Community created: ${savedCommunity.name} by ${req.user.name}`);
        res.status(201).json(responseCommunity); // 201 Created

    } catch (error) {
        console.error('Error creating community:', error);
        res.status(500).json({ message: 'Error creating community', error: error.message });
    }
};

// --- コミュニティ参加 ---
exports.joinCommunity = async (req, res) => {
    // protectミドルウェアにより req.user は存在する想定
    try {
        const communityId = req.params.communityId;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        // 既にメンバーかチェック
        const isAlreadyMember = community.participants.some(participantId => participantId.equals(userId));
        if (isAlreadyMember) {
            return res.status(400).json({ message: 'You are already a member of this community' });
        }

        // 定員チェック
        if (community.participants.length >= community.participantsLimit) {
            return res.status(400).json({ message: 'Community is full' });
        }

        // 参加処理
        community.participants.push(userId);
        await community.save();

        // ポイント付与 (参加ポイントがある場合)
        let pointsEarned = community.joinPoints || 0;
        let currentUserPoints = req.user.points;
        if (pointsEarned > 0) {
            req.user.points += pointsEarned;
            await req.user.save();
            currentUserPoints = req.user.points; // 更新後のポイント
        }

        console.log(`User ${req.user.name} joined community: ${community.name}`);
        res.status(200).json({
            message: 'Successfully joined community',
            currentParticipants: community.participants.length, // 更新後の参加者数
            pointsEarned: pointsEarned,
            currentUserPoints: currentUserPoints // 更新後のユーザーポイント
        });

    } catch (error) {
        console.error('Error joining community:', error);
        res.status(500).json({ message: 'Error joining community', error: error.message });
    }
};

// --- コミュニティ脱退 ---
exports.leaveCommunity = async (req, res) => {
    // protectミドルウェアにより req.user は存在する想定
    try {
        const communityId = req.params.communityId;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        // 主催者は脱退できない（削除のみ）
        if (community.organizer.equals(userId)) {
            return res.status(400).json({ message: 'Organizer cannot leave the community. You can delete it instead.' });
        }

        // 参加者リストから削除
        const initialLength = community.participants.length;
        community.participants = community.participants.filter(participantId => !participantId.equals(userId));

        // 実際に削除されたか確認
        if (community.participants.length === initialLength) {
            return res.status(400).json({ message: 'You are not a member of this community' });
        }

        await community.save();

        console.log(`User ${req.user.name} left community: ${community.name}`);
        res.status(200).json({
            message: 'Successfully left community',
            currentParticipants: community.participants.length // 更新後の参加者数
        });

    } catch (error) {
        console.error('Error leaving community:', error);
        res.status(500).json({ message: 'Error leaving community', error: error.message });
    }
};

// --- コミュニティ削除 ---
exports.deleteCommunity = async (req, res) => {
    // protectミドルウェアにより req.user は存在する想定
    try {
        const communityId = req.params.communityId;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        // 主催者のみ削除可能
        if (!community.organizer.equals(userId)) {
            return res.status(403).json({ message: 'Only the organizer can delete this community' });
        }

        // コミュニティに関連するチャットメッセージも削除 (オプション)
        await CommunityChatMessage.deleteMany({ communityId: communityId });

        // コミュニティを削除
        await Community.findByIdAndDelete(communityId);


        console.log(`Community ${community.name} deleted by organizer ${req.user.name}`);
        res.status(200).json({ message: 'Community deleted successfully' });

    } catch (error) {
        console.error('Error deleting community:', error);
        res.status(500).json({ message: 'Error deleting community', error: error.message });
    }
};

// --- 参加者リスト取得 ---
exports.getCommunityParticipants = async (req, res) => {
    try {
        const communityId = req.params.communityId;

        const community = await Community.findById(communityId)
                                        .populate('participants', 'googleId name picture'); // 参加者の指定フィールドを取得

        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        // フロントエンドが期待する形式に整形 (googleId を sub にするなど)
        const participants = community.participants.map(p => ({
            sub: p.googleId, // ★ googleId を sub として返す
            name: p.name,
            picture: p.picture,
            // 必要なら他のフィールドも
        }));

        res.status(200).json(participants);

    } catch (error) {
        console.error('Error fetching community participants:', error);
        res.status(500).json({ message: 'Error fetching community participants', error: error.message });
    }
};


// --- チャットメッセージ取得 ---
exports.getChatMessages = async (req, res) => {
    // 認証ミドルウェア (protect) が適用されている想定
    try {
        const communityId = req.params.communityId;
        const userId = req.user._id; // 認証ユーザーのID

        // 1. コミュニティ存在確認 & ユーザーが参加者か確認
        const community = await Community.findById(communityId).select('participants organizer');
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }
        // ObjectId と ObjectId を比較
        const isMember = community.participants.some(id => id.equals(userId)) || community.organizer.equals(userId);
        if (!isMember) {
            return res.status(403).json({ message: 'You are not a member of this community' });
        }

        // 2. チャットメッセージを取得 (最新の50件など、制限を設けることを推奨)
        // ▼▼▼ .populate を追加 ▼▼▼
        const messages = await CommunityChatMessage.find({ communityId: communityId })
            .sort({ timestamp: -1 }) // 新しい順
            .limit(50) // 例: 最新50件
            .populate('sender', 'googleId name picture'); // 送信者情報を取得 (googleId, name, picture を指定)
        // ▲▲▲ .populate を追加 ▲▲▲

        // 3. フロントエンドが期待する形式に整形 (古い順に戻す)
        const formattedMessages = messages.reverse().map(msg => ({
            id: msg._id, // メッセージID
            communityId: msg.communityId,
            // ▼▼▼ sender オブジェクトから情報を取得 ▼▼▼
            senderId: msg.sender?.googleId, // 送信者のGoogle ID (フロントは sub を期待)
            senderName: msg.sender?.name || '不明なユーザー', // 送信者の名前
            senderPicture: msg.sender?.picture, // 送信者の画像URL (フロントで利用)
            // ▲▲▲ sender オブジェクトから情報を取得 ▲▲▲
            text: msg.text,
            timestamp: msg.timestamp,
            // ▼▼▼ メッセージタイプを追加 (フロントエンドの appendChatMessage に合わせる) ▼▼▼
            type: 'community_chat_message' // 固定でチャットメッセージタイプを指定
            // ▲▲▲ メッセージタイプを追加 ▲▲▲
        }));

        res.status(200).json(formattedMessages);

    } catch (error) {
        console.error('Error fetching chat messages:', error);
        res.status(500).json({ message: 'Error fetching chat messages', error: error.message });
    }
};

// --- (任意) 単一コミュニティ取得API ---
exports.getCommunityById = async (req, res) => {
    try {
        const communityId = req.params.communityId;
        const community = await Community.findById(communityId)
                                        .populate('organizer', 'name googleId picture');

        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        // フロントエンドが期待する形式に整形
        const responseCommunity = {
            id: community._id,
            name: community.name,
            description: community.description,
            organizerId: community.organizer?._id,
            organizerGoogleId: community.organizer?.googleId, // ★ 追加
            organizerName: community.organizer?.name || '不明',
            organizerPicture: community.organizer?.picture, // ★ 追加
            participantsLimit: community.participantsLimit,
            currentParticipants: community.participants.length, // 参加者数を計算
            joinPoints: community.joinPoints,
            createdAt: community.createdAt,
            // participants: community.participants // 必要なら参加者のIDリストも返す
        };

        res.status(200).json(responseCommunity);
    } catch (error) {
        console.error(`Error fetching community by ID ${req.params.communityId}:`, error);
        res.status(500).json({ message: 'Error fetching community details', error: error.message });
    }
};
