export interface NostrProfile {
  display_name?: string;
  name?: string;
  picture?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  pubkey: string | null;
  profile: NostrProfile | null;
}

export interface WebRTCState {
  isInRoom: boolean;
  connectionStatus: string;
  participantCount: number;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: any): Promise<any>;
    };
  }
}