const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('../client'));

io.on('connection', (socket) => {

    console.log("User connected:", socket.id);

    socket.on('join-room', (roomName) => {

        // Leave previous rooms
        socket.rooms.forEach(room => {
            if (room !== socket.id) {
                socket.leave(room);
            }
        });

        socket.join(roomName);

        console.log(socket.id, "joined room:", roomName);
    });

    socket.on('chat-message', (data) => {

        const { room, message } = data;

        console.log("Message:", message, "Room:", room);

        io.to(room).emit('chat-message', message);
    });

});

server.listen(4000, () => {
    console.log("Server started on port 4000");
});
