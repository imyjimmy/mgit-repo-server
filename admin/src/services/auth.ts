import { NostrProfile } from '../types';

class AuthService {
  private baseUrl = window.location.origin;
  
  async challenge(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/auth/nostr/challenge`, {
      method: 'POST'
    });
    const data = await response.json();
    return data.challenge;
  }
  
  async signChallenge(challenge: string): Promise<any> {
    if (!window.nostr) {
      throw new Error('Please install a Nostr browser extension like nos2x');
    }
    
    return await window.nostr.signEvent({
      kind: 1,
      content: challenge,
      tags: [['challenge', challenge]],
      created_at: Math.floor(Date.now() / 1000)
    });
  }
  
  async verify(signedEvent: any): Promise<{ token: string; pubkey: string; metadata: NostrProfile }> {
    const response = await fetch(`${this.baseUrl}/api/auth/nostr/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signedEvent })
    });
    
    const data = await response.json();
    if (data.status !== 'OK') {
      throw new Error('Authentication failed');
    }
    
    return {
      token: data.token,
      pubkey: data.pubkey,
      metadata: data.metadata
    };
  }
  
  async login(): Promise<{ token: string; pubkey: string; metadata: NostrProfile }> {
    const challenge = await this.challenge();
    const signedEvent = await this.signChallenge(challenge);
    return await this.verify(signedEvent);
  }
}

export const authService = new AuthService();