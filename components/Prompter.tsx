import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Song, PlayState } from '../types';
import { Play, Pause, RotateCcw, ArrowLeft, Type, Gauge, Mic, MicOff, Activity } from 'lucide-react';

interface PrompterProps {
  song: Song;
  onExit: () => void;
  onUpdateSongSettings: (id: string, settings: Partial<Song>) => void;
}

export const Prompter: React.FC<PrompterProps> = ({ song, onExit, onUpdateSongSettings }) => {
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  
  // Initialize with fallbacks - AutoStart defaults to TRUE now
  const [scrollSpeed, setScrollSpeed] = useState(song.defaultScrollSpeed ?? 2.0);
  const [fontSize, setFontSize] = useState(song.fontSize ?? 42);
  const [autoStartEnabled, setAutoStartEnabled] = useState(song.autoStartEnabled ?? true);
  const [audioThreshold, setAudioThreshold] = useState(song.audioThreshold ?? 20);
  
  const [progress, setProgress] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentAudioLevel, setCurrentAudioLevel] = useState(0);
  const [micError, setMicError] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isScrollingRef = useRef(false);
  
  // Audio refs to avoid stale closures in animation loop
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioFrameRef = useRef<number>();
  
  // State Refs for the audio loop
  const playStateRef = useRef(playState);
  const autoStartEnabledRef = useRef(autoStartEnabled);
  const audioThresholdRef = useRef(audioThreshold);
  const isScrollingStateRef = useRef(isScrollingRef.current);
  
  // Cooldown ref to prevent instant re-triggering when manually pausing in loud environment
  const audioCooldownRef = useRef<number>(0);
  const progressRef = useRef(progress);
  
  // Confidence counter: Requires sustained volume to trigger (prevents spikes/claps from triggering)
  const triggerConfidenceCounterRef = useRef(0);
  const REQUIRED_CONFIDENCE_FRAMES = 10; // Approx 160ms of sustained volume

  // Sync refs with state
  useEffect(() => { playStateRef.current = playState; }, [playState]);
  useEffect(() => { autoStartEnabledRef.current = autoStartEnabled; }, [autoStartEnabled]);
  useEffect(() => { audioThresholdRef.current = audioThreshold; }, [audioThreshold]);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { isScrollingStateRef.current = isScrollingRef.current; }, [isScrollingRef.current]); // Note: relying on ref mutation mostly, but this helps

  // Setup Audio Analysis
  useEffect(() => {
    if (!autoStartEnabled) {
      cleanupAudio();
      return;
    }

    const initAudio = async () => {
      try {
        setMicError(false);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512; // Higher resolution for time domain
        analyserRef.current = analyser;

        const microphone = audioCtx.createMediaStreamSource(stream);
        microphone.connect(analyser);
        microphoneRef.current = microphone;

        analyzeAudio();
      } catch (err) {
        console.error("Microphone access denied or error", err);
        setMicError(true);
        setAutoStartEnabled(false); 
      }
    };

    initAudio();

    return cleanupAudio;
  }, [autoStartEnabled]);

  const cleanupAudio = () => {
    if (audioFrameRef.current) cancelAnimationFrame(audioFrameRef.current);
    if (microphoneRef.current) microphoneRef.current.disconnect();
    if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
    }
    
    microphoneRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    setCurrentAudioLevel(0);
  };

  const analyzeAudio = () => {
    if (!analyserRef.current) return;

    // Use TimeDomainData for better volume (loudness) detection than FrequencyData
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    // Calculate RMS (Root Mean Square)
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const x = (dataArray[i] - 128) / 128.0; // Normalize to -1..1
      sum += x * x;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Map RMS to 0-100. RMS of 0.25 is quite loud music.
    // Scaling factor 350 feels natural for "loud music" hitting 80-90%
    let volume = Math.min(100, rms * 350); 

    // Update visual state occasionally
    setCurrentAudioLevel(prev => {
        // Smooth falloff for visual
        return volume > prev ? volume : prev * 0.92;
    });

    // Trigger Logic
    const now = Date.now();
    const isCooldownActive = now < audioCooldownRef.current;
    // Don't auto-start if song is effectively finished (>95%)
    const isAtEnd = progressRef.current > 0.95; 
    const isTouching = isScrollingRef.current;

    if (
        autoStartEnabledRef.current && 
        playStateRef.current !== PlayState.PLAYING && 
        !isCooldownActive &&
        !isAtEnd &&
        !isTouching
    ) {
        if (volume > audioThresholdRef.current) {
             triggerConfidenceCounterRef.current += 1;
        } else {
             // Decay confidence quickly but not instantly to allow for tiny gaps
             triggerConfidenceCounterRef.current = Math.max(0, triggerConfidenceCounterRef.current - 2);
        }

        // Only trigger if we have sustained volume for X frames
        if (triggerConfidenceCounterRef.current >= REQUIRED_CONFIDENCE_FRAMES) {
            console.log("Audio Triggered Start! Volume:", volume, "Confidence:", triggerConfidenceCounterRef.current);
            setPlayState(PlayState.PLAYING);
            triggerConfidenceCounterRef.current = 0; // Reset
        }
    } else {
        // Reset confidence if we are playing or in cooldown
        triggerConfidenceCounterRef.current = 0;
    }
    
    audioFrameRef.current = requestAnimationFrame(analyzeAudio);
  };

  // Handle scrolling logic
  const animate = useCallback((time: number) => {
    if (playState !== PlayState.PLAYING || !scrollerRef.current) {
      lastTimeRef.current = 0;
      return;
    }

    if (lastTimeRef.current === 0) {
      lastTimeRef.current = time;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    const currentSpeed = scrollSpeed ?? 2.0;
    const pixelsPerSecond = currentSpeed * 15; 
    const pixelsToScroll = (pixelsPerSecond * deltaTime) / 1000;

    if (scrollerRef.current && !isScrollingRef.current) {
      scrollerRef.current.scrollTop += pixelsToScroll;
      
      const maxScroll = scrollerRef.current.scrollHeight - scrollerRef.current.clientHeight;
      if (maxScroll > 0) {
        const newProgress = Math.min(scrollerRef.current.scrollTop / maxScroll, 1);
        setProgress(newProgress);
        
        if (scrollerRef.current.scrollTop >= maxScroll) {
          setPlayState(PlayState.PAUSED);
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [playState, scrollSpeed]);

  useEffect(() => {
    if (playState === PlayState.PLAYING) {
      animationFrameRef.current = requestAnimationFrame(animate);
      
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2000);

    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      lastTimeRef.current = 0;
      setControlsVisible(true);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [playState, animate]);

  // Save settings
  useEffect(() => {
    onUpdateSongSettings(song.id, { 
      defaultScrollSpeed: scrollSpeed, 
      fontSize,
      autoStartEnabled,
      audioThreshold
    });
  }, [scrollSpeed, fontSize, autoStartEnabled, audioThreshold, song.id, onUpdateSongSettings]);

  const handleReset = () => {
    // Add cooldown here too, otherwise hitting reset during a loud intro 
    // will cause immediate restart.
    audioCooldownRef.current = Date.now() + 2000;
    setPlayState(PlayState.STOPPED);
    triggerConfidenceCounterRef.current = 0;
    
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = 0;
      setProgress(0);
    }
  };

  const togglePlay = () => {
    setPlayState(prev => {
        if (prev === PlayState.PLAYING) {
            // If pausing manually, set a cooldown so microphone doesn't immediately restart it
            // if the environment is loud.
            audioCooldownRef.current = Date.now() + 2000; 
            console.log("Paused manually. Audio trigger cooldown active.");
            return PlayState.PAUSED;
        }
        return PlayState.PLAYING;
    });
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (isScrollingRef.current) return;
    
    if (!controlsVisible) {
      setControlsVisible(true);
      if (playState === PlayState.PLAYING) {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => setControlsVisible(false), 4000);
      }
    } else if (playState === PlayState.PLAYING) {
       setControlsVisible(false);
    }
  };

  const handleScrollBegin = () => { isScrollingRef.current = true; };
  const handleScrollEnd = () => { 
     setTimeout(() => { isScrollingRef.current = false; }, 200);
  };

  return (
    <div 
      className="relative h-full w-full flex flex-col bg-black text-white"
      onClick={handleContainerClick}
    >
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/90 to-transparent flex justify-between items-start pointer-events-none">
        <button 
          onClick={(e) => { e.stopPropagation(); onExit(); }}
          className="pointer-events-auto p-2 bg-slate-800/50 backdrop-blur rounded-full hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <div className="text-right pointer-events-auto max-w-[70%]">
           <h2 className="text-xl font-bold drop-shadow-md text-slate-100 truncate">{song.title}</h2>
           <p className="text-slate-400 text-sm truncate">{song.artist}</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div 
        ref={scrollerRef}
        className="flex-1 overflow-y-auto scroll-smooth px-4 md:px-12 py-[40vh]"
        style={{ scrollBehavior: 'auto' }} 
        onTouchStart={handleScrollBegin}
        onTouchMove={handleScrollBegin}
        onTouchEnd={handleScrollEnd}
        onScroll={() => {
            if(scrollerRef.current) {
                const maxScroll = scrollerRef.current.scrollHeight - scrollerRef.current.clientHeight;
                if (maxScroll > 0) setProgress(Math.min(scrollerRef.current.scrollTop / maxScroll, 1));
            }
        }}
      >
        <pre 
          className="whitespace-pre-wrap font-sans leading-relaxed transition-all duration-200 text-center md:text-left mx-auto max-w-4xl select-none pb-96"
          style={{ fontSize: `${fontSize}px` }}
        >
          {song.lyrics}
        </pre>
      </div>

      {/* Progress Indicator */}
      <div className={`absolute bottom-0 left-0 w-full z-20 transition-all duration-500 ${controlsVisible ? 'bottom-[320px] md:bottom-[280px]' : 'bottom-0'}`}>
        <div className="h-1 bg-slate-800 w-full">
            <div 
            className="h-full bg-cyan-500 transition-all duration-100 ease-linear"
            style={{ width: `${progress * 100}%` }}
            />
        </div>
      </div>

      {/* Control Deck */}
      <div 
        className={`absolute bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-6 flex flex-col gap-6 transition-transform duration-500 ease-in-out shadow-2xl ${controlsVisible ? 'translate-y-0' : 'translate-y-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
           {/* Speed Control */}
           <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-cyan-400 font-semibold uppercase tracking-wider">
                <span className="flex items-center gap-1"><Gauge className="w-3 h-3"/> Tempo</span>
                <span>{(scrollSpeed ?? 2.0).toFixed(1)}</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="15" 
                step="0.1" 
                value={scrollSpeed ?? 2.0} 
                onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 touch-none"
              />
            </div>

            {/* Font Size Control */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-cyan-400 font-semibold uppercase tracking-wider">
                <span className="flex items-center gap-1"><Type className="w-3 h-3"/> Größe</span>
                <span>{fontSize ?? 42}px</span>
              </div>
              <input 
                type="range" 
                min="24" 
                max="120" 
                step="2" 
                value={fontSize ?? 42} 
                onChange={(e) => setFontSize(parseInt(e.target.value))}
                className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 touch-none"
              />
            </div>

             {/* Auto-Start Audio Control */}
             <div className="flex flex-col gap-2">
               <div className="flex justify-between items-center mb-1">
                 <button 
                    onClick={() => setAutoStartEnabled(!autoStartEnabled)}
                    className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded transition-colors ${autoStartEnabled ? 'bg-cyan-900 text-cyan-300 border border-cyan-700' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                 >
                    {autoStartEnabled ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                    {autoStartEnabled ? "Auto-Start An" : "Auto-Start Aus"}
                 </button>
                 {autoStartEnabled && <span className="text-xs text-cyan-400">{audioThreshold} %</span>}
               </div>
               
               {autoStartEnabled ? (
                 <div className="relative w-full h-8 flex items-center">
                    {/* Background Level Indicator */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-2 bg-slate-800 w-full rounded overflow-hidden">
                       <div 
                          className={`h-full transition-all duration-75 ${currentAudioLevel > audioThreshold ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'bg-green-500'}`}
                          style={{ width: `${currentAudioLevel}%`, opacity: 0.8 }}
                       />
                    </div>
                    {/* Threshold Slider */}
                    <input 
                      type="range" 
                      min="1" 
                      max="100" 
                      step="1" 
                      value={audioThreshold ?? 20} 
                      onChange={(e) => setAudioThreshold(parseInt(e.target.value))}
                      className="absolute w-full h-8 top-0 opacity-0 cursor-pointer z-20"
                      title="Schwellenwert einstellen"
                    />
                     {/* Visual Thumb for Threshold */}
                     <div 
                        className="absolute w-4 h-4 bg-white rounded-full shadow border border-slate-300 pointer-events-none z-10 top-1/2 -translate-y-1/2 -ml-2"
                        style={{ left: `${audioThreshold}%` }}
                     />
                 </div>
               ) : (
                 <div className="h-8 flex items-center justify-center text-xs text-slate-600 bg-slate-900/50 rounded border border-slate-800">
                    <Activity className="w-3 h-3 mr-2" />
                    Audio deaktiviert
                 </div>
               )}
               {micError && <span className="text-[10px] text-red-400">Mikrofon nicht verfügbar</span>}
            </div>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-8 max-w-4xl mx-auto w-full pb-safe">
            <button 
              onClick={handleReset}
              className="p-4 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors shadow-lg"
            >
              <RotateCcw className="w-6 h-6" />
            </button>

            <button 
              onClick={togglePlay}
              className={`p-6 rounded-full shadow-xl shadow-cyan-500/20 transition-all transform active:scale-95 ${
                playState === PlayState.PLAYING 
                ? 'bg-slate-800 text-red-400 hover:bg-slate-700 border border-red-500/30' 
                : 'bg-cyan-600 text-white hover:bg-cyan-500'
              }`}
            >
              {playState === PlayState.PLAYING ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current pl-1" />}
            </button>
            
            {/* Placeholder for balance */}
            <div className="w-14"></div> 
        </div>
      </div>
    </div>
  );
};