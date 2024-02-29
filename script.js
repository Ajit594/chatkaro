// Get local video stream
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(function(stream) {
        var localVideo = document.getElementById('local-video');
        localVideo.srcObject = stream;
    })
    .catch(function(err) {
        console.log('Error accessing local media devices:', err);
    });

// Initialize socket.io for real-time communication
var socket = io();

// Listen for 'video-offer' event from the server
socket.on('video-offer', function(offer) {
    // Create peer connection
    var peerConnection = new RTCPeerConnection();

    // Add local stream to peer connection
    var localStream = document.getElementById('local-video').srcObject;
    localStream.getTracks().forEach(function(track) {
        peerConnection.addTrack(track, localStream);
    });

    // Set remote description
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(function() {
            // Create answer
            return peerConnection.createAnswer();
        })
        .then(function(answer) {
            // Set local description
            return peerConnection.setLocalDescription(answer);
        })
        .then(function() {
            // Send answer to the server
            socket.emit('video-answer', answer);
        })
        .catch(function(err) {
            console.log('Error creating or setting answer:', err);
        });

    // Listen for ICE candidates and send them to the server
    peerConnection.onicecandidate = function(event) {
        if (event.candidate) {
            socket.emit('ice-candidate', event.candidate);
        }
    };

    // Add remote stream to remote video element
    peerConnection.ontrack = function(event) {
        var remoteVideo = document.getElementById('remote-video');
        remoteVideo.srcObject = event.streams[0];
    };
});

// Listen for 'ice-candidate' event from the server
socket.on('ice-candidate', function(candidate) {
    // Add ICE candidate to peer connection
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(function(err) {
            console.log('Error adding ICE candidate:', err);
        });
});
