class WebRTCService {
  private baseUrl = window.location.origin;
  
  async joinRoom(roomId: string, token: string): Promise<{ participants: number }> {
    const response = await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    return await response.json();
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
  
  async getOffer(roomId: string, token: string): Promise<{ offer: any }> {
    const response = await fetch(`${this.baseUrl}/api/webrtc/rooms/${roomId}/offer`, {
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
    return new EventSource(`${this.baseUrl}/api/webrtc/rooms/${roomId}/events`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }
}

export const webrtcService = new WebRTCService();