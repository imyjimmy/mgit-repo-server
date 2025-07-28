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
      setParticipantCount(joinResult.participants);
      setIsInRoom(true);
      
      // Start participant count updates
      startParticipantCountUpdates();
      
      // Start signaling loop
      startSignalingLoop();
      
      alert(`Joined room: ${roomId}`);
      
    } catch (error) {
      console.error('Error joining WebRTC room:', error);
      alert(`Failed to join room: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setConnectionStatus('Failed to connect');
    }
  };
  
  const leaveRoom = () => {
    try {
      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      
      // Close peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      // Close event source
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Clear video elements
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      
      setIsInRoom(false);
      setConnectionStatus('Disconnected');
      setParticipantCount(0);
      
      alert('Left WebRTC room');
      
    } catch (error) {
      console.error('Error leaving room:', error);
      alert(`Error leaving room: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
  
  const startSignalingLoop = () => {
    // Poll for ICE candidates from client
    const pollIceCandidates = setInterval(async () => {
      try {
        if (!isInRoom || !peerConnectionRef.current) {
          clearInterval(pollIceCandidates);
          return;
        }
        
        const { candidates } = await webrtcService.getIceCandidates(roomId, token);
        
        if (candidates && candidates.length > 0) {
          for (const candidateData of candidates) {
            await peerConnectionRef.current.addIceCandidate(candidateData.candidate);
          }
        }
      } catch (error) {
        console.error('Error handling ICE candidates:', error);
      }
    }, 2000);
    
    // Check for offers
    const checkOffers = setInterval(async () => {
      try {
        if (!isInRoom || !peerConnectionRef.current) {
          clearInterval(checkOffers);
          clearInterval(pollIceCandidates);
          return;
        }
        
        const { offer } = await webrtcService.getOffer(roomId, token);
        
        if (offer && offer.offer) {
          clearInterval(checkOffers);
          
          await peerConnectionRef.current.setRemoteDescription(offer.offer);
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          
          await webrtcService.sendAnswer(roomId, answer, token);
        }
      } catch (error) {
        console.error('Error in signaling loop:', error);
      }
    }, 2000);
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