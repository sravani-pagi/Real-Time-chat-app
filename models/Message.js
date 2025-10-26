// models/Message.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
    senderId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    targetId: {
        type: String, // Can be a Room ID (e.g., 'general') or the Recipient User ID for private chat
        required: true,
    },
    roomType: {
        type: String, // 'public' or 'private'
        enum: ['public', 'private'],
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Message', MessageSchema);