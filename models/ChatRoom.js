// models/ChatRoom.js
const mongoose = require('mongoose');

const ChatRoomSchema = new mongoose.Schema({
    // Use String for 'general' room ID, or ObjectId for custom group IDs
    _id: {
        type: String, 
        required: true
    },
    name: {
        type: String,
        required: true
    },
    // List of User IDs who are members (only needed for Group rooms)
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    roomType: {
        type: String, 
        enum: ['public', 'group'],
        default: 'group'
    }
});

module.exports = mongoose.model('ChatRoom', ChatRoomSchema);