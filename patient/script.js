// patient Dashboard JavaScript

// State management
let patientToken = null;
let patientPubkey = null;
let currentPatients = [];
let billingConfig = {
    storageRate: 10, // sats per MB per month
    baseRate: 1000   // base hosting fee per month
};

let peerConnection = null;
let localStream = null;
let isInRoom = false;

// DOM elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginStatus = document.getElementById('loginStatus');
const patientName = document.getElementById('patientName');
const messageDiv = document.getElementById('message');

// Dashboard elements
const totalRepos = document.getElementById('totalRepos');
const totalUsers = document.getElementById('totalUsers');
const serverUptime = document.getElementById('serverUptime');
const monthlyRevenue = document.getElementById('monthlyRevenue');
const pendingInvoices = document.getElementById('pendingInvoices');
const totalStorage = document.getElementById('totalStorage');
const patientsTable = document.getElementById('patientsTable').getElementsByTagName('tbody')[0];

// Billing elements
const storageRateInput = document.getElementById('storageRate');
const baseRateInput = document.getElementById('baseRate');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const generateAllInvoicesBtn = document.getElementById('generateAllInvoicesBtn');
const sendOverdueRemindersBtn = document.getElementById('sendOverdueRemindersBtn');
const refreshPatientsBtn = document.getElementById('refreshPatientsBtn');

// Modal elements
const invoiceModal = document.getElementById('invoiceModal');
const closeModal = document.querySelector('.close');
const sendInvoiceBtn = document.getElementById('sendInvoiceBtn');
const cancelInvoiceBtn = document.getElementById('cancelInvoiceBtn');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkExistingAuth();
    loadBillingConfig();
    
    // Add all event listeners here instead of inline onclick
    setupEventListeners();
});

function setupEventListeners() {
    // Authentication buttons
    loginBtn.addEventListener('click', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    
    // Billing config
    saveConfigBtn.addEventListener('click', saveBillingConfig);
    
    // Bulk actions
    generateAllInvoicesBtn.addEventListener('click', generateAllInvoices);
    sendOverdueRemindersBtn.addEventListener('click', sendOverdueReminders);
    refreshPatientsBtn.addEventListener('click', loadPatientData);
    
    // Modal actions
    sendInvoiceBtn.addEventListener('click', sendInvoice);
    cancelInvoiceBtn.addEventListener('click', closeInvoiceModal);
    closeModal.addEventListener('click', closeInvoiceModal);
    
    // room stuff
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');
    
    joinRoomBtn.addEventListener('click', joinWebRTCRoom);
    leaveRoomBtn.addEventListener('click', leaveWebRTCRoom);
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === invoiceModal) {
            closeInvoiceModal();
        }
    });
}

/* WebRTC Stuff */
async function joinWebRTCRoom() {
    try {
        const roomId = document.getElementById('testRoomId').value.trim();
        if (!roomId) {
            showMessage('Please enter a room ID', 'error');
            return;
        }
        
        showMessage('Joining WebRTC room...', 'info');
        updateConnectionStatus('Connecting...');
        
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        document.getElementById('localVideo').srcObject = localStream;
        
        // Create peer connection
        peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Add local stream to peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
        console.log('Received remote stream');
        console.log('Event object:', event);
        console.log('Event streams:', event.streams);
        console.log('Event streams length:', event.streams ? event.streams.length : 'no streams');
        
        if (event.streams && event.streams[0]) {
            const stream = event.streams[0];
            console.log('Stream object:', stream);
            console.log('Stream tracks:', stream.getTracks());
            console.log('Stream tracks length:', stream.getTracks().length);
            console.log('Stream active:', stream.active);
            
            // Check what kind of tracks we have
            stream.getTracks().forEach((track, index) => {
            console.log(`Track ${index}:`, track.kind, track.enabled, track.readyState);
            });
            
            document.getElementById('remoteVideo').srcObject = stream;
        } else {
            console.log('No stream in event.streams[0]');
            
            // Try the track directly
            if (event.track) {
            console.log('Trying event.track directly:', event.track);
            const stream = new MediaStream([event.track]);
            document.getElementById('remoteVideo').srcObject = stream;
            }
        }
        };
        
        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            updateConnectionStatus(peerConnection.connectionState);
        };
        
        // Join room via signaling server
        const joinResponse = await fetch(`/api/webrtc/rooms/${roomId}/join`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${patientToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const joinResult = await joinResponse.json();
        console.log('patient joined room:', joinResult);
        
        updateRoomParticipants(joinResult.participants);
        isInRoom = true;
        
        startParticipantCountUpdates(roomId);

        // Start signaling loop
        await startpatientSignalingLoop(roomId);
        
        // Update UI
        document.getElementById('joinRoomBtn').disabled = true;
        document.getElementById('leaveRoomBtn').disabled = false;
        
        showMessage(`Joined room: ${roomId}`, 'success');
        
    } catch (error) {
        console.error('Error joining WebRTC room:', error);
        showMessage(`Failed to join room: ${error.message}`, 'error');
    }
}

