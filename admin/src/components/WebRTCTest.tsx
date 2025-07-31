import React, { useState, useRef, useEffect, useCallback } from 'react';
import { webrtcService } from '../services/webrtc';

interface WebRTCTestProps {
  token: string;
}

// Advanced interval management hook with comprehensive cleanup
function useIntervalManager() {
  const intervalsRef = useRef(new Map<string, NodeJS.Timeout>());
  const mountedRef = useRef(true);
  const cleanupInProgressRef = useRef(false);
  const pendingOperationsRef = useRef(0);
  
  const setManagedInterval = useCallback((key: string, callback: () => void, delay: number) => {
    console.log(`🔍 DEBUG: setManagedInterval called for '${key}' with delay ${delay}ms`);
    console.log(`🔍 DEBUG: cleanupInProgressRef.current =`, cleanupInProgressRef.current);
    console.log(`🔍 DEBUG: mountedRef.current =`, mountedRef.current);
    
    // Clear any existing interval with the same key to prevent overlaps
    if (intervalsRef.current.has(key)) {
      clearInterval(intervalsRef.current.get(key)!);
      intervalsRef.current.delete(key);
    }
    
    // Don't create new intervals if cleanup is in progress or component unmounted
    if (cleanupInProgressRef.current || !mountedRef.current) {
      console.log(`❌ DEBUG: Cannot create interval '${key}' - cleanup in progress or unmounted`);
      return null;
    }
    
    const safeCallback = () => {
      // Check mount status before each execution to prevent stale callbacks
      if (mountedRef.current && !cleanupInProgressRef.current) {
        try {
          pendingOperationsRef.current++;
          callback();
        } catch (error) {
          console.error(`Interval callback error for ${key}:`, error);
        } finally {
          pendingOperationsRef.current--;
        }
      }
    };
    
    const intervalId = setInterval(safeCallback, delay);
    intervalsRef.current.set(key, intervalId);
    
    console.log(`✅ DEBUG: Created interval '${key}' with ID:`, intervalId);
    console.log(`🔍 DEBUG: Active intervals after creation:`, Array.from(intervalsRef.current.keys()));
    return intervalId;
  }, []);
  
  const clearManagedInterval = useCallback((key: string) => {
    const intervalId = intervalsRef.current.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      intervalsRef.current.delete(key);
      console.log(`🗑️ ADMIN: Cleared managed interval '${key}'`);
    }
  }, []);
  
  const clearAllIntervals = useCallback(async () => {
    if (cleanupInProgressRef.current) return; // Prevent double cleanup
    cleanupInProgressRef.current = true;
    
    console.log(`🧹 ADMIN: Clearing ${intervalsRef.current.size} managed intervals`);
    
    intervalsRef.current.forEach((intervalId, key) => {
      clearInterval(intervalId);
      console.log(`🗑️ ADMIN: Cleared interval '${key}'`);
    });
    
    intervalsRef.current.clear();
    
    // Wait briefly for any pending async operations to complete
    if (pendingOperationsRef.current > 0) {
      console.log(`⏳ ADMIN: Waiting for ${pendingOperationsRef.current} pending operations...`);
      let waitCount = 0;
      while (pendingOperationsRef.current > 0 && waitCount < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      if (pendingOperationsRef.current > 0) {
        console.log(`⚠️ ADMIN: ${pendingOperationsRef.current} operations still pending after timeout`);
      }
    }
    
    mountedRef.current = false;
  }, []);
  
  // 🔧 NEW: Reset function for rejoin scenarios
  const resetIntervalManager = useCallback(() => {
    console.log('🔄 ADMIN: Resetting interval manager for rejoin');
    cleanupInProgressRef.current = false;
    mountedRef.current = true;
    pendingOperationsRef.current = 0;
    console.log('✅ ADMIN: Interval manager reset completed');
  }, []);
  
  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      clearAllIntervals();
    };
  }, [clearAllIntervals]);
  
  return { 
    setManagedInterval, 
    clearManagedInterval, 
    clearAllIntervals,
    resetIntervalManager,
    getActiveIntervals: () => Array.from(intervalsRef.current.keys())
  };
}

