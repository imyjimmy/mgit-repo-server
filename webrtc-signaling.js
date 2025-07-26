// webrtc-signaling.js
const express = require('express');
const { generateRoomId } = require('./webrtc-room-generator');

const BASE_URL = process.env.BASE_URL || 'https://plebemr.com';

// In-memory storage for signaling (use Redis in production)
let videoCallRooms = new Map();
const sseConnections = new Map(); // roomId -> Set of SSE response objects

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
    
    if (!videoCallRooms.has(roomId)) {
      videoCallRooms.set(roomId, { participants: [] });
    }
    
    const room = videoCallRooms.get(roomId);
    const existingParticipant = room.participants.find(p => p.pubkey === pubkey);
    
    if (!existingParticipant) {
      room.participants.push({ pubkey, joinedAt: Date.now() });
      console.log(`NEW participant joined: ${pubkey.substring(0, 8)}...`);
    } else {
      console.log(`EXISTING participant rejoined: ${pubkey.substring(0, 8)}...`);
    }

    // If this is a rejoin (participant already exists), reset connection state
    if (existingParticipant) {
      console.log('Participant rejoining - resetting connection state');
      delete room.pendingOffer;
      delete room.pendingAnswer;
      room.iceCandidates = [];
    }
    
    console.log(`Room ${roomId} participants:`, room.participants.map(p => p.pubkey.substring(0, 8)));
    console.log(`Total participants: ${room.participants.length}`);
    
    broadcastParticipantCount(roomId);

    res.json({ 
      status: 'joined',
      participants: room.participants.length 
    });
  });

  app.post('/api/webrtc/rooms/:roomId/leave', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { pubkey } = req.user;
    
    const room = videoCallRooms.get(roomId);
    if (room) {
      // Remove participant
      room.participants = room.participants.filter(p => p.pubkey !== pubkey);
      
      // If participant was part of signaling, clear their data
      if (room.pendingOffer?.from === pubkey) {
        delete room.pendingOffer;
      }
      if (room.pendingAnswer?.from === pubkey) {
        delete room.pendingAnswer;
      }
      
      // Remove their ICE candidates
      if (room.iceCandidates) {
        room.iceCandidates = room.iceCandidates.filter(ic => ic.from !== pubkey);
      }
      
      console.log(`User ${pubkey} left room ${roomId}`);
    }
    
    broadcastParticipantCount(roomId);

    res.json({ 
      status: 'left',
      participants: room ? room.participants.length : 0
    });
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
  app.get('/api/webrtc/rooms/:roomId/events', authenticateJWT, (req, res) => {
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
  });

  console.log('WebRTC signaling routes initialized');
}

module.exports = setupWebRTCRoutes;
