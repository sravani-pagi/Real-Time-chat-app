// public/js/chatClient.js

// --- UI Element References (Updated/Added) ---
const AUTH_SCREEN = document.getElementById('auth-screen');
const CHAT_SCREEN = document.getElementById('chat-screen');
const AUTH_FORM = document.getElementById('auth-form');
const AUTH_TITLE = document.getElementById('auth-title');
const TOGGLE_AUTH_BTN = document.getElementById('toggle-auth-btn');
const MESSAGE_STATUS = document.getElementById('message-status'); // Used for login status
const LOGOUT_BTN = document.getElementById('logout-btn');

const MESSAGE_VIEWPORT = document.getElementById('message-viewport');
const MESSAGE_INPUT = document.getElementById('message-input');
const TYPING_INDICATOR = document.getElementById('typing-indicator');
const SEND_BUTTON = document.getElementById('send-button');
const USER_LIST = document.getElementById('user-list'); // The entire sidebar container
const CURRENT_CHAT_NAME = document.getElementById('current-chat-name');
const CURRENT_USER_NAME_SPAN = document.getElementById('current-user-name');

// --- NEW MODAL REFERENCES ---
const GROUP_MODAL = document.getElementById('group-modal');
const CREATE_GROUP_BTN = document.getElementById('create-group-btn');
const GROUP_NAME_INPUT = document.getElementById('group-name-input');
const GROUP_MEMBER_LIST = document.getElementById('group-member-list');
const GROUP_MESSAGE_STATUS = document.getElementById('group-message-status');
// --- END MODAL REFERENCES ---


// --- State Variables (Kept from previous step) ---
let socket;
let currentUser = null;
let isRegisterMode = false;
let activeChat = { id: 'general', name: 'General', type: 'public' }; // Default to general room
let typingTimeout;
const API_BASE = '/api/auth';

let sidebarUsers = {}; // Stores all known users {id: {username, isOnline}}
let availableRooms = { 'general': { _id: 'general', name: 'General', roomType: 'public' } }; // Stores groups and general


// --- Utility Functions ---
function displayStatus(message, isError = false) {
    MESSAGE_STATUS.textContent = message;
    MESSAGE_STATUS.classList.remove('hidden', isError ? 'text-green-600' : 'text-red-600');
    MESSAGE_STATUS.classList.add(isError ? 'text-red-600' : 'text-green-600');
    // Auto-hide status messages after a few seconds
    setTimeout(() => {
        MESSAGE_STATUS.classList.add('hidden');
        MESSAGE_STATUS.textContent = '';
    }, 4000);
}

function scrollToBottom() {
    MESSAGE_VIEWPORT.scrollTop = MESSAGE_VIEWPORT.scrollHeight;
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}


// --- Group Chat & Delete Message Functions (Group Logic is NEW) ---

function populateGroupMemberModal() {
    GROUP_MEMBER_LIST.innerHTML = '';
    // Filter out the current user
    const otherUsers = Object.keys(sidebarUsers).filter(id => id !== currentUser.id);

    if (otherUsers.length === 0) {
        GROUP_MEMBER_LIST.innerHTML = '<p class="text-sm text-gray-500">No other users available to add.</p>';
        return;
    }

    otherUsers.forEach(userId => {
        const user = sidebarUsers[userId];
        GROUP_MEMBER_LIST.innerHTML += `
            <div class="flex items-center space-x-2">
                <input type="checkbox" id="member-${userId}" value="${userId}" class="rounded text-blue-600">
                <label for="member-${userId}" class="text-sm">${user.username} 
                    <span class="text-xs ${user.isOnline ? 'text-green-500' : 'text-red-500'}">
                        (${user.isOnline ? 'Online' : 'Offline'})
                    </span>
                </label>
            </div>`;
    });
}

window.openGroupModal = function() {
    populateGroupMemberModal();
    GROUP_MODAL.classList.remove('hidden');
    GROUP_NAME_INPUT.value = '';
    GROUP_MESSAGE_STATUS.textContent = '';
}

window.closeGroupModal = function() {
    GROUP_MODAL.classList.add('hidden');
}

