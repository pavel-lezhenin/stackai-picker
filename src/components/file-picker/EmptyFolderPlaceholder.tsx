function FolderEmptyIcon() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <rect
        x="8"
        y="24"
        width="64"
        height="44"
        rx="6"
        fill="currentColor"
        className="text-muted/60"
      />
      <rect x="8" y="30" width="64" height="38" rx="6" fill="currentColor" className="text-muted" />
      <path d="M8 36h64" stroke="currentColor" className="text-border" strokeWidth="1.5" />
      <rect
        x="14"
        y="24"
        width="22"
        height="8"
        rx="3"
        fill="currentColor"
        className="text-muted/60"
      />
      <path
        d="M28 51 l6-6 l6 6"
        stroke="currentColor"
        className="text-muted-foreground/40"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M34 45v12"
        stroke="currentColor"
        className="text-muted-foreground/40"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyFolderPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <FolderEmptyIcon />
      <div>
        <p className="text-sm font-medium text-foreground">This folder is empty</p>
        <p className="text-xs text-muted-foreground mt-1">Files you add will appear here</p>
      </div>
    </div>
  );
}
