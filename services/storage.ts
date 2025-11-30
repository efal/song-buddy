
import localforage from 'localforage';
import { Song, SongLibrary, DEFAULT_SONG } from '../types';

const DB_NAME = 'SongBuddyDB';
const STORE_NAME = 'songs';

localforage.config({
  name: DB_NAME,
  storeName: STORE_NAME
});

export const storageService = {
  async getAllSongs(): Promise<Song[]> {
    const songs: Song[] = [];
    await localforage.iterate((value: Song) => {
      songs.push(value);
    });
    // Sort by custom order first (playlist), then by title
    return songs.sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.title.localeCompare(b.title);
    });
  },

  async getSong(id: string): Promise<Song | null> {
    return await localforage.getItem<Song>(id);
  },

  async saveSong(song: Song): Promise<void> {
    await localforage.setItem(song.id, song);
  },

  async deleteSong(id: string): Promise<void> {
    await localforage.removeItem(id);
  },

  async exportLibrary(): Promise<string> {
    const songs = await this.getAllSongs();
    const library: SongLibrary = {
      version: 1,
      songs
    };
    return JSON.stringify(library, null, 2);
  },

  async importLibrary(jsonString: string): Promise<number> {
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(jsonString);
      } catch (e) {
        throw new Error('Invalid JSON syntax');
      }

      let songsToImport: any[] = [];

      // Determine format
      if (Array.isArray(parsed)) {
        // Format: Array of songs directly [ {..}, {..} ]
        songsToImport = parsed;
      } else if (parsed && parsed.songs && Array.isArray(parsed.songs)) {
        // Format: Library object { version: 1, songs: [..] }
        songsToImport = parsed.songs;
      } else if (parsed && parsed.title && parsed.lyrics) {
        // Format: Single song object { title: .., lyrics: .. }
        songsToImport = [parsed];
      } else {
        throw new Error('Unrecognized file format. JSON must be a Song Library, a list of songs, or a single song.');
      }

      let count = 0;
      for (const rawSong of songsToImport) {
        // Validate minimal requirements
        if (rawSong.id && rawSong.title) {
            // Merge with defaults to ensure missing fields (like metronome in old exports) don't crash the app
            const song: Song = {
                ...DEFAULT_SONG,
                ...rawSong, // Overwrite defaults with imported data
                audioTrigger: { ...DEFAULT_SONG.audioTrigger, ...(rawSong.audioTrigger || {}) },
                metronome: { ...DEFAULT_SONG.metronome, ...(rawSong.metronome || {}) }
            };
            
            // Ensure ID and createdAt are preserved correctly
            song.id = rawSong.id; 
            song.createdAt = rawSong.createdAt || Date.now();

            await this.saveSong(song);
            count++;
        }
      }

      if (count === 0 && songsToImport.length > 0) {
          throw new Error('No valid songs found (IDs or Titles missing).');
      }

      return count;
    } catch (e: any) {
      console.error('Import failed', e);
      throw e;
    }
  }
};
