import { useRef, useState, type DragEvent } from 'react';
import { IconPaperclip, IconX } from '../teacher/components/icons';

/**
 * FileDropzone — единая зона загрузки вместо браузерного «Choose File».
 *
 * Поддерживает клик и drag-and-drop, тёмную тему и список выбранных файлов.
 */
export function FileDropzone({
  files,
  onFiles,
  multiple = false,
  hint = 'Перетащите файл сюда или нажмите, чтобы выбрать',
  disabled = false,
}: {
  files: File[];
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  hint?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function accept(incoming: FileList | null) {
    if (disabled || !incoming || incoming.length === 0) {
      return;
    }

    const next = Array.from(incoming);

    onFiles(multiple ? next : next.slice(0, 1));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.click();
          }
        }}
        onKeyDown={(event) => {
          if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-left transition ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${
          dragging
            ? 'border-ink/60 bg-muted'
            : 'border-line2 bg-card hover:border-ink/30 hover:bg-muted/60'
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-ink3">
          <IconPaperclip className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium text-ink2">
            {files.length > 0
              ? files.map((file) => file.name).join(', ')
              : 'Прикрепить файл'}
          </span>
          <span className="mt-0.5 block text-[11px] text-ink3">{hint}</span>
        </span>
        {files.length > 0 ? (
          <button
            type="button"
            aria-label="Очистить файлы"
            onClick={(event) => {
              event.stopPropagation();
              onFiles([]);
            }}
            className="shrink-0 rounded-md p-1 text-ink3 transition hover:bg-sunken hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(event) => {
          accept(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