window.handleGroupCreationSubmit = async function() {
    const groupName = GROUP_NAME_INPUT.value.trim();
    const checkboxes = GROUP_MEMBER_LIST.querySelectorAll('input[type="checkbox"]:checked');
    const memberIds = Array.from(checkboxes).map(cb => cb.value);

    GROUP_MESSAGE_STATUS.textContent = '';

    if (!groupName) {
        GROUP_MESSAGE_STATUS.textContent = 'Please enter a group name.';
        return;
    }
    if (memberIds.length === 0) {
        GROUP_MESSAGE_STATUS.textContent = 'Please select at least one member.';
        return;
    }

    const token = localStorage.getItem('chatToken');

    try {
        const response = await fetch('/api/chat/group/create', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({ 
                name: groupName, 
                members: memberIds 
            })
        });

        const data = await response.json();

        if (response.ok) {
            displayStatus(`Group "${data.name}" created successfully!`, false);
            window.changeChat(data._id, data.name, 'public', true); 
            closeGroupModal();
        } else {
            GROUP_MESSAGE_STATUS.textContent = data.message || 'Failed to create group.';
        }

    } catch (error) {
        console.error('Group creation network error:', error);
        GROUP_MESSAGE_STATUS.textContent = 'Network error during group creation.';
    }
}

// Global function to handle client-side delete button click (Kept from previous step)
window.deleteMessage = function(messageId) {
    if (socket && socket.connected && confirm("Are you sure you want to delete this message for everyone?")) {
        socket.emit('deleteMessage', { 
            messageId: messageId
        });
    }
}


// --- Core Authentication Flow (Kept from previous step) ---
async function handleAuth(e) {
    e.preventDefault();
    MESSAGE_STATUS.classList.add('hidden');
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const endpoint = isRegisterMode ? `${API_BASE}/register` : `${API_BASE}/login`;
    const method = 'POST';

    try {
        const response = await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            if (isRegisterMode) {
                displayStatus(data.message || 'Registration successful. Please log in.', false);
                toggleAuthMode();
            } else {
                localStorage.setItem('chatToken', data.token);
                currentUser = data.user;
                loadChatApp();
            }
        } else {
            displayStatus(data.message || 'Authentication failed.', true);
        }
    } catch (error) {
        console.error('Network or server error:', error);
        displayStatus('Could not connect to the server.', true);
    }
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    AUTH_TITLE.textContent = isRegisterMode ? 'Create New Account' : 'Login to Chat';
    TOGGLE_AUTH_BTN.textContent = isRegisterMode ? 'Already have an account? Login' : 'Need an account? Register';
    document.getElementById('auth-submit-btn').textContent = isRegisterMode ? 'Register' : 'Login';
    MESSAGE_STATUS.classList.add('hidden');
}

function loadChatApp() {
    if (!currentUser || !localStorage.getItem('chatToken')) {
        return;
    }
    
    AUTH_SCREEN.classList.add('hidden');
    CHAT_SCREEN.classList.remove('hidden');
    CURRENT_USER_NAME_SPAN.textContent = currentUser.username;
    
    connectSocket(localStorage.getItem('chatToken'));
}

window.logout = function() {
    localStorage.removeItem('chatToken');
    currentUser = null;
    if (socket) {
        socket.disconnect();
    }
    CHAT_SCREEN.classList.add('hidden');
    AUTH_SCREEN.classList.remove('hidden');
    MESSAGE_VIEWPORT.innerHTML = ''; 
    MESSAGE_STATUS.classList.add('hidden');
    // Reset sidebar state on logout
    sidebarUsers = {};
    availableRooms = { 'general': { _id: 'general', name: 'General', roomType: 'public' } };
}


// --- Socket.IO & Chat Logic (Kept from previous step) ---

