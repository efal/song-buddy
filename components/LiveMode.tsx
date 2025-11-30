import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Song } from '../types';
import { useAudioMonitor, useMetronome } from '../services/audio';
import { ArrowLeft, Mic, Play, Pause, RotateCcw, Activity, Zap, Type, MoveVertical, Gauge } from 'lucide-react';

interface LiveModeProps {
  song: Song;
  onExit: () => void;
  onUpdate: (song: Song) => void;
}

const LiveMode: React.FC<LiveModeProps> = ({ song, onExit, onUpdate }) => {
  // Default to monitoring true (armed) immediately
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [isScrolling, setIsScrolling] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null); 
  const lastFrameTime = useRef<number>(0);
  const animationRef = useRef<number>(0);

  // Long press refs for gestures/keyboard
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressHandled = useRef(false);

  // Reference to song to access latest values inside requestAnimationFrame closure
  const songRef = useRef(song);
  
  // Update ref when song changes (e.g. via sliders)
  useEffect(() => {
    songRef.current = song;
  }, [song]);
  
  // Audio Monitor (Mic) - Disable monitoring while scrolling to save performance
  const shouldMonitor = isMonitoring && !isScrolling;
  const { triggered } = useAudioMonitor(shouldMonitor, song.audioTrigger.threshold);

  // Metronome (Click)
  const metroConfig = song.metronome || { bpm: 120, beatsPerBar: 4, clickPitch: 1000, enabled: false };
  const { isPlaying: isMetronomePlaying, toggleMetronome, bpm, setBpm } = useMetronome(
      metroConfig.bpm, 
      metroConfig.beatsPerBar, 
      metroConfig.clickPitch
  );

  // Sync internal Metronome hook state with parent song state updates
  useEffect(() => {
      if (song.metronome && song.metronome.bpm !== bpm) {
          setBpm(song.metronome.bpm);
      }
  }, [song.metronome, bpm, setBpm]);

  // Audio Trigger Effect
  useEffect(() => {
    if (triggered && !isScrolling) {
      setIsScrolling(true);
    }
  }, [triggered, isScrolling]);

  // Update Progress Bar
  const updateProgressBar = useCallback(() => {
    if (containerRef.current && progressBarRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const maxScroll = scrollHeight - clientHeight;
      
      if (maxScroll > 0) {
        // Calculate progress (0 to 1)
        const progress = scrollTop / maxScroll;
        // Bar shrinks from top (height 100% -> 0%)
        const heightPercentage = Math.max(0, 100 - (progress * 100));
        progressBarRef.current.style.height = `${heightPercentage}%`;
      }
    }
  }, []);

  // Scroll Loop
  const scroll = useCallback((time: number) => {
    if (!lastFrameTime.current) lastFrameTime.current = time;
    const deltaTime = (time - lastFrameTime.current) / 1000; // seconds
    lastFrameTime.current = time;

    if (containerRef.current) {
      const moveAmount = songRef.current.scrollspeed * deltaTime;
      
      if (moveAmount > 0) {
        containerRef.current.scrollTop += moveAmount;
        updateProgressBar();

        // Check end
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        // Tolerance of 1px
        if (scrollTop + clientHeight >= scrollHeight - 1) {
          setIsScrolling(false);
        }
      }
    }

    if (isScrolling) {
      animationRef.current = requestAnimationFrame(scroll);
    }
  }, [isScrolling, updateProgressBar]);

  // Start/Stop Animation Loop
  useEffect(() => {
    if (isScrolling) {
      lastFrameTime.current = 0;
      animationRef.current = requestAnimationFrame(scroll);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isScrolling, scroll]);

  // Attach scroll listener for manual scrolling updates
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
        container.addEventListener('scroll', updateProgressBar);
        window.addEventListener('resize', updateProgressBar);
        updateProgressBar();
    }
    return () => {
        if (container) container.removeEventListener('scroll', updateProgressBar);
        window.removeEventListener('resize', updateProgressBar);
    };
  }, [updateProgressBar]);

  // Manual Page Scrolling Helper (Direct assignment for immediate effect)
  const pageScroll = useCallback((direction: 'up' | 'down') => {
    if (containerRef.current) {
        const { clientHeight, scrollTop } = containerRef.current;
        const scrollAmount = clientHeight * 0.75; 
        const newTop = scrollTop + (direction === 'down' ? scrollAmount : -scrollAmount);
        // Direct assignment to force update instantly
        containerRef.current.scrollTop = newTop;
        updateProgressBar();
    }
  }, [updateProgressBar]);

  const handleReset = useCallback((e?: React.MouseEvent | KeyboardEvent) => {
    if (e) e.stopPropagation();
    if (containerRef.current) {
        containerRef.current.scrollTop = 0;
        setIsScrolling(false);
        updateProgressBar();
    }
  }, [updateProgressBar]);

  const toggleScroll = useCallback(() => {
      setIsScrolling(prev => !prev);
  }, []);

  const handleSpeedAdjustment = useCallback((factor: number) => {
      const currentSpeed = songRef.current.scrollspeed;
      const newSpeed = Math.max(5, Math.round(currentSpeed * factor));
      onUpdate({ ...songRef.current, scrollspeed: newSpeed });
  }, [onUpdate]);

  // Keyboard Handler (Bluetooth Pedal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input (unlikely in live mode but good practice)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isRepeat = e.repeat;

      // Handle Long Press for Enter/Return to toggle Metronome
      if ((e.key === 'Enter' || e.key === ' ') && !isRepeat) {
         isLongPressHandled.current = false;
         longPressTimer.current = setTimeout(() => {
             toggleMetronome();
             if (navigator.vibrate) navigator.vibrate(50);
             isLongPressHandled.current = true;
         }, 2000); // 2 seconds long press
      }

      switch (e.key) {
        case ' ':
        case 'Enter':
        case 'ArrowDown':
           // We handle the actual action on KeyUp or if it wasn't a long press
           break;

        case 'ArrowUp':
        case 'Home':
          e.preventDefault();
          handleReset();
          break;

        case 'PageDown':
        case 'ArrowRight':
          e.preventDefault();
          if (isScrolling) {
            handleSpeedAdjustment(1.1); // Speed up
          } else {
            pageScroll('down');
          }
          break;

        case 'PageUp':
        case 'ArrowLeft':
          e.preventDefault();
          if (isScrolling) {
            handleSpeedAdjustment(0.9); // Slow down
          } else {
            pageScroll('up');
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
            if (!isLongPressHandled.current) {
                // Short press action
                toggleScroll();
            }
            isLongPressHandled.current = false;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, [isScrolling, handleReset, toggleScroll, pageScroll, handleSpeedAdjustment, toggleMetronome]);

  // Touch Gestures
  const handleTouchStart = () => {
      isLongPressHandled.current = false;
      longPressTimer.current = setTimeout(() => {
          toggleMetronome();
          if (navigator.vibrate) navigator.vibrate(50);
          isLongPressHandled.current = true;
      }, 2000);
  };

  const handleTouchEnd = (e: React.MouseEvent | React.TouchEvent) => {
      if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
      // If it wasn't a long press and we are clicking the main container
      if (!isLongPressHandled.current) {
          // Check if target is a control button to avoid conflict
          const target = e.target as HTMLElement;
          if (!target.closest('button') && !target.closest('input')) {
             toggleScroll();
          }
      }
  };

  return (
    <div 
        className="fixed inset-0 bg-black text-white z-50 flex flex-col"
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
    >
      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-black/40 backdrop-blur-sm z-20 transition-opacity duration-300">
        <div className="flex items-center space-x-4">
            <button onClick={onExit} className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white">
              <ArrowLeft size={32} />
            </button>
            <h1 className="text-xl font-bold text-white/90 truncate max-w-[200px] sm:max-w-md">
                {song.title}
            </h1>
        </div>

        <div className="flex items-center space-x-4">
            <button 
                onMouseDown={() => {
                   isLongPressHandled.current = false;
                   longPressTimer.current = setTimeout(() => {
                       toggleMetronome();
                       if (navigator.vibrate) navigator.vibrate(50);
                       isLongPressHandled.current = true;
                   }, 2000);
                }}
                onMouseUp={(e) => {
                    if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    if (!isLongPressHandled.current) handleReset(e);
                }}
                onTouchStart={() => {
                   isLongPressHandled.current = false;
                   longPressTimer.current = setTimeout(() => {
                       toggleMetronome();
                       if (navigator.vibrate) navigator.vibrate(50);
                       isLongPressHandled.current = true;
                   }, 2000);
                }}
                onTouchEnd={(e) => {
                    if (longPressTimer.current) clearTimeout(longPressTimer.current);
                    if (!isLongPressHandled.current) handleReset(e as any);
                }}
                className="p-3 rounded-full hover:bg-white/10 text-white/70 hover:text-white"
            >
               <RotateCcw size={28} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); toggleScroll(); }} className="p-3 bg-blue-600/80 hover:bg-blue-600 text-white rounded-full">
              {isScrolling ? <Pause size={32} /> : <Play size={32} fill="currentColor" />}
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); toggleMetronome(); }} 
                className={`p-3 rounded-full ${isMetronomePlaying ? 'bg-yellow-600 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
            >
               <Activity size={28} />
            </button>
        </div>
      </div>

      {/* Main Content */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto no-scrollbar scroll-smooth"
        style={{ scrollBehavior: 'auto' }} // Controlled manually
      >
        <div className="min-h-[40vh]" /> {/* Top spacer */}
        <div 
            className="px-4 md:px-12 max-w-5xl mx-auto text-center font-bold leading-tight"
            style={{ fontSize: `${song.fontsize}px` }}
        >
          <pre className="font-sans whitespace-pre-wrap">{song.lyrics}</pre>
        </div>
        <div className="min-h-[60vh]" /> {/* Bottom spacer */}
      </div>

      {/* Progress Bar (Right Side) */}
      <div className="absolute top-0 right-0 w-2 h-full bg-transparent z-10 pointer-events-none">
         {/* Bar grows from bottom visually, but we implemented height shrinking from top logic */}
         <div 
            ref={progressBarRef} 
            className="absolute bottom-0 left-0 right-0 bg-gray-300/70 w-full transition-all duration-75"
            style={{ height: '100%' }}
         />
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-md p-4 flex flex-col gap-2 z-20 transition-opacity duration-300"
           onMouseDown={(e) => e.stopPropagation()}
           onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Row 1: Font & Speed */}
        <div className="flex items-center space-x-6">
            <div className="flex items-center flex-1 space-x-3">
                <Type size={20} className="text-white/50" />
                <input 
                    type="range" min="20" max="120" 
                    value={song.fontsize}
                    onChange={(e) => onUpdate({ ...song, fontsize: parseInt(e.target.value) })}
                    className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500/80"
                />
            </div>
            <div className="flex items-center flex-1 space-x-3">
                <MoveVertical size={20} className="text-white/50" />
                <input 
                    type="range" min="5" max="200" 
                    value={song.scrollspeed}
                    onChange={(e) => onUpdate({ ...song, scrollspeed: parseInt(e.target.value) })}
                    className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-green-500/80"
                />
            </div>
        </div>
        
        {/* Row 2: Trigger Sensitivity & BPM */}
        <div className="flex items-center space-x-6 mt-1">
            <div className="flex items-center flex-1 space-x-3">
                <div className="relative">
                    {triggered ? <Zap size={20} className="text-yellow-400" /> : <Mic size={20} className="text-white/50" />}
                </div>
                <input 
                    type="range" min="-80" max="0" 
                    value={song.audioTrigger.threshold}
                    onChange={(e) => onUpdate({ ...song, audioTrigger: { ...song.audioTrigger, threshold: parseInt(e.target.value) } })}
                    className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-500/80"
                />
            </div>
            <div className="flex items-center flex-1 space-x-3">
                <Gauge size={20} className={isMetronomePlaying ? "text-yellow-400" : "text-white/50"} />
                <input 
                    type="range" min="30" max="300" 
                    value={bpm}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setBpm(val);
                        // Optional: Persist BPM change to song structure
                        if (song.metronome) {
                             onUpdate({ ...song, metronome: { ...song.metronome, bpm: val } });
                        }
                    }}
                    className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-yellow-500/80"
                />
                <span className="text-xs text-white/70 w-8">{bpm}</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMode;