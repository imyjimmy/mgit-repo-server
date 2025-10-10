import { ProviderProfile } from '../types/profile';

class ProfileService {
  private baseUrl = window.location.origin;
  
  // Get current user's username
  async getCurrentUsername(token: string): Promise<{ username?: string, userId: string }> {
    const response = await fetch(`${this.baseUrl}/api/admin/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }
    
    return await response.json();
  }
  
  // Get profile (uses the same public endpoint OR creates empty profile)
  async getProfile(token: string): Promise<Partial<ProviderProfile>> {
    const meData = await this.getCurrentUsername(token);
    
    // If no username exists yet, return empty profile structure
    if (!meData.username) {
      return {
        userId: Number(meData.userId),
      };
    }
    
    // If username exists, fetch full profile
    return await this.getPublicProfile(meData.username);
  }
  
  // Get public profile by username
  async getPublicProfile(username: string): Promise<ProviderProfile> {
    const response = await fetch(`${this.baseUrl}/api/admin/provider/${username}/profile`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch public profile');
    }
    
    const data = await response.json();
    // Backend returns { status: 'success', profile: {...} }
    return data.profile || data;
  }
  
  // Update profile
  async updateProfile(token: string, profile: any): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/admin/provider/profile`, {
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