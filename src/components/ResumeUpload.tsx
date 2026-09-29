import { useRef, useState } from 'react';
import { FileText, Upload, X, Loader2, FileCheck2, AlertCircle } from 'lucide-react';

interface ResumeUploadProps {
  onFileSelected: (file: File | null) => void;
  disabled?: boolean;
  parsing?: boolean;
  parseError?: string | null;
}

export function ResumeUpload({ onFileSelected, disabled, parsing, parseError }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

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
        disabled={disabled || parsing}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!fileName ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || parsing}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={[
            'w-full flex flex-col items-center justify-center gap-3 rounded-2xl px-4 py-10',
            'border-2 border-dashed transition-all duration-300',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            isDragOver
              ? 'border-accent-400 bg-accent-500/5 scale-[1.01]'
              : 'border-border hover:border-accent-400/50 hover:bg-surface-hover',
          ].join(' ')}
        >
          <div
            className={[
              'w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300',
              isDragOver
                ? 'bg-accent-500/20 text-accent-300 scale-110'
                : 'bg-white/5 text-text-muted',
            ].join(' ')}
          >
            <Upload className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-text-secondary">
            {isDragOver ? 'Drop your resume here' : 'Upload your resume'}
          </span>
          <span className="text-xs text-text-muted">PDF only — drag and drop or click to browse</span>
        </button>
      ) : (
        <div className="w-full flex flex-col gap-3">
          <div
            className={[
              'w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all duration-200',
              parsing
                ? 'glass-strong border-accent-500/30'
                : 'glass',
            ].join(' ')}
          >
            <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0">
              {parsing ? (
                <Loader2 className="w-5 h-5 text-accent-300 animate-spin" />
              ) : parseError ? (
                <AlertCircle className="w-5 h-5 text-error-400" />
              ) : (
                <FileCheck2 className="w-5 h-5 text-accent-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-text-primary truncate block">{fileName}</span>
              {parsing && (
                <span className="text-xs text-accent-300 flex items-center gap-1.5 mt-0.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Analyzing resume...
                </span>
              )}
            </div>
            {!parsing && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || parsing}
                aria-label="Remove resume"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-error-400 hover:bg-error-500/10 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {parseError && !parsing && (
            <p className="text-xs text-error-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {parseError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
