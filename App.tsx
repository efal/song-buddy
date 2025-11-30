import React, { useEffect, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import SongList from './components/SongList';
import SongEditor from './components/SongEditor';
import LiveMode from './components/LiveMode';
import { storageService } from './services/storage';
import { Song } from './types';

const AppContent: React.FC = () => {
  const [view, setView] = useState<'list' | 'editor' | 'live'>('list');
  const [songs, setSongs] = useState<Song[]>([]);
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSongs = async () => {
    setLoading(true);
    const data = await storageService.getAllSongs();
    setSongs(data);
    setLoading(false);
  };

  useEffect(() => {
    refreshSongs();
  }, []);

  const handleCreate = () => {
    setActiveSong(null);
    setView('editor');
  };

  const handleEdit = (song: Song) => {
    setActiveSong(song);
    setView('editor');
  };

  const handlePlay = (song: Song) => {
    setActiveSong(song);
    setView('live');
  };

  const handleSave = () => {
    refreshSongs();
    setView('list');
    setActiveSong(null);
  };

  // Called when slider changes in list view or live mode
  const handleQuickUpdate = async (updatedSong: Song) => {
    // Optimistic UI update for the list
    setSongs(prev => prev.map(s => s.id === updatedSong.id ? updatedSong : s));
    
    // If we are currently viewing this song (Live Mode), update the active state too
    if (activeSong && activeSong.id === updatedSong.id) {
        setActiveSong(updatedSong);
    }

    // Persist to DB
    await storageService.saveSong(updatedSong);
  };

  const handleReorder = async (newOrderSongs: Song[]) => {
    // Update local state immediately for UI responsiveness
    setSongs(newOrderSongs);

    // Update order property on all songs and persist
    // We assume the new array index is the desired order
    const updates = newOrderSongs.map((song, index) => {
        const updated = { ...song, order: index };
        return storageService.saveSong(updated);
    });

    await Promise.all(updates);
  };

  const handleCloseEditor = () => {
    setView('list');
    setActiveSong(null);
  };

  const handleExitLive = () => {
    setView('list');
    setActiveSong(null);
  };

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-gray-900 text-white">Loading Library...</div>;
  }

  return (
    <div className="h-full w-full bg-gray-900">
        {view === 'list' && (
          <div className="h-full w-full overflow-y-auto">
            <SongList 
                songs={songs} 
                onCreate={handleCreate} 
                onEdit={handleEdit} 
                onPlay={handlePlay} 
                onUpdate={handleQuickUpdate}
                onReorder={handleReorder}
                onRefresh={refreshSongs}
            />
          </div>
        )}

        {view === 'editor' && (
          <SongEditor 
            existingSong={activeSong} 
            onSave={handleSave} 
            onClose={handleCloseEditor} 
          />
        )}

        {view === 'live' && activeSong && (
          <LiveMode 
            song={activeSong} 
            onExit={handleExitLive} 
            onUpdate={handleQuickUpdate}
          />
        )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
       <AppContent />
    </HashRouter>
  );
};

export default App;