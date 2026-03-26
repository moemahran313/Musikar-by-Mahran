export interface Song {
  id: string;
  userId: string;
  prompt: string;
  title: string;
  genre: string;
  mood: string;
  duration: number;
  audioUrl: string;
  lyrics?: string;
  createdAt: any; // Firestore Timestamp
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
