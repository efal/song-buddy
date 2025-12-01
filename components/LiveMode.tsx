
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

  // Tap Tempo state
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tempo Input Mode (for Bluetooth pedal)
  const [isTempoInputMode, setIsTempoInputMode] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const lastFrameTime = useRef<number>(0);
  const animationRef = useRef<number>(0);

  // Long press refs for TOUCH gestures only
  const touchLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouchLongPressHandled = useRef(false);

  // Refs for State to be accessible in persistent Event Listeners
  const isScrollingRef = useRef(isScrolling);
  const songRef = useRef(song);

  // Sync refs with state/props
  useEffect(() => { isScrollingRef.current = isScrolling; }, [isScrolling]);
  useEffect(() => { songRef.current = song; }, [song]);

  // Audio Monitor (Mic) - Disable monitoring while scrolling to save performance
  const shouldMonitor = isMonitoring && !isScrolling;
  const { triggered } = useAudioMonitor(shouldMonitor, song.audioTrigger.threshold);

  // Metronome (Click)
  const metroConfig = song.metronome || { bpm: 120, beatsPerBar: 4, clickPitch: 1000, enabled: false, soundType: 'drums' };
  const { isPlaying: isMetronomePlaying, toggleMetronome, bpm, setBpm } = useMetronome(
    metroConfig.bpm,
    metroConfig.beatsPerBar,
    metroConfig.clickPitch,
    metroConfig.soundType || 'drums'
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

  // --- ACTIONS ---

  const pageScroll = useCallback((direction: 'up' | 'down') => {
    if (containerRef.current) {
      const { clientHeight, scrollTop } = containerRef.current;
      const scrollAmount = clientHeight * 0.70; // 70% per jump
      const newTop = scrollTop + (direction === 'down' ? scrollAmount : -scrollAmount);
      // Direct assignment to force update instantly, overriding any animation frame that might run in parallel
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

  // Tap Tempo handler
  const handleTapTempo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const now = performance.now();

    // Clear previous timeout
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);

    setTapTimes(prev => {
      const newTaps = [...prev, now];

      // Keep only last 8 taps for averaging
      if (newTaps.length > 8) newTaps.shift();

      // Need at least 2 taps to calculate BPM
      if (newTaps.length >= 2) {
        // Calculate intervals between taps
        const intervals: number[] = [];
        for (let i = 1; i < newTaps.length; i++) {
          intervals.push(newTaps[i] - newTaps[i - 1]);
        }

        // Average interval in milliseconds
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

        // Convert to BPM (60000ms per minute)
        const calculatedBpm = Math.round(60000 / avgInterval);

        // Clamp to valid range
        const clampedBpm = Math.max(30, Math.min(300, calculatedBpm));

        setBpm(clampedBpm);
        if (song.metronome) {
          onUpdate({ ...song, metronome: { ...song.metronome, bpm: clampedBpm } });
        }
      }

      return newTaps;
    });

    // Reset taps after 2 seconds of inactivity
    tapTimeoutRef.current = setTimeout(() => {
      setTapTimes([]);
    }, 2000);
  }, [setBpm, song, onUpdate]);

  // BPM adjustment handlers
  const adjustBpm = useCallback((delta: number) => {
    const newBpm = Math.max(30, Math.min(300, bpm + delta));
    setBpm(newBpm);
    if (song.metronome) {
      onUpdate({ ...song, metronome: { ...song.metronome, bpm: newBpm } });
    }
  }, [bpm, setBpm, song, onUpdate]);

  // --- KEYBOARD HANDLING (Persistent) ---

  const handlersRef = useRef({
    toggleScroll,
    toggleMetronome,
    handleReset,
    pageScroll,
    handleSpeedAdjustment,
    onExit
  });

  // Update handlers ref on every render to ensure latest functions are used
  useEffect(() => {
    handlersRef.current = {
      toggleScroll,
      toggleMetronome,
      handleReset,
      pageScroll,
      handleSpeedAdjustment,
      onExit
    };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Don't handle keys if Tempo Input Mode is active (except 'A' to close it)
      if (isTempoInputMode && e.key !== 'a' && e.key !== 'A') return;

      const { toggleScroll, toggleMetronome, handleReset, pageScroll, handleSpeedAdjustment, onExit } = handlersRef.current;
      const isScrolling = isScrollingRef.current;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          toggleScroll();
          break;

        case 'PageDown':
          e.preventDefault();
          if (isScrolling) {
            handleSpeedAdjustment(1.1); // 10% faster
          } else {
            pageScroll('down');
          }
          break;

        case 'PageUp':
          e.preventDefault();
          if (isScrolling) {
            handleSpeedAdjustment(0.9); // 10% slower
          } else {
            pageScroll('up');
          }
          break;

        case 'm':
        case 'M':
          e.preventDefault();
          toggleMetronome();
          break;

        case 'b':
        case 'B':
          e.preventDefault();
          onExit();
          break;
        case 'Home':
          e.preventDefault();
          handleReset();
          break;

        case 'a':
        case 'A':
          e.preventDefault();
          setIsTempoInputMode(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTempoInputMode]);

  // Tempo Input Mode keyboard handler (for Bluetooth pedal)
  useEffect(() => {
    if (!isTempoInputMode) return;

    const handleTempoKey = (e: KeyboardEvent) => {
      e.preventDefault();

      switch (e.key) {
        case 'Enter':
          // Tap Tempo
          const now = performance.now();
          if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);

          setTapTimes(prev => {
            const newTaps = [...prev, now];
            if (newTaps.length > 8) newTaps.shift();

            if (newTaps.length >= 2) {
              const intervals: number[] = [];
              for (let i = 1; i < newTaps.length; i++) {
                intervals.push(newTaps[i] - newTaps[i - 1]);
              }
              const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
              const calculatedBpm = Math.round(60000 / avgInterval);
              const clampedBpm = Math.max(30, Math.min(300, calculatedBpm));

              setBpm(clampedBpm);
              if (song.metronome) {
                onUpdate({ ...song, metronome: { ...song.metronome, bpm: clampedBpm } });
              }
            }
            return newTaps;
          });

          tapTimeoutRef.current = setTimeout(() => setTapTimes([]), 2000);
          break;

        case 'PageDown':
          // +1 BPM
          adjustBpm(1);
          break;

        case 'PageUp':
          // -1 BPM
          adjustBpm(-1);
          break;

        case 'a':
        case 'A':
          // Close popup and save
          setIsTempoInputMode(false);
          break;
      }
    };

    window.addEventListener('keydown', handleTempoKey);
    return () => window.removeEventListener('keydown', handleTempoKey);
  }, [isTempoInputMode, adjustBpm, setBpm, song, onUpdate]);

  // --- TOUCH HANDLING (Screen only) ---

  const handleTouchStart = () => {
    isTouchLongPressHandled.current = false;
    if (touchLongPressTimer.current) clearTimeout(touchLongPressTimer.current);

    touchLongPressTimer.current = setTimeout(() => {
      handlersRef.current.toggleMetronome();
      if (navigator.vibrate) navigator.vibrate(50);
      isTouchLongPressHandled.current = true;
    }, 2000); // Keep 2s long press for touch gestures
  };

  const handleTouchEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (touchLongPressTimer.current) {
      clearTimeout(touchLongPressTimer.current);
      touchLongPressTimer.current = null;
    }
    // If it wasn't a long press and we are clicking the main container
    if (!isTouchLongPressHandled.current) {
      // Check if target is a control button to avoid conflict
      const target = e.target as HTMLElement;
      if (!target.closest('button') && !target.closest('input')) {
        handlersRef.current.toggleScroll();
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
          <button onClick={onExit} className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white" title="Back (B)">
            <ArrowLeft size={32} />
          </button>
          <h1 className="text-xl font-bold text-white/90 truncate max-w-[200px] sm:max-w-md">
            {song.title}
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onMouseDown={(e) => { e.stopPropagation(); handleTouchStart(); }}
            onMouseUp={(e) => {
              e.stopPropagation();
              if (touchLongPressTimer.current) clearTimeout(touchLongPressTimer.current);
              if (!isTouchLongPressHandled.current) handleReset(e);
            }}
            onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(); }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              if (touchLongPressTimer.current) clearTimeout(touchLongPressTimer.current);
              if (!isTouchLongPressHandled.current) handleReset(e as any);
            }}
            className="p-3 rounded-full hover:bg-white/10 text-white/70 hover:text-white"
            title="Reset to Top (Home)"
          >
            <RotateCcw size={28} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); toggleScroll(); }} className="p-3 bg-blue-600/80 hover:bg-blue-600 text-white rounded-full" title="Play/Pause (Enter)">
            {isScrolling ? <Pause size={32} /> : <Play size={32} fill="currentColor" />}
          </button>
          <div className="flex items-center space-x-2">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => { e.stopPropagation(); toggleMetronome(); }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => { e.stopPropagation(); toggleMetronome(); }}
              onClick={(e) => e.stopPropagation()}
              className={`p-3 rounded-full ${isMetronomePlaying ? 'bg-yellow-600 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
              title="Metronome (M)"
            >
              <Activity size={28} />
            </button>
            <span className={`text-2xl font-bold ${isMetronomePlaying ? 'text-yellow-400' : 'text-white/70'}`}>
              {bpm}
            </span>
            <button
              onClick={handleTapTempo}
              className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${tapTimes.length > 0
                ? 'bg-yellow-500 text-black'
                : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              title="Tap Tempo: Click in rhythm"
            >
              {tapTimes.length > 0 ? `TAP ${tapTimes.length}` : 'TAP'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto no-scrollbar scroll-smooth"
        style={{ scrollBehavior: 'auto' }} // Controlled manually for reliability
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                const newType = (song.metronome?.soundType === 'beep') ? 'drums' : 'beep';
                onUpdate({ ...song, metronome: { ...song.metronome, soundType: newType } });
              }}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold uppercase w-16 text-center"
              title="Toggle Sound Type"
            >
              {song.metronome?.soundType === 'beep' ? 'Beep' : 'Drums'}
            </button>
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
            <div className="flex items-center space-x-1">
              <button
                onClick={(e) => { e.stopPropagation(); adjustBpm(-1); }}
                className="w-6 h-6 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white text-lg font-bold leading-none"
                title="Decrease BPM"
              >
                −
              </button>
              <span className="text-xs text-white/70 w-8 text-center">{bpm}</span>
              <button
                onClick={(e) => { e.stopPropagation(); adjustBpm(1); }}
                className="w-6 h-6 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white text-lg font-bold leading-none"
                title="Increase BPM"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tempo Input Mode Popup (for Bluetooth pedal) */}
      {isTempoInputMode && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-900 border-4 border-yellow-500 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-3xl font-bold text-yellow-400 text-center mb-6">
              🎵 Tempo Input Mode
            </h2>

            <div className="text-center mb-8">
              <div className="text-6xl font-bold text-white mb-2">{bpm}</div>
              <div className="text-xl text-gray-400">BPM</div>
              {tapTimes.length > 0 && (
                <div className="text-sm text-yellow-400 mt-2">
                  {tapTimes.length} Tap{tapTimes.length > 1 ? 's' : ''}
                </div>
              )}
            </div>

            <div className="space-y-4 text-white/80">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="font-mono">RETURN</span>
                <span>Tap Tempo</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="font-mono">PAGE DOWN</span>
                <span>+1 BPM</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="font-mono">PAGE UP</span>
                <span>-1 BPM</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-yellow-600/20 rounded-lg border border-yellow-500/50">
                <span className="font-mono text-yellow-400">A</span>
                <span className="text-yellow-400">Save & Close</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMode;
