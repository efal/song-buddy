import React, { useRef, useState } from 'react';
import { Song } from '../types';
import { Play, Edit2, Trash2, Plus, Music, Download, Upload, ArrowUp, ArrowDown, GripVertical, ListOrdered, Check } from 'lucide-react';

interface SongListProps {
  songs: Song[];
  onSelectSong: (song: Song) => void;
  onEditSong: (song: Song) => void;
  onDeleteSong: (id: string) => void;
  onAddSong: () => void;
  onImportSongs: (songs: Song[]) => void;
  onReorderSongs: (songs: Song[]) => void;
}

export const SongList: React.FC<SongListProps> = ({ 
  songs, 
  onSelectSong, 
  onEditSong, 
  onDeleteSong, 
  onAddSong,
  onImportSongs,
  onReorderSongs
}) => {
  const [isReordering, setIsReordering] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(songs, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `song-buddy-backup-${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileObj = event.target.files && event.target.files[0];
    if (!fileObj) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          onImportSongs(parsed as Song[]);
          alert(`${parsed.length} Songs importiert.`);
        } else {
          alert("Ungültiges Dateiformat.");
        }
      } catch (error) {
        console.error(error);
        alert("Fehler beim Lesen der Datei.");
      }
    };
    reader.readAsText(fileObj);
    event.target.value = '';
  };

  const moveSong = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === songs.length - 1)
    ) return;

    const newSongs = [...songs];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    [newSongs[index], newSongs[targetIndex]] = [newSongs[targetIndex], newSongs[index]];
    onReorderSongs(newSongs);
  };

  const handleDragStart = (index: number) => {
    setDraggedItemIndex(index);
  };

  const handleDragEnter = (index: number) => {
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    
    const newSongs = [...songs];
    const draggedItem = newSongs[draggedItemIndex];
    
    // Remove dragged item
    newSongs.splice(draggedItemIndex, 1);
    // Insert at new position
    newSongs.splice(index, 0, draggedItem);
    
    onReorderSongs(newSongs);
    setDraggedItemIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedItemIndex(null);
  };

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full p-4 md:p-8">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Song Buddy
          </h1>
          <p className="text-slate-500 text-sm mt-1">Deine digitale Setlist</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button 
             onClick={() => setIsReordering(!isReordering)}
             className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
               isReordering 
               ? 'bg-cyan-600 text-white' 
               : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
             }`}
             title="Liste sortieren"
          >
            {isReordering ? <Check className="w-4 h-4" /> : <ListOrdered className="w-4 h-4" />}
            <span className="hidden md:inline">{isReordering ? 'Fertig' : 'Sortieren'}</span>
          </button>

          {!isReordering && (
            <>
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg transition-colors text-sm"
                title="Backup exportieren"
              >
                <Download className="w-4 h-4" />
                <span className="hidden md:inline">Export</span>
              </button>
              
              <button 
                onClick={handleImportClick}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg transition-colors text-sm"
                title="Backup importieren"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden md:inline">Import</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />

              <button 
                onClick={onAddSong}
                className="ml-2 bg-cyan-600 hover:bg-cyan-500 text-white p-3 rounded-full shadow-lg shadow-cyan-500/20 transition-transform hover:scale-105 active:scale-95"
              >
                <Plus className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </header>

      {songs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
          <div className="bg-slate-900 p-6 rounded-full">
            <Music className="w-12 h-12 text-slate-700" />
          </div>
          <p className="text-lg">Keine Songs in der Bibliothek.</p>
          <button 
            onClick={onAddSong}
            className="text-cyan-400 hover:text-cyan-300 underline decoration-dashed underline-offset-4"
          >
            Füge deinen ersten Song hinzu
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 overflow-y-auto pb-20">
          {songs.map((song, index) => (
            <div 
              key={song.id}
              draggable={isReordering}
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`
                group bg-slate-900/50 border rounded-xl p-4 flex items-center justify-between transition-all
                ${isReordering ? 'cursor-move border-cyan-500/30 bg-slate-800/50' : 'border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800'}
                ${draggedItemIndex === index ? 'opacity-50' : 'opacity-100'}
              `}
            >
              {isReordering && (
                <div className="mr-4 text-slate-500">
                   <GripVertical className="w-5 h-5" />
                </div>
              )}

              <div 
                className={`flex-1 ${!isReordering ? 'cursor-pointer' : ''}`}
                onClick={() => !isReordering && onSelectSong(song)}
              >
                <h3 className="font-bold text-lg text-slate-200 group-hover:text-white truncate">{song.title}</h3>
                <p className="text-slate-500 text-sm group-hover:text-slate-400 truncate">{song.artist}</p>
              </div>

              <div className="flex items-center gap-2">
                {isReordering ? (
                  <>
                    <button 
                      onClick={() => moveSong(index, 'up')}
                      disabled={index === 0}
                      className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg"
                    >
                      <ArrowUp className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => moveSong(index, 'down')}
                      disabled={index === songs.length - 1}
                      className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg"
                    >
                      <ArrowDown className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => onSelectSong(song)}
                      className="p-3 bg-slate-800 hover:bg-cyan-600 text-cyan-500 hover:text-white rounded-full transition-colors"
                      title="Abspielen"
                    >
                      <Play className="w-5 h-5 fill-current" />
                    </button>
                    <div className="w-px h-8 bg-slate-800 mx-2"></div>
                    <button 
                      onClick={() => onEditSong(song)}
                      className="p-2 text-slate-500 hover:text-indigo-400 transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if(confirm(`"${song.title}" wirklich löschen?`)) onDeleteSong(song.id);
                      }}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};