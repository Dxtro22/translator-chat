/* client/script.js */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCzaMTY5l4meGUGn2UvhPhGHSQ_2XCdaNU",
  authDomain: "translator-chat-ad787.firebaseapp.com",
  projectId: "translator-chat-ad787",
  storageBucket: "translator-chat-ad787.firebasestorage.app",
  messagingSenderId: "330253931723",
  appId: "1:330253931723:web:385b98d03e20ea58b2f74e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const socket = io();

let currentUser = null;
let currentRoom = "general";

// NEW: Track unread counts for each room
const unreadCounts = {
    general: 0,
    gaming: 0,
    devs: 0
};

// DOM Elements
const authScreen = document.getElementById('authScreen');
const appUI = document.getElementById('appUI');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const toggleBtn = document.getElementById('toggleBtn');
const toggleText = document.getElementById('toggleText');
const authTitle = document.getElementById('authTitle');
const authError = document.getElementById('authError');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const langInput = document.getElementById('langInput');
const currentRoomName = document.getElementById('currentRoomName');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

// --- HELPER: UPDATE BADGE COUNT ---
function updateBadge(roomName) {
    const badge = document.getElementById(`badge-${roomName}`);
    const btn = document.getElementById(`btn-${roomName}`);
    const count = unreadCounts[roomName];

    if (badge) {
        if (count > 0) {
            badge.style.display = 'block';
            badge.textContent = count > 9 ? "9+" : count; // Show "9+" if many messages
            if(btn) btn.classList.add('text-white');
        } else {
            badge.style.display = 'none';
            if(btn) btn.classList.remove('text-white');
        }
    }
}

// Reset count when clicking a room
function resetBadge(roomName) {
    unreadCounts[roomName] = 0;
    updateBadge(roomName);
}

// --- AUTH UI ---
toggleBtn.addEventListener('click', () => {
    authError.classList.add('hidden');
    if (loginForm.classList.contains('hidden')) {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        authTitle.textContent = "Welcome Back!";
        toggleText.textContent = "Need an account?";
        toggleBtn.textContent = "Register";
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        authTitle.textContent = "Create an Account";
        toggleText.textContent = "Already have an account?";
        toggleBtn.textContent = "Log In";
    }
});

function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
}

// --- AUTH HANDLERS ---
document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { showError(error.message); }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, document.getElementById('loginEmail').value, document.getElementById('loginPass').value); } 
    catch (error) { showError("Login Failed: " + error.message); }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    try {
        const cred = await createUserWithEmailAndPassword(auth, document.getElementById('regEmail').value, document.getElementById('regPass').value);
        await updateProfile(cred.user, { displayName: name, photoURL: `https://ui-avatars.com/api/?name=${name}&background=random` });
        window.location.reload(); 
    } catch (error) { showError("Registration Failed: " + error.message); }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authScreen.classList.add('hidden');
        appUI.classList.remove('hidden');
        userName.textContent = user.displayName || user.email.split('@')[0];
        userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${userName.textContent}`;
        joinRoom('general');
    } else {
        authScreen.classList.remove('hidden');
        appUI.classList.add('hidden');
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));


// --- CHAT LOGIC ---

// Helper to render a single message bubble
function renderMessage(data) {
    const div = document.createElement("div");
    if (data.user) {
        div.className = "flex gap-4 p-2 pl-4 mt-2 message-hover group";
        div.innerHTML = `
            <img src="${data.user.photo}" class="w-10 h-10 rounded-full bg-gray-600 mt-1 cursor-pointer transition hover:opacity-80">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-white cursor-pointer hover:underline text-base">${data.user.name}</span>
                    <span class="text-xs text-gray-400 select-none">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="text-gray-300 text-base leading-relaxed break-words">${data.text}</div>
            </div>
        `;
    } else {
        div.className = "px-4 py-1 mt-1";
        div.innerHTML = `<div class="flex items-center gap-2 opacity-60"><i class="fas fa-arrow-right text-gray-400 text-xs"></i><span class="text-xs text-gray-400 italic">${data.text}</span></div>`;
    }
    messagesDiv.appendChild(div);
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
}

window.joinRoom = (roomName) => {
    if (!currentUser) return;

    // Reset unread count for this room
    resetBadge(roomName);

    currentRoom = roomName;
    currentRoomName.textContent = `# ${roomName}`;
    messagesDiv.innerHTML = ""; // Clear view before loading history
    
    // UI Highlight
    document.querySelectorAll('.room-btn').forEach(btn => {
        btn.classList.remove('bg-gray-700', 'text-white');
        if(btn.id === `btn-${roomName}`) btn.classList.add('bg-gray-700', 'text-white');
    });

    socket.emit("join-room", { 
        room: roomName, 
        lang: langInput.value,
        user: {
            name: currentUser.displayName || "User",
            photo: currentUser.photoURL || userAvatar.src
        }
    });
};

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentUser) return;

    socket.emit("chat-message", {
        room: currentRoom,
        message: text,
        user: {
            name: currentUser.displayName || "User",
            photo: currentUser.photoURL || userAvatar.src
        }
    });
    messageInput.value = "";
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

langInput.addEventListener('change', () => joinRoom(currentRoom)); // Re-join to re-translate history
document.getElementById('joinCustomBtn').addEventListener('click', () => {
    const custom = document.getElementById('customRoomInput').value.trim();
    if(custom) joinRoom(custom);
});


// --- SOCKET EVENTS ---

// 1. Receive Real-time Message
socket.on("chat-message", (data) => {
    renderMessage(data);
});

// 2. Receive History (When joining)
socket.on("room-history", (history) => {
    // Render all past messages
    history.forEach(msg => {
        renderMessage(msg);
    });
});

// 3. Receive Notification (Update Count)
socket.on('room-notification', (activeRoom) => {
    if (activeRoom !== currentRoom) {
        // Increment count if not in that room
        if (!unreadCounts[activeRoom]) unreadCounts[activeRoom] = 0;
        unreadCounts[activeRoom]++;
        updateBadge(activeRoom);
    }
});