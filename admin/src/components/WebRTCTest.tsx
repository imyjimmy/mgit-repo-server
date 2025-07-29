import React, { useState, useRef, useEffect } from 'react';
import { webrtcService } from '../services/webrtc';

interface WebRTCTestProps {
  token: string;
}

export const WebRTCTest: React.FC<WebRTCTestProps> = ({ token }) => {
  const [roomId, setRoomId] = useState('bright-dolphin-swimming');
  const [isInRoom, setIsInRoom] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [participantCount, setParticipantCount] = useState(0);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const joinRoom = async () => {
    try {
      if (!roomId.trim()) {
        alert('Please enter a room ID');
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
      
      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      
      peerConnectionRef.current = pc;
      
      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
      
      // Handle remote stream
      pc.ontrack = (event) => {
        console.log('Received remote stream');
        if (event.streams && event.streams[0] && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };
      
      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        setConnectionStatus(pc.connectionState);
      };
      
      // Handle ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          try {
            await webrtcService.sendIceCandidate(roomId, event.candidate, token);
          } catch (error) {
            console.error('Error sending ICE candidate:', error);
          }
        }
      };
      
      // Join room
      const joinResult = await webrtcService.joinRoom(roomId, token);
      console.log('🚀 ADMIN: Join room result:', joinResult);
      setParticipantCount(joinResult.participants);
      setIsInRoom(true);
      
      // Start participant count updates
      startParticipantCountUpdates();
      
      // Start signaling loop
      console.log('🚀 ADMIN: About to start signaling loop...');
      startSignalingLoop(true);
      console.log('✅ ADMIN: startSignalingLoop() called');

      alert(`Joined room: ${roomId}`);
      
    } catch (error) {
      console.error('Error joining WebRTC room:', error);
      alert(`Failed to join room: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setConnectionStatus('Failed to connect');
    }
  };
  
  const leaveRoom = () => {
    console.log('=== ADMIN LEAVE ROOM INITIATED ===');
    console.log('Current room state - isInRoom:', isInRoom);
    console.log('Current connectionStatus:', connectionStatus);
    console.log('Current participantCount:', participantCount);
    
    try {
      console.log('=== STOPPING LOCAL STREAM ===');
      if (localStreamRef.current) {
        console.log('Local stream exists, stopping tracks...');
        const tracks = localStreamRef.current.getTracks();
        console.log('Number of local tracks:', tracks.length);
        tracks.forEach((track, index) => {
          console.log(`Stopping local track ${index}: ${track.kind} - ${track.readyState}`);
          track.stop();
          console.log(`Local track ${index} stopped, new state: ${track.readyState}`);
        });
        localStreamRef.current = null;
        console.log('Local stream ref cleared');
      } else {
        console.log('No local stream to stop');
      }
      
      console.log('=== CLOSING PEER CONNECTION ===');
      if (peerConnectionRef.current) {
        console.log('PeerConnection state before close:', peerConnectionRef.current.connectionState);
        console.log('PeerConnection ice state before close:', peerConnectionRef.current.iceConnectionState);
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        console.log('PeerConnection closed and ref cleared');
      } else {
        console.log('No peer connection to close');
      }
      
      console.log('=== CLOSING EVENT SOURCE ===');
      if (eventSourceRef.current) {
        console.log('EventSource readyState before close:', eventSourceRef.current.readyState);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        console.log('EventSource closed and ref cleared');
      } else {
        console.log('No event source to close');
      }
      
      console.log('=== CLEARING VIDEO ELEMENTS ===');
      if (localVideoRef.current) {
        console.log('Clearing local video srcObject');
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        console.log('Clearing remote video srcObject');
        remoteVideoRef.current.srcObject = null;
      }
      
      console.log('=== UPDATING STATE ===');
      setIsInRoom(false);
      setConnectionStatus('Disconnected');
      setParticipantCount(0);
      console.log('State updated - isInRoom: false, connectionStatus: Disconnected, participantCount: 0');
      
      alert('Left WebRTC room');
      console.log('=== ADMIN LEAVE ROOM COMPLETED ===');
      
    } catch (error: unknown) {
      const err = error as Error;
      console.error('=== ADMIN LEAVE ROOM ERROR ===');
      console.error('Error details:', err);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      alert(`Error leaving room: ${err.message}`);
    }
  };
  
  const startParticipantCountUpdates = () => {
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
  };
  
  const startSignalingLoop = (forceInRoom = isInRoom) => {
    console.log('🔄 ADMIN: Starting signaling loop...');
    console.log('🔍 ADMIN: isInRoom =', isInRoom);
    console.log('🔍 ADMIN: peerConnectionRef.current =', !!peerConnectionRef.current);
    console.log('🔍 ADMIN: Both exist?', !!(isInRoom && peerConnectionRef.current));

    // Use forceInRoom instead of isInRoom
    const inRoom = forceInRoom;
    // Poll for ICE candidates from client
    const pollIceCandidates = setInterval(async () => {
      try {
        if (!inRoom || !peerConnectionRef.current) {
          console.log('❌ ADMIN: Stopping ICE polling - not in room or no peer connection');
          clearInterval(pollIceCandidates);
          return;
        }
        
        console.log('🧊 ADMIN: Polling for ICE candidates...');
        const { candidates } = await webrtcService.getIceCandidates(roomId, token);
        
        if (candidates && candidates.length > 0) {
          console.log(`📥 ADMIN: Received ${candidates.length} ICE candidates from client`);
          for (const candidateData of candidates) {
            console.log('🧊 ADMIN: Adding ICE candidate:', candidateData.candidate);
            await peerConnectionRef.current.addIceCandidate(candidateData.candidate);
          }
        } else {
          console.log('⏳ ADMIN: No ICE candidates available yet');
        }
      } catch (error) {
        console.error('❌ ADMIN: Error handling ICE candidates:', error);
      }
    }, 2000);
    
    // Check for offers
    const checkOffers = setInterval(async () => {
      try {
        if (!inRoom || !peerConnectionRef.current) {
          console.log('❌ ADMIN: Stopping offer polling - not in room or no peer connection');
          clearInterval(checkOffers);
          clearInterval(pollIceCandidates);
          return;
        }
        
        console.log('🔍 ADMIN: Checking for offers from client...');
        const { offer } = await webrtcService.getOffer(roomId, token);
        console.log('📋 ADMIN: Offer check result:', offer ? 'OFFER FOUND' : 'no offer yet');
        
        if (offer && offer.offer) {
          console.log('🎯 ADMIN: Processing offer from client!');
          console.log('📄 ADMIN: Offer details:', offer.offer);
          clearInterval(checkOffers);
          
          console.log('🔧 ADMIN: Setting remote description from client offer...');
          await peerConnectionRef.current.setRemoteDescription(offer.offer);
          console.log('✅ ADMIN: Set remote description successfully');
          
          console.log('📝 ADMIN: Creating answer...');
          const answer = await peerConnectionRef.current.createAnswer();
          console.log('📝 ADMIN: Created answer:', answer);
          
          console.log('🔧 ADMIN: Setting local description (answer)...');
          await peerConnectionRef.current.setLocalDescription(answer);
          console.log('✅ ADMIN: Set local description successfully');
          
          console.log('📤 ADMIN: Sending answer to server...');
          await webrtcService.sendAnswer(roomId, answer, token);
          console.log('🎉 ADMIN: Answer sent! WebRTC handshake should be complete');
          
          // Log connection states after answering
          console.log('📊 ADMIN: Connection state:', peerConnectionRef.current.connectionState);
          console.log('📊 ADMIN: ICE connection state:', peerConnectionRef.current.iceConnectionState);
          console.log('📊 ADMIN: Signaling state:', peerConnectionRef.current.signalingState);
          
        } else {
          console.log('⏳ ADMIN: No offer available yet, continuing to poll...');
        }
      } catch (error: any) {
        console.error('❌ ADMIN: Error in offer signaling loop:', error);
        console.error('❌ ADMIN: Error details:', error.message);
        console.error('❌ ADMIN: Error stack:', error.stack);
      }
    }, 2000);
    
    console.log('✅ ADMIN: Signaling loop intervals started');
    console.log(`🔄 ADMIN: Checking for offers every 2 seconds for room: ${roomId}`);
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInRoom) {
        leaveRoom();
      }
    };
  }, []);
  
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 border-b-2 border-blue-500 pb-2">
          Telehealth
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