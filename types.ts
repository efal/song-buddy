
export interface Song {
  id: string;
  title: string;
  artist: string;
  lyrics: string;
  durationSeconds?: number;
  defaultScrollSpeed: number; // 0-10
  fontSize: number; // px
  autoStartEnabled?: boolean;
  audioThreshold?: number; // 0-100
  voiceControlEnabled?: boolean;
}

export interface AppState {
  songs: Song[];
  view: 'library' | 'editor' | 'prompter';
  activeSongId: string | null;
}

export enum PlayState {
  STOPPED = 'STOPPED',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED'
}