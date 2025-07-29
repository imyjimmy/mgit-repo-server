// webrtc-signaling.js
const express = require('express');
const { generateRoomId } = require('./webrtc-room-generator');

const BASE_URL = process.env.BASE_URL || 'https://plebemr.com';
const ROOM_EXPIRE_AFTER_FIRST_LEAVE_MS = 15 * 60 * 1000; // 15 minutes
const ROOM_EXPIRE_AFTER_EMPTY_MS = 5 * 60 * 1000; // 5 minutes

// In-memory storage for signaling (use Redis in production)
let videoCallRooms = new Map();
const sseConnections = new Map(); // roomId -> Set of SSE response objects

const createRoom = () => ({
  participants: [],
  pendingOffer: null,
  pendingAnswer: null,
  iceCandidates: [],
  createdAt: Date.now(),
  firstLeaveAt: null,
  emptyAt: null,
  expireTimer: null,
  emptyTimer: null
});

// Room cleanup function
const cleanupRoom = (roomId) => {
  console.log(`=== CLEANING UP ROOM ${roomId} ===`);
  const room = videoCallRooms.get(roomId);
  if (room) {
    // Clear any timers
    if (room.expireTimer) {
      clearTimeout(room.expireTimer);
      console.log(`Cleared expire timer for room ${roomId}`);
    }
    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      console.log(`Cleared empty timer for room ${roomId}`);
    }
    
    // Remove room
    videoCallRooms.delete(roomId);
    console.log(`Room ${roomId} deleted from memory`);
    
    // Broadcast final participant count
    broadcastParticipantCount(roomId);
  }
};

// Set room expiration timers
const setRoomExpirationTimers = (roomId) => {
  const room = videoCallRooms.get(roomId);
  if (!room) return;
  
  console.log(`=== SETTING EXPIRATION TIMERS FOR ROOM ${roomId} ===`);
  
  // If this is the first leave, set 15-minute timer
  if (!room.firstLeaveAt && room.participants.length < 2) {
    room.firstLeaveAt = Date.now();
    room.expireTimer = setTimeout(() => {
      console.log(`Room ${roomId} expired after 15 minutes from first leave`);
      cleanupRoom(roomId);
    }, ROOM_EXPIRE_AFTER_FIRST_LEAVE_MS);
    
    console.log(`Set 15-minute expiration timer for room ${roomId} (first leave)`);
  }
  
  // If room is now empty, set 5-minute timer
  if (room.participants.length === 0) {
    if (!room.emptyAt) {
      room.emptyAt = Date.now();
    }
    
    // Clear existing empty timer if any
    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
    }
    
    room.emptyTimer = setTimeout(() => {
      console.log(`Room ${roomId} expired after 5 minutes of being empty`);
      cleanupRoom(roomId);
    }, ROOM_EXPIRE_AFTER_EMPTY_MS);
    
    console.log(`Set 5-minute expiration timer for room ${roomId} (room empty)`);
  } else {
    // Room has participants again, clear empty timer
    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
      room.emptyAt = null;
      console.log(`Cleared empty timer for room ${roomId} - participants rejoined`);
    }
  }
};

