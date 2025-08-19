// webrtc-signaling.js
const express = require('express');
const { generateRoomId } = require('./webrtc-room-generator');
const sessionManager = require('./webrtc-session-management');
const { pool } = require('./db-config');
const { timeCheck } = require('./utils');
const BASE_URL = process.env.BASE_URL || 'https://plebemr.com';

// In-memory storage for signaling (use Redis in production)
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

  app.get('/api/patients/appointments', authenticateJWT, async (req, res) => {
    const { pubkey } = req.user; // Only pubkey is guaranteed to be in JWT
    
    let connection;

    console.log(`=== GET PATIENT APPOINTMENTS ===`);
    console.log(`User pubkey: ${pubkey}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    try {
      connection = await pool.getConnection();

      // First, get the user ID from the pubkey
      const [userRows] = await connection.execute(`
        SELECT id FROM users WHERE nostr_pubkey = ?
      `, [pubkey]);

      if (userRows.length === 0) {
        connection.release();
        return res.status(403).json({
          success: false,
          error: 'User not found for this pubkey'
        });
      }

      const userId = userRows[0].id;

      // Now get appointments for this user ID
      const [rows] = await connection.execute(`
        SELECT 
          a.id,
          a.start_datetime,
          a.end_datetime,
          a.location,
          a.notes,
          a.status,
          a.create_datetime,
          doctor.first_name as doctor_first_name,
          doctor.last_name as doctor_last_name,
          doctor.email as doctor_email,
          doctor.timezone as doctor_timezone,
          s.name as service_name,
          s.duration as service_duration
        FROM appointments a 
        JOIN users doctor ON doctor.id = a.id_users_provider
        LEFT JOIN services s ON s.id = a.id_services
        WHERE a.id_users_customer = ?
        ORDER BY a.start_datetime ASC
      `, [userId]);

      // Format the response...
      const appointments = rows.map(appointment => ({
        id: appointment.id,
        datetime: appointment.start_datetime,
        location: appointment.location,
        notes: appointment.notes,
        status: appointment.status,
        createdAt: appointment.created_at,
        doctor: {
          firstName: appointment.doctor_first_name,
          lastName: appointment.doctor_last_name,
          email: appointment.doctor_email,
          timezone: appointment.doctor_timezone
        },
        service: appointment.service_name ? {
          name: appointment.service_name,
          duration: appointment.service_duration
        } : null,
        isVideoAppointment: appointment.location === 'bright-dolphin-swimming',
        videoRoomUrl: appointment.location === 'bright-dolphin-swimming' 
          ? `${process.env.BASE_URL}/video-call?room=${appointment.location}`
          : null
      }));

      console.log(`Found ${rows.length} appointments for patient ${userId} (pubkey: ${pubkey}), appt start: ${appointments}`);

      connection.release();

      res.json({
        success: true,
        appointments: appointments,
        count: appointments.length
      });

    } catch (error) {
      if (connection) connection.release();
      
      console.error('Error fetching patient appointments:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch appointments'
      });
    }
  });

  // Endpoint for testing room generation
  app.get('/api/appointments/generate-room', authenticateJWT, (req, res) => {
    const roomId = generateRoomId();
    
    res.json({
      roomId,
      webrtcUrl: `${BASE_URL}/api/webrtc/rooms/${roomId}`
    });
  });
  
  app.post('/api/webrtc/rooms/:roomId/join', authenticateJWT, async (req, res) => {
    const { roomId } = req.params;
    const { pubkey } = req.user;
    
    let connection;

    console.log(`=== JOIN ROOM REQUEST ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`User pubkey: ${pubkey}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    connection = await pool.getConnection();

    const [rows] = await connection.execute(`
    SELECT a.*, u.nostr_pubkey, u.timezone 
    FROM appointments a 
    JOIN users u ON (u.id = a.id_users_provider OR u.id = a.id_users_customer)
    WHERE a.location = ? AND u.nostr_pubkey = ?
    `, [roomId, pubkey]);

    let joinResult; 

    const isAuthorized = rows.length > 0;
    console.log('checking appt rows: ', rows);
    const timeCheckResult = isAuthorized ? timeCheck(rows[0].start_datetime, rows[0].timezone) : false;
    console.log('timecheck result: ', timeCheckResult);
    
    if (!isAuthorized) { // !timeCheckResult
      connection.release();
    
      if (!isAuthorized) {
        console.error('Error, not authorized for room: ', roomId, pubkey);
        res.status(403).json({ error: 'Not authorized for this room' });
      } else {
        console.error('Error, too early to join room: ', roomId, pubkey);
        res.status(403).json({ error: 'Room not available yet. You can join 15 minutes before the appointment.' });
      }
    } else {
      joinResult = sessionManager.handleParticipantJoin(roomId, pubkey);
      console.log(`Join result:`, joinResult);
      console.log(`Is rejoin: ${joinResult.isRejoin}`);
      
      if (joinResult.shouldNotifyOthers) {
        broadcastRejoinEvent(roomId, joinResult.rejoinedParticipant);
      }
      
      broadcastParticipantCount(roomId);
      connection.release();

      res.json({ 
        status: joinResult.isRejoin ? 'rejoined' : 'joined',
        participants: joinResult.participantCount,
        isRejoin: joinResult.isRejoin,
        roomInfo: joinResult.roomInfo
      });
    }
  
    console.log(`=== JOIN ROOM REQUEST COMPLETED ===`);
  });

  app.post('/api/webrtc/rooms/:roomId/leave', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { pubkey } = req.user;
    
    console.log(`=== LEAVE ROOM REQUEST ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`User pubkey: ${pubkey}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    const leaveResult = sessionManager.handleParticipantLeave(roomId, pubkey);
    
    console.log(`Leave result:`, leaveResult);
    
    console.log('About to broadcast for roomId:', roomId, 'type:', typeof roomId);
    broadcastParticipantCount(roomId);

    res.json({ 
      status: 'left',
      participants: leaveResult.participantCount,
      roomExpiration: leaveResult.roomExpiration
    });
    
    console.log(`=== LEAVE ROOM REQUEST COMPLETED ===`);
  });

  app.post('/api/webrtc/rooms/:roomId/reset-connection', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    
    const room = sessionManager.getRoom(roomId);
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
    
    const room = sessionManager.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    sessionManager.setOffer(roomId, offer, pubkey);
      res.json({ status: 'offer-sent' });
    });

  app.get('/api/webrtc/rooms/:roomId/offer', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const room = sessionManager.getRoom(roomId);
    
    res.json({ offer: room?.pendingOffer || null });
  });

  app.post('/api/webrtc/rooms/:roomId/answer', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { answer } = req.body;
    const { pubkey } = req.user;
    
    const room = sessionManager.getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    room.pendingAnswer = { answer, from: pubkey, timestamp: Date.now() };
    
    res.json({ status: 'answer-sent' });
  });

  app.get('/api/webrtc/rooms/:roomId/answer', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const room = sessionManager.getRoom(roomId);
    
    res.json({ answer: room?.pendingAnswer || null });
  });

  app.post('/api/webrtc/rooms/:roomId/ice-candidate', authenticateJWT, (req, res) => {
    const { roomId } = req.params;
    const { candidate } = req.body;
    const { pubkey } = req.user;
    
    const room = sessionManager.getRoom(roomId);
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
    const room = sessionManager.getRoom(roomId);
    
    if (!room || !room.iceCandidates) {
      return res.json({ candidates: [] });
    }
    
    // Return candidates from other participants
    const candidates = room.iceCandidates.filter(ic => ic.from !== pubkey);
    
    res.json({ candidates });
  });

  function broadcastParticipantCount(roomId) {
    console.log('=== BROADCAST PARTICIPANT COUNT START ===');
    console.log('Input roomId:', roomId, 'type:', typeof roomId);
    
    const room = sessionManager.getRoom(roomId);
    console.log('Room from sessionManager:', room ? 'EXISTS' : 'NULL');
    
    if (room) {
        console.log('Room.participants type:', typeof room.participants);
        console.log('Room.participants is Map:', room.participants instanceof Map);
        console.log('Room.participants:', room.participants);
    }
    
    const participantCount = room ? Array.from(room.participants.values()).filter(p => p.status === 'connected').length : 0;
    console.log('Calculated participantCount:', participantCount);
    
    const connections = sseConnections.get(roomId);
    console.log('SSE connections for room:', connections ? connections.size : 'NO_CONNECTIONS');
    
    if (connections && connections.size > 0) {
      const message = `data: ${JSON.stringify({ type: 'participant_count', count: participantCount })}\n\n`;
      console.log('Message to broadcast:', message);
      
      connections.forEach(res => {
      try {
        res.write(message);
      } catch (error) {
        console.error('Error writing to SSE connection:', error);
        connections.delete(res);
      }
    });
    console.log(`📡 Broadcasted participant count (${participantCount}) to ${connections.size} connected admin(s)`);
    } else {
      console.log('No SSE connections to broadcast to');
    }
    console.log('=== BROADCAST PARTICIPANT COUNT END ===');
  }

  function broadcastRejoinEvent(roomId, rejoinedParticipant) {
    const connections = sseConnections.get(roomId);
    
    if (connections && connections.size > 0) {
      const message = `data: ${JSON.stringify({ 
        type: 'participant_rejoined', 
        participant: rejoinedParticipant 
      })}\n\n`;
      
      connections.forEach(res => {
        try {
          res.write(message);
        } catch (error) {
          connections.delete(res);
        }
      });
      
      console.log(`📡 Broadcasted rejoin event for ${rejoinedParticipant} to ${connections.size} connected admin(s)`);
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
      const room = sessionManager.getRoom(roomId);
      const participantCount = room ? Array.from(room.participants.values()).filter(p => p.status === 'connected').length : 0;
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
