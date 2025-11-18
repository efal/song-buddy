import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Song, PlayState } from '../types';
import { Play, Pause, RotateCcw, ArrowLeft, Type, Gauge, Mic, MicOff, Activity, Speech, Zap, Ear, WifiOff } from 'lucide-react';

// Typ-Definitionen für Speech Recognition (noch experimentell in Browsern)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface PrompterProps {
  song: Song;
  onExit: () => void;
  onUpdateSongSettings: (id: string, settings: Partial<Song>) => void;
}

export const Prompter: React.FC<PrompterProps> = ({ song, onExit, onUpdateSongSettings }) => {
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  
  // Initialize with fallbacks
  const [scrollSpeed, setScrollSpeed] = useState(song.defaultScrollSpeed ?? 2.0);
  const [fontSize, setFontSize] = useState(song.fontSize ?? 42);
  
  // Audio Trigger (AutoStart) State
  const [autoStartEnabled, setAutoStartEnabled] = useState(song.autoStartEnabled ?? true);
  const [audioThreshold, setAudioThreshold] = useState(song.audioThreshold ?? 20);
  const [isListening, setIsListening] = useState(false); // Visual state for UI
  
  // Voice Command State
  const [voiceControlEnabled, setVoiceControlEnabled] = useState(song.voiceControlEnabled ?? false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState<string | null>(null);
  
  const [progress, setProgress] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentAudioLevel, setCurrentAudioLevel] = useState(0);
  const [micError, setMicError] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isScrollingRef = useRef(false);
  
  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioFrameRef = useRef<number>(0);
  
  // Voice Command Ref
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // State Refs for loops
  const playStateRef = useRef(playState);
  const autoStartEnabledRef = useRef(autoStartEnabled);
  const audioThresholdRef = useRef(audioThreshold);
  const isScrollingStateRef = useRef(isScrollingRef.current);
  const audioCooldownRef = useRef<number>(0);
  const progressRef = useRef(progress);
  const triggerConfidenceCounterRef = useRef(0);
  
  const REQUIRED_CONFIDENCE_FRAMES = 10;

  // Sync refs with state
  useEffect(() => { playStateRef.current = playState; }, [playState]);
  useEffect(() => { autoStartEnabledRef.current = autoStartEnabled; }, [autoStartEnabled]);
  useEffect(() => { audioThresholdRef.current = audioThreshold; }, [audioThreshold]);
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { isScrollingStateRef.current = isScrollingRef.current; }, [isScrollingRef.current]);

  // Monitor Online/Offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      if (voiceControlEnabled) {
        setVoiceControlEnabled(false);
        setLastVoiceCommand("Offline: Voice deaktiviert");
        setTimeout(() => setLastVoiceCommand(null), 3000);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [voiceControlEnabled]);

  // ----------------------------------------------------------------------
  // Logic: Voice Commands (Speech Recognition)
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!voiceControlEnabled) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      return;
    }

    // Prevent enabling if offline
    if (!navigator.onLine) {
        setVoiceControlEnabled(false);
        return;
    }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.error("Browser does not support Speech Recognition");
      setMicError(true);
      setVoiceControlEnabled(false);
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.trim().toLowerCase();
      console.log("Voice Command heard:", transcript);
      
      handleVoiceCommand(transcript);
    };

    recognition.onerror = (event: any) => {
      // Ignore "no-speech" errors, they just mean silence
      if (event.error !== 'no-speech') {
          console.error("Speech recognition error", event.error);
      }
      
      if (event.error === 'not-allowed') {
        setMicError(true);
        setVoiceControlEnabled(false);
      }
      if (event.error === 'network') {
        setIsOffline(true);
        setVoiceControlEnabled(false);
      }
    };

    // Restart if it stops unexpectedly (common in Web Speech API)
    recognition.onend = () => {
      if (voiceControlEnabled && recognitionRef.current && navigator.onLine) {
        try {
          recognition.start();
        } catch (e) {
          // Already started or other error
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error("Failed to start recognition", e);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [voiceControlEnabled]);

  const handleVoiceCommand = (text: string) => {
    let commandFound = false;
    let feedback = "";

    // Play
    if (text.includes("start") || text.includes("los") || text.includes("play") || text.includes("weiter")) {
      setPlayState(PlayState.PLAYING);
      feedback = "PLAY";
      commandFound = true;
    }
    // Pause/Stop
    else if (text.includes("stopp") || text.includes("stop") || text.includes("halt") || text.includes("pause") || text.includes("warte")) {
      audioCooldownRef.current = Date.now() + 2000;
      triggerConfidenceCounterRef.current = 0; // Reset Trigger logic
      setPlayState(PlayState.PAUSED);
      feedback = "PAUSE";
      commandFound = true;
    }
    // Reset
    else if (text.includes("anfang") || text.includes("zurück") || text.includes("reset")) {
      handleReset();
      feedback = "RESET";
      commandFound = true;
    }
    // Speed Up
    else if (text.includes("schneller")) {
      setScrollSpeed(prev => Math.min(15, prev + 0.5));
      feedback = "SCHNELLER";
      commandFound = true;
    }
    // Slow Down
    else if (text.includes("langsamer")) {
      setScrollSpeed(prev => Math.max(0.5, prev - 0.5));
      feedback = "LANGSAMER";
      commandFound = true;
    }
    // Exit
    else if (text.includes("ende") || text.includes("schließen") || text.includes("raus")) {
      onExit();
      commandFound = true;
    }

    if (commandFound) {
      setLastVoiceCommand(feedback);
      setTimeout(() => setLastVoiceCommand(null), 2000);
    }
  };


  // ----------------------------------------------------------------------
  // Logic: Audio Volume Trigger (Auto-Start)
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!autoStartEnabled) {
      cleanupAudio();
      setIsListening(false);
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
        analyser.fftSize = 512; 
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

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    // Calculate RMS
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const x = (dataArray[i] - 128) / 128.0; 
      sum += x * x;
    }
    const rms = Math.sqrt(sum / bufferLength);
    let volume = Math.min(100, rms * 350); 

    setCurrentAudioLevel(prev => volume > prev ? volume : prev * 0.92);

    // Trigger Logic
    const now = Date.now();
    const isCooldownActive = now < audioCooldownRef.current;
    const isAtEnd = progressRef.current > 0.99; // Only disable at very end
    const isTouching = isScrollingRef.current;
    const isNotPlaying = playStateRef.current !== PlayState.PLAYING;
    
    if (
        autoStartEnabledRef.current && 
        isNotPlaying && 
        !isCooldownActive &&
        !isAtEnd &&
        !isTouching
    ) {
        // Only show listening active if not in cooldown
        if (!isListening) setIsListening(true);

        if (volume > audioThresholdRef.current) {
             triggerConfidenceCounterRef.current += 1;
        } else {
             // Slower decay to allow for breathing pauses in singing before start
             triggerConfidenceCounterRef.current = Math.max(0, triggerConfidenceCounterRef.current - 1);
        }

        if (triggerConfidenceCounterRef.current >= REQUIRED_CONFIDENCE_FRAMES) {
            setPlayState(PlayState.PLAYING);
            triggerConfidenceCounterRef.current = 0; 
            setIsListening(false);
        }
    } else {
        if (isListening) setIsListening(false);
        triggerConfidenceCounterRef.current = 0;
    }
    
    audioFrameRef.current = requestAnimationFrame(analyzeAudio);
  };

  // ----------------------------------------------------------------------
  // Logic: Scrolling Animation
  // ----------------------------------------------------------------------
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
      audioThreshold,
      voiceControlEnabled
    });
  }, [scrollSpeed, fontSize, autoStartEnabled, audioThreshold, voiceControlEnabled, song.id, onUpdateSongSettings]);

  const handleReset = () => {
    audioCooldownRef.current = Date.now() + 1000; // Short cooldown on reset
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
            // Manual pause: Set cooldown (1.5s) and RESET trigger logic
            // This ensures it doesn't accidentally restart immediately if volume is high
            audioCooldownRef.current = Date.now() + 1500; 
            triggerConfidenceCounterRef.current = 0;
            return PlayState.PAUSED;
        }
        // Manual start
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

      {/* Visual Feedback for Voice Command */}
      {lastVoiceCommand && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-cyan-500/90 text-black px-6 py-2 rounded-full font-bold animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.6)] backdrop-blur">
           {lastVoiceCommand}
        </div>
      )}
      
      {/* Visual Feedback for AutoStart Listening */}
      {isListening && !lastVoiceCommand && !isOffline && (
         <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-green-900/80 text-green-100 border border-green-500/30 px-4 py-1 rounded-full text-xs font-bold flex items-center gap-2 backdrop-blur animate-pulse">
           <Ear className="w-3 h-3" />
           Hört zu...
        </div>
      )}

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

            {/* Audio Controls Container */}
            <div className="flex flex-col gap-3">
               {/* Auto-Start Audio Control */}
               <div className="flex items-center gap-2">
                 <button 
                    onClick={() => setAutoStartEnabled(!autoStartEnabled)}
                    className={`flex-1 flex items-center justify-center gap-1 text-[10px] md:text-xs font-semibold uppercase tracking-wider py-1.5 rounded transition-colors ${autoStartEnabled ? 'bg-cyan-900 text-cyan-300 border border-cyan-700' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                 >
                    {autoStartEnabled ? <Activity className="w-3 h-3" /> : <Activity className="w-3 h-3 opacity-50" />}
                    {autoStartEnabled ? "Auto-Start An" : "Auto-Start Aus"}
                 </button>
                 
                 <button 
                    onClick={() => !isOffline && setVoiceControlEnabled(!voiceControlEnabled)}
                    disabled={isOffline}
                    className={`flex-1 flex items-center justify-center gap-1 text-[10px] md:text-xs font-semibold uppercase tracking-wider py-1.5 rounded transition-colors ${isOffline ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed' : voiceControlEnabled ? 'bg-purple-900 text-purple-300 border border-purple-700' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                 >
                    {isOffline ? <WifiOff className="w-3 h-3" /> : voiceControlEnabled ? <Speech className="w-3 h-3" /> : <MicOff className="w-3 h-3 opacity-50" />}
                    {isOffline ? "Offline" : "Voice Cmd"}
                 </button>
               </div>
               
               {/* Audio Threshold Visualizer (Only if AutoStart is on) */}
               {autoStartEnabled ? (
                 <div className="relative w-full h-6 flex items-center">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 bg-slate-800 w-full rounded overflow-hidden">
                       <div 
                          className={`h-full transition-all duration-75 ${currentAudioLevel > audioThreshold ? 'bg-cyan-400' : 'bg-green-500'}`}
                          style={{ width: `${currentAudioLevel}%`, opacity: 0.8 }}
                       />
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="100" 
                      step="1" 
                      value={audioThreshold ?? 20} 
                      onChange={(e) => setAudioThreshold(parseInt(e.target.value))}
                      className="absolute w-full h-8 top-0 opacity-0 cursor-pointer z-20"
                    />
                     <div 
                        className="absolute w-3 h-3 bg-white rounded-full shadow border border-slate-300 pointer-events-none z-10 top-1/2 -translate-y-1/2 -ml-1.5"
                        style={{ left: `${audioThreshold}%` }}
                     />
                 </div>
               ) : voiceControlEnabled ? (
                  <div className="h-6 flex items-center justify-center gap-2">
                    <Zap className="w-3 h-3 text-purple-400 animate-pulse" />
                    <span className="text-[10px] text-purple-300">Sage "Start", "Stopp" oder "Schneller"</span>
                  </div>
               ) : (
                 <div className="h-6"></div>
               )}
               
               {micError && <span className="text-[10px] text-red-400 text-center -mt-1">Mikrofon Zugriff verweigert</span>}
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