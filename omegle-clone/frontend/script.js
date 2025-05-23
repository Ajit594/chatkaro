const socket = io();

const statusDiv = document.getElementById('status');
const findMatchBtn = document.getElementById('findMatchBtn');
const nextMatchBtn = document.getElementById('nextMatchBtn');
const chatBoxDiv = document.getElementById('chatBox');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const leaveChatBtn = document.getElementById('leaveChatBtn');

let partnerId = null;

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
    socket.emit('findMatch');
});

nextMatchBtn.addEventListener('click', () => {
    addMessage('Looking for a new match...', 'system');
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
});
