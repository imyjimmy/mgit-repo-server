import { ProviderProfile } from '../types/profile';

class ProfileService {
  private baseUrl = window.location.origin;
  
  async getProfile(token: string): Promise<ProviderProfile> {
    const response = await fetch(`${this.baseUrl}/api/admin/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }
    
    return await response.json();
  }
  
  async getPublicProfile(username: string): Promise<ProviderProfile> {
    const response = await fetch(`${this.baseUrl}/api/admin/profile/${username}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch public profile');
    }
    
    return await response.json();
  }
  
  async updateProfile(token: string, profile: any): Promise<void> {
    const response = await fetch('/api/admin/provider/profile', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(profile)
    });

    if (!response.ok) {
      throw new Error('Failed to update profile');
    }
  }
  
}

export const profileService = new ProfileService();