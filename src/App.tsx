import React, { useState, useEffect, useRef } from 'react';
import { 
  Music, 
  Sparkles, 
  History, 
  Play, 
  Pause, 
  Download, 
  RefreshCw, 
  LogOut, 
  LogIn, 
  Mic2, 
  Volume2,
  Clock,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { cn, formatDuration } from './lib/utils';
import { generateMusic } from './services/geminiService';
import { Song, UserProfile, GenerationStatus } from './types';

// Operation types for error handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Error handling as per guidelines
  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    setError("Database error. Please check your permissions.");
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Check API Key for Lyria
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();
  }, []);

  // Sync Songs
  useEffect(() => {
    if (!user || !isAuthReady) {
      setSongs([]);
      return;
    }

    const path = 'songs';
    const q = query(
      collection(db, path),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const songList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Song[];
      setSongs(songList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Test connection on boot
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return handleLogin();
    if (!hasApiKey) return handleSelectKey();
    if (!prompt.trim()) return;

    setStatus('generating');
    setError(null);

    try {
      // Create a fresh instance of GenAI with the latest key as per guidelines
      const apiKey = process.env.GEMINI_API_KEY || ""; 
      // Note: Lyria requires user-selected key, but we use process.env.API_KEY if available
      // or the platform injected one.
      
      const result = await generateMusic(prompt, apiKey);
      
      const songData = {
        userId: user.uid,
        prompt,
        title: result.title,
        genre: "AI Generated",
        mood: "Dynamic",
        duration: result.duration,
        audioUrl: result.audioUrl,
        lyrics: result.lyrics,
        createdAt: serverTimestamp()
      };

      const path = 'songs';
      await addDoc(collection(db, path), songData);
      
      setStatus('success');
      setPrompt('');
    } catch (err: any) {
      console.error("Generation failed", err);
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("API Key invalid or expired. Please re-select.");
      } else {
        setError("Failed to generate music. Please try again.");
      }
      setStatus('error');
    }
  };

  const togglePlay = (song: Song) => {
    if (currentSong?.id === song.id) {
      if (isPlaying) {
        audioRef.current?.pause();
      } else {
        audioRef.current?.play();
      }
      setIsPlaying(!isPlaying);
    } else {
      setCurrentSong(song);
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.src = song.audioUrl;
        audioRef.current.play();
      }
    }
  };

  const handleDelete = async (id: string) => {
    const path = `songs/${id}`;
    try {
      await deleteDoc(doc(db, 'songs', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-bg">
        <div className="animate-pulse-neon">
          <Music className="w-12 h-12 text-neon-blue" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg text-white selection:bg-neon-blue/30">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-card border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-neon-blue rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(0,242,255,0.5)]">
            <Music className="text-dark-bg w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tighter neon-text">MUSIKAR</span>
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-medium">{user.displayName}</span>
                <span className="text-xs text-white/40">{user.email}</span>
              </div>
              <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border border-white/10" referrerPolicy="no-referrer" />
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/60 hover:text-white"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 bg-white text-dark-bg px-4 py-2 rounded-full font-semibold hover:bg-neon-blue transition-all"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}
        </div>
      </nav>

      <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        {/* Hero Section */}
        <section className="text-center mb-20">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black mb-6 tracking-tight leading-none"
          >
            CREATE <span className="text-neon-blue neon-text">MUSIC</span> <br />
            WITH <span className="text-neon-purple">AI</span>
          </motion.h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto mb-10">
            Describe your sound, mood, and style. Musikar turns your imagination into high-quality audio tracks in seconds.
          </p>

          {/* Generator Input */}
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleGenerate} className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-neon-blue to-neon-purple rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative glass-card rounded-2xl p-2 flex items-center gap-2">
                <div className="pl-4 text-white/40">
                  <Sparkles className="w-6 h-6" />
                </div>
                <input 
                  type="text" 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A lo-fi hip hop track with rainy vibes and soft piano..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-lg py-4 px-2 placeholder:text-white/20"
                />
                <button 
                  type="submit"
                  disabled={status === 'generating'}
                  className={cn(
                    "bg-neon-blue text-dark-bg px-8 py-4 rounded-xl font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95",
                    status === 'generating' && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {status === 'generating' ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Generate
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* API Key Alert */}
            {!hasApiKey && user && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-xl bg-neon-purple/10 border border-neon-purple/20 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 text-neon-purple">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Lyria models require a billing-enabled API key.</span>
                </div>
                <button 
                  onClick={handleSelectKey}
                  className="text-xs font-bold uppercase tracking-widest bg-neon-purple text-white px-3 py-1 rounded-md hover:bg-neon-purple/80 transition-colors"
                >
                  Select Key
                </button>
              </motion.div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mt-4 text-red-400 flex items-center justify-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* Example Prompts */}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {["Synthwave 80s", "Epic Orchestral", "Chill Lo-fi", "Hard Techno", "Smooth Jazz"].map((p) => (
                <button 
                  key={p}
                  onClick={() => setPrompt(p)}
                  className="px-4 py-1.5 rounded-full border border-white/10 text-sm text-white/40 hover:text-white hover:border-neon-blue transition-all"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Dashboard / History */}
        <section className="mt-32">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <History className="w-6 h-6 text-neon-blue" />
              <h2 className="text-2xl font-bold">Your Creations</h2>
            </div>
            <div className="text-white/40 text-sm">
              {songs.length} songs generated
            </div>
          </div>

          {!user ? (
            <div className="glass-card rounded-3xl p-20 text-center border-dashed border-white/10">
              <Music className="w-12 h-12 text-white/10 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">Sign in to save your music</h3>
              <p className="text-white/40 mb-8">Your generated tracks will be stored here forever.</p>
              <button 
                onClick={handleLogin}
                className="bg-white text-dark-bg px-8 py-3 rounded-full font-bold hover:bg-neon-blue transition-all"
              >
                Connect with Google
              </button>
            </div>
          ) : songs.length === 0 ? (
            <div className="glass-card rounded-3xl p-20 text-center border-dashed border-white/10">
              <Sparkles className="w-12 h-12 text-white/10 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">No songs yet</h3>
              <p className="text-white/40">Start by describing a track above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {songs.map((song) => (
                  <motion.div 
                    key={song.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="glass-card rounded-2xl p-6 group hover:border-neon-blue/30 transition-all relative overflow-hidden"
                  >
                    {/* Progress Bar (Mock for current playing) */}
                    {currentSong?.id === song.id && isPlaying && (
                      <div className="absolute bottom-0 left-0 h-1 bg-neon-blue animate-pulse" style={{ width: '100%' }} />
                    )}

                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-neon-blue/10 transition-colors">
                        <Music className="w-6 h-6 text-white/20 group-hover:text-neon-blue transition-colors" />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleDelete(song.id)}
                          className="p-2 text-white/20 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <h3 className="font-bold text-lg mb-1 truncate">{song.title}</h3>
                    <p className="text-white/40 text-sm mb-6 line-clamp-2 italic">"{song.prompt}"</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => togglePlay(song)}
                          className="w-12 h-12 bg-neon-blue text-dark-bg rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-[0_0_15px_rgba(0,242,255,0.3)]"
                        >
                          {currentSong?.id === song.id && isPlaying ? (
                            <Pause className="w-5 h-5 fill-current" />
                          ) : (
                            <Play className="w-5 h-5 fill-current ml-1" />
                          )}
                        </button>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold uppercase tracking-widest text-white/20">Duration</span>
                          <span className="text-sm font-mono">{formatDuration(song.duration)}</span>
                        </div>
                      </div>
                      
                      <a 
                        href={song.audioUrl} 
                        download={`${song.title}.wav`}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                      >
                        <Download className="w-5 h-5 text-white/60" />
                      </a>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>

      {/* Global Audio Element */}
      <audio 
        ref={audioRef} 
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-6 text-center text-white/20 text-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Music className="w-4 h-4" />
          <span className="font-bold tracking-tighter">MUSIKAR</span>
        </div>
        <p>© 2026 Musikar AI. Powered by Gemini Lyria.</p>
      </footer>
    </div>
  );
}