async function startpatientSignalingLoop(roomId) {
    console.log('=== patient: Starting signaling loop ===');
    // Handle ICE candidates (web API works fine here)
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            console.log('patient: Sending ICE candidate');
            try {
                await fetch(`/api/webrtc/rooms/${roomId}/ice-candidate`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${patientToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ candidate: event.candidate })
                });
            } catch (error) {
                console.error('patient: Error sending ICE candidate:', error);
            }
        }
    };
    
    // Poll for ICE candidates from client
    const pollForIceCandidates = setInterval(async () => {
        try {
            if (!isInRoom) {
                clearInterval(pollForIceCandidates);
                return;
            }
            
            const response = await fetch(`/api/webrtc/rooms/${roomId}/ice-candidates`, {
                headers: { 'Authorization': `Bearer ${patientToken}` }
            });
            
            const { candidates } = await response.json();
            
            if (candidates && candidates.length > 0) {
                console.log(`patient: Received ${candidates.length} ICE candidates`);
                for (const candidateData of candidates) {
                    console.log('patient: Adding remote ICE candidate');
                    await peerConnection.addIceCandidate(candidateData.candidate);
                }
            }
        } catch (error) {
            console.error('patient: Error handling ICE candidates:', error);
        }
    }, 2000);
        
    // Check for existing offers (from mobile clients)
    const checkOffers = setInterval(async () => {
        try {
            if (!isInRoom) {
                clearInterval(checkOffers);
                clearInterval(pollForIceCandidates); // Clean up ICE polling too
                return;
            }
            
            console.log('patient: Checking for offers...');
            
            const response = await fetch(`/api/webrtc/rooms/${roomId}/offer`, {
                headers: { 'Authorization': `Bearer ${patientToken}` }
            });
            
            const { offer } = await response.json();
            console.log('patient: Offer check result:', offer ? 'OFFER FOUND' : 'no offer yet');
            
            if (offer && offer.offer) {
                clearInterval(checkOffers);
                console.log('patient: Processing offer from client...');
                
                await peerConnection.setRemoteDescription(offer.offer);
                console.log('patient: Set remote description from client offer');
                
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log('patient: Created and set local answer');
                
                const answerResponse = await fetch(`/api/webrtc/rooms/${roomId}/answer`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${patientToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ answer })
                });
                
                console.log('patient: Sent answer to server, response:', answerResponse.status);
                console.log('patient: ✅ Answer sent! Connection should be established.');
            }
        } catch (error) {
            console.error('Error in patient signaling loop:', error);
        }
    }, 2000);
}

async function leaveWebRTCRoom() {
    try {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        
        if (participantEventSource) {
            participantEventSource.close();
            participantEventSource = null;
        }
        
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('remoteVideo').srcObject = null;
        
        isInRoom = false;
        
        // Update UI
        document.getElementById('joinRoomBtn').disabled = false;
        document.getElementById('leaveRoomBtn').disabled = true;
        
        updateConnectionStatus('Disconnected');
        updateRoomParticipants(0);
        
        showMessage('Left WebRTC room', 'info');
        
    } catch (error) {
        console.error('Error leaving room:', error);
        showMessage(`Error leaving room: ${error.message}`, 'error');
    }
}

function updateConnectionStatus(status) {
    document.getElementById('connectionStatus').textContent = `Status: ${status}`;
}

function updateRoomParticipants(count) {
    document.getElementById('roomParticipants').textContent = `Participants: ${count}`;
}

// Add this new function after your existing WebRTC functions:
let participantEventSource = null;

function startParticipantCountUpdates(roomId) {
  // Close existing connection if any
  if (participantEventSource) {
    participantEventSource.close();
  }
  
  // Create new SSE connection
  participantEventSource = new EventSource(`/api/webrtc/rooms/${roomId}/events`, {
    headers: {
      'Authorization': `Bearer ${patientToken}`
    }
  });
  
  participantEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'participant_count') {
        console.log('📡 Received participant count update:', data.count);
        updateRoomParticipants(data.count);
      }
    } catch (error) {
      console.error('Error parsing SSE message:', error);
    }
  };
  
  participantEventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
  };
  
  console.log('📡 Started listening for participant count updates');
}

