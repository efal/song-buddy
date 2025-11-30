
import React, { useEffect, useRef, useState } from 'react';
import { Song } from '../types';
import { useAudioMonitor, useMetronome } from '../services/audio';
import { ArrowLeft, Mic, Play, Maximize2, Minimize2, Type, MoveVertical, Pause, RotateCcw, Activity } from 'lucide-react';

interface LiveModeProps {
  song: Song;
  onExit: () => void;
  onUpdate: (song: Song) => void;
}

const LiveMode: React.FC<LiveModeProps> = ({ song, onExit, onUpdate }) => {
  // Default to monitoring true (armed) immediately
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null); // Ref for the progress bar thumb
  const lastFrameTime = useRef<number>(0);
  const animationRef = useRef<number>(0);

  // Reference to song to access latest values inside requestAnimationFrame closure
  const songRef = useRef(song);
  songRef.current = song;
  
  // Audio Monitor (Mic)
  const shouldMonitor = isMonitoring && !isScrolling;
  const { currentDB, triggered, error } = useAudioMonitor(shouldMonitor, song.audioTrigger.threshold);

  // Metronome (Click)
  // Ensure metronome properties exist even for old data
  const metroConfig = song.metronome || { bpm: 120, beatsPerBar: 4, clickPitch: 1000, enabled: false };
  const { isPlaying: isMetronomePlaying, toggleMetronome, bpm, setBpm } = useMetronome(
      metroConfig.bpm, 
      metroConfig.beatsPerBar, 
      metroConfig.clickPitch
  );

  // Sync internal Metronome hook state with parent song state updates if needed
  useEffect(() => {
      // If the song prop updates via slider, we need to tell the hook
      if (song.metronome && song.metronome.bpm !== bpm) {
          setBpm(song.metronome.bpm);
      }
  }, [song.metronome, bpm, setBpm]);


  // Trigger effect
  useEffect(() => {
    if (triggered && !isScrolling) {
      setIsScrolling(true);
    }
  }, [triggered, isScrolling]);

  // Helper to update progress bar visually without triggering re-renders
  const updateProgressBar = () => {
    if (containerRef.current && progressBarRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const maxScroll = scrollHeight - clientHeight;
      
      if (maxScroll > 0) {
        // Calculate remaining percentage
        const progress = (scrollTop / maxScroll) * 100;
        const remaining = 100 - Math.min(100, Math.max(0, progress));
        
        // Set height based on remaining content (shrinks as we scroll)
        progressBarRef.current.style.height = `${remaining}%`;
      }
    }
  };

  // Scroll Loop
  const scroll = (time: number) => {
    if (!lastFrameTime.current) lastFrameTime.current = time;
    const deltaTime = (time - lastFrameTime.current) / 1000; // seconds
    lastFrameTime.current = time;

    if (containerRef.current) {
      // Use ref to get latest speed during active loop without restarting it
      // Pixels to move = speed (px/s) * deltaTime (s)
      const moveAmount = songRef.current.scrollspeed * deltaTime;
      
      // Only update DOM if we actually moved
      if (moveAmount > 0) {
        containerRef.current.scrollTop += moveAmount;
        
        // Update progress bar synchronously with scroll
        updateProgressBar();

        // Check end
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 1) {
          setIsScrolling(false); // Stop at absolute bottom
        }
      }
    }

    if (isScrolling) {
      animationRef.current = requestAnimationFrame(scroll);
    }
  };

  // Start/Stop Scroll Animation
  useEffect(() => {
    if (isScrolling) {
      lastFrameTime.current = 0; // Reset delta timer
      animationRef.current = requestAnimationFrame(scroll);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isScrolling]);

  // Update progress bar on manual scroll or window resize
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
        container.addEventListener('scroll', updateProgressBar);
        window.addEventListener('resize', updateProgressBar);
        // Initial update
        updateProgressBar();
    }
    return () => {
        if (container) container.removeEventListener('scroll', updateProgressBar);
        window.removeEventListener('resize', updateProgressBar);
    };
  }, []);

  // Manual Page Scrolling Helper
  const pageScroll = (direction: 'up' | 'down') => {
    if (containerRef.current) {
        const { clientHeight } = containerRef.current;
        // Scroll 75% of viewport height to maintain some context context
        const scrollAmount = clientHeight * 0.75; 
        const newTop = containerRef.current.scrollTop + (direction === 'down' ? scrollAmount : -scrollAmount);
        
        containerRef.current.scrollTo({
            top: newTop,
            behavior: 'smooth'
        });
    }
  };

  // Handle Reset logic
  const handleReset = (e?: React.MouseEvent | KeyboardEvent) => {
    if (e) e.stopPropagation();
    if (containerRef.current) {
        containerRef.current.scrollTop = 0;
        setIsScrolling(false);
        updateProgressBar();
    }
  };

  // Keyboard / Foot Switch Control (Bluetooth HID)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Toggle Scroll (Start/Stop)
      // Space, Enter: Standard keys
      // ArrowDown: Kept for compatibility with simple pedals as requested previously
      if (['Space', 'Enter', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
        setIsScrolling(prev => !prev);
        return;
      }
      
      // 2. Reset to Top
      // ArrowUp, Home
      if (['ArrowUp', 'Home'].includes(e.code)) {
        e.preventDefault();
        handleReset();
        return;
      }

      // 3. Page Down (Blättern) - NEW
      // PageDown: Standard pedal "next" key
      // ArrowRight: Alternative "next" key
      if (['PageDown', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
        pageScroll('down');
        return;
      }

      // 4. Page Up
      // PageUp: Standard pedal "prev" key
      // ArrowLeft: Alternative "prev" key
      if (['PageUp', 'ArrowLeft'].includes(e.code)) {
        e.preventDefault();
        pageScroll('up');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fullscreen Toggle
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle exit
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onExit]);

  const handleScreenTap = () => {
    setIsScrolling(prev => !prev);
  };

  const handleSettingChange = (field: keyof Song, value: number) => {
      onUpdate({ ...song, [field]: value });
  };

  const handleTriggerChange = (value: number) => {
      onUpdate({ ...song, audioTrigger: { ...song.audioTrigger, threshold: value } });
  };

  const handleTempoChange = (value: number) => {
    // Update local hook (live change)
    setBpm(value);
    // Persist song state
    const currentMetronome = song.metronome || { beatsPerBar: 4, clickPitch: 1000, enabled: false };
    onUpdate({ ...song, metronome: { ...currentMetronome, bpm: value } });
  };

  return (
    <div 
      className="fixed inset-0 bg-black text-white z-50 overflow-hidden flex flex-col cursor-pointer"
      onClick={handleScreenTap}
    >
      {/* Progress Bar Sidebar */}
      <div className="absolute right-0 top-0 bottom-0 w-1.5 z-30 bg-white/5">
        <div 
            ref={progressBarRef}
            className="absolute bottom-0 w-full bg-gray-300/70 rounded-t-full transition-all duration-75 ease-linear"
            style={{ height: '100%' }}
        />
      </div>

      {/* Scrolling Container */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-scroll no-scrollbar relative"
        style={{ scrollBehavior: 'auto', transform: 'translateZ(0)' }} // Force GPU layer
      >
        <div style={{ height: '40vh' }}></div>
        
        <div 
            ref={contentRef}
            className="max-w-5xl mx-auto px-8 pb-20 text-center whitespace-pre-wrap font-bold leading-relaxed transition-all duration-100"
            style={{ fontSize: `${song.fontsize}px` }}
        >
          {song.lyrics}
        </div>
        
        <div style={{ height: '60vh' }}></div>
      </div>

      {/* Top HUD Controls */}
      <div className="absolute top-0 left-0 w-full bg-black/10 hover:bg-black/60 transition-colors duration-300 p-4 backdrop-blur-[1px] z-20 group cursor-auto">
        <div className="flex justify-between items-center max-w-7xl mx-auto opacity-40 group-hover:opacity-100 transition-opacity duration-300">
            {/* Left */}
            <div className="flex-1 flex justify-start items-center min-w-0 mr-2">
                <button onClick={(e) => { e.stopPropagation(); onExit(); }} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-all flex-shrink-0">
                    <ArrowLeft size={24} />
                </button>
                <span className="ml-3 font-bold text-lg text-white/80 truncate select-none pointer-events-none">
                    {song.title}
                </span>
            </div>

            {/* Center */}
            <div className="flex-1 flex justify-center items-center space-x-6">
                <button 
                    onClick={handleReset}
                    className="p-3 bg-white/10 text-white/70 hover:bg-white/20 hover:text-white rounded-full transition-all"
                    title="Reset to Start"
                >
                    <RotateCcw size={24} />
                </button>

                <button 
                    onClick={(e) => { e.stopPropagation(); setIsScrolling(!isScrolling); }} 
                    className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-105 ${isScrolling ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}
                >
                    {isScrolling ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                </button>

                {/* Metronome Toggle */}
                <button
                    onClick={(e) => { e.stopPropagation(); toggleMetronome(); }}
                    className={`p-3 rounded-full transition-all ${isMetronomePlaying ? 'bg-yellow-500/80 text-black' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
                    title="Toggle Metronome"
                >
                    <Activity size={24} className={isMetronomePlaying ? "animate-pulse" : ""} />
                </button>
            </div>

            {/* Right */}
            <div className="flex-1 flex justify-end items-center space-x-4">
                <div className="flex items-center space-x-2 bg-black/20 px-3 py-2 rounded-full border border-white/5">
                    <Mic size={18} className={shouldMonitor ? "text-green-500/70" : "text-white/20"} />
                    <div className="w-16 sm:w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-75 ${currentDB > song.audioTrigger.threshold ? 'bg-green-500/80' : 'bg-blue-500/50'}`}
                            style={{ width: `${Math.min(100, Math.max(0, (currentDB + 60) * 2))}%` }} 
                        />
                    </div>
                </div>

                {!isMonitoring ? (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMonitoring(true); }}
                        className="bg-blue-600/30 hover:bg-blue-600/80 text-blue-100/70 hover:text-white px-3 py-2 rounded-lg font-bold text-sm transition-all"
                    >
                        Arm
                    </button>
                ) : (
                   <button 
                       onClick={(e) => { e.stopPropagation(); setIsMonitoring(false); }}
                       className={`font-bold text-xs px-3 rounded-lg py-1.5 border flex items-center space-x-1 transition-all cursor-pointer hover:bg-white/5
                        ${isScrolling 
                            ? 'text-yellow-500/70 border-yellow-500/20 bg-yellow-900/10' 
                            : 'text-green-500/70 border-green-500/20 bg-green-900/10 animate-pulse'}`
                       }
                   >
                       {isScrolling ? <span>Paused</span> : <span>Listening</span>}
                   </button>
                )}

                <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className="hidden sm:block p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all">
                    {isFullscreen ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
                </button>
            </div>
        </div>
        {error && <div className="text-red-500 text-center mt-2 font-bold text-sm opacity-80">{error}</div>}
      </div>

      {/* Bottom Settings Bar */}
      <div 
        className="absolute bottom-0 left-0 w-full bg-black/60 p-4 backdrop-blur-sm z-20 cursor-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
            
            {/* Font Size */}
            <div className="flex items-center space-x-2">
                <Type size={16} className="text-white/50" />
                <div className="flex flex-col flex-1">
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-white/40 mb-1">
                        <span>Size</span>
                        <span>{song.fontsize}</span>
                    </div>
                    <input 
                        type="range" min="20" max="150" step="2"
                        value={song.fontsize}
                        onChange={(e) => handleSettingChange('fontsize', parseInt(e.target.value))}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500/70 hover:accent-blue-500"
                    />
                </div>
            </div>

            {/* Scroll Speed */}
            <div className="flex items-center space-x-2">
                <MoveVertical size={16} className="text-white/50" />
                <div className="flex flex-col flex-1">
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-white/40 mb-1">
                        <span>Speed</span>
                        <span>{song.scrollspeed}</span>
                    </div>
                    <input 
                        type="range" min="5" max="200" step="5"
                        value={song.scrollspeed}
                        onChange={(e) => handleSettingChange('scrollspeed', parseInt(e.target.value))}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-green-500/70 hover:accent-green-500"
                    />
                </div>
            </div>

            {/* Metronome Tempo */}
             <div className="flex items-center space-x-2">
                <Activity size={16} className="text-white/50" />
                <div className="flex flex-col flex-1">
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-white/40 mb-1">
                        <span>Tempo</span>
                        <span>{bpm} BPM</span>
                    </div>
                    <input 
                        type="range" min="30" max="240" step="1"
                        value={bpm}
                        onChange={(e) => handleTempoChange(parseInt(e.target.value))}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-yellow-500/70 hover:accent-yellow-500"
                    />
                </div>
            </div>

            {/* Trigger Sensitivity */}
             <div className="flex items-center space-x-2">
                <Mic size={16} className="text-white/50" />
                <div className="flex flex-col flex-1">
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-white/40 mb-1">
                        <span>Trig</span>
                        <span>{song.audioTrigger.threshold}dB</span>
                    </div>
                    <input 
                        type="range" min="-80" max="0" step="1"
                        value={song.audioTrigger.threshold}
                        onChange={(e) => handleTriggerChange(parseInt(e.target.value))}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-500/70 hover:accent-red-500"
                    />
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMode;
