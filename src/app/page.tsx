'use client';

import { FileBrowser } from '@/components/file-picker/FileBrowser';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Stack AI File Picker</h1>
      </header>
      <main className="flex-1">
        <FileBrowser />
      </main>
    </div>
  );
}
