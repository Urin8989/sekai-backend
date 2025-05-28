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

        const communitiesWithDetails = communities.map(community => {
            const communityObj = community.toObject({ virtuals: true });

            return {
                id: communityObj._id,
                name: communityObj.name,
                description: communityObj.description,
                organizerId: communityObj.organizer?._id,
                organizerGoogleId: communityObj.organizer?.googleId,
                organizerName: communityObj.organizer?.name || '不明',
                organizerPicture: communityObj.organizer?.picture,
                participantsLimit: communityObj.participantsLimit,
                currentParticipants: communityObj.currentParticipantsCount,
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
    try {
        const { name, description, participantsLimit } = req.body;
        const organizerId = req.user._id;

        const sanitize = (str) => typeof str === 'string' ? str.replace(/<[^>]*>?/gm, '') : str;
        if (!name || !participantsLimit) {
            return res.status(400).json({ message: 'Community name and participants limit are required.' });
        }
        if (name.length > 50) return res.status(400).json({ message: 'コミュニティ名は50文字以内で入力してください。' });
        if (description && description.length > 200) return res.status(400).json({ message: 'コミュニティ説明は200文字以内で入力してください。' });
        const limit = parseInt(participantsLimit, 10);
        if (isNaN(limit) || limit < 2 || limit > 24) {
            return res.status(400).json({ message: 'Participants limit must be between 2 and 24.' });
        }

        const newCommunity = new Community({
            name: sanitize(name),
            description: sanitize(description),
            organizer: organizerId,
            participantsLimit: limit,
            participants: [organizerId],
        });

        const savedCommunity = await newCommunity.save();
        const populatedCommunity = await Community.findById(savedCommunity._id)
                                            .populate('organizer', 'name googleId picture');

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
        res.status(201).json(responseCommunity);

    } catch (error) {
        console.error('Error creating community:', error);
        res.status(500).json({ message: 'Error creating community', error: error.message });
    }
};

// --- コミュニティ参加 ---
exports.joinCommunity = async (req, res) => {
    try {
        const communityId = req.params.communityId;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        const isAlreadyMember = community.participants.some(participantId => participantId.equals(userId));
        if (isAlreadyMember) {
            return res.status(400).json({ message: 'You are already a member of this community' });
        }

        if (community.participants.length >= community.participantsLimit) {
            return res.status(400).json({ message: 'Community is full' });
        }

        community.participants.push(userId);
        await community.save();

        let pointsEarned = community.joinPoints || 0;
        let currentUserPoints = req.user.points;
        if (pointsEarned > 0) {
            req.user.points += pointsEarned;
            await req.user.save();
            currentUserPoints = req.user.points;
        }

        console.log(`User ${req.user.name} joined community: ${community.name}`);
        res.status(200).json({
            message: 'Successfully joined community',
            currentParticipants: community.participants.length,
            pointsEarned: pointsEarned,
            currentUserPoints: currentUserPoints
        });

    } catch (error) {
        console.error('Error joining community:', error);
        res.status(500).json({ message: 'Error joining community', error: error.message });
    }
};

// --- コミュニティ脱退 ---
exports.leaveCommunity = async (req, res) => {
    try {
        const communityId = req.params.communityId;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        if (community.organizer.equals(userId)) {
            return res.status(400).json({ message: 'Organizer cannot leave the community. You can delete it instead.' });
        }

        const initialLength = community.participants.length;
        community.participants = community.participants.filter(participantId => !participantId.equals(userId));

        if (community.participants.length === initialLength) {
            return res.status(400).json({ message: 'You are not a member of this community' });
        }

        await community.save();

        console.log(`User ${req.user.name} left community: ${community.name}`);
        res.status(200).json({
            message: 'Successfully left community',
            currentParticipants: community.participants.length
        });

    } catch (error) {
        console.error('Error leaving community:', error);
        res.status(500).json({ message: 'Error leaving community', error: error.message });
    }
};

// --- コミュニティ削除 ---
exports.deleteCommunity = async (req, res) => {
    try {
        const communityId = req.params.communityId;
        const userId = req.user._id;

        const community = await Community.findById(communityId);
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        if (!community.organizer.equals(userId)) {
            return res.status(403).json({ message: 'Only the organizer can delete this community' });
        }

        await CommunityChatMessage.deleteMany({ communityId: communityId });
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
                                        .populate('participants', 'googleId name picture');

        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        const participants = community.participants.map(p => ({
            sub: p.googleId,
            name: p.name,
            picture: p.picture,
        }));

        res.status(200).json(participants);

    } catch (error) {
        console.error('Error fetching community participants:', error);
        res.status(500).json({ message: 'Error fetching community participants', error: error.message });
    }
};

// --- チャットメッセージ取得 ---
exports.getChatMessages = async (req, res) => {
    try {
        const communityId = req.params.communityId;
        const userId = req.user._id;

        const community = await Community.findById(communityId).select('participants organizer');
        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }
        const isMember = community.participants.some(id => id.equals(userId)) || community.organizer.equals(userId);
        if (!isMember) {
            return res.status(403).json({ message: 'You are not a member of this community' });
        }

        const messages = await CommunityChatMessage.find({ communityId: communityId })
            .sort({ timestamp: -1 })
            .limit(50)
            .populate('sender', 'googleId name picture');

        const formattedMessages = messages.reverse().map(msg => ({
            id: msg._id,
            communityId: msg.communityId,
            senderId: msg.sender?.googleId,
            senderName: msg.sender?.name || '不明なユーザー',
            senderPicture: msg.sender?.picture,
            text: msg.text,
            timestamp: msg.timestamp,
            type: 'community_chat_message'
        }));

        res.status(200).json(formattedMessages);

    } catch (error) {
        console.error('Error fetching chat messages:', error);
        res.status(500).json({ message: 'Error fetching chat messages', error: error.message });
    }
};

// --- 単一コミュニティ取得API ---
exports.getCommunityById = async (req, res) => {
    try {
        const communityId = req.params.communityId;
        const community = await Community.findById(communityId)
                                        .populate('organizer', 'name googleId picture');

        if (!community) {
            return res.status(404).json({ message: 'Community not found' });
        }

        const responseCommunity = {
            id: community._id,
            name: community.name,
            description: community.description,
            organizerId: community.organizer?._id,
            organizerGoogleId: community.organizer?.googleId,
            organizerName: community.organizer?.name || '不明',
            organizerPicture: community.organizer?.picture,
            participantsLimit: community.participantsLimit,
            currentParticipants: community.participants.length,
            joinPoints: community.joinPoints,
            createdAt: community.createdAt,
        };

        res.status(200).json(responseCommunity);
    } catch (error) {
        console.error(`Error fetching community by ID ${req.params.communityId}:`, error);
        res.status(500).json({ message: 'Error fetching community details', error: error.message });
    }
};

// ★★★ 追加: 参加者キック機能 ★★★
exports.kickParticipant = async (req, res) => {
    try {
        const communityId = req.params.communityId; // URLからコミュニティIDを取得
        const { participantId: participantSubToKick } = req.body; // リクエストボディからキック対象のユーザーsub(Google ID)を取得
        const organizerSub = req.user.googleId; // リクエストしたユーザー(主催者のはず)のGoogle ID

        if (!participantSubToKick) {
            return res.status(400).json({ message: '追放する参加者のIDを指定してください。' });
        }

        const community = await Community.findById(communityId).populate('organizer', 'googleId');

        if (!community) {
            return res.status(404).json({ message: 'コミュニティが見つかりません。' });
        }

        // 1. リクエストユーザーが主催者であることを確認
        if (!community.organizer || community.organizer.googleId !== organizerSub) {
            return res.status(403).json({ message: 'コミュニティの主催者のみが参加者を追放できます。' });
        }

        // 2. 主催者が自分自身をキックしようとしていないか確認
        if (participantSubToKick === organizerSub) {
            return res.status(400).json({ message: '主催者は自分自身を追放できません。' });
        }

        // 3. キック対象のユーザーのMongoDBの_idを取得
        const userToKick = await User.findOne({ googleId: participantSubToKick });
        if (!userToKick) {
            return res.status(404).json({ message: '追放対象の参加者が見つかりません。' });
        }
        const participantMongoIdToKick = userToKick._id;

        // 4. 参加者リストに対象ユーザーが存在するか確認
        const participantIndex = community.participants.findIndex(pId => pId.equals(participantMongoIdToKick));

        if (participantIndex === -1) {
            return res.status(404).json({ message: '対象の参加者はこのコミュニティのメンバーではありません。' });
        }

        // 5. 参加者リストから削除
        community.participants.splice(participantIndex, 1);
        await community.save();

        console.log(`Participant ${userToKick.name} (sub: ${participantSubToKick}) kicked from community ${community.name} by organizer ${req.user.name}`);
        res.status(200).json({
            message: `${userToKick.name}さんをコミュニティから追放しました。`,
            currentParticipants: community.participants.length
        });

    } catch (error) {
        console.error('Error kicking participant:', error);
        res.status(500).json({ message: '参加者の追放処理中にエラーが発生しました。', error: error.message });
    }
};
// ★★★ 追加ここまで ★★★