
export interface AudioTriggerConfig {
  threshold: number; // dB value, e.g., -40
}

export interface MetronomeConfig {
  bpm: number;
  beatsPerBar: number;
  clickPitch: number; // Frequency in Hz (e.g., 1000)
  enabled: boolean; // Default state when entering live mode
}

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  fontsize: number; // px
  scrollspeed: number; // pixels per second
  audioTrigger: AudioTriggerConfig;
  metronome: MetronomeConfig;
  order?: number; // For playlist sorting
  createdAt: number;
}

export interface SongLibrary {
  version: number;
  songs: Song[];
}

export const DEFAULT_SONG: Omit<Song, 'id' | 'createdAt'> = {
  title: '',
  lyrics: '',
  fontsize: 48,
  scrollspeed: 30,
  audioTrigger: {
    threshold: -35
  },
  metronome: {
    bpm: 120,
    beatsPerBar: 4,
    clickPitch: 1000,
    enabled: false
  }
};
