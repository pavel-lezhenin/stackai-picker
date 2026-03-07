'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

type SearchBarProps = {
  searchQuery: string;
  isLoading: boolean;
  onClear: () => void;
  onChange: (value: string) => void;
};

/** Self-contained search input that registers the `/` global keyboard shortcut. */
export function SearchBar({ searchQuery, isLoading, onClear, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        onClear();
        inputRef.current?.blur();
      }
    },
    [onClear],
  );

  // Global `/` shortcut to focus search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 h-10">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search files… (press / to focus)"
        value={searchQuery}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
        aria-label="Search files"
      />
      {searchQuery && (
        <button
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