// Authentication functions
async function handleLogin() {
    try {
        showMessage('Connecting to Nostr...', 'info');
        
        if (!window.nostr) {
            throw new Error('Please install a Nostr browser extension like nos2x');
        }
        
        // Step 1: Get challenge
        const challengeRes = await fetch('/api/auth/nostr/challenge', { 
            method: 'POST' 
        });
        const { challenge } = await challengeRes.json();
        
        // Step 2: Sign with Nostr extension
        const signedEvent = await window.nostr.signEvent({
            kind: 1,
            content: challenge,
            tags: [['challenge', challenge]],
            created_at: Math.floor(Date.now() / 1000)
        });
        
        // Step 3: Verify signature
        const verifyRes = await fetch('/api/auth/nostr/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signedEvent })
        });
        
        const { status, token, pubkey, metadata } = await verifyRes.json();
        
        if (status === 'OK') {
            // TODO: Add server-side check that this pubkey is authorized as patient
            // For now, we assume the person with Nostr access is the patient
            
            patientToken = token;
            patientPubkey = pubkey;
            
            // Store credentials
            localStorage.setItem('patient_token', token);
            localStorage.setItem('patient_pubkey', pubkey);
            
            // Update UI
            const displayName = metadata?.display_name || metadata?.name || 'patientistrator';
            patientName.textContent = displayName;
            
            showDashboard();
            showMessage('patient login successful!', 'success');
            
        } else {
            throw new Error('Authentication failed');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showMessage(`Login failed: ${error.message}`, 'error');
    }
}

function handleLogout() {
    patientToken = null;
    patientPubkey = null;
    localStorage.removeItem('patient_token');
    localStorage.removeItem('patient_pubkey');
    
    showLogin();
    showMessage('Logged out successfully', 'info');
}

function checkExistingAuth() {
    const token = localStorage.getItem('patient_token');
    const pubkey = localStorage.getItem('patient_pubkey');
    
    if (token && pubkey) {
        patientToken = token;
        patientPubkey = pubkey;
        showDashboard();
    }
}

/* Profile Pic Management */
async function fetchProfilePicture(pubkey, displayName) {
    try {
        showMessage('Fetching profile...', 'info');
        
        const profile = await fetchNostrProfile(pubkey);
        if (profile?.picture) {
            displayProfilePicture(profile.picture, displayName);
        } else {
            displayInitials(displayName);
        }
    } catch (error) {
        console.error('Error fetching profile picture:', error);
        displayInitials(displayName);
    }
}

async function fetchNostrProfile(hexPubkey) {
    return new Promise((resolve, reject) => {
        const relays = [
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.snort.social',
            'wss://relay.nostr.band'
        ];
        
        let currentRelayIndex = 0;
        const timeoutMs = 8000;
        
        const tryNextRelay = () => {
            if (currentRelayIndex >= relays.length) {
                reject(new Error('All relays failed to provide profile'));
                return;
            }
            
            const relayUrl = relays[currentRelayIndex++];
            console.log(`Trying relay: ${relayUrl}`);
            
            tryFetchFromRelay(relayUrl, hexPubkey, timeoutMs / relays.length)
            .then(resolve)
            .catch((error) => {
                console.log(`Relay ${relayUrl} failed: ${error.message}`);
                tryNextRelay();
            });
        };
        
        tryNextRelay();
    });
}

function tryFetchFromRelay(relayUrl, hexPubkey, timeoutMs) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(relayUrl);
        let resolved = false;
        
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.close();
                reject(new Error('Timeout'));
            }
        }, timeoutMs);
        
        ws.onopen = () => {
            console.log('Connected to relay:', relayUrl);
            
            const subscription_id = 'patient_profile_' + Math.random().toString(36).substring(7);
            const subscription = {
                kinds: [0],
                authors: [hexPubkey],
                limit: 1
            };
            
            ws.send(JSON.stringify(['REQ', subscription_id, subscription]));
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                
                if (message[0] === 'EVENT' && message[2]?.kind === 0) {
                    const profileEvent = message[2];
                    const profile = JSON.parse(profileEvent.content);
                    
                    console.log('Found patient profile:', profile.name || profile.display_name || 'unnamed');
                    
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve(profile);
                    }
                } else if (message[0] === 'EOSE') {
                    // End of stored events - no profile found
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        ws.close();
                        resolve(null);
                    }
                }
            } catch (error) {
                console.error('Error parsing relay message:', error);
            }
        };
        
        ws.onerror = () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(new Error('WebSocket error'));
            }
        };
        
        ws.onclose = () => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(new Error('Connection closed'));
            }
        };
    });
}

function displayProfilePicture(pictureUrl, displayName) {
    const patientInfoDiv = document.querySelector('.patient-info');
    
    // Remove existing profile elements
    removeExistingProfileElements();
    
    // Create profile picture container
    const profileContainer = document.createElement('div');
    profileContainer.className = 'patient-profile-container';
    
    const profilePic = document.createElement('img');
    profilePic.className = 'patient-profile-pic';
    profilePic.src = pictureUrl;
    profilePic.alt = 'patient Profile';
    
    // Handle image load error - fallback to initials
    profilePic.onerror = () => {
        profileContainer.remove();
        displayInitials(displayName);
    };
    
    profilePic.onload = () => {
        console.log('Profile picture loaded successfully');
    };
    
    profileContainer.appendChild(profilePic);
    
    // Insert before the patient name
    patientInfoDiv.insertBefore(profileContainer, patientName);
}

function displayInitials(name) {
    const patientInfoDiv = document.querySelector('.patient-info');
    
    // Remove existing profile elements
    removeExistingProfileElements();
    
    // Create initials container
    const initialsContainer = document.createElement('div');
    initialsContainer.className = 'patient-profile-container patient-initials';
    
    const initials = getInitials(name);
    initialsContainer.textContent = initials;
    
    // Insert before the patient name
    patientInfoDiv.insertBefore(initialsContainer, patientName);
}

function removeExistingProfileElements() {
    const patientInfoDiv = document.querySelector('.patient-info');
    const existingElements = patientInfoDiv.querySelectorAll('.patient-profile-container');
    existingElements.forEach(el => el.remove());
}

function getInitials(name) {
    if (!name) return 'A';
    return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

// UI management
function showLogin() {
    loginSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
}

function showDashboard() {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    if (metadata?.picture) {
        displayProfilePicture(metadata.picture, displayName);
    } else {
        // Try to fetch profile from Nostr if no picture in initial metadata
        fetchProfilePicture(pubkey, displayName);
    }

    loadDashboardData();
}

// Dashboard data loading
async function loadDashboardData() {
    await Promise.all([
        // loadServerStats(),
        // loadPatientData(),
        // loadBillingStats()
    ]);
}

// Invoice modal functions
function openInvoiceModal(patientId) {
    const patient = currentPatients.find(p => p.id === patientId);
    if (!patient) return;
    
    const monthlyCost = calculateMonthlyCost(patient.storageUsed);
    
    document.getElementById('invoicePatientName').textContent = patient.name;
    document.getElementById('invoiceBaseFee').textContent = `${billingConfig.baseRate} sats`;
    document.getElementById('invoiceStorageAmount').textContent = patient.storageUsed;
    document.getElementById('invoiceStorageFee').textContent = `${patient.storageUsed * billingConfig.storageRate} sats`;
    document.getElementById('invoiceTotal').innerHTML = `<strong>${monthlyCost} sats</strong>`;
    
    // Store patient ID for later use
    invoiceModal.setAttribute('data-patient-id', patientId);
    
    invoiceModal.classList.remove('hidden');
}

function closeInvoiceModal() {
    invoiceModal.classList.add('hidden');
}

async function sendInvoice() {
    const patientId = invoiceModal.getAttribute('data-patient-id');
    const patient = currentPatients.find(p => p.id === patientId);
    const description = document.getElementById('invoiceDescription').value;
    const amount = calculateMonthlyCost(patient.storageUsed);
    
    try {
        showMessage('Generating Lightning invoice...', 'info');
        
        const response = await fetch('/api/patient/invoice', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${patientToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                patientId: patient.id,
                amount: amount,
                description: description
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showMessage(`Lightning invoice generated and sent to ${patient.name}`, 'success');
            console.log('Generated invoice:', {
                id: result.invoice.id,
                amount: result.invoice.amount,
                paymentRequest: result.invoice.paymentRequest.paymentRequest.substring(0, 50) + '...', // many layers deep, inception
                status: result.invoice.status
            });
            
            closeInvoiceModal();
            
            // Update patient status
            patient.paymentStatus = 'pending';
            patient.totalOwed = amount;
            patient.lastInvoice = {
                id: result.invoice.id,
                amount: result.invoice.amount,
                paymentRequest: result.invoice.paymentRequest,
                createdAt: result.invoice.createdAt,
                expiresAt: result.invoice.expiresAt
            };
            
            renderPatientsTable();
            loadBillingStats();
            
        } else {
            throw new Error(result.reason || 'Invoice generation failed');
        }
        
    } catch (error) {
        console.error('Invoice sending error:', error);
        showMessage(`Failed to send invoice: ${error.message}`, 'error');
    }
}

// Add event listeners to patient action buttons
function addPatientButtonListeners() {
    // Bill Patient buttons
    const billButtons = document.querySelectorAll('.bill-patient-btn');
    billButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const patientId = e.target.getAttribute('data-patient-id');
            openInvoiceModal(patientId);
        });
    });
    
    // Remind buttons
    const remindButtons = document.querySelectorAll('.remind-patient-btn');
    remindButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const patientId = e.target.getAttribute('data-patient-id');
            sendReminder(patientId);
        });
    });
}

// Utility functions
function showMessage(text, type = 'info') {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.classList.remove('hidden');
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 3000);
}

