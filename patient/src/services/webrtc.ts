class WebRTCService {
  private baseUrl = window.location.origin;

  async joinRoom(roomId: string, token: string): Promise<{ participants: number, shouldInitiateOffer: boolean, userRole: any, joinOrder: number }> {
    const response = await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    return {
      participants: result.participants,
      shouldInitiateOffer: result.shouldInitiateOffer, // Use backend's determination
      userRole: result.userRole,
      joinOrder: result.joinOrder
    };
  }
  
  async sendIceCandidate(roomId: string, candidate: RTCIceCandidate, token: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/ice-candidate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ candidate })
    });
  }
  
  async getIceCandidates(roomId: string, token: string): Promise<{ candidates: any[] }> {
    const response = await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/ice-candidates`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    return await response.json();
  }
  
  async sendOffer(roomId: string, offer: RTCSessionDescriptionInit, token: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/offer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ offer })
    });
  }

  async getOffer(roomId: string, token: string): Promise<{ offer: any }> {
    const response = await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/offer`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    return await response.json();
  }
  
  async getAnswer(roomId: string, token: string): Promise<{ answer: any }> {
    const response = await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/answer`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    return await response.json();
  }

  async sendAnswer(roomId: string, answer: RTCSessionDescriptionInit, token: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/answer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ answer })
    });
  }
  
  createEventSource(roomId: string, token: string): EventSource {
    const eventSourceUrl = `${this.baseUrl}/api/webrtc/rooms/${roomId}/events?token=${encodeURIComponent(token)}`;
    console.log('🔗 EventSource URL:', eventSourceUrl);
    console.log('🌐 Base URL:', this.baseUrl);
    console.log('🏠 Window origin:', window.location.origin);
    return new EventSource(`${this.baseUrl}/api/webrtc/rooms/${roomId}/events?token=${encodeURIComponent(token)}`);
  }
}

export const webrtcService = new WebRTCService();