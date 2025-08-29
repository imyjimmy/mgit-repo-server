import { NostrProfile, UserInfo } from '../types';

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

  async registerUser(userData: { firstName: string; lastName: string; email: string; phoneNumber?: string; nostr_pubkey: string }, token: string): Promise<any> {
    try {
      const response = await fetch('/api/patient/register-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userData)
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        return data.user;
      } else {
        throw new Error(data.message || 'Registration failed');
      }
    } catch (error) {
      console.error('User registration failed:', error);
      throw error;
    }
  }

  async checkUserRegistration(pubkey: string, token: string): Promise<{
    isRegistered: boolean;
    user?: UserInfo;
  }> {
    try {
      const response = await fetch(`/api/patient/user-lookup/${pubkey}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        return {
          isRegistered: data.userFound,
          user: data.user || undefined
        };
      } else {
        throw new Error(data.message || 'User lookup failed');
      }
    } catch (error) {
      console.error('User registration check failed:', error);
      throw error;
    }
  }
}

export const authService = new AuthService();