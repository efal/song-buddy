import React, { useState } from 'react';
import { storageService } from '../services/storage';
import { Download, Upload, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportExportProps {
  onRefresh: () => void;
}

const ImportExport: React.FC<ImportExportProps> = ({ onRefresh }) => {
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  const handleExport = async () => {
    try {
      const json = await storageService.exportLibrary();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `songbuddy_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setStatus({ type: 'success', msg: 'Library exported successfully.' });
    } catch (err) {
      setStatus({ type: 'error', msg: 'Export failed.' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        const count = await storageService.importLibrary(json);
        setStatus({ type: 'success', msg: `Imported ${count} songs successfully.` });
        onRefresh();
      } catch (err) {
        setStatus({ type: 'error', msg: 'Invalid JSON file or corrupted data.' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6 bg-gray-800 rounded-xl border border-gray-700">
      <h3 className="text-lg font-bold text-white mb-4">Data Management</h3>
      
      <div className="flex flex-col sm:flex-row gap-4">
        <button 
          onClick={handleExport}
          className="flex-1 flex items-center justify-center px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium transition"
        >
          <Download className="mr-2" size={20} /> Export Library
        </button>

        <label className="flex-1 flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium cursor-pointer transition">
          <Upload className="mr-2" size={20} /> Import JSON
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>
      </div>

      {status && (
        <div className={`mt-4 p-3 rounded-lg flex items-center ${status.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {status.type === 'success' ? <CheckCircle size={20} className="mr-2" /> : <AlertCircle size={20} className="mr-2" />}
          {status.msg}
        </div>
      )}
    </div>
  );
};

export default ImportExport;
