
import React, { useState, useEffect } from 'react';
import { Song, DEFAULT_SONG } from '../types';
import { storageService } from '../services/storage';
import { v4 as uuidv4 } from 'uuid';
import { Save, Trash2, ArrowLeft } from 'lucide-react';

interface SongEditorProps {
  existingSong?: Song | null;
  onClose: () => void;
  onSave: () => void;
}

const SongEditor: React.FC<SongEditorProps> = ({ existingSong, onClose, onSave }) => {
  // Merge default values including new metronome config if editing an old song structure
  const [formData, setFormData] = useState<Song>(() => {
    const base = existingSong || { ...DEFAULT_SONG, id: uuidv4(), createdAt: Date.now() };
    // Ensure metronome object exists for old data
    if (!base.metronome) {
        base.metronome = { ...DEFAULT_SONG.metronome };
    }
    return base;
  });

  const handleChange = (field: keyof Song, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTriggerChange = (field: string, value: number) => {
    setFormData(prev => ({ 
        ...prev, 
        audioTrigger: { ...prev.audioTrigger, [field]: value } 
    }));
  };

  const handleMetronomeChange = (field: string, value: any) => {
    setFormData(prev => ({ 
        ...prev, 
        metronome: { ...prev.metronome, [field]: value } 
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await storageService.saveSong(formData);
    onSave();
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this song?')) {
        await storageService.deleteSong(formData.id);
        onSave(); // Refreshes list and closes
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900 sticky top-0 z-10">
        <button onClick={onClose} className="flex items-center text-gray-400 hover:text-white">
            <ArrowLeft className="mr-2" /> Back
        </button>
        <h2 className="text-xl font-bold">{existingSong ? 'Edit Song' : 'New Song'}</h2>
        <div className="flex space-x-2">
            {existingSong && (
                <button onClick={handleDelete} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg">
                    <Trash2 size={20} />
                </button>
            )}
            <button onClick={handleSubmit} className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold">
                <Save size={18} className="mr-2" /> Save
            </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-6">
        <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Song Title</label>
            <input 
                type="text" 
                required
                value={formData.title}
                onChange={e => handleChange('title', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Enter title..."
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-gray-800 pb-6">
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Font Size ({formData.fontsize}px)</label>
                <input 
                    type="range" min="20" max="120" step="2"
                    value={formData.fontsize}
                    onChange={e => handleChange('fontsize', parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Scroll Speed ({formData.scrollspeed} px/s)</label>
                <input 
                    type="range" min="5" max="200" step="5"
                    value={formData.scrollspeed}
                    onChange={e => handleChange('scrollspeed', parseInt(e.target.value))}
                    className="w-full accent-green-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Audio Trigger ({formData.audioTrigger.threshold} dB)</label>
                <input 
                    type="range" min="-80" max="0" step="1"
                    value={formData.audioTrigger.threshold}
                    onChange={e => handleTriggerChange('threshold', parseInt(e.target.value))}
                    className="w-full accent-red-500"
                />
                <p className="text-xs text-gray-500 mt-1">Lower = more sensitive.</p>
            </div>
        </div>

        {/* Metronome Settings Section */}
        <div className="space-y-4 border-b border-gray-800 pb-6">
             <h3 className="text-md font-bold text-gray-300 flex items-center">
                 Metronome Settings
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Default Tempo (BPM)</label>
                    <input 
                        type="number" min="30" max="300"
                        value={formData.metronome.bpm}
                        onChange={e => handleMetronomeChange('bpm', parseInt(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                    />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Time Signature (Beats)</label>
                    <select 
                        value={formData.metronome.beatsPerBar}
                        onChange={e => handleMetronomeChange('beatsPerBar', parseInt(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="1">1 (Click track)</option>
                        <option value="2">2/4</option>
                        <option value="3">3/4 (Waltz)</option>
                        <option value="4">4/4 (Standard)</option>
                        <option value="6">6/8</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Pitch ({formData.metronome.clickPitch} Hz)</label>
                    <input 
                        type="range" min="400" max="2000" step="50"
                        value={formData.metronome.clickPitch}
                        onChange={e => handleMetronomeChange('clickPitch', parseInt(e.target.value))}
                        className="w-full accent-yellow-500"
                    />
                 </div>
             </div>
        </div>

        <div className="flex-1 flex flex-col min-h-[400px]">
            <label className="block text-sm font-medium text-gray-400 mb-1">Lyrics</label>
            <textarea 
                value={formData.lyrics}
                onChange={e => handleChange('lyrics', e.target.value)}
                className="w-full flex-1 bg-gray-800 border border-gray-700 rounded-lg p-4 text-lg font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed resize-none"
                placeholder="Paste lyrics here..."
            />
        </div>
      </form>
    </div>
  );
};

export default SongEditor;
