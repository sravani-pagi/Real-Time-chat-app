

# 💬 Real-Time Chat Application

A **full-stack real-time chat platform** built with **Node.js**, **Express**, **MongoDB**, **Socket.io**, and **Tailwind CSS**, enabling instant communication between users through chat rooms with **secure authentication** and **live updates**.

This project demonstrates the integration of backend, frontend, and real-time systems in a modular, scalable architecture.

---

## 🧭 Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [System Architecture](#system-architecture)
4. [Folder Structure](#folder-structure)
5. [Backend Explanation](#backend-explanation)
6. [Frontend Explanation](#frontend-explanation)
7. [Socket.io (Real-Time Layer)](#socketio-real-time-layer)
8. [Database Design](#database-design)
9. [Data Flow (End-to-End)](#data-flow-end-to-end)
10. [Setup and Installation](#setup-and-installation)
11. [API Endpoints](#endpoints)
12. [Technologies Used](#technologies-used)
13. [License](#license)

---

##  Project Overview

This project is a **real-time chat web application** that allows multiple users to:
- Register or log in securely.
- Create or join chat rooms.
- Exchange messages in real time.
- Have their messages and rooms persisted in MongoDB.

It uses **Socket.io** for real-time communication, **Express** for REST APIs, **JWT** for secure user authentication, and **Tailwind CSS** for a responsive user interface.

---

##  Key Features

| Feature | Description |
|----------|-------------|
|  Authentication | Secure user registration and login using JWT and bcrypt. |
|  Real-Time Messaging | Messages broadcast live using Socket.io without page reloads. |
|  Chat Rooms | Dynamic creation and joining of multiple chat rooms. |
|  Persistence | All users, rooms, and messages stored in MongoDB. |
|  Frontend | Tailwind CSS and vanilla JS for lightweight interactivity. |
|  Modular Architecture | Clear separation of routes, controllers, and models. |

---

##  System Architecture

```
┌────────────┐       ┌──────────────┐       ┌──────────────┐
│  Frontend  │ <---> │  Express API │ <---> │   MongoDB     │
│ (HTML/JS)  │       │ (Node Server)│       │ (Database)    │
└────────────┘       └──────────────┘       └──────────────┘
        ▲                    │
        │   WebSockets       │
        └────────── Socket.io ┘
```

**Flow:**
1. Client connects → sends login/signup request via REST API.
2. Once authenticated, connects to Socket.io.
3. User joins or creates a chat room.
4. Messages are sent → saved to MongoDB → broadcast to all connected clients.

---

##  Folder Structure

```
real time/
├── server.js                   # Main entry point (Express + Socket.io)
│
├── config/
│   └── db.js                   # MongoDB connection setup
│
├── controllers/
│   └── authController.js       # Register/login logic, JWT handling
│
├── models/
│   ├── User.js                 # User schema (username, email, password)
│   ├── ChatRoom.js             # Chat room schema
│   └── Message.js              # Message schema (sender, roomId, content)
│
├── routes/
│   ├── authRoutes.js           # /api/auth endpoints
│   └── chatRoutes.js           # /api/chat endpoints
│
├── public/
│   ├── index.html              # Login/register page
│   ├── chat.html               # Chat room UI
│   └── js/
│       └── chatClient.js       # Socket.io client-side code
│
├── src/
│   └── input.css               # Tailwind source file
│
├── .env                        # Environment variables (PORT, MONGO_URI, JWT_SECRET)
├── package.json                # Project dependencies and scripts
├── postcss.config.js           # PostCSS config for Tailwind
└── tailwind.config.js          # Tailwind CSS configuration
```

---

##  Backend Explanation

### 1. **Server Setup (`server.js`)**
- Initializes Express and integrates Socket.io.
- Connects to MongoDB.
- Loads authentication and chat routes.
- Listens for Socket.io connections.

**Main logic:**
```js
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
    console.log(`User joined room ${roomId}`);
  });

  socket.on("sendMessage", async (data) => {
    const newMessage = await Message.create(data);
    io.to(data.roomId).emit("receiveMessage", newMessage);
  });
});
```

---

### 2. **Authentication Controller (`authController.js`)**
Handles:
- New user registration (hashes passwords with bcrypt)
- Login validation
- Token issuance via JWT

**Example request:**
```json
POST /api/auth/register
{
  "username": "neha",
  "email": "neha@proj.com",
  "password": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

##  Frontend Explanation

### 1. **index.html**
- Displays login and registration forms.
- On success, stores JWT in local storage and redirects to `chat.html`.

### 2. **chat.html**
- Displays chat UI (message list, input, send button).
- Connects to server via Socket.io.

### 3. **chatClient.js**
Handles:
- Connecting to socket server.
- Joining a room.
- Sending and receiving messages live.

**Snippet:**
```js
const socket = io();

socket.emit("joinRoom", roomId);

socket.on("receiveMessage", (msg) => {
  const div = document.createElement("div");
  div.textContent = `${msg.sender}: ${msg.content}`;
  document.getElementById("messages").appendChild(div);
});
```

---

##  Socket.io (Real-Time Layer)

Socket.io bridges all connected clients to the server in real time.  
Each room has its own message channel identified by a room ID.

**Events handled:**
- `joinRoom` → when user joins.
- `sendMessage` → when message sent.
- `receiveMessage` → broadcast to all room members.

---

##  Database Design

###  User Schema
| Field | Type | Description |
|--------|------|-------------|
| username | String | Display name |
| email | String | Unique user email |
| password | String | Hashed password |

###  Message Schema
| Field | Type | Description |
|--------|------|-------------|
| roomId | ObjectId | Linked chat room |
| sender | ObjectId | Linked user |
| content | String | Message text |
| timestamp | Date | Message creation time |

###  ChatRoom Schema
| Field | Type | Description |
|--------|------|-------------|
| name | String | Room name |
| participants | [ObjectId] | Users in the room |

---

##  Data Flow (End-to-End)

1. **User registers or logs in** → `/api/auth/*`
2. **Receives JWT** → stored in frontend.
3. **Joins room** → Socket.io `joinRoom` event.
4. **Sends message** → `/api/chat/messages` + `sendMessage` socket event.
5. **Server saves to MongoDB** → broadcasts `receiveMessage`.
6. **All connected clients update instantly.**

---

##  Setup and Installation

### 1️⃣ Clone the repository
```bash
git clone https://github.com/yourusername/realtime-chat-app.git
cd realtime-chat-app/real\ time
```

### 2️⃣ Install dependencies
```bash
npm install
```

### 3️⃣ Configure environment variables
Create `.env` in root:
```
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

### 4️⃣ Run the app
```bash
npm start
```

---

##  API Endpoints

| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login existing user |
| GET | `/api/chat/rooms` | Get all chat rooms |
| POST | `/api/chat/messages` | Send new message |

---


## Technologies Used

| Category | Technology |
|-----------|-------------|
| Backend | Node.js, Express |
| Real-Time | Socket.io |
| Database | MongoDB, Mongoose |
| Frontend | HTML, Tailwind CSS, JavaScript |
| Auth | JWT, bcrypt |
| Environment | dotenv |
| Dev Tools | Nodemon, Postman |

---

## License

This project is licensed under the **MIT License**.  
You’re free to use, modify, and distribute it with attribution.




