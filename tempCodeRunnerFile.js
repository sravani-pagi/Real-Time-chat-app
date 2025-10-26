// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

// Import Modules
const connectDB = require('./config/db'); // New DB connection module
const authRoutes = require('./routes/authRoutes');
const Message = require('./models/Message'); // For use in Socket.IO logic

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key'; 

// Connect to Database
connectDB();

// --- Express Middleware & Setup ---
app.use(express.json()); // Body parser for Express routes
app.use(express.static('public')); // Serve frontend static files

// --- Express Route Integration ---
app.use('/api/auth', authRoutes);


// ===================================
// === Socket.IO Setup and Security ===
// ===================================

const io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// In-memory store for active users
let activeUsers = {}; // { userId: { username, socketId } }

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

    // Add user to active users map and join their private room
    activeUsers[socket.userId] = { userId: socket.userId, username: socket.username, socketId: socket.id };
    socket.join(socket.userId); // Private room for user

    // Broadcast updated online list to all clients
    io.emit('onlineUsers', Object.values(activeUsers).map(u => ({ username: u.username, id: u.userId })));

    // 3. Handle Joining a Chat/Room and Fetching History
    socket.on('joinChat', async ({ targetId, isPrivate = false }) => {
        
        // Ensure the socket joins the correct room 
        if (!socket.rooms.has(targetId)) {
            // Clear previous chat room (except their private room)
            const roomsToLeave = Array.from(socket.rooms).filter(room => room !== socket.id && room !== targetId);
            roomsToLeave.forEach(room => socket.leave(room));

            socket.join(targetId); 
        }

        let filter;
        if (isPrivate) {
            // Filter for messages between these two users (sender to target OR target to sender)
            filter = { 
                $and: [
                    { roomType: 'private' },
                    { $or: [
                        { senderId: socket.userId, targetId: targetId },
                        { senderId: targetId, targetId: socket.userId }
                    ]}
                ]
            };
        } else {
            // Filter for public room messages
            filter = { targetId: targetId, roomType: 'public' };
        }
        
        try {
            const history = await Message.find(filter)
                .sort({ timestamp: 1 })
                .limit(50)
                .populate('senderId', 'username') // Populate the sender's username
                
                
            socket.emit('chatHistory', history);
        } catch (error) {
            console.error("Error fetching chat history:", error);
            socket.emit('chatError', 'Could not load chat history.');
        }
    });

    // 4. Handle Incoming Messages (Public or Private)
socket.on('sendMessage', async (data) => {
    const { content, targetId, isPrivate } = data;
    
    // Basic validation
    if (!content || !targetId) return;

    // Save to MongoDB
    let newMessage = new Message({
        senderId: socket.userId,
        content: content,
        targetId: targetId,
        roomType: isPrivate ? 'private' : 'public'
    });
    await newMessage.save();
    
    // Populate the sender details before broadcasting (important for client-side display)
    // FIX APPLIED: Removed .execPopulate() as it is deprecated in Mongoose v6+
    newMessage = await newMessage.populate('senderId', 'username'); 

    // Broadcast the message
    if (isPrivate) {
    // Send to recipient's private room (targetId) AND sender's private room (socket.userId)
    io.to(targetId).to(socket.userId).emit('newMessage', newMessage);
} else {
    // Send to everyone in the group room
    io.to(targetId).emit('newMessage', newMessage);
}
});
    
    // 5. Typing Indicator Logic
    socket.on('typing', ({ targetId }) => {
        // Broadcast only to the room/user that the current user is typing to
        socket.broadcast.to(targetId).emit('userTyping', { username: socket.username, targetId });
    });
    
    socket.on('stopTyping', ({ targetId }) => {
        socket.broadcast.to(targetId).emit('userStoppedTyping', { username: socket.username, targetId });
    });


    // 6. Handle Disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.username}`);
        delete activeUsers[socket.userId];
        io.emit('onlineUsers', Object.values(activeUsers).map(u => ({ username: u.username, id: u.userId })));
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));