function connectSocket(token) {
    socket = io({
        auth: { token: token }
    });

    socket.on('connect', () => {
        console.log('Socket Connected!');
        // Force initial join to General chat
        if (activeChat && activeChat.id) {
            changeChat(activeChat.id, activeChat.name, activeChat.type, true); 
        }
    });
    
    socket.on('connect_error', (err) => {
        console.error('Socket Connection Error:', err.message);
        logout(); 
        // Display a critical error upon connection failure
        displayStatus('Session expired or authentication failed. Please log in again.', true);
    });
    
    // --- Error Handling Listener ---
    socket.on('chatError', (message) => {
        // Use an alert for now for critical socket errors
        alert(`CRITICAL CHAT ERROR: ${message}`);
    });

    // --- Sidebar Listeners ---
    
    socket.on('allUsersForSidebar', (users) => {
        users.forEach(u => {
            sidebarUsers[u.id] = { username: u.username, isOnline: u.isOnline };
        });
        renderSidebar(); 
    });
    
    socket.on('availableRooms', (rooms) => {
        rooms.forEach(r => {
            availableRooms[r._id] = { _id: r._id, name: r.name, roomType: r.roomType };
        });
        renderSidebar();
    });
    
    socket.on('roomCreated', (room) => {
        if (!availableRooms[room._id]) {
            availableRooms[room._id] = room;
            renderSidebar();
        }
    });
    
    socket.on('onlineUsersList', (onlineUsers) => {
        Object.keys(sidebarUsers).forEach(id => sidebarUsers[id].isOnline = false);
        
        onlineUsers.forEach(u => {
            if (sidebarUsers[u.id]) {
                sidebarUsers[u.id].isOnline = true;
            }
        });
        renderSidebar();
    });
    // --- End Sidebar Listeners ---
    
    socket.on('chatHistory', (messages) => {
        MESSAGE_VIEWPORT.innerHTML = ''; 
        messages.forEach(addMessageToView);
        scrollToBottom();
    });

    socket.on('newMessage', (message) => {
        const senderInfo = message.senderId;
        const senderId = senderInfo._id || senderInfo.id || senderInfo; 
        
        const isForActiveChat = 
            message.targetId === activeChat.id || 
            (activeChat.type === 'private' && 
             (senderId === activeChat.id || message.targetId === activeChat.id));

        if (isForActiveChat) {
            addMessageToView(message);
        } 
    });
    
    // --- Handle Message Deletion Broadcast ---
    socket.on('messageDeleted', ({ messageId }) => {
        const messageElement = document.getElementById(`msg-${messageId}`);
        if (messageElement) {
            messageElement.querySelector('.chat-bubble-content').innerHTML = '<p class="text-xs italic text-gray-400">Message deleted.</p>';
            const deleteButton = messageElement.querySelector('.delete-msg-btn');
            if (deleteButton) deleteButton.remove();
        }
    });
    // --- End Delete Listener ---

    socket.on('userTyping', ({ username, targetId }) => {
        if (targetId === activeChat.id) {
            TYPING_INDICATOR.textContent = `${username} is typing...`;
            TYPING_INDICATOR.classList.remove('hidden');
        }
    });

    socket.on('userStoppedTyping', ({ username, targetId }) => {
        if (targetId === activeChat.id) {
            TYPING_INDICATOR.classList.add('hidden');
        }
    });
}

// Function to render the entire sidebar (Users and Rooms)
function renderSidebar() {
    USER_LIST.innerHTML = '';

    // --- 1. Render Public/Group Rooms ---
    USER_LIST.innerHTML += '<p class="text-xs text-gray-400 mt-2 mb-1 uppercase font-bold">Rooms & Groups</p>';
    Object.keys(availableRooms).forEach(roomId => {
        const room = availableRooms[roomId];
        const isActive = activeChat.id === room._id;
        const buttonClass = isActive ? 'bg-blue-700' : 'bg-gray-800 hover:bg-gray-700';
        const namePrefix = room.roomType === 'public' ? '#' : '👥'; 
        
        USER_LIST.innerHTML += `<button onclick="changeChat('${room._id}', '${room.name}', 'public')" class="w-full text-left p-2 rounded-lg ${buttonClass} transition mb-1">
            <span class="font-bold text-sm">${namePrefix} ${room.name}</span>
        </button>`;
    });

    // --- 2. Render Private Users ---
    USER_LIST.innerHTML += '<p class="text-xs text-gray-400 mt-3 mb-1 uppercase font-bold">Direct Messages</p>';
    
    const sortedUsers = Object.keys(sidebarUsers)
        .sort((a, b) => {
            const userA = sidebarUsers[a];
            const userB = sidebarUsers[b];
            // Sort: Online users first, then alphabetically
            if (userA.isOnline && !userB.isOnline) return -1;
            if (!userA.isOnline && userB.isOnline) return 1;
            return userA.username.localeCompare(userB.username);
        });

    sortedUsers.forEach(userId => {
        const user = sidebarUsers[userId];
        const isActive = activeChat.id === userId;
        const buttonClass = isActive ? 'bg-blue-700' : 'hover:bg-gray-700';
        const statusClass = user.isOnline ? 'bg-green-500' : 'bg-red-500';
        
        USER_LIST.innerHTML += `<button onclick="changeChat('${userId}', '${user.username}', 'private')" class="w-full flex items-center space-x-2 p-2 rounded-lg ${buttonClass} transition mb-1">
            <span class="w-3 h-3 rounded-full ${statusClass} flex-shrink-0"></span>
            <span class="text-sm truncate">${user.username}</span>
        </button>`;
    });
}


// Global function to be called by HTML buttons
window.changeChat = function(id, name, type, forceUpdate = false) { 
    if (!forceUpdate && activeChat.id === id) return; 
    
    activeChat = { id, name, type };

    MESSAGE_VIEWPORT.innerHTML = '<p class="text-center text-gray-500 text-sm">Loading chat history...</p>';
    CURRENT_CHAT_NAME.textContent = type === 'public' ? `# ${name}` : name;
    
    if (socket && socket.connected) {
        socket.emit('joinChat', { targetId: activeChat.id, isPrivate: activeChat.type === 'private' });
    } else {
        console.log("Socket not yet connected. Deferring 'joinChat' emission.");
    }
    
    // Update the sidebar highlighting immediately
    renderSidebar();
}

function addMessageToView(message) {
    const senderInfo = message.senderId;
    const senderId = senderInfo._id || senderInfo.id || senderInfo;
    
    const isMe = senderId === currentUser.id;
    const alignClass = isMe ? 'justify-end' : 'justify-start';
    const bubbleClass = isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-bl-none';
    const username = senderInfo.username || 'Unknown User'; 

    // Delete button logic 
    const deleteButtonHtml = isMe && message._id
        ? `<button onclick="deleteMessage('${message._id}')" 
                   class="delete-msg-btn text-xs ml-2 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                   🗑️
           </button>`
        : '';

    const messageHtml = `
        <div class="flex ${alignClass} my-2 group" id="msg-${message._id}">
            <div class="flex flex-col max-w-xs md:max-w-md">
                <span class="text-xs ${isMe ? 'text-right' : 'text-left'} text-gray-500 mb-1">${isMe ? 'You' : username}</span>
                <div class="flex items-end ${bubbleClass} p-3 rounded-xl shadow chat-bubble-content">
                    <p class="text-sm mr-2">${message.content}</p>
                    <div class="flex flex-col items-end">
                    <span class="text-xs opacity-70 block">
                          ${formatTimestamp(message.timestamp)}
                       </span>
                       ${deleteButtonHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
    MESSAGE_VIEWPORT.innerHTML += messageHtml;
    scrollToBottom();
}

// --- Event Listeners and Initialization (Updated to use new modal functions) ---

AUTH_FORM.addEventListener('submit', handleAuth);
TOGGLE_AUTH_BTN.addEventListener('click', toggleAuthMode);
LOGOUT_BTN.addEventListener('click', logout);
CREATE_GROUP_BTN.addEventListener('click', openGroupModal); // New listener for the button

SEND_BUTTON.addEventListener('click', () => {
    // ... (send button logic remains the same) ...
    const content = MESSAGE_INPUT.value.trim();
    if (content && socket.connected) {
        socket.emit('sendMessage', { 
            content: content, 
            targetId: activeChat.id, 
            isPrivate: activeChat.type === 'private' 
        });
        MESSAGE_INPUT.value = ''; 
        socket.emit('stopTyping', { targetId: activeChat.id });
        TYPING_INDICATOR.classList.add('hidden');
    }
});

MESSAGE_INPUT.addEventListener('input', () => {
    // ... (typing indicator logic remains the same) ...
    if (socket && socket.connected) {
        socket.emit('typing', { targetId: activeChat.id });
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stopTyping', { targetId: activeChat.id });
        }, 2000); 
    }
});

MESSAGE_INPUT.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        SEND_BUTTON.click();
    }
});

window.onload = () => {
    const token = localStorage.getItem('chatToken');
    if (token) {
        try {
            const [header, payload, signature] = token.split('.');
            if (payload) {
                // Decode the JWT payload to get current user info
                const decoded = JSON.parse(atob(payload));
                currentUser = { id: decoded.id, username: decoded.username };
                loadChatApp();
            } else {
                localStorage.removeItem('chatToken');
            }
        } catch (e) {
            localStorage.removeItem('chatToken');
        }
    }
};