import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { GoogleProfile, NostrProfile } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isNostrProfile(profile: GoogleProfile | NostrProfile): profile is NostrProfile {
  return 'name' in profile || 'display_name' in profile;
}

export function isGoogleProfile(profile: GoogleProfile | NostrProfile): profile is GoogleProfile {
  return 'firstName' in profile;
}

export function getDisplayName(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return 'User';
  
  if (isGoogleProfile(profile)) {
    return `${profile.firstName} ${profile.lastName}`.trim();
  }
  
  return profile.display_name || profile.name || 'User';
}

export function getInitials(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return 'U';
  
  if (isGoogleProfile(profile)) {
    const firstInitial = profile.firstName?.[0]?.toUpperCase() || '';
    const lastInitial = profile.lastName?.[0]?.toUpperCase() || '';
    return `${firstInitial}${lastInitial}` || 'U';
  }
  
  // For Nostr profile, take first 2 letters of display_name or name
  const name = profile.display_name || profile.name || 'User';
  return name.slice(0, 2).toUpperCase();
}

export function getProfilePicture(profile: GoogleProfile | NostrProfile | null): string | undefined {
  if (!profile) return undefined;
  
  if (isGoogleProfile(profile)) {
    return profile.profilePic;
  }
  
  return profile.picture;
}

export function getEmail(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return '';
  
  if (isGoogleProfile(profile)) {
    return profile.email || '';
  }
  
  // For Nostr, could show npub or nip05 if available
  return '';
}