export const WebRTCTest: React.FC<WebRTCTestProps> = ({ token }) => {
  const [roomId, setRoomId] = useState('bright-dolphin-swimming');
  const [isInRoom, setIsInRoom] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [participantCount, setParticipantCount] = useState(0);
  const [handshakeInProgress, setHandshakeInProgress] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Advanced interval management
  const { setManagedInterval, clearManagedInterval, clearAllIntervals, resetIntervalManager, getActiveIntervals } = useIntervalManager();
  
  // Thread-safe cleanup with comprehensive resource management
  const cleanupWebRTCState = useCallback(() => {
    console.log('🧹 ADMIN CLEANUP: Starting comprehensive WebRTC state cleanup');
    console.log('🔍 ADMIN CLEANUP: Active intervals before cleanup:', getActiveIntervals());
    console.log('🔍 ADMIN CLEANUP: Cleanup context - connectionStatus:', connectionStatus);
    console.log('🔍 ADMIN CLEANUP: Cleanup context - isInRoom:', isInRoom);
    
    // STEP 1: Clear all managed intervals first to stop ongoing operations
    clearAllIntervals();
    
    // STEP 2: Stop local stream tracks
    if (localStreamRef.current) {
      console.log('🧹 ADMIN CLEANUP: Stopping local stream tracks');
      const tracks = localStreamRef.current.getTracks();
      tracks.forEach((track, index) => {
        console.log(`🧹 ADMIN CLEANUP: Stopping track ${index}: ${track.kind}`);
        track.stop();
      });
      localStreamRef.current = null;
    }
  
    // STEP 3: Close peer connection with proper event handler cleanup
    if (peerConnectionRef.current) {
      console.log('🧹 ADMIN CLEANUP: Closing peer connection');
      const pc = peerConnectionRef.current;
      
      // Clear all event handlers to prevent stray events
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.onicegatheringstatechange = null;
      
      pc.close();
      peerConnectionRef.current = null;
    }
    
    // STEP 4: Close event source
    if (eventSourceRef.current) {
      console.log('🧹 ADMIN CLEANUP: Closing event source');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // STEP 5: Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // STEP 6: Reset UI state
    setConnectionStatus('Disconnected');
    setIsInRoom(false);
    
    console.log('🧹 ADMIN CLEANUP: Comprehensive WebRTC state cleanup completed');
  }, [clearAllIntervals, getActiveIntervals, connectionStatus, isInRoom]);

  const setupPeerConnection = useCallback(() => {
    console.log('⚙️ ADMIN: Setting up fresh peer connection');
    
    // Create new peer connection
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    
    // Add local stream (with null checks)
    if (localStreamRef.current && peerConnectionRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (peerConnectionRef.current && localStreamRef.current) {
          peerConnectionRef.current.addTrack(track, localStreamRef.current);
        }
      });
    }
    
    // Set up event handlers
    if (peerConnectionRef.current) {
      peerConnectionRef.current.addEventListener('track', (event) => {
        console.log('📺 ADMIN: Received remote track');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      });
      
      peerConnectionRef.current.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          webrtcService.sendIceCandidate(roomId, event.candidate, token);
        }
      });
    }
    
    console.log('✅ ADMIN: Fresh peer connection created and configured');
  }, [roomId, token]);

  const joinRoom = async () => {
    try {
      if (!roomId.trim()) {
        console.log('Please enter a room ID');
        return;
      }
      
      setConnectionStatus('Connecting...');
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Create and setup peer connection
      setupPeerConnection();
      
      // Handle connection state changes
      if (peerConnectionRef.current) {
        peerConnectionRef.current.onconnectionstatechange = () => {
          if (peerConnectionRef.current) {
            setConnectionStatus(peerConnectionRef.current.connectionState);
          }
        };
      }
      
      // Join room
      const joinResult = await webrtcService.joinRoom(roomId, token);
      console.log('🚀 ADMIN: Join room result:', joinResult);
      setParticipantCount(joinResult.participants);
      setIsInRoom(true);
      
      // Start managed services
      startParticipantCountUpdates();
      startSignalingLoop();

      console.log(`Joined room: ${roomId}`);
      
    } catch (error) {
      console.error('Error joining WebRTC room:', error);
      console.log(`Failed to join room: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setConnectionStatus('Failed to connect');
    }
  };
  
  const leaveRoom = () => {
    console.log('=== ADMIN LEAVE ROOM INITIATED ===');
    try {
      cleanupWebRTCState();
      setParticipantCount(0);
      console.log('Left WebRTC room');
      console.log('=== ADMIN LEAVE ROOM COMPLETED ===');
    } catch (error: unknown) {
      const err = error as Error;
      console.error('=== ADMIN LEAVE ROOM ERROR ===', err);
      console.log(`Error leaving room: ${err.message}`);
    }
  };

  const handleParticipantRejoin = useCallback(() => {
    console.log('🔄 ADMIN: Handling participant rejoin with full reset');
    
    // Complete cleanup first
    cleanupWebRTCState();
    
    // 🔧 NEW: Reset interval manager to allow new intervals
    resetIntervalManager();
    
    // Re-initialize everything fresh with error handling
    navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    }).then(stream => {
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create fresh peer connection
      setupPeerConnection();
      
      // Restart managed services
      startParticipantCountUpdates();
      setIsInRoom(true);
      startSignalingLoop();

      console.log('✅ ADMIN: Fresh WebRTC state created for rejoin');
    }).catch(error => {
      console.error('❌ ADMIN: Error reinitializing for rejoin:', error);
      console.log('Failed to reinitialize for rejoin. Please refresh and try again.');
    });
  }, [cleanupWebRTCState, setupPeerConnection, resetIntervalManager]);
  
  const startParticipantCountUpdates = useCallback(() => {
    console.log('📊 ADMIN: Starting participant count updates');
    
    // Close existing event source if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = webrtcService.createEventSource(roomId, token);
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'participant_count') {
          setParticipantCount(data.count);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };

    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'participant_rejoined') {
          console.log(`🔄 Participant ${data.participant} rejoined - resetting WebRTC`);
          handleParticipantRejoin();
        }
        
        if (data.type === 'participant_count') {
          setParticipantCount(data.count);
        }
      } catch (error) {
        console.error('Error parsing SSE event:', error);
      }
    });
  }, [roomId, token, handleParticipantRejoin]);
  
  const startSignalingLoop = useCallback(() => {
    console.log('🔄 ADMIN: Starting managed signaling loop');
    console.log('🔍 ADMIN: peerConnectionRef.current =', !!peerConnectionRef.current);

    if (!peerConnectionRef.current) {
      console.error('❌ ADMIN: Cannot start signaling loop - no peer connection');
      return;
    }

    // State for ICE candidate queueing (using closure to avoid stale state)
    let remoteDescriptionSet = false;
    let pendingIceCandidates: RTCIceCandidateInit[] = [];
    let handshakeAborted = false;

    // Managed ICE candidates polling
    setManagedInterval('ice-candidates-poll', async () => {
      try {
        if (!peerConnectionRef.current || handshakeAborted) {
          console.log('❌ ADMIN: Stopping ICE polling - no peer connection or handshake aborted');
          clearManagedInterval('ice-candidates-poll');
          return;
        }
        
        console.log('🧊 ADMIN: Polling for ICE candidates...');
        const { candidates } = await webrtcService.getIceCandidates(roomId, token);
        
        if (candidates && candidates.length > 0) {
          console.log(`📥 ADMIN: Received ${candidates.length} ICE candidates from client`);
          for (const candidateData of candidates) {
            if (handshakeAborted) break;
            
            if (remoteDescriptionSet && peerConnectionRef.current) {
              console.log('🧊 ADMIN: Adding ICE candidate immediately');
              await peerConnectionRef.current.addIceCandidate(candidateData.candidate);
            } else {
              console.log('🧊 ADMIN: Queueing ICE candidate (no remote description yet)');
              pendingIceCandidates.push(candidateData.candidate);
            }
          }
        } else {
          console.log('⏳ ADMIN: No ICE candidates available yet');
        }
      } catch (error) {
        console.error('❌ ADMIN: Error handling ICE candidates:', error);
      }
    }, 2000);
    
    // Managed offers polling
    setManagedInterval('offers-poll', async () => {
      try {
        if (!peerConnectionRef.current || handshakeAborted) {
          console.log('❌ ADMIN: Stopping offer polling - no peer connection or handshake aborted');
          clearManagedInterval('offers-poll');
          return;
        }
        
        console.log('🔍 ADMIN: Checking for offers from client...');
        const { offer } = await webrtcService.getOffer(roomId, token);
        console.log('📋 ADMIN: Offer check result:', offer ? 'OFFER FOUND' : 'no offer yet');
        
        if (offer && offer.offer && peerConnectionRef.current && !handshakeAborted) {
          console.log('🎯 ADMIN: Processing offer from client!');
          
          // 🔧 ADD: Log all state before handshake to find the trigger
          console.log('🔍 DEBUG: State before handshake:');
          console.log('  - isInRoom:', isInRoom);
          console.log('  - connectionStatus:', connectionStatus);
          console.log('  - participantCount:', participantCount);
          console.log('  - handshakeInProgress:', handshakeInProgress);
          
          setHandshakeInProgress(true);
          console.log('🔍 DEBUG: Set handshakeInProgress to true');
          
          // Stop offer polling once we get an offer
          clearManagedInterval('offers-poll');
          
          try {
            // Capture peer connection reference for the entire handshake
            const handshakePeerConnection = peerConnectionRef.current;
            
            console.log('🔧 ADMIN: Setting remote description from client offer...');
            console.log('🔍 DEBUG: About to call setRemoteDescription');
            await handshakePeerConnection.setRemoteDescription(offer.offer);
            console.log('🔍 DEBUG: setRemoteDescription completed');
            
            // Check if we're still using the same peer connection
            if (peerConnectionRef.current !== handshakePeerConnection) {
              console.log('⚠️ ADMIN: Peer connection changed during handshake, aborting');
              handshakeAborted = true;
              setHandshakeInProgress(false);
              return;
            }
            
            console.log('✅ ADMIN: Set remote description successfully');
            
            // Process queued ICE candidates now that remote description is set
            remoteDescriptionSet = true;
            console.log(`🧊 ADMIN: Processing ${pendingIceCandidates.length} queued ICE candidates`);
            for (const candidate of pendingIceCandidates) {
              if (handshakeAborted || peerConnectionRef.current !== handshakePeerConnection) break;
              
              try {
                await handshakePeerConnection.addIceCandidate(candidate);
                console.log('🧊 ADMIN: Added queued ICE candidate');
              } catch (error) {
                console.error('❌ ADMIN: Error adding queued ICE candidate:', error);
              }
            }
            pendingIceCandidates = []; // Clear the queue

            // Create and send answer
            if (!handshakeAborted && peerConnectionRef.current === handshakePeerConnection) {
              console.log('📝 ADMIN: Creating answer...');
              const answer = await handshakePeerConnection.createAnswer();
              
              // Final consistency check
              if (!handshakeAborted && peerConnectionRef.current === handshakePeerConnection) {
                console.log('🔧 ADMIN: Setting local description (answer)...');
                await handshakePeerConnection.setLocalDescription(answer);
                
                console.log('📤 ADMIN: Sending answer to server...');
                await webrtcService.sendAnswer(roomId, answer, token);
                console.log('🎉 ADMIN: Answer sent! WebRTC handshake should be complete');
                
                // Safe connection state logging
                console.log('📊 ADMIN: Connection state:', handshakePeerConnection.connectionState);
                console.log('📊 ADMIN: ICE connection state:', handshakePeerConnection.iceConnectionState);
                console.log('📊 ADMIN: Signaling state:', handshakePeerConnection.signalingState);
              } else {
                console.log('⚠️ ADMIN: Handshake aborted or peer connection changed, skipping answer send');
              }
            } else {
              console.log('⚠️ ADMIN: Cannot create answer - handshake aborted or peer connection changed');
            }
          } catch (error) {
            console.error('❌ ADMIN: Error during handshake:', error);
            handshakeAborted = true;
          } finally {
            setHandshakeInProgress(false);
          }
        } else {
          console.log('⏳ ADMIN: No offer available yet, continuing to poll...');
        }
      } catch (error: any) {
        console.error('❌ ADMIN: Error in offer signaling loop:', error);
        setHandshakeInProgress(false);
      }
    }, 2000);
    
    // Cleanup function for this signaling loop instance
    return () => {
      handshakeAborted = true;
      setHandshakeInProgress(false);
    };
    
    console.log('✅ ADMIN: Managed signaling loop started');
    console.log('🔍 ADMIN: Active intervals:', getActiveIntervals());
  }, [roomId, token, setManagedInterval, clearManagedInterval, getActiveIntervals]);
  
  // Cleanup on unmount with dependency to ensure latest leaveRoom reference
  useEffect(() => {
    console.log('🏗️ ADMIN: Component mounted/effect running');
    
    return () => {
      console.log('🔄 ADMIN: Component unmounting, performing cleanup');
      console.log('🔍 ADMIN: Unmount context - isInRoom:', isInRoom);
      console.log('🔍 ADMIN: Unmount context - connectionStatus:', connectionStatus);
      console.log('🔍 ADMIN: Unmount context - handshakeInProgress:', handshakeInProgress);
      console.log('🔍 ADMIN: Unmount context - peerConnection exists:', !!peerConnectionRef.current);
      
      // Get stack trace to understand WHY we're unmounting
      const stack = new Error().stack;
      console.log('📍 ADMIN: Unmount stack trace:', stack?.split('\n').slice(0, 5).join('\n'));
      
      if (handshakeInProgress) {
        console.log('⚠️ ADMIN: Unmounting during handshake! This may cause issues.');
      }
      
      if (isInRoom) {
        cleanupWebRTCState();
      }
    };
  }, []); //isInRoom, cleanupWebRTCState, connectionStatus, handshakeInProgress
  
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 border-b-2 border-blue-500 pb-2">
          Telehealth (Advanced Interval Management)
        </h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium text-gray-700 mb-3">Test Video Calls</h4>
          <div className="space-y-4">
            <div>
              <label htmlFor="roomId" className="block text-sm font-medium text-gray-600 mb-1">
                Room ID:
              </label>
              <input
                id="roomId"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID"
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={joinRoom}
                disabled={isInRoom}
                className="btn btn-primary"
              >
                Join Room
              </button>
              <button
                onClick={leaveRoom}
                disabled={!isInRoom}
                className="btn btn-secondary"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
        
        <div>
          <h4 className="font-medium text-gray-700 mb-3">Connection Status</h4>
          <div className="space-y-2">
            <div className="font-medium">Status: {connectionStatus}</div>
            <div className="font-medium">Participants: {participantCount}</div>
            <div className="text-sm text-gray-600">
              Active Intervals: {getActiveIntervals().join(', ') || 'None'}
            </div>
            {handshakeInProgress && (
              <div className="text-sm text-amber-600 font-medium">
                ⚠️ Handshake in progress - do not navigate away
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-6">
        <h4 className="font-medium text-gray-700 mb-3">Video Test</h4>
        <div className="flex gap-4 justify-center">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">Local Video</p>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              className="w-48 h-36 border border-gray-300 rounded-lg bg-gray-100"
            />
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">Remote Video</p>
            <video
              ref={remoteVideoRef}
              autoPlay
              className="w-48 h-36 border border-gray-300 rounded-lg bg-gray-100"
            />
          </div>
        </div>
      </div>
    </div>
  );
};