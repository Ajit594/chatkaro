const socket = io();

const statusDiv = document.getElementById('status');
const findMatchBtn = document.getElementById('findMatchBtn');
const nextMatchBtn = document.getElementById('nextMatchBtn');
const chatBoxDiv = document.getElementById('chatBox');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const leaveChatBtn = document.getElementById('leaveChatBtn');

// Video Chat Elements
const videoChatArea = document.getElementById('videoChatArea');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const requestVideoBtn = document.getElementById('requestVideoBtn');
const acceptVideoBtn = document.getElementById('acceptVideoBtn');
const endVideoBtn = document.getElementById('endVideoBtn');
const muteAudioBtn = document.getElementById('muteAudioBtn');
const muteVideoBtn = document.getElementById('muteVideoBtn');

let localStream = null; // To store the local media stream
let partnerId = null;
let peerConnection = null;
const configuration = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // You might add more STUN/TURN servers here for robustness
    ]
};

function createPeerConnection(partnerSocketId) { // partnerSocketId is not directly used here, uses global partnerId
    if (peerConnection) {
        console.log(`[${new Date().toISOString()}] Closing existing peer connection before creating new one.`);
        peerConnection.close(); // Close existing connection
        peerConnection = null;
    }

    try {
        peerConnection = new RTCPeerConnection(configuration);
        console.log(`[${new Date().toISOString()}] RTCPeerConnection created.`);

        // Add local stream tracks if localStream is available
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
            console.log(`[${new Date().toISOString()}] Local stream tracks added to peer connection.`);
        } else {
            console.warn(`[${new Date().toISOString()}] Local stream not available when creating peer connection.`);
        }

        // Event handler for ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && partnerId) { 
                socket.emit('iceCandidate', { 
                    to: partnerId, 
                    candidate: event.candidate 
                });
            }
        };

        // Event handler for remote tracks
        peerConnection.ontrack = (event) => {
            console.log(`[${new Date().toISOString()}] Remote track received.`);
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                videoChatArea.style.display = 'block'; 
                remoteVideo.style.display = 'block'; 
            } else {
                if (!remoteVideo.srcObject && event.track) {
                    let inboundStream = new MediaStream();
                    inboundStream.addTrack(event.track);
                    remoteVideo.srcObject = inboundStream;
                     videoChatArea.style.display = 'block';
                     remoteVideo.style.display = 'block';
                }
            }
        };

        // Event handler for ICE connection state changes
        peerConnection.oniceconnectionstatechange = () => {
            console.log(`[${new Date().toISOString()}] ICE Connection State: ${peerConnection?.iceConnectionState}`);
            if (peerConnection?.iceConnectionState === 'failed' || 
                peerConnection?.iceConnectionState === 'disconnected' || 
                peerConnection?.iceConnectionState === 'closed') {
                // Consider calling a cleanup function if state is 'closed' or 'failed'.
            }
        };
        
        peerConnection.onsignalingstatechange = () => {
            console.log(`[${new Date().toISOString()}] Signaling State: ${peerConnection?.signalingState}`);
        };


    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error creating RTCPeerConnection:`, error);
        addMessage('Error setting up video connection.', 'system');
        return null; 
    }
    return peerConnection; 
}

function closePeerConnection() {
    if (peerConnection) {
        console.log(`[${new Date().toISOString()}] Closing peer connection.`);
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onsignalingstatechange = null;
        
        peerConnection.close();
        peerConnection = null;
    }
}

function addMessage(message, type) { // type can be 'you', 'stranger', or 'system'
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.classList.add(type + '-message'); // e.g., 'system-message'
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Scroll to bottom
}

findMatchBtn.addEventListener('click', () => {
    statusDiv.textContent = 'Searching for a match...';
    findMatchBtn.disabled = true;
    nextMatchBtn.style.display = 'none';
    leaveChatBtn.style.display = 'none';
    resetVideoCallUI(); // Reset video UI when starting a new search
    socket.emit('findMatch');
});

nextMatchBtn.addEventListener('click', () => {
    addMessage('Looking for a new match...', 'system');
    resetVideoCallUI(); // Reset video UI for next match
    socket.emit('findMatch'); 
    chatBoxDiv.style.display = 'none';
    messagesDiv.innerHTML = ''; 
    nextMatchBtn.style.display = 'none';
    leaveChatBtn.style.display = 'none';
    statusDiv.textContent = 'Searching for a new match...';
    partnerId = null; 
});

leaveChatBtn.addEventListener('click', () => {
    if (partnerId) { 
        socket.emit('leaveChat');
    }
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && partnerId) {
        socket.emit('chatMessage', { recipientId: partnerId, message: message });
        addMessage(`You: ${message}`, 'you');
        messageInput.value = '';
    }
}

socket.on('connect', () => {
    statusDiv.textContent = 'Connected to server. Click "Find Match".';
    findMatchBtn.disabled = false;
});

async function startLocalMedia() {
    try {
        // Make videoChatArea visible as soon as user attempts to start video
        videoChatArea.style.display = 'block'; 
        statusDiv.textContent = 'Requesting camera/microphone access...';

        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        statusDiv.textContent = 'Local video started. Waiting for partner to accept...'; // Or similar
        requestVideoBtn.style.display = 'none';
        acceptVideoBtn.style.display = 'none'; // Hide if it was visible
        endVideoBtn.style.display = 'inline-block';
        muteAudioBtn.style.display = 'inline-block';
        muteVideoBtn.style.display = 'inline-block';
        return true; // Indicate success
    } catch (error) {
        console.error('Error accessing media devices.', error);
        addMessage(`Error accessing media devices: ${error.name}. Ensure permissions are granted.`, 'system');
        statusDiv.textContent = 'Could not start video. Check permissions.';
        videoChatArea.style.display = 'none'; // Hide if failed
        // Reset any other relevant UI state if needed
        requestVideoBtn.style.display = 'inline-block'; // Show request button again if failed
        endVideoBtn.style.display = 'none';
        muteAudioBtn.style.display = 'none';
        muteVideoBtn.style.display = 'none';
        return false; // Indicate failure
    }
}

requestVideoBtn.addEventListener('click', async () => {
    if (!partnerId) {
        addMessage('Cannot start video call, no partner found.', 'system');
        return;
    }
    const mediaStarted = await startLocalMedia();
    if (mediaStarted && partnerId) {
        socket.emit('videoCallRequest', { to: partnerId }); // Inform partner
        statusDiv.textContent = 'Video call requested...';
        // UI already updated by startLocalMedia success
    } else if (!mediaStarted) {
        // Error already handled by startLocalMedia
        statusDiv.textContent = 'Failed to start local video. Cannot request video call.';
    }
});

acceptVideoBtn.addEventListener('click', async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 'acceptVideoBtn' clicked.`);

    if (!partnerId) { // partnerId should be set from 'videoCallRequested' or earlier text match
        addMessage('Error: Partner ID not found to accept call.', 'system');
        return;
    }

    const mediaStarted = await startLocalMedia(); // Get local media first
    if (!mediaStarted) {
        statusDiv.textContent = 'Failed to start local media. Cannot accept video call.';
        acceptVideoBtn.style.display = 'inline-block'; // Allow trying again, or hide
        return;
    }

    // At this point, localStream is available.
    // createPeerConnection will add localStream tracks.
    if (!createPeerConnection(partnerId)) { // Pass partnerId to createPeerConnection
         addMessage('Failed to setup video connection. Please try again.', 'system');
         return;
    }
    
    // Notify the original caller that the call was accepted.
    // The original caller will then create and send the offer.
    socket.emit('videoCallAccepted', { to: partnerId }); 
    console.log(`[${timestamp}] Emitted 'videoCallAccepted' to ${partnerId}.`);

    statusDiv.textContent = 'Video call accepted. Waiting for connection...';
    acceptVideoBtn.style.display = 'none';
    requestVideoBtn.style.display = 'none';
    endVideoBtn.style.display = 'inline-block'; // Show end call, mute buttons
    muteAudioBtn.style.display = 'inline-block';
    muteVideoBtn.style.display = 'inline-block';
});


