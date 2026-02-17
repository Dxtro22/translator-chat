const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('../client'));

const users = {}; 

// 1. Simple In-Memory Database for History
const roomHistory = {
    general: [],
    gaming: [],
    devs: []
};

async function translateText(text, sourceLang, targetLang) {
    if (sourceLang === targetLang) return text;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            return data[0][0][0];
        }
        return text;
    } catch (error) {
        console.error("Translation Error:", error);
        return text;
    }
}

io.on('connection', (socket) => {
    socket.join('global-notifications');

    // 2. Join Room & Send History
    socket.on('join-room', async ({ room, lang, user }) => {
        const cleanRoom = room.trim().toLowerCase();
        
        // Handle Switching
        const previousRoom = users[socket.id]?.room;
        if (previousRoom) socket.leave(previousRoom);
        
        socket.join(cleanRoom);
        users[socket.id] = { room: cleanRoom, lang, user };

        // --- NEW: Send History ---
        // We must translate the history to the NEW user's language
        const history = roomHistory[cleanRoom] || [];
        
        // Translate history in parallel (Fast)
        const translatedHistory = await Promise.all(history.map(async (msg) => {
            let translatedText = msg.text;
            if (msg.originalLang !== lang) {
                translatedText = await translateText(msg.text, msg.originalLang, lang);
            }
            return {
                ...msg,
                text: translatedText // Send translated version
            };
        }));

        // Send history ONLY to the user who just joined
        socket.emit('room-history', translatedHistory);
    });

    // 3. Handle Message & Save to History
    socket.on('chat-message', async (data) => {
        const { room, message, user } = data;
        const sender = users[socket.id];
        if (!sender) return;

        const cleanRoom = room.trim().toLowerCase();
        const senderLang = sender.lang;

        // A. Save to History (Original Language)
        if (!roomHistory[cleanRoom]) roomHistory[cleanRoom] = [];
        roomHistory[cleanRoom].push({
            user: user,
            text: message, // Store original text
            originalLang: senderLang,
            timestamp: new Date()
        });
        
        // Limit history to last 50 messages to save memory
        if (roomHistory[cleanRoom].length > 50) roomHistory[cleanRoom].shift();

        // B. Notify Everyone (for Unread Counts)
        io.to('global-notifications').emit('room-notification', cleanRoom);

        // C. Send to Users in Room (Translated)
        const clients = await io.in(cleanRoom).fetchSockets();

        await Promise.all(clients.map(async (clientSocket) => {
            const receiver = users[clientSocket.id];
            if (!receiver) return; 

            const targetLang = receiver.lang;
            let finalMessageText = message;

            if (targetLang !== senderLang) {
                finalMessageText = await translateText(message, senderLang, targetLang);
            }

            clientSocket.emit('chat-message', {
                text: finalMessageText,
                user: user,
                originalLang: senderLang
            });
        }));
    });

    socket.on('disconnect', () => {
        delete users[socket.id];
    });
});

server.listen(4000, () => {
    console.log("🚀 Server started on port 4000");
});