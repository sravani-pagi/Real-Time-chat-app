// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); 

// Import Modules
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
// NOTE: chatRoutes is now imported as a function that expects the 'io' instance
const chatRoutes = require('./routes/chatRoutes'); 
const Message = require('./models/Message');
const User = require('./models/User');
const ChatRoom = require('./models/ChatRoom');


const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key'; 


// Function to initialize the default public room
async function initializeDefaultRoom() {
    try {
        await ChatRoom.findOneAndUpdate(
            { _id: 'general' },
            { name: 'General Chat', roomType: 'public', members: [] },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        console.error('Error initializing default room:', error);
    }
}

// Connect to Database and Initialize Default Room
connectDB().then(() => {
    initializeDefaultRoom();
}).catch(err => {
    console.error('Failed to connect to DB:', err);
});

// --- Express Middleware & Setup ---
app.use(express.json());
app.use(express.static('public'));
app.use('/api/auth', authRoutes);


// ===================================
// === Socket.IO Setup and Security ===
// ===================================

const io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// --- PASS IO TO CHAT ROUTES ---
app.use('/api/chat', chatRoutes(io)); 
// --- END IO PASS ---

let activeUsers = {};

// 1. Socket.IO Authentication Middleware (verifies JWT)
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error: Token required'));
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.id;
        socket.username = decoded.username;
        next();
    } catch (error) {
        return next(new Error('Authentication error: Invalid token'));
    }
});

// 2. Socket.IO Connection Handler
io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.username} (${socket.id})`);

    activeUsers[socket.userId] = { userId: socket.userId, username: socket.username, socketId: socket.id };
    socket.join(socket.userId); // Private room for user

    let currentUserIdObject;
    try {
        currentUserIdObject = new mongoose.Types.ObjectId(socket.userId);
    } catch (err) {
        console.error(`Invalid ObjectId for user ${socket.userId}: ${err.message}`);
        return; 
    }

    // --- REFACTOR: Sidebar Initial Load ---
    // 1. Send all users (for private chat list)
    const allUsers = await User.find({ _id: { $ne: currentUserIdObject } }, 'username').lean();
    const usersForSidebar = allUsers.map(user => ({ 
        id: user._id.toString(), 
        username: user.username, 
        isOnline: !!activeUsers[user._id.toString()]
    }));
    socket.emit('allUsersForSidebar', usersForSidebar);
    
    // 2. Send all rooms (Public and Group)
    const availableRooms = await ChatRoom.find({}, 'name _id roomType');
    socket.emit('availableRooms', availableRooms);


    // 3. Handle Joining a Chat/Room and Fetching History
    socket.on('joinChat', async ({ targetId, isPrivate = false }) => {
        // ... (Joining logic remains the same) ...
        console.log(`[JOIN CHAT] Attempting to join target: ${targetId}, isPrivate: ${isPrivate}`);

        if (!socket.rooms.has(targetId)) {
            // Leave previous rooms except the socket's own ID room
            const roomsToLeave = Array.from(socket.rooms).filter(room => room !== socket.userId && room !== targetId);
            roomsToLeave.forEach(room => socket.leave(room));
            socket.join(targetId); 
        }

        let filter;
        if (isPrivate) {
            let targetObjectId;
            try {
                targetObjectId = new mongoose.Types.ObjectId(targetId);
            } catch (err) {
                socket.emit('chatError', 'Invalid user ID for private chat.');
                return; 
            }

            filter = { 
                $and: [
                    { roomType: 'private' },
                    { $or: [
                        { senderId: currentUserIdObject, targetId: targetId }, 
                        { senderId: targetObjectId, targetId: socket.userId } 
                    ]}
                ]
            };
        } else {
            // Filter for Public Room or Group Room messages (targetId is the room string/ID)
            filter = { targetId: targetId, roomType: { $ne: 'private' } }; 
        }
        
        try {
            const history = await Message.find(filter)
                .sort({ timestamp: 1 })
                .limit(50)
                .populate('senderId', 'username') 
                
            socket.emit('chatHistory', history);
        } catch (error) {
            console.error("Error fetching chat history:", error); 
            socket.emit('chatError', 'Could not load chat history.');
        }
    });

    // 4. Handle Incoming Messages (Unchanged logic)
    socket.on('sendMessage', async (data) => {
        const { content, targetId, isPrivate } = data;
        // ... (send message logic remains the same) ...
        
        if (!content || !targetId) return;

        let newMessage = new Message({
            senderId: currentUserIdObject, 
            content: content,
            targetId: targetId, 
            roomType: isPrivate ? 'private' : 'public'
        });
        
        try {
            await newMessage.save();
            newMessage = await newMessage.populate('senderId', 'username'); 

            if (isPrivate) {
                io.to(targetId).to(socket.userId).emit('newMessage', newMessage);
            } else {
                io.to(targetId).emit('newMessage', newMessage);
            }
        } catch (error) {
            console.error("Error saving or broadcasting message:", error);
            socket.emit('chatError', 'Failed to send message.');
        }
    });
    
    // 5. Typing Indicator Logic (Unchanged)
    socket.on('typing', ({ targetId }) => {
        socket.broadcast.to(targetId).emit('userTyping', { username: socket.username, targetId });
    });
    
    socket.on('stopTyping', ({ targetId }) => {
        socket.broadcast.to(targetId).emit('userStoppedTyping', { username: socket.username, targetId });
    });


    // 6. Handle Message Deletion - (FIXED SCOPE)
    socket.on('deleteMessage', async ({ messageId }) => {
        try {
            const message = await Message.findById(messageId);
            
            if (!message) return;

            // Security Check: Only allow the sender to delete the message
            if (message.senderId.toString() !== socket.userId) {
                socket.emit('chatError', 'You can only delete your own messages.');
                return;
            }
            
            await Message.deleteOne({ _id: messageId });

            const broadcastPayload = { messageId: messageId };
            const targetRoom = message.targetId;
            
            if (message.roomType === 'private') {
                io.to(targetRoom).to(socket.userId).emit('messageDeleted', broadcastPayload);
            } else {
                io.to(targetRoom).emit('messageDeleted', broadcastPayload);
            }
        
        } catch (error) {
            console.error("Error deleting message:", error);
            socket.emit('chatError', 'Could not delete message.');
        }
    });


    // 7. Handle Disconnect 
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.username}`);
        delete activeUsers[socket.userId];
        
        // Broadcast the online user update
        io.emit('onlineUsersList', Object.values(activeUsers).map(u => ({ id: u.userId, isOnline: true })));
    });
    
    // 8. Event to keep user list up-to-date for everyone (login/logout)
    io.emit('onlineUsersList', Object.values(activeUsers).map(u => ({ id: u.userId, isOnline: true })));
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));