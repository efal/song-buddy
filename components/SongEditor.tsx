import React, { useState } from 'react';
import { Song } from '../types';
import { Save, X } from 'lucide-react';

interface SongEditorProps {
  existingSong?: Song | null;
  onSave: (song: Song) => void;
  onCancel: () => void;
}

export const SongEditor: React.FC<SongEditorProps> = ({ existingSong, onSave, onCancel }) => {
  const [title, setTitle] = useState(existingSong?.title || '');
  const [artist, setArtist] = useState(existingSong?.artist || '');
  const [lyrics, setLyrics] = useState(existingSong?.lyrics || '');

  const handleSave = () => {
    if (!title.trim()) return;

    const newSong: Song = {
      id: existingSong?.id || crypto.randomUUID(),
      title,
      artist,
      lyrics,
      defaultScrollSpeed: existingSong?.defaultScrollSpeed || 2.0,
      fontSize: existingSong?.fontSize || 42,
      // Default settings for new songs
      autoStartEnabled: existingSong?.autoStartEnabled ?? true,
      audioThreshold: existingSong?.audioThreshold ?? 20
    };
    onSave(newSong);
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full p-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-cyan-400">
          {existingSong ? 'Song bearbeiten' : 'Neuer Song'}
        </h2>
        <button onClick={onCancel} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-400">Titel</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Bohemian Rhapsody"
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-400">Künstler</label>
            <input 
              type="text" 
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="z.B. Queen"
              className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-slate-400">Songtext</label>
          </div>
          <textarea 
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Hier Songtext eingeben..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-4 text-white font-mono text-lg leading-relaxed focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none min-h-[300px]"
          />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-950 border-t border-slate-800 flex justify-center">
        <button 
          onClick={handleSave}
          disabled={!title}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
        >
          <Save className="w-5 h-5" />
          Speichern
        </button>
      </div>
    </div>
  );
};