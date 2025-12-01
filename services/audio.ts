
import { useState, useEffect, useRef, useCallback } from 'react';

// --- Microphone / Audio Monitor ---

export const useAudioMonitor = (enabled: boolean, thresholdDB: number) => {
  const [currentDB, setCurrentDB] = useState<number>(-100);
  const [triggered, setTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const thresholdRef = useRef(thresholdDB);
  const lastUpdateRef = useRef<number>(0);

  // Update ref when prop changes so the animation loop sees the new value
  useEffect(() => {
    thresholdRef.current = thresholdDB;
  }, [thresholdDB]);

  const analyze = useCallback(() => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    analyserRef.current.getFloatTimeDomainData(dataArray);

    // Calculate RMS (Root Mean Square)
    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / bufferLength);

    // Convert to Decibels
    // Use a small epsilon to avoid log(0) = -Infinity
    const db = 20 * Math.log10(Math.max(rms, 1e-7));

    // Throttle state updates to ~10fps (100ms) to prevent React render thrashing
    const now = Date.now();
    if (now - lastUpdateRef.current > 100) {
      setCurrentDB(db);
      lastUpdateRef.current = now;

      // Trigger logic inside the throttle block is fine for this use case, 
      // or we could move it outside if we need instant reaction, 
      // but 100ms latency for a generic volume trigger is usually acceptable.
      if (db > thresholdRef.current) {
        setTriggered(true);
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyze);
  }, []);

  const startMonitoring = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      // Smooth out the volume reading slightly
      analyser.smoothingTimeConstant = 0.3;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyser);

      analyserRef.current = analyser;
      sourceRef.current = source;

      analyze();
      setError(null);
    } catch (err) {
      console.error("Microphone access denied or error", err);
      setError("Microphone access denied.");
    }
  }, [analyze]);

  const stopMonitoring = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    // We do not close AudioContext to reuse it, but we could suspend it.
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend();
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      startMonitoring();
    } else {
      stopMonitoring();
      setTriggered(false);
      setCurrentDB(-100);
    }
    return () => stopMonitoring();
  }, [enabled, startMonitoring, stopMonitoring]);

  return { currentDB, triggered, error };
};

// --- Metronome (Web Worker Based) ---

// We define the worker code as a string to avoid needing a separate file loader configuration
const workerCode = `
let timerID = null;
let interval = 25;

self.onmessage = function(e) {
  if (e.data === "start") {
    timerID = setInterval(function() { postMessage("tick"); }, interval);
  } else if (e.data.interval) {
    interval = e.data.interval;
    if (timerID) {
      clearInterval(timerID);
      timerID = setInterval(function() { postMessage("tick"); }, interval);
    }
  } else if (e.data === "stop") {
    clearInterval(timerID);
    timerID = null;
  }
};
`;

export const useMetronome = (initialBpm: number, beatsPerBar: number, clickPitch: number, soundType: 'beep' | 'drums' = 'drums') => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(initialBpm);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentBeatRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);

  // Lookahead settings
  const scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)

  // Refs for current settings to be accessible inside the scheduler
  const bpmRef = useRef(bpm);
  const beatsPerBarRef = useRef(beatsPerBar);
  const pitchRef = useRef(clickPitch);
  const soundTypeRef = useRef(soundType);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    beatsPerBarRef.current = beatsPerBar;
  }, [beatsPerBar]);

  useEffect(() => {
    pitchRef.current = clickPitch;
  }, [clickPitch]);

  useEffect(() => {
    soundTypeRef.current = soundType;
  }, [soundType]);

  // Initialize Web Worker
  useEffect(() => {
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data === "tick") {
        scheduler();
      }
    };

    return () => {
      worker.terminate();
    };
  }, []);

  // Stable reference to scheduler needed? No, called from worker event.
  // But we need to make sure scheduler closes over the refs.

  const nextNote = useCallback(() => {
    const secondsPerBeat = 60.0 / bpmRef.current;
    nextNoteTimeRef.current += secondsPerBeat;
    currentBeatRef.current++;
    if (currentBeatRef.current >= beatsPerBarRef.current) {
      currentBeatRef.current = 0;
    }
  }, []);

  const scheduleNote = useCallback((beatNumber: number, time: number, context: AudioContext) => {
    if (soundTypeRef.current === 'beep') {
      // --- CLASSIC BEEP ---
      const osc = context.createOscillator();
      const gain = context.createGain();

      osc.connect(gain);
      gain.connect(context.destination);

      if (beatNumber === 0) {
        // First beat: High pitch
        osc.frequency.value = pitchRef.current;
      } else {
        // Other beats: Lower pitch (2/3 of main pitch)
        osc.frequency.value = pitchRef.current * 0.66;
      }

      // Short beep envelope
      gain.gain.setValueAtTime(0.5, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

      osc.start(time);
      osc.stop(time + 0.1);

    } else {
      // --- ROCK DRUMS ---
      // Beat 0 (1): Kick
      // Beat 2 (3): Kick (Optional, let's keep it simple: Kick on 1, Snare on 2 & 4. What about 3? Hi-hat or Kick?)
      // User asked for Snare on 2 and 4.
      // Let's do: 1=Kick, 2=Snare, 3=Kick (Classic Rock), 4=Snare.
      // If beatsPerBar is not 4, we need a fallback.
      // Fallback: Beat 0 = Kick. Others = Hi-hat. 
      // BUT if beatsPerBar == 4: 0=Kick, 1=Snare, 2=Kick, 3=Snare.

      const isSnare = (beatsPerBarRef.current === 4 && (beatNumber === 1 || beatNumber === 3));
      const isKick = (beatNumber === 0) || (beatsPerBarRef.current === 4 && beatNumber === 2);

      if (isKick) {
        // KICK DRUM
        const kickOsc = context.createOscillator();
        const kickGain = context.createGain();

        kickOsc.connect(kickGain);
        kickGain.connect(context.destination);

        kickOsc.frequency.setValueAtTime(150, time);
        kickOsc.frequency.exponentialRampToValueAtTime(50, time + 0.05);

        kickGain.gain.setValueAtTime(0.8, time);
        kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        kickOsc.start(time);
        kickOsc.stop(time + 0.15);
      }
      else if (isSnare) {
        // SNARE DRUM (Noise + Tone)
        // 1. Noise part
        const bufferSize = context.sampleRate * 0.1; // 100ms
        const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = context.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = context.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;
        const noiseGain = context.createGain();
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(context.destination);

        noiseGain.gain.setValueAtTime(0.6, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        noise.start(time);
        noise.stop(time + 0.1);

        // 2. Tonal part (body)
        const osc = context.createOscillator();
        const oscGain = context.createGain();
        osc.connect(oscGain);
        oscGain.connect(context.destination);
        osc.frequency.setValueAtTime(250, time); // Snare body
        oscGain.gain.setValueAtTime(0.3, time);
        oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.05);
      }
      else {
        // HI-HAT (for other beats or non-4/4 time)
        const bufferSize = context.sampleRate * 0.05;
        const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = context.createBufferSource();
        noise.buffer = buffer;
        const filter = context.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;
        const hatGain = context.createGain();
        noise.connect(filter);
        filter.connect(hatGain);
        hatGain.connect(context.destination);

        // Louder Hi-Hat as requested ("Hi-Hat ist zu leise")
        hatGain.gain.setValueAtTime(0.5, time); // Increased from 0.3
        hatGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        noise.start(time);
        noise.stop(time + 0.05);
      }
    }
  }, []);

  const scheduler = useCallback(() => {
    if (!audioContextRef.current) return;

    // While there are notes that will need to play before the next interval, 
    // schedule them and advance the pointer.
    while (nextNoteTimeRef.current < audioContextRef.current.currentTime + scheduleAheadTime) {
      scheduleNote(currentBeatRef.current, nextNoteTimeRef.current, audioContextRef.current);
      nextNote();
    }
  }, [nextNote, scheduleNote]);

  const toggleMetronome = useCallback(async () => {
    // We use functional update or ref for isPlaying to avoid dependency cycle if we were inside an effect,
    // but here it is an event handler. However, we want this function reference to be stable.
    // We need to access the CURRENT value of isPlaying.

    // Since we can't easily access the current state value inside a useCallback without adding it to deps (breaking stability),
    // we will check a Ref that tracks playing state, or use the worker state.
    // Simpler approach: Check if worker is running? No.
    // Let's rely on the React state setter to toggle.

    setIsPlaying(prev => {
      const newState = !prev;
      if (!newState) {
        // Stop
        workerRef.current?.postMessage("stop");
        // Suspend AudioContext to stop all scheduled sounds
        if (audioContextRef.current && audioContextRef.current.state === 'running') {
          audioContextRef.current.suspend();
        }
        // Reset beat counter
        currentBeatRef.current = 0;
      } else {
        // Start
        (async () => {
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          }

          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
          }

          currentBeatRef.current = 0;
          // Start slightly in the future to avoid immediate catch-up sounds
          nextNoteTimeRef.current = audioContextRef.current.currentTime + 0.05;

          workerRef.current?.postMessage("start");
        })();
      }
      return newState;
    });
  }, []);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.postMessage("stop");
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return { isPlaying, toggleMetronome, bpm, setBpm };
};