socket.on('matchFound', (data) => {
    partnerId = data.partnerId;
    statusDiv.textContent = `Matched with a stranger! (${partnerId.substring(0,6)}...) Start chatting.`;
    chatBoxDiv.style.display = 'block';
    messagesDiv.innerHTML = ''; 
    findMatchBtn.disabled = true;
    findMatchBtn.style.display = 'none'; 
    nextMatchBtn.style.display = 'inline-block'; 
    leaveChatBtn.style.display = 'inline-block';
    messageInput.focus();

    // Video UI reset and setup for new match
    resetVideoCallUI(); // Clear any previous video state first
    videoChatArea.style.display = 'block'; // Show the video area
    requestVideoBtn.style.display = 'inline-block'; // Show request button
    // Other video buttons remain hidden until video call is active/requested
});

socket.on('chatMessage', (data) => {
    addMessage(`${data.message}`, 'stranger'); // Message content is just the message
});

function handlePartnerLeftOrDisconnected(reason) {
    addMessage(reason, 'system');
    statusDiv.textContent = `${reason}. Find a new match?`;
    partnerId = null;
    chatBoxDiv.style.display = 'none';
    messageInput.value = '';
    leaveChatBtn.style.display = 'none';
    resetVideoCallUI(); // Reset video UI
    
    findMatchBtn.disabled = false;
    findMatchBtn.style.display = 'inline-block';
    nextMatchBtn.style.display = 'none'; 
}

socket.on('partnerDisconnected', () => {
    handlePartnerLeftOrDisconnected('Partner has disconnected');
});

socket.on('partnerLeftChat', () => {
    handlePartnerLeftOrDisconnected('Partner has left the chat');
});

socket.on('leftChatSuccess', () => {
    addMessage('You have left the chat.', 'system');
    statusDiv.textContent = 'Successfully left chat. Find a new match?';
    partnerId = null;
    chatBoxDiv.style.display = 'none';
    messageInput.value = '';
    leaveChatBtn.style.display = 'none';
    resetVideoCallUI(); // Reset video UI

    findMatchBtn.disabled = false;
    findMatchBtn.style.display = 'inline-block';
    nextMatchBtn.style.display = 'none';
});


socket.on('actionError', (data) => {
    addMessage(`Error: ${data.message}`, 'system'); 
    console.warn('Received actionError:', data.message);
    // Potentially reset parts of the UI based on the error
    if (data.message.includes('Cannot start search') || data.message.includes('Authentication error')) {
        findMatchBtn.disabled = false;
        findMatchBtn.style.display = 'inline-block';
        nextMatchBtn.style.display = 'none';
        leaveChatBtn.style.display = 'none';
        statusDiv.textContent = 'Could not start search. Try again.';
        // If user was in a chat, ensure chat UI is hidden
        if (chatBoxDiv.style.display === 'block') {
             chatBoxDiv.style.display = 'none';
             partnerId = null; // Clear partner if any error occurs that boots them from chat
        }
    }
    // Add other specific error handling UI resets if needed
});

socket.on('disconnect', () => {
    statusDiv.textContent = 'Disconnected from server. Please refresh.';
    findMatchBtn.disabled = true;
    nextMatchBtn.style.display = 'none';
    leaveChatBtn.style.display = 'none';
    chatBoxDiv.style.display = 'none';
    resetVideoCallUI(); // Reset video UI
});