// WebRTC Signaling Endpoints
function setupWebRTCRoutes(app, authenticateJWT) {
  
  // Endpoint to create a new appointment/room
  app.post('/api/appointments/create', authenticateJWT, (req, res) => {
    const { doctorName, appointmentTime, notes } = req.body;
    const roomId = generateRoomId();
    
    // Store appointment in your system (database, memory, etc.)
    // For now, just return the room ID
    res.json({
      roomId,
      doctorName,
      appointmentTime,
      webrtcUrl: `${BASE_URL}/api/webrtc/rooms/${roomId}`,
      message: `Appointment room created: ${roomId}`
    });
  });

  // Endpoint for testing room generation
  app.get('/api/appointments/generate-room', authenticateJWT, (req, res) => {
    const roomId = generateRoomId();
    
    res.json({
      roomId,
      webrtcUrl: `${BASE_URL}/api/webrtc/rooms/${roomId}`
    });
  });
  
  app.post('/api/webrtc/rooms/:roomId/join', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { pubkey } = req.user;
    
    console.log(`=== JOIN ROOM REQUEST ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`User pubkey: ${pubkey}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    if (!videoCallRooms.has(roomId)) {
      console.log(`Creating new room ${roomId}`);
      videoCallRooms.set(roomId, createRoom());
    }
    
    const room = videoCallRooms.get(roomId);
    console.log(`Room state before join:`);
    console.log(`- Participants: ${room.participants.length}`);
    console.log(`- Created at: ${new Date(room.createdAt).toISOString()}`);
    console.log(`- First leave at: ${room.firstLeaveAt ? new Date(room.firstLeaveAt).toISOString() : 'none'}`);
    console.log(`- Empty at: ${room.emptyAt ? new Date(room.emptyAt).toISOString() : 'none'}`);
    console.log(`- Has expire timer: ${!!room.expireTimer}`);
    console.log(`- Has empty timer: ${!!room.emptyTimer}`);
    
    // Check if user already in room
    const existingParticipant = room.participants.find(p => p.pubkey === pubkey);
    if (existingParticipant) {
      console.log(`User ${pubkey} already in room ${roomId}`);
    } else {
      // Add participant
      room.participants.push({
        pubkey,
        joinedAt: Date.now()
      });
      console.log(`Added user ${pubkey} to room ${roomId}`);
    }
    
    // Clear empty timer if room is no longer empty
    if (room.participants.length > 0 && room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
      room.emptyAt = null;
      console.log(`Cleared empty timer for room ${roomId} - participants rejoined`);
    }
    
    console.log(`Room state after join:`);
    console.log(`- Participants: ${room.participants.length}`);
    console.log(`- Participant pubkeys: ${room.participants.map(p => p.pubkey).join(', ')}`);
    
    broadcastParticipantCount(roomId);
    
    res.json({ 
      status: 'joined', 
      participants: room.participants.length,
      roomInfo: {
        createdAt: room.createdAt,
        firstLeaveAt: room.firstLeaveAt,
        emptyAt: room.emptyAt,
        hasExpireTimer: !!room.expireTimer,
        hasEmptyTimer: !!room.emptyTimer
      }
    });
    
    console.log(`=== JOIN ROOM REQUEST COMPLETED ===`);
  });

  app.post('/api/webrtc/rooms/:roomId/leave', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { pubkey } = req.user;
    
    console.log(`=== LEAVE ROOM REQUEST ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`User pubkey: ${pubkey}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    const room = videoCallRooms.get(roomId);
    console.log(`Room exists: ${!!room}`);
    
    if (room) {
      console.log(`Room before leave - participants: ${room.participants.length}`);
      console.log(`Participants before: ${room.participants.map(p => p.pubkey).join(', ')}`);
      console.log(`Room created at: ${new Date(room.createdAt).toISOString()}`);
      console.log(`First leave at: ${room.firstLeaveAt ? new Date(room.firstLeaveAt).toISOString() : 'none'}`);
      console.log(`Empty at: ${room.emptyAt ? new Date(room.emptyAt).toISOString() : 'none'}`);
      console.log(`Has expire timer: ${!!room.expireTimer}`);
      console.log(`Has empty timer: ${!!room.emptyTimer}`);
      
      // Remove participant
      const participantsBefore = room.participants.length;
      room.participants = room.participants.filter(p => p.pubkey !== pubkey);
      console.log(`Participants after filtering: ${room.participants.length} (removed ${participantsBefore - room.participants.length})`);
      console.log(`Remaining participants: ${room.participants.map(p => p.pubkey).join(', ')}`);
      
      // If participant was part of signaling, clear their data
      if (room.pendingOffer?.from === pubkey) {
        console.log(`Clearing pending offer from ${pubkey}`);
        delete room.pendingOffer;
      }
      if (room.pendingAnswer?.from === pubkey) {
        console.log(`Clearing pending answer from ${pubkey}`);
        delete room.pendingAnswer;
      }
      
      // Remove their ICE candidates
      if (room.iceCandidates) {
        const candidatesBefore = room.iceCandidates.length;
        room.iceCandidates = room.iceCandidates.filter(ic => ic.from !== pubkey);
        console.log(`ICE candidates after filtering: ${room.iceCandidates.length} (removed ${candidatesBefore - room.iceCandidates.length})`);
      }
      
      // Set expiration timers based on room state
      setRoomExpirationTimers(roomId);
      
      console.log(`User ${pubkey} left room ${roomId}`);
      console.log(`Final room state - participants: ${room.participants.length}`);
    } else {
      console.log(`Room ${roomId} not found when ${pubkey} tried to leave`);
    }
    
    console.log(`Broadcasting participant count for room ${roomId}`);
    broadcastParticipantCount(roomId);

    res.json({ 
      status: 'left',
      participants: room ? room.participants.length : 0,
      roomExpiration: room ? {
        firstLeaveAt: room.firstLeaveAt,
        emptyAt: room.emptyAt,
        hasExpireTimer: !!room.expireTimer,
        hasEmptyTimer: !!room.emptyTimer
      } : null
    });
    
    console.log(`=== LEAVE ROOM REQUEST COMPLETED ===`);
  });

  app.post('/api/webrtc/rooms/:roomId/reset-connection', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    
    const room = videoCallRooms.get(roomId);
    if (room) {
      // Clear all connection state but keep participants
      delete room.pendingOffer;
      delete room.pendingAnswer;
      room.iceCandidates = [];
      
      console.log(`Connection reset for room ${roomId}`);
    }
    
    res.json({ status: 'connection-reset' });
  });

  app.post('/api/webrtc/rooms/:roomId/offer', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { offer } = req.body;
    const { pubkey } = req.user;
    
    const room = videoCallRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    room.pendingOffer = { offer, from: pubkey, timestamp: Date.now() };
    
    res.json({ status: 'offer-sent' });
  });

  app.get('/api/webrtc/rooms/:roomId/offer', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const room = videoCallRooms.get(roomId);
    
    res.json({ offer: room?.pendingOffer || null });
  });

  app.post('/api/webrtc/rooms/:roomId/answer', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { answer } = req.body;
    const { pubkey } = req.user;
    
    const room = videoCallRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    room.pendingAnswer = { answer, from: pubkey, timestamp: Date.now() };
    
    res.json({ status: 'answer-sent' });
  });

  app.get('/api/webrtc/rooms/:roomId/answer', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const room = videoCallRooms.get(roomId);
    
    res.json({ answer: room?.pendingAnswer || null });
  });

  app.post('/api/webrtc/rooms/:roomId/ice-candidate', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { candidate } = req.body;
    const { pubkey } = req.user;
    
    const room = videoCallRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    if (!room.iceCandidates) room.iceCandidates = [];
    room.iceCandidates.push({ candidate, from: pubkey, timestamp: Date.now() });
    
    res.json({ status: 'ice-candidate-sent' });
  });

  app.get('/api/webrtc/rooms/:roomId/ice-candidates', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { pubkey } = req.user;
    const room = videoCallRooms.get(roomId);
    
    if (!room || !room.iceCandidates) {
      return res.json({ candidates: [] });
    }
    
    // Return candidates from other participants
    const candidates = room.iceCandidates.filter(ic => ic.from !== pubkey);
    
    res.json({ candidates });
  });

  function broadcastParticipantCount(roomId) {
    const room = videoCallRooms.get(roomId);
    const participantCount = room ? room.participants.length : 0;
    const connections = sseConnections.get(roomId);
    
    if (connections && connections.size > 0) {
      const message = `data: ${JSON.stringify({ type: 'participant_count', count: participantCount })}\n\n`;
      connections.forEach(res => {
        try {
          res.write(message);
        } catch (error) {
          // Remove dead connections
          connections.delete(res);
        }
      });
      console.log(`📡 Broadcasted participant count (${participantCount}) to ${connections.size} connected admin(s)`);
    }
  }

  // Add this new SSE endpoint for real-time updates
  app.get('/api/webrtc/rooms/:roomId/events', (req, res) => {
    const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    
    try { 
      const { roomId } = req.params;
      
      // Set up SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Send initial participant count
      const room = videoCallRooms.get(roomId);
      const participantCount = room ? room.participants.length : 0;
      res.write(`data: ${JSON.stringify({ type: 'participant_count', count: participantCount })}\n\n`);

      // Add this connection to the room's SSE connections
      if (!sseConnections.has(roomId)) {
        sseConnections.set(roomId, new Set());
      }
      sseConnections.get(roomId).add(res);

      // Clean up when connection closes
      req.on('close', () => {
        const roomConnections = sseConnections.get(roomId);
        if (roomConnections) {
          roomConnections.delete(res);
          if (roomConnections.size === 0) {
            sseConnections.delete(roomId);
          }
        }
      });
    } catch (error) {
      return res.status(401).json({ 
        status: 'error', 
        reason: 'Invalid token' 
      });
    }
  });

  console.log('WebRTC signaling routes initialized');
}

module.exports = setupWebRTCRoutes;
