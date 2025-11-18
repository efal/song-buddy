import React, { useState, useEffect } from 'react';
import { Song, AppState } from './types';
import { SongList } from './components/SongList';
import { SongEditor } from './components/SongEditor';
import { Prompter } from './components/Prompter';

const STORAGE_KEY = 'song_buddy_library';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    songs: [],
    view: 'library',
    activeSongId: null,
  });

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const songs = JSON.parse(saved);
        setState(prev => ({ ...prev, songs }));
      } catch (e) {
        console.error("Failed to load songs", e);
      }
    }
  }, []);

  // Save to local storage whenever songs change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.songs));
  }, [state.songs]);

  const handleSaveSong = (song: Song) => {
    setState(prev => {
      const exists = prev.songs.find(s => s.id === song.id);
      const newSongs = exists 
        ? prev.songs.map(s => s.id === song.id ? song : s)
        : [...prev.songs, song];
      
      return {
        ...prev,
        songs: newSongs,
        view: 'library',
        activeSongId: null
      };
    });
  };

  const handleDeleteSong = (id: string) => {
    setState(prev => ({
      ...prev,
      songs: prev.songs.filter(s => s.id !== id)
    }));
  };

  const handleImportSongs = (importedSongs: Song[]) => {
    // Merge or replace? For simplicity and safety (avoid duplicates), we'll merge by ID
    setState(prev => {
       const currentMap = new Map(prev.songs.map(s => [s.id, s]));
       importedSongs.forEach(s => currentMap.set(s.id, s));
       return {
           ...prev,
           songs: Array.from(currentMap.values())
       };
    });
  };

  const handleReorderSongs = (reorderedSongs: Song[]) => {
    setState(prev => ({
      ...prev,
      songs: reorderedSongs
    }));
  };

  const handleUpdateSettings = (id: string, settings: Partial<Song>) => {
    setState(prev => ({
      ...prev,
      songs: prev.songs.map(s => s.id === id ? { ...s, ...settings } : s)
    }));
  };

  const renderView = () => {
    switch (state.view) {
      case 'editor':
        const songToEdit = state.songs.find(s => s.id === state.activeSongId);
        return (
          <SongEditor 
            existingSong={songToEdit} 
            onSave={handleSaveSong}
            onCancel={() => setState(prev => ({ ...prev, view: 'library', activeSongId: null }))}
          />
        );
      
      case 'prompter':
        const activeSong = state.songs.find(s => s.id === state.activeSongId);
        if (!activeSong) return null;
        return (
          <Prompter 
            song={activeSong}
            onExit={() => setState(prev => ({ ...prev, view: 'library', activeSongId: null }))}
            onUpdateSongSettings={handleUpdateSettings}
          />
        );

      case 'library':
      default:
        return (
          <SongList 
            songs={state.songs}
            onAddSong={() => setState(prev => ({ ...prev, view: 'editor', activeSongId: null }))}
            onSelectSong={(song) => setState(prev => ({ ...prev, view: 'prompter', activeSongId: song.id }))}
            onEditSong={(song) => setState(prev => ({ ...prev, view: 'editor', activeSongId: song.id }))}
            onDeleteSong={handleDeleteSong}
            onImportSongs={handleImportSongs}
            onReorderSongs={handleReorderSongs}
          />
        );
    }
  };

  return (
    <main className="flex-1 relative bg-slate-950 h-full w-full overflow-hidden">
      {renderView()}
    </main>
  );
};

export default App;