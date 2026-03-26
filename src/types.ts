export interface Song {
  id: string;
  userId: string;
  prompt: string;
  title: string;
  genre: string;
  mood: string;
  key?: string;
  scale?: string;
  instruments?: string[];
  duration: number;
  audioUrl: string;
  lyrics?: string;
  coverArtUrl?: string;
  shareId: string;
  createdAt: any; // Firestore Timestamp
}

export interface MusicOptions {
  key: string;
  scale: string;
  includeInstruments: string[];
  excludeInstruments: string[];
  duration: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  createdAt: any;
}

export type GenerationStatus = 'idle' | 'generating' | 'success' | 'error';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
