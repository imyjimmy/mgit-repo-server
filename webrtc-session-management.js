// Room expiration constants
const ROOM_EXPIRE_AFTER_FIRST_LEAVE_MS = 15 * 60 * 1000; // 15 minutes
const ROOM_EXPIRE_AFTER_EMPTY_MS = 5 * 60 * 1000; // 5 minutes

// Enhanced room structure for session persistence
const createRoom = () => ({
  participants: new Map(), // pubkey -> participant data
  createdAt: Date.now(),
  firstLeaveAt: null,
  lastEmptyAt: null,
  expireTimer: null,
  emptyTimer: null,
  // WebRTC signaling state
  pendingOffer: null,
  pendingAnswer: null,
  iceCandidates: []
});

const createParticipant = (pubkey) => ({
  pubkey,
  joinedAt: Date.now(),
  lastSeenAt: Date.now(),
  status: 'connected', // 'connected', 'disconnected'
  sessionData: {
    // Preserve WebRTC session state for rejoins
    hasActiveSession: false,
    lastOfferAt: null,
    lastAnswerAt: null
  }
});

class WebRTCSessionManager {
  constructor() {
    this.rooms = new Map();
  }

  // Create or get existing room
  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      console.log(`Creating new room: ${roomId}`);
      this.rooms.set(roomId, createRoom());
    }
    return this.rooms.get(roomId);
  }

  // Handle participant joining (new or rejoin)
  handleParticipantJoin(roomId, pubkey) {
    console.log(`=== HANDLING JOIN: ${pubkey} -> ${roomId} ===`);
    
    const room = this.getOrCreateRoom(roomId);
    
    // Check if this is a rejoin
    const existingParticipant = room.participants.get(pubkey);
    const isRejoin = !!existingParticipant;
    
    if (isRejoin) {
      console.log(`REJOIN detected for ${pubkey}`);
      console.log(`Previous status: ${existingParticipant.status}`);
      console.log(`Had active session: ${existingParticipant.sessionData.hasActiveSession}`);
      
      // Update existing participant
      existingParticipant.status = 'connected';
      existingParticipant.lastSeenAt = Date.now();

      room.iceCandidates = room.iceCandidates.filter(ic => ic.from !== pubkey);
      console.log(`Cleared old ICE candidates for rejoining participant ${pubkey}`);
    } else {
      console.log(`NEW JOIN for ${pubkey}`);
      // Create new participant
      room.participants.set(pubkey, createParticipant(pubkey));
    }

    // Clear empty timer if room is no longer empty
    this.clearEmptyTimer(roomId);
    
    const participantCount = Array.from(room.participants.values())
      .filter(p => p.status === 'connected').length;
    
    console.log(`Room ${roomId} now has ${participantCount} connected participants`);
    
    return {
      isRejoin,
      participantCount,
      roomInfo: {
        createdAt: room.createdAt,
        firstLeaveAt: room.firstLeaveAt,
        lastEmptyAt: room.lastEmptyAt,
        hasExpireTimer: !!room.expireTimer,
        hasEmptyTimer: !!room.emptyTimer
      }
    };
  }

  // Handle participant leaving (disconnect, not full remove)
  handleParticipantLeave(roomId, pubkey) {
    console.log(`=== HANDLING LEAVE: ${pubkey} -> ${roomId} ===`);
    
    const room = this.rooms.get(roomId);
    if (!room) {
      console.log(`Room ${roomId} not found for leave`);
      return { participantCount: 0 };
    }

    const participant = room.participants.get(pubkey);
    if (!participant) {
      console.log(`Participant ${pubkey} not found in room ${roomId}`);
      return { participantCount: room.participants.size };
    }

    console.log(`Marking ${pubkey} as disconnected (preserving session)`);
    
    // Mark as disconnected but preserve session data
    participant.status = 'disconnected';
    participant.lastSeenAt = Date.now();
    
    const connectedCount = Array.from(room.participants.values())
      .filter(p => p.status === 'connected').length;
    
    console.log(`Room ${roomId} now has ${connectedCount} connected participants`);
    
    // Set expiration timers based on room state
    this.setExpirationTimers(roomId);
    
    return {
      participantCount: connectedCount,
      roomExpiration: {
        firstLeaveAt: room.firstLeaveAt,
        lastEmptyAt: room.lastEmptyAt,
        hasExpireTimer: !!room.expireTimer,
        hasEmptyTimer: !!room.emptyTimer
      }
    };
  }

  // Set expiration timers based on room state
  setExpirationTimers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const connectedCount = Array.from(room.participants.values())
      .filter(p => p.status === 'connected').length;
    
    console.log(`=== SETTING EXPIRATION TIMERS FOR ROOM ${roomId} ===`);
    console.log(`Connected participants: ${connectedCount}`);
    console.log(`Total participants: ${room.participants.size}`);
    
    // If this is the first leave and we haven't set the timer yet
    if (!room.firstLeaveAt && connectedCount < room.participants.size) {
      room.firstLeaveAt = Date.now();
      
      room.expireTimer = setTimeout(() => {
        console.log(`Room ${roomId} expired after 15 minutes from first leave`);
        this.cleanupRoom(roomId);
      }, ROOM_EXPIRE_AFTER_FIRST_LEAVE_MS);
      
      console.log(`Set 15-minute expiration timer for room ${roomId} (first leave)`);
    }
    
    // If room is now empty, set 5-minute timer
    if (connectedCount === 0) {
      room.lastEmptyAt = Date.now();
      
      // Clear existing empty timer if any
      if (room.emptyTimer) {
        clearTimeout(room.emptyTimer);
      }
      
      room.emptyTimer = setTimeout(() => {
        console.log(`Room ${roomId} expired after 5 minutes of being empty`);
        this.cleanupRoom(roomId);
      }, ROOM_EXPIRE_AFTER_EMPTY_MS);
      
      console.log(`Set 5-minute expiration timer for room ${roomId} (room empty)`);
    }
  }

  // Clear empty timer when participants rejoin
  clearEmptyTimer(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
      room.lastEmptyAt = null;
      console.log(`Cleared empty timer for room ${roomId} - participants rejoined`);
    }
  }

  // Complete room cleanup
  cleanupRoom(roomId) {
    console.log(`=== CLEANING UP ROOM ${roomId} ===`);
    const room = this.rooms.get(roomId);
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
      
      // Remove room completely
      this.rooms.delete(roomId);
      console.log(`Room ${roomId} deleted from memory`);
    }
  }

  // WebRTC signaling state management
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  setOffer(roomId, offer, fromPubkey) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false; // Room not found
    }
    
    room.pendingOffer = { offer, from: fromPubkey, timestamp: Date.now() };
    
    // Mark participant as having active session
    const participant = room.participants.get(fromPubkey);
    if (participant) {
      participant.sessionData.hasActiveSession = true;
      participant.sessionData.lastOfferAt = Date.now();
    }
    
    return true; // Success
  }

  setAnswer(roomId, answer, fromPubkey) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.pendingAnswer = { answer, from: fromPubkey, timestamp: Date.now() };
      
      // Mark participant as having active session
      const participant = room.participants.get(fromPubkey);
      if (participant) {
        participant.sessionData.hasActiveSession = true;
        participant.sessionData.lastAnswerAt = Date.now();
      }
    }
  }

  addIceCandidate(roomId, candidate, fromPubkey) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.iceCandidates.push({
        candidate,
        from: fromPubkey,
        timestamp: Date.now()
      });
    }
  }

  // Get room status for debugging
  getRoomStatus(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participants = Array.from(room.participants.entries()).map(([pubkey, data]) => ({
      pubkey: pubkey.substring(0, 8) + '...',
      status: data.status,
      joinedAt: new Date(data.joinedAt).toISOString(),
      lastSeenAt: new Date(data.lastSeenAt).toISOString(),
      hasActiveSession: data.sessionData.hasActiveSession
    }));

    return {
      roomId,
      participantCount: participants.filter(p => p.status === 'connected').length,
      totalParticipants: participants.length,
      participants,
      createdAt: new Date(room.createdAt).toISOString(),
      firstLeaveAt: room.firstLeaveAt ? new Date(room.firstLeaveAt).toISOString() : null,
      lastEmptyAt: room.lastEmptyAt ? new Date(room.lastEmptyAt).toISOString() : null,
      hasExpireTimer: !!room.expireTimer,
      hasEmptyTimer: !!room.emptyTimer,
      pendingOffer: !!room.pendingOffer,
      pendingAnswer: !!room.pendingAnswer,
      iceCandidatesCount: room.iceCandidates.length
    };
  }
}

// Export singleton instance
module.exports = new WebRTCSessionManager();