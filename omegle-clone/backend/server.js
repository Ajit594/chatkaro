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
    const timestamp = new Date().toISOString();
    const currentUser = users.get(socket.id);

    if (!currentUser) {
        console.warn(`[${timestamp}] 'findMatch' attempt by unknown user: ${socket.id}`);
        socket.emit('actionError', { message: 'User not recognized. Please reconnect.' });
        return;
    }

    if (currentUser.status === 'chatting') {
        console.log(`[${timestamp}] User ${socket.id} (chatting) requested 'findMatch'. Ending current chat.`);
        const partnerSocketId = currentUser.partner;
        if (partnerSocketId) { // Check if partner exists
            const partnerUser = users.get(partnerSocketId);
            if (partnerUser) {
                partnerUser.status = 'idle';
                delete partnerUser.partner;
                io.to(partnerSocketId).emit('partnerLeftChat', { reason: 'Partner started a new search.' });
                console.log(`[${timestamp}] Notified user ${partnerSocketId} that ${socket.id} left chat (via findMatch). Partner set to idle.`);
            }
            delete currentUser.partner;
        }
        // currentUser.status will be set to 'searching' below.
        // No explicit currentUser.status = 'idle'; needed here as it's immediately set to 'searching'
    } else if (currentUser.status === 'searching') {
        console.warn(`[${timestamp}] User ${socket.id} attempted to 'findMatch' but is already 'searching'.`);
        socket.emit('actionError', { message: 'Already searching for a match. Please wait.' });
        return;
    }
    // If user was 'idle' or 'chatting' (and now effectively 'idle' regarding partnership), they proceed.

    currentUser.status = 'searching';
    console.log(`[${timestamp}] User ${socket.id} is now searching for a match.`);

    let matchedPartnerId = null;
    // Iterate over all users to find a searching partner
    for (const [partnerIdToMatch, partnerUserToMatch] of users) {
      // Check if the potential partner is not the current user and is also searching
      if (partnerIdToMatch !== socket.id && partnerUserToMatch.status === 'searching') {
        // Match found
        currentUser.status = 'chatting';
        partnerUserToMatch.status = 'chatting';
        currentUser.partner = partnerIdToMatch;
        partnerUserToMatch.partner = socket.id;

        matchedPartnerId = partnerIdToMatch; // Store the matched partner's ID

        // Notify both users about the match
        io.to(socket.id).emit('matchFound', { partnerId: partnerIdToMatch });
        io.to(partnerIdToMatch).emit('matchFound', { partnerId: socket.id });

        console.log(`[${timestamp}] User ${socket.id} matched with user ${partnerIdToMatch}.`);
        break; // Exit the loop as a match has been found
      }
    }

    if (!matchedPartnerId) {
      // This log will be printed if the loop completes without finding a match
      console.log(`[${timestamp}] User ${socket.id} is searching, no match found yet.`);
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

  // WebRTC Signaling Event Handlers
  socket.on('videoCallRequest', (data) => {
    const timestamp = new Date().toISOString();
    const requesterId = socket.id;
    const recipientId = data.to;

    const requester = users.get(requesterId);
    const recipient = users.get(recipientId);

    if (requester && requester.partner === recipientId && recipient && recipient.partner === requesterId) {
        console.log(`[${timestamp}] Relaying 'videoCallRequest' from ${requesterId} to ${recipientId}`);
        io.to(recipientId).emit('videoCallRequested', { from: requesterId });
    } else {
        console.warn(`[${timestamp}] Invalid 'videoCallRequest' from ${requesterId} to ${recipientId}. Partnership not valid or users not found.`);
        // Optionally emit an error back to requester:
        // socket.emit('actionError', { message: 'Could not send video call request: partner not found or invalid.' });
    }
  });

  socket.on('videoCallAccepted', (data) => {
    const timestamp = new Date().toISOString();
    const accepterId = socket.id;
    const originalRequesterId = data.to;

    const accepter = users.get(accepterId);
    const originalRequester = users.get(originalRequesterId);

    if (accepter && accepter.partner === originalRequesterId && originalRequester && originalRequester.partner === accepterId) {
        console.log(`[${timestamp}] Relaying 'videoCallAccepted' from ${accepterId} to ${originalRequesterId}`);
        io.to(originalRequesterId).emit('videoCallAccepted', { from: accepterId });
    } else {
        console.warn(`[${timestamp}] Invalid 'videoCallAccepted' from ${accepterId} to ${originalRequesterId}. Partnership not valid.`);
    }
  });

  socket.on('videoOffer', (data) => {
    const timestamp = new Date().toISOString();
    const offererId = socket.id;
    const recipientId = data.to;
    const sdpOffer = data.offer;

    const offerer = users.get(offererId);
    const recipient = users.get(recipientId);

    if (offerer && offerer.partner === recipientId && recipient && recipient.partner === offererId) {
        console.log(`[${timestamp}] Relaying 'videoOffer' from ${offererId} to ${recipientId}`);
        io.to(recipientId).emit('videoOfferReceived', { from: offererId, offer: sdpOffer });
    } else {
        console.warn(`[${timestamp}] Invalid 'videoOffer' from ${offererId} to ${recipientId}. Partnership not valid.`);
    }
  });

  socket.on('videoAnswer', (data) => {
    const timestamp = new Date().toISOString();
    const answererId = socket.id;
    const recipientId = data.to; // Original offerer
    const sdpAnswer = data.answer;

    const answerer = users.get(answererId);
    const recipient = users.get(recipientId);

    if (answerer && answerer.partner === recipientId && recipient && recipient.partner === answererId) {
        console.log(`[${timestamp}] Relaying 'videoAnswer' from ${answererId} to ${recipientId}`);
        io.to(recipientId).emit('videoAnswerReceived', { from: answererId, answer: sdpAnswer });
    } else {
        console.warn(`[${timestamp}] Invalid 'videoAnswer' from ${answererId} to ${recipientId}. Partnership not valid.`);
    }
  });

  socket.on('iceCandidate', (data) => {
    const timestamp = new Date().toISOString();
    const senderId = socket.id;
    const recipientId = data.to;
    const candidate = data.candidate;

    const sender = users.get(senderId);
    const recipient = users.get(recipientId);

    if (sender && sender.partner === recipientId && recipient && recipient.partner === senderId) {
        // console.log(`[${timestamp}] Relaying 'iceCandidate' from ${senderId} to ${recipientId}`); // Can be very noisy
        io.to(recipientId).emit('iceCandidateReceived', { from: senderId, candidate: candidate });
    } else {
        // console.warn(`[${timestamp}] Invalid 'iceCandidate' from ${senderId} to ${recipientId}. Partnership not valid.`); // Can be noisy
    }
  });

  socket.on('endVideoCall', (data) => {
    const timestamp = new Date().toISOString();
    const initiatorId = socket.id;
    const partnerId = data.to;

    const initiator = users.get(initiatorId);
    const partner = users.get(partnerId);

    if (initiator && initiator.partner === partnerId && partner && partner.partner === initiatorId) {
        console.log(`[${timestamp}] Relaying 'endVideoCall' from ${initiatorId} to ${partnerId}`);
        io.to(partnerId).emit('videoCallEnded', { from: initiatorId });
        // Server doesn't change its own state here, text chat partnership is separate
    } else {
        console.warn(`[${timestamp}] Invalid 'endVideoCall' from ${initiatorId} to ${partnerId}. Partnership not valid.`);
    }
  });

});

server.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Server listening on port ${port}`);
});
