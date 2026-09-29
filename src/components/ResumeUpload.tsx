import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';

interface ResumeUploadProps {
  onFileSelected: (file: File | null) => void;
  disabled?: boolean;
}

export function ResumeUpload({ onFileSelected, disabled }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFileName(null);
      onFileSelected(null);
      return;
    }
    setFileName(file.name);
    onFileSelected(file);
  };

  const handleRemove = () => {
    setFileName(null);
    onFileSelected(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!fileName ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-600 px-4 py-6 text-slate-400 hover:border-sky-500 hover:text-sky-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload className="w-5 h-5" />
          <span className="text-sm font-medium">Upload your resume (PDF)</span>
        </button>
      ) : (
        <div className="w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3">
          <FileText className="w-5 h-5 text-sky-400 shrink-0" />
          <span className="text-sm text-slate-200 truncate flex-1">{fileName}</span>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
