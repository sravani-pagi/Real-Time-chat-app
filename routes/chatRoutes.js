// routes/chatRoutes.js (CORRECTED AND COMPLETE)
const express = require('express');
const router = express.Router();
const ChatRoom = require('../models/ChatRoom');
const jwt = require('jsonwebtoken');
const { default: mongoose } = require('mongoose');

// NOTE: Ensure JWT_SECRET matches the one in server.js
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key'; 

// Middleware to protect routes
const protect = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(440).json({ message: 'Session expired or token is invalid' });
    }
};

// Export a function that accepts the Socket.IO instance
module.exports = (io) => {
    
    // POST /api/chat/group/create
    router.post('/group/create', protect, async (req, res) => {
        const { name, members } = req.body;
        
        if (!name || !members || members.length < 1) {
            return res.status(400).json({ message: 'Group name and at least one other member are required.' });
        }

        try {
            // Add the creator (current user) to the list of members if not already present
            // Using Set for cleaner handling of unique members (recommended)
            const allMembers = [...new Set([...members.map(String), req.user.id.toString()])];
            
            const newRoom = new ChatRoom({
                _id: new mongoose.Types.ObjectId(),
                name: name,
                roomType: 'group',
                members: allMembers,
                creator: req.user.id
            });

            await newRoom.save(); 

            // Broadcast the new room to ALL connected clients so they can update their sidebars
            io.emit('roomCreated', { 
                _id: newRoom._id, 
                name: newRoom.name, 
                roomType: newRoom.roomType 
            });
            
            res.status(201).json(newRoom);

        } catch (error) {
            console.error('Error creating group chat:', error); 
            res.status(500).json({ message: 'Server error during group creation.' });
        }
    });

    // -------------------------------------------------------------
    // PUT /api/chat/group/exit/:roomId - MOVED INSIDE THE io FUNCTION
    // -------------------------------------------------------------
    router.put('/group/exit/:roomId', protect, async (req, res) => {
        const { roomId } = req.params;
        const userId = req.user.id; 

        try {
            // Find the group chat room by its ID
            const chatRoom = await ChatRoom.findById(roomId);

            if (!chatRoom) {
                return res.status(404).json({ message: 'Chat room not found.' });
            }

            // 1. Check if the user is a member
            if (!chatRoom.members.map(id => id.toString()).includes(userId.toString())) {
                return res.status(400).json({ message: 'You are not a member of this group.' });
            }

            // 2. Prevent the creator from leaving if they are the last member
            if (chatRoom.creator.toString() === userId.toString() && chatRoom.members.length === 1) {
                return res.status(403).json({ 
                    message: 'The creator cannot exit the group when they are the only remaining member. You must delete the group instead.' 
                });
            }
            
            // 3. Remove the user from the members array
            chatRoom.members.pull(userId); // Mongoose helper function to remove an item from an array

            // 4. Save the updated room
            await chatRoom.save();

            // 5. Broadcast the event to the remaining members and the departing user
            // io.to(roomId).emit(...) would be better here, but io.emit is okay if your 
            // frontend handles the filtering.
            io.emit('memberRemoved', { 
                roomId: chatRoom._id, 
                userId: userId, 
                // Assuming you've attached user data (like name) to req.user during auth
                name: req.user.name || 'A user' 
            });

            res.status(200).json({ 
                message: 'Successfully exited the group chat.', 
                roomId: chatRoom._id 
            });

        } catch (error) {
            console.error('Error exiting group chat:', error);
            res.status(500).json({ message: 'Server error during group exit.' });
        }
    });
    // -------------------------------------------------------------
    // END of routes inside the io function
    // -------------------------------------------------------------

    return router;
};