endVideoBtn.addEventListener('click', () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 'endVideoBtn' clicked.`);
    
    if (partnerId) { // Notify partner only if there was one
        socket.emit('endVideoCall', { to: partnerId });
        console.log(`[${timestamp}] Emitted 'endVideoCall' to ${partnerId}.`);
    }
    
    resetVideoCallUI(); // This will close peerConnection and stop localStream tracks

    // Specific UI updates after local termination
    statusDiv.textContent = 'You ended the video call.';
    if (partnerId) { // If text chat is still active
        // requestVideoBtn.style.display = 'inline-block'; // This is now handled by resetVideoCallUI
        statusDiv.textContent += ' Request new video call or continue text chat.';
    } else {
        // If no partner (e.g. they disconnected text chat before video ended)
        // resetVideoCallUI already hides requestVideoBtn if partnerId is null.
        // findMatchBtn should be visible from text chat termination logic.
    }
});

socket.on('iceCandidateReceived', async (data) => {
    const timestamp = new Date().toISOString();
    // console.log(`[${timestamp}] Received 'iceCandidateReceived' from ${data.from}, candidate:`, data.candidate); // Can be very noisy

    if (!peerConnection) {
        // console.warn(`[${timestamp}] Received ICE candidate but no peer connection is established. Candidate ignored.`);
        // This can happen if candidates arrive before the offer/answer cycle is fully ready on this client,
        // or after a connection has been closed. Usually, the browser/WebRTC handles buffering to some extent.
        return;
    }

    if (data.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            // console.log(`[${timestamp}] ICE candidate added successfully.`); // Also noisy
        } catch (error) {
            console.error(`[${timestamp}] Error adding received ICE candidate:`, error);
            // Informing user might be too much, but log is important.
        }
    }
});

socket.on('videoCallAccepted', async (data) => {
    const timestamp = new Date().toISOString();
    const accepterId = data.from; // This is our partnerId
    console.log(`[${timestamp}] Received 'videoCallAccepted' from ${accepterId}. This client is the caller.`);

    if (!localStream) {
        console.error(`[${timestamp}] Call accepted, but local stream not ready for caller. Aborting offer.`);
        addMessage('Error: Your local media is not ready. Cannot proceed with video call.', 'system');
        // Consider calling resetVideoCallUI() or specific cleanup
        return;
    }

    // Now create the peer connection and the offer
    if (!createPeerConnection(accepterId)) { // Create PC for the partner who accepted
        addMessage('Failed to setup video connection. Please try again.', 'system');
        return;
    }

    try {
        const offer = await peerConnection.createOffer();
        console.log(`[${timestamp}] Offer created by caller.`);

        await peerConnection.setLocalDescription(offer);
        console.log(`[${timestamp}] Local description set with offer by caller.`);

        socket.emit('videoOffer', { to: accepterId, offer: offer });
        console.log(`[${timestamp}] Emitted 'videoOffer' to ${accepterId}.`);

        statusDiv.textContent = 'Video offer sent. Waiting for answer...';
        // UI for end/mute buttons should already be visible from startLocalMedia()
    } catch (error) {
        console.error(`[${timestamp}] Error creating or sending video offer:`, error);
        addMessage('Error starting video call.', 'system');
        // Consider cleanup
    }
});

socket.on('videoCallRequested', async (data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received 'videoCallRequested' from ${data.from}`);
    
    // Assuming partnerId is already set from text chat match.
    // If not, you might need to set it: partnerId = data.from;

    if (socket.id === data.from) { // Should not happen if server logic is correct
        console.warn(`[${timestamp}] Received 'videoCallRequested' from self. Ignoring.`);
        return;
    }

    // Update UI to show incoming call
    statusDiv.textContent = `Incoming video call from partner...`;
    videoChatArea.style.display = 'block';
    requestVideoBtn.style.display = 'none';
    acceptVideoBtn.style.display = 'inline-block'; // Show accept button
    endVideoBtn.style.display = 'none'; // Hide end call until accepted
    muteAudioBtn.style.display = 'none';
    muteVideoBtn.style.display = 'none';

    // Optional: Add a timeout to auto-reject if not accepted? (More advanced)
});

socket.on('videoOfferReceived', async (data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received 'videoOfferReceived' from ${data.from}`);

    if (!localStream) {
        console.error(`[${timestamp}] Received video offer but local stream is not ready. Ignoring offer.`);
        addMessage('Error: Local media not ready to receive video offer.', 'system');
        // Potentially, auto-start local media here if desired, or ensure UI flow prevents this.
        // For now, if acceptVideoBtn click is the only way to get here, localStream should be ready.
        return; 
    }

    // Ensure peerConnection is created, typically after local media is confirmed.
    // This might have been created if this client clicked "Accept".
    // If this client *made* the request and is now getting an offer (less common for this event name, but for robustness):
    if (!peerConnection) {
        console.log(`[${timestamp}] PeerConnection not found, creating one for incoming offer.`);
        if (!createPeerConnection(data.from)) { // Pass offerer's ID
            addMessage('Failed to setup video connection for offer. Please try again.', 'system');
            return;
        }
    }
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        console.log(`[${timestamp}] Remote description set from offer.`);

        const answer = await peerConnection.createAnswer();
        console.log(`[${timestamp}] Answer created.`);

        await peerConnection.setLocalDescription(answer);
        console.log(`[${timestamp}] Local description set with answer.`);

        socket.emit('videoAnswer', { to: data.from, answer: answer });
        console.log(`[${timestamp}] Emitted 'videoAnswer' to ${data.from}.`);

        statusDiv.textContent = 'Video call connected.'; // Or "Video call in progress"
        // Ensure video controls are appropriately visible
        endVideoBtn.style.display = 'inline-block';
        muteAudioBtn.style.display = 'inline-block';
        muteVideoBtn.style.display = 'inline-block';
        acceptVideoBtn.style.display = 'none';
        requestVideoBtn.style.display = 'none';

    } catch (error) {
        console.error(`[${timestamp}] Error handling video offer or creating answer:`, error);
        addMessage('Error connecting video call.', 'system');
        // Consider cleanup or emitting an error to partner
    }
});

socket.on('videoCallEnded', (data) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received 'videoCallEnded' from ${data.from}.`);
    
    addMessage('Partner has ended the video call.', 'system');
    resetVideoCallUI();

    // Specific UI updates after remote termination
    statusDiv.textContent = 'Partner ended the video call.';
    if (partnerId) { // If text chat is still active
        // requestVideoBtn.style.display = 'inline-block'; // This is now handled by resetVideoCallUI
        statusDiv.textContent += ' Request new video call or continue text chat.';
    } else {
        // If no partner (e.g. they disconnected text chat before video ended)
        // resetVideoCallUI already hides requestVideoBtn if partnerId is null.
    }
});


function resetVideoCallUI() {
    closePeerConnection(); // Closes peerConnection and sets it to null

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        console.log(`[${new Date().toISOString()}] Local stream stopped and cleared.`);
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    remoteVideo.style.display = 'none'; // Explicitly hide remote video element

    videoChatArea.style.display = 'none';
    // requestVideoBtn.style.display = 'none'; // Initial state, will be updated below
    acceptVideoBtn.style.display = 'none';
    endVideoBtn.style.display = 'none';
    muteAudioBtn.style.display = 'none';
    muteVideoBtn.style.display = 'none';

    // New logic: After cleanup, if still partnered (text chat active), allow requesting video again.
    if (partnerId) {
        requestVideoBtn.style.display = 'inline-block';
        // Status text will be set by the calling function (endVideoBtn listener or 'videoCallEnded' listener)
    } else {
        requestVideoBtn.style.display = 'none';
    }
    console.log(`[${new Date().toISOString()}] Video call UI reset.`);
});
