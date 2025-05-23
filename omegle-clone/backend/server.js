const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path'); // Added path module

const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const users = new Map(); // User store

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] A user connected: ${socket.id}`);
  users.set(socket.id, { status: 'idle' });
  console.log(`[${new Date().toISOString()}] User ${socket.id} connected and set to idle. Total users: ${users.size}`);

  socket.on('findMatch', () => {
    const currentUser = users.get(socket.id);
    if (!currentUser) {
        console.warn(`[${new Date().toISOString()}] 'findMatch' attempted by unknown user: ${socket.id}`);
        socket.emit('actionError', { message: 'Authentication error. Please reconnect.' });
        return;
    }

    // Check if user is already searching or chatting
    if (currentUser.status !== 'idle') {
        console.warn(`[${new Date().toISOString()}] User ${socket.id} attempted to 'findMatch' but is already ${currentUser.status}.`);
        socket.emit('actionError', { message: `Cannot start search, current status: ${currentUser.status}` });
        return;
    }

    currentUser.status = 'searching';
    console.log(`[${new Date().toISOString()}] User ${socket.id} is now searching for a match.`);

    let matchedPartnerId = null;
    // Iterate over all users to find a searching partner
    for (const [partnerId, partnerUser] of users) {
      // Check if the potential partner is not the current user and is also searching
      if (partnerId !== socket.id && partnerUser.status === 'searching') {
        // Match found
        currentUser.status = 'chatting';
        partnerUser.status = 'chatting';
        currentUser.partner = partnerId;
        partnerUser.partner = socket.id;

        matchedPartnerId = partnerId; // Store the matched partner's ID

        // Notify both users about the match
        io.to(socket.id).emit('matchFound', { partnerId: partnerId });
        io.to(partnerId).emit('matchFound', { partnerId: socket.id });

        console.log(`[${new Date().toISOString()}] User ${socket.id} matched with user ${partnerId}.`);
        break; // Exit the loop as a match has been found
      }
    }

    if (!matchedPartnerId) {
      // This log will be printed if the loop completes without finding a match
      console.log(`[${new Date().toISOString()}] User ${socket.id} is searching, no match found yet.`);
    }
  });

  socket.on('chatMessage', (data) => {
    const { recipientId, message } = data;
    const senderId = socket.id;
    const recipientSocket = io.sockets.sockets.get(recipientId);
    const senderUser = users.get(senderId);

    if (!senderUser) {
        console.warn(`[${new Date().toISOString()}] chatMessage from unknown user ${senderId}`);
        socket.emit('actionError', { message: 'Authentication error. Please reconnect.' });
        return;
    }
    
    if (recipientSocket) {
      if (senderUser.partner === recipientId) {
        recipientSocket.emit('chatMessage', { senderId, message });
        console.log(`[${new Date().toISOString()}] Message from ${senderId} to ${recipientId}: ${message}`);
      } else {
        console.warn(`[${new Date().toISOString()}] User ${senderId} tried to send message to ${recipientId} but they are not partners.`);
        socket.emit('actionError', { message: 'Message not sent. You are not connected with this user or your partner has changed.' });
      }
    } else {
      console.warn(`[${new Date().toISOString()}] Recipient ${recipientId} not found for message from ${senderId}.`);
      socket.emit('actionError', { message: 'Message not sent. Recipient is no longer connected.' });
    }
  });

  socket.on('leaveChat', () => {
    const currentUser = users.get(socket.id);
    if (currentUser && currentUser.status === 'chatting' && currentUser.partner) {
        const partnerSocketId = currentUser.partner;
        const partnerUser = users.get(partnerSocketId);

        if (partnerUser) {
            partnerUser.status = 'idle';
            delete partnerUser.partner;
            io.to(partnerSocketId).emit('partnerLeftChat');
            console.log(`[${new Date().toISOString()}] User ${partnerSocketId} was notified that ${socket.id} left the chat. Partner set to idle.`);
        }
        
        const oldPartnerId = currentUser.partner; // For logging
        currentUser.status = 'idle';
        delete currentUser.partner;
        socket.emit('leftChatSuccess');
        console.log(`[${new Date().toISOString()}] User ${socket.id} successfully left chat with ${oldPartnerId}.`);

    } else {
        console.warn(`[${new Date().toISOString()}] User ${socket.id} attempted to 'leaveChat' but was not in an active chat. Status: ${currentUser?.status}`);
        socket.emit('actionError', { message: 'You are not currently in a chat.' });
    }
  });

  socket.on('disconnect', () => {
    const disconnectedUser = users.get(socket.id);
    const timestamp = new Date().toISOString();
    if (disconnectedUser) {
      if (disconnectedUser.status === 'chatting' && disconnectedUser.partner) {
        const partnerSocketId = disconnectedUser.partner;
        const partnerUser = users.get(partnerSocketId);
        if (partnerUser) {
          io.to(partnerSocketId).emit('partnerDisconnected'); // Existing event, client should handle this
          partnerUser.status = 'idle';
          delete partnerUser.partner;
          console.log(`[${timestamp}] User ${socket.id} disconnected from chat with ${partnerSocketId}. Partner (${partnerSocketId}) set to idle.`);
        } else {
          console.log(`[${timestamp}] User ${socket.id} (who was in chat with ${partnerSocketId}) disconnected, but partner was not found.`);
        }
      } else if (disconnectedUser.status === 'searching') {
        console.log(`[${timestamp}] Searching user ${socket.id} disconnected.`);
      } else {
        console.log(`[${timestamp}] Idle user ${socket.id} disconnected.`);
      }
    }
    users.delete(socket.id);
    console.log(`[${timestamp}] User ${socket.id} disconnected. Total users: ${users.size}`);
  });
});

server.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Server listening on port ${port}`);
});
