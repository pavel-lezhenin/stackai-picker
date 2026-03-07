import { FileBrowser } from '@/components/file-picker/FileBrowser';
import { FileBrowserErrorBoundary } from '@/components/file-picker/FileBrowserErrorBoundary';

export default function Home() {
  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <header className="md:hidden border-b border-border px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">Stack AI File Picker</h1>
      </header>
      <main id="main-content" className="flex-1 min-h-0">
        <FileBrowserErrorBoundary>
          <FileBrowser />
        </FileBrowserErrorBoundary>
      </main>
    </div>
  );
}
