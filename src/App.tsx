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
  AlertCircle,
  Share2,
  Settings2,
  X,
  Check,
  Copy,
  Image as ImageIcon,
  Type as TypeIcon
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
  updateDoc,
  deleteDoc, 
  doc, 
  serverTimestamp,
  getDocFromServer,
  getDoc
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { cn, formatDuration } from './lib/utils';
import { generateMusic, generateLyrics, generateCoverArt } from './services/geminiService';
import { Song, UserProfile, GenerationStatus, MusicOptions } from './types';

// Operation types for error handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

type QueueStep = 'idle' | 'lyrics' | 'music' | 'art' | 'saving';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [queueStep, setQueueStep] = useState<QueueStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sharedSong, setSharedSong] = useState<Song | null>(null);
  
  // Advanced Options
  const [options, setOptions] = useState<MusicOptions>({
    key: 'C Major',
    scale: 'Ionian',
    includeInstruments: ['Piano', 'Synth'],
    excludeInstruments: ['Drums'],
    duration: 30
  });

  const [generatedLyrics, setGeneratedLyrics] = useState<string>('');
  const [isEditingLyrics, setIsEditingLyrics] = useState(false);
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [saveProgress, setSaveProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Error handling
  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
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

  // Check for shared song in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const songId = params.get('song');
    if (songId) {
      const fetchShared = async () => {
        try {
          const docRef = doc(db, 'songs', songId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setSharedSong({ id: docSnap.id, ...docSnap.data() } as Song);
          }
        } catch (err) {
          console.error("Error fetching shared song", err);
        }
      };
      fetchShared();
    }
  }, []);

  // Check API Key
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

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
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
    setSaveProgress(0);

    try {
      const apiKey = process.env.GEMINI_API_KEY || ""; 
      
      // Step 1: Lyrics
      setQueueStep('lyrics');
      const lyrics = await generateLyrics(prompt, options, apiKey);
      setGeneratedLyrics(lyrics);
      
      // Step 2: Music
      setQueueStep('music');
      const musicResult = await generateMusic(prompt, options, apiKey);
      
      // Step 3: Cover Art
      setQueueStep('art');
      const coverArt = await generateCoverArt(prompt, lyrics, apiKey);
      
      // Step 4: Saving
      setQueueStep('saving');
      // Granular progress simulation
      setSaveProgress(25);
      const shareId = Math.random().toString(36).substring(2, 15);
      setSaveProgress(50);
      const songData = {
        userId: user.uid,
        prompt,
        title: musicResult.title,
        genre: options.scale,
        mood: options.key,
        key: options.key,
        scale: options.scale,
        instruments: options.includeInstruments,
        duration: options.duration,
        audioUrl: musicResult.audioUrl,
        lyrics: lyrics,
        coverArtUrl: coverArt,
        shareId,
        createdAt: serverTimestamp()
      };

      setSaveProgress(75);
      await addDoc(collection(db, 'songs'), songData);
      setSaveProgress(100);
      
      setStatus('success');
      setQueueStep('idle');
      setPrompt('');
      setGeneratedLyrics('');
    } catch (err: any) {
      console.error("Generation failed", err);
      setError(err.message?.includes("Requested entity was not found") 
        ? "API Key invalid. Please re-select." 
        : "Failed to generate. Please try again.");
      setStatus('error');
      setQueueStep('idle');
    }
  };

  const handleRegenerateArt = async (song: Song) => {
    if (!hasApiKey) return handleSelectKey();
    try {
      const apiKey = process.env.GEMINI_API_KEY || "";
      const newArt = await generateCoverArt(song.prompt, song.lyrics || "", apiKey);
      await updateDoc(doc(db, 'songs', song.id), { coverArtUrl: newArt });
    } catch (err) {
      console.error("Art regeneration failed", err);
      setError("Failed to regenerate art.");
    }
  };

  const handleUpdateTitle = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      await updateDoc(doc(db, 'songs', id), { title: editTitle });
      setEditingSongId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `songs/${id}`);
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

  const handleShare = (song: Song) => {
    const url = `${window.location.origin}${window.location.pathname}?song=${song.id}`;
    navigator.clipboard.writeText(url);
    alert("Share link copied to clipboard!");
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'songs', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `songs/${id}`);
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
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.href = '/'}>
          <div className="w-10 h-10 bg-neon-blue rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(0,242,255,0.5)]">
            <Music className="text-dark-bg w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tighter neon-text">MUSIKAR</span>
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border border-white/10" referrerPolicy="no-referrer" />
              <button onClick={handleLogout} className="p-2 hover:bg-white/5 rounded-full text-white/60 hover:text-white">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} className="bg-white text-dark-bg px-4 py-2 rounded-full font-semibold hover:bg-neon-blue transition-all">
              Sign In
            </button>
          )}
        </div>
      </nav>

      <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        {/* Shared Song View */}
        {sharedSong && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-20 glass-card rounded-3xl p-8 border-neon-blue/30 relative overflow-hidden"
          >
            <button 
              onClick={() => setSharedSong(null)}
              className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <img 
                src={sharedSong.coverArtUrl || 'https://picsum.photos/seed/music/512/512'} 
                className="w-64 h-64 rounded-2xl shadow-2xl object-cover border border-white/10"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 text-center md:text-left">
                <span className="text-neon-blue text-xs font-bold uppercase tracking-widest mb-2 block">Shared Track</span>
                <h2 className="text-4xl font-black mb-4">{sharedSong.title}</h2>
                <p className="text-white/60 mb-6 italic">"{sharedSong.prompt}"</p>
                <div className="flex flex-wrap gap-4 justify-center md:justify-start mb-8">
                  <div className="bg-white/5 px-4 py-2 rounded-xl">
                    <span className="text-xs text-white/40 block">Key</span>
                    <span className="font-bold">{sharedSong.key}</span>
                  </div>
                  <div className="bg-white/5 px-4 py-2 rounded-xl">
                    <span className="text-xs text-white/40 block">Scale</span>
                    <span className="font-bold">{sharedSong.scale}</span>
                  </div>
                </div>
                <button 
                  onClick={() => togglePlay(sharedSong)}
                  className="bg-neon-blue text-dark-bg px-10 py-4 rounded-full font-black flex items-center gap-3 hover:scale-105 transition-transform"
                >
                  {currentSong?.id === sharedSong.id && isPlaying ? <Pause /> : <Play />}
                  {currentSong?.id === sharedSong.id && isPlaying ? 'PAUSE' : 'PLAY NOW'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Generator Section */}
        {!sharedSong && (
          <section className="text-center mb-20">
            <motion.h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight leading-none">
              CREATE <span className="text-neon-blue neon-text">MUSIC</span> <br />
              WITH <span className="text-neon-purple">AI</span>
            </motion.h1>

            <div className="max-w-3xl mx-auto">
              <form onSubmit={handleGenerate} className="relative group mb-6">
                <div className="absolute -inset-1 bg-gradient-to-r from-neon-blue to-neon-purple rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                <div className="relative glass-card rounded-2xl p-2 flex items-center gap-2">
                  <div className="pl-4 text-white/40"><Sparkles className="w-6 h-6" /></div>
                  <input 
                    type="text" 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your track..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-lg py-4 px-2"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={cn("p-4 rounded-xl transition-colors", showAdvanced ? "bg-neon-blue/20 text-neon-blue" : "text-white/40 hover:bg-white/5")}
                  >
                    <Settings2 className="w-6 h-6" />
                  </button>
                  <button 
                    type="submit"
                    disabled={status === 'generating'}
                    className="bg-neon-blue text-dark-bg px-8 py-4 rounded-xl font-bold flex items-center gap-2"
                  >
                    {status === 'generating' ? <RefreshCw className="animate-spin" /> : <ChevronRight />}
                  </button>
                </div>
              </form>

              {/* Advanced Controls */}
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mb-8"
                  >
                    <div className="glass-card rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                      <div>
                        <label className="text-xs font-bold text-white/40 uppercase mb-2 block">Musical Key</label>
                        <select 
                          value={options.key}
                          onChange={(e) => setOptions({...options, key: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-neon-blue outline-none"
                        >
                          {['C Major', 'G Major', 'D Major', 'A Minor', 'E Minor'].map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-white/40 uppercase mb-2 block">Scale</label>
                        <select 
                          value={options.scale}
                          onChange={(e) => setOptions({...options, scale: e.target.value})}
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:border-neon-blue outline-none"
                        >
                          {['Ionian', 'Aeolian', 'Dorian', 'Phrygian', 'Lydian'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-bold text-white/40 uppercase mb-2 block">Duration: {options.duration}s</label>
                        <input 
                          type="range" 
                          min="15" 
                          max="120" 
                          step="1"
                          value={options.duration}
                          onChange={(e) => setOptions({...options, duration: parseInt(e.target.value)})}
                          className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-neon-blue"
                        />
                        <div className="flex justify-between text-[10px] text-white/20 mt-2">
                          <span>15s</span>
                          <span>120s</span>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs font-bold text-white/40 uppercase mb-2 block">Instruments (Include)</label>
                        <div className="flex flex-wrap gap-2">
                          {['Piano', 'Synth', 'Guitar', 'Bass', 'Strings', 'Brass'].map(inst => (
                            <button 
                              key={inst}
                              type="button"
                              onClick={() => {
                                const newInst = options.includeInstruments.includes(inst) 
                                  ? options.includeInstruments.filter(i => i !== inst)
                                  : [...options.includeInstruments, inst];
                                setOptions({...options, includeInstruments: newInst});
                              }}
                              className={cn(
                                "px-4 py-2 rounded-xl border text-sm transition-all",
                                options.includeInstruments.includes(inst) ? "bg-neon-blue/20 border-neon-blue text-neon-blue" : "border-white/10 text-white/40"
                              )}
                            >
                              {inst}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Queue System Visualization */}
              <AnimatePresence>
                {status === 'generating' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card rounded-2xl p-8 mb-8"
                  >
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex flex-col items-start">
                        <h3 className="text-xl font-bold mb-1">Generating your track...</h3>
                        <p className="text-white/40 text-sm">Our AI is composing your masterpiece.</p>
                      </div>
                      <RefreshCw className="w-8 h-8 text-neon-blue animate-spin" />
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4 relative">
                      {[
                        { id: 'lyrics', icon: TypeIcon, label: 'Lyrics' },
                        { id: 'music', icon: Music, label: 'Audio' },
                        { id: 'art', icon: ImageIcon, label: 'Cover Art' },
                        { id: 'saving', icon: Check, label: 'Finalizing' }
                      ].map((step, idx) => {
                        const isDone = ['lyrics', 'music', 'art', 'saving'].indexOf(queueStep) > idx;
                        const isCurrent = queueStep === step.id;
                        return (
                          <div key={step.id} className="flex flex-col items-center gap-3">
                            <div className={cn(
                              "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500",
                              isDone ? "bg-neon-blue text-dark-bg" : isCurrent ? "bg-neon-blue/20 text-neon-blue animate-pulse" : "bg-white/5 text-white/20"
                            )}>
                              <step.icon className="w-6 h-6" />
                            </div>
                            <span className={cn("text-[10px] font-bold uppercase tracking-widest", isCurrent ? "text-neon-blue" : "text-white/20")}>
                              {step.label}
                            </span>
                            {isCurrent && step.id === 'saving' && (
                              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                                <motion.div 
                                  className="h-full bg-neon-blue"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${saveProgress}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Progress Line */}
                      <div className="absolute top-6 left-0 w-full h-0.5 bg-white/5 -z-10" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* History Grid */}
        {!sharedSong && (
          <section className="mt-32">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <History className="w-6 h-6 text-neon-blue" />
                <h2 className="text-2xl font-bold">Your Creations</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {songs.map((song) => (
                <motion.div 
                  key={song.id}
                  layout
                  className="glass-card rounded-3xl overflow-hidden group hover:border-neon-blue/30 transition-all"
                >
                  <div className="relative aspect-square overflow-hidden">
                    <img 
                      src={song.coverArtUrl || 'https://picsum.photos/seed/music/512/512'} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-transparent to-transparent opacity-60" />
                    <button 
                      onClick={() => togglePlay(song)}
                      className="absolute bottom-4 right-4 w-14 h-14 bg-neon-blue text-dark-bg rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform"
                    >
                      {currentSong?.id === song.id && isPlaying ? <Pause /> : <Play className="ml-1" />}
                    </button>
                    <button 
                      onClick={() => handleRegenerateArt(song)}
                      className="absolute top-4 right-4 p-2 bg-dark-bg/50 backdrop-blur-md rounded-lg text-white/60 hover:text-neon-blue opacity-0 group-hover:opacity-100 transition-all"
                      title="Regenerate Cover Art"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-2">
                      {editingSongId === song.id ? (
                        <div className="flex-1 flex gap-2">
                          <input 
                            type="text" 
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="flex-1 bg-white/5 border border-neon-blue rounded-lg px-2 py-1 text-sm outline-none"
                            autoFocus
                          />
                          <button onClick={() => handleUpdateTitle(song.id)} className="text-neon-blue"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingSongId(null)} className="text-red-400"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <h3 
                          className="font-bold text-xl truncate pr-4 cursor-pointer hover:text-neon-blue transition-colors"
                          onClick={() => {
                            setEditingSongId(song.id);
                            setEditTitle(song.title);
                          }}
                        >
                          {song.title}
                        </h3>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => handleShare(song)} className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-neon-blue">
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(song.id)} className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-white/40 text-sm mb-4 line-clamp-2">"{song.prompt}"</p>
                    
                    <div className="flex items-center gap-4 text-xs font-bold text-white/20 uppercase tracking-widest">
                      <span>{song.key}</span>
                      <span>•</span>
                      <span>{song.scale}</span>
                      <span>•</span>
                      <span>{formatDuration(song.duration)}</span>
                    </div>

                    {/* Lyrics Preview */}
                    {song.lyrics && (
                      <div className="mt-4 pt-4 border-t border-white/5">
                        <div className="flex items-center gap-2 text-neon-purple mb-2">
                          <TypeIcon className="w-3 h-3" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Lyrics</span>
                        </div>
                        <p className="text-[11px] text-white/40 line-clamp-3 leading-relaxed italic">
                          {song.lyrics}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </main>

      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} className="hidden" />
    </div>
  );
}
