import { useRef, useState } from 'react';
import { Upload, X, Loader2, FileCheck2, AlertCircle, FileText } from 'lucide-react';

interface ResumeUploadProps {
  onFileSelected: (file: File | null) => void;
  disabled?: boolean;
  parsing?: boolean;
  parseError?: string | null;
  isParsed?: boolean;
}

export function ResumeUpload({
  onFileSelected,
  disabled = false,
  parsing = false,
  parseError = null,
  isParsed = false,
}: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFile = (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    console.info('[Vera upload] file selected:', { name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setLocalError('Please select a valid PDF document.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLocalError('File size exceeds 5MB limit. Please choose a smaller resume PDF.');
      return;
    }

    setFileName(file.name);
    setFileSize(formatFileSize(file.size));
    selectedFileRef.current = file;
    onFileSelected(file);
  };

  const handleRemove = () => {
    setFileName(null);
    setFileSize(null);
    selectedFileRef.current = null;
    setLocalError(null);
    onFileSelected(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const activeError = parseError || localError;

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={disabled || parsing}
        aria-label="Upload PDF Resume"
        onChange={(e) => {
          const selectedFile = e.currentTarget.files?.[0];
          handleFile(selectedFile);
          // Preserve the File reference above; clearing permits selecting the same file again.
          e.currentTarget.value = '';
        }}
      />

      {!fileName ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || parsing}
          aria-label="Upload resume PDF"
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
            'w-full min-h-48 flex flex-col items-center justify-center gap-3.5 rounded-[1.75rem] px-6 py-10',
            'border border-dashed transition-transform duration-200 outline-none focus-visible:ring-2 focus-visible:ring-lime-300',
            'disabled:opacity-40 disabled:cursor-not-allowed group',
            isDragOver
              ? 'border-lime-300 bg-lime-300/[.06] scale-[1.01] shadow-[0_0_25px_rgba(204,255,0,0.12)]'
              : 'border-lime-300/25 hover:border-lime-300/50 hover:bg-white/[0.03]',
          ].join(' ')}
        >
          <div
            className={[
              'w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300',
              isDragOver
                ? 'bg-lime-300/15 text-lime-100 scale-110 shadow-lg shadow-lime-300/10'
                : 'bg-white/5 text-text-muted group-hover:text-lime-100 group-hover:bg-lime-300/10',
            ].join(' ')}
          >
            <Upload className="w-6 h-6 transition-transform group-hover:-translate-y-0.5" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-semibold text-text-primary tracking-wide">
              {isDragOver ? 'Drop your resume PDF here' : 'Drop your resume here, or browse'}
            </span>
            <span className="text-xs text-text-muted">
              PDF only (maximum file size 5MB)
            </span>
          </div>
        </button>
      ) : (
        <div className="w-full flex flex-col gap-3">
          <div
            className={[
              'w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 transition-all duration-200 border',
              parsing
                ? 'bg-white/[0.05] border-lime-300/30 shadow-[0_0_20px_rgba(204,255,0,.08)]'
                : activeError
                ? 'bg-red-500/5 border-red-500/30'
                : isParsed
                ? 'bg-white/[0.04] border-emerald-500/40'
                : 'bg-white/[0.03] border-white/10',
            ].join(' ')}
          >
            <div
              className={[
                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                parsing
                  ? 'bg-lime-300/10 text-lime-100'
                  : activeError
                  ? 'bg-rose-300/10 text-rose-200'
                  : 'bg-emerald-500/15 text-emerald-400',
              ].join(' ')}
            >
              {parsing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : activeError ? (
                <AlertCircle className="w-5 h-5" />
              ) : (
                <FileCheck2 className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary truncate block">{fileName}</span>
                {fileSize && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted shrink-0">
                    {fileSize}
                  </span>
                )}
              </div>
              <div className="mt-0.5">
                {parsing ? (
                  <span className="text-xs text-lime-100 flex items-center gap-1.5 font-medium">
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    Extracting text and analyzing resume...
                  </span>
                ) : activeError ? (
                  <span className="text-xs text-rose-200 truncate block">{activeError}</span>
                ) : (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                    Resume parsed and ready
                  </span>
                )}
              </div>
            </div>

            {!parsing && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled}
                aria-label="Remove resume"
                className="w-11 h-11 rounded-xl flex items-center justify-center text-text-muted hover:text-rose-200 hover:bg-rose-300/10 transition-transform active:scale-95"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {activeError && !parsing && (
            <div className="flex items-start justify-between gap-2 px-1">
              <p className="text-xs text-rose-200 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{activeError}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  if (selectedFileRef.current) onFileSelected(selectedFileRef.current);
                  else inputRef.current?.click();
                }}
                className="min-h-11 shrink-0 px-3 text-xs text-lime-100 hover:underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
