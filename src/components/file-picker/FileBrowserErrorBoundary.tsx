'use client';

import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { ErrorInfo, ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Component-level error boundary for the FileBrowser.
 * Catches render errors without crashing the whole page.
 */
export class FileBrowserErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Server-side logging boundary — only fires in production
    console.error('[FileBrowser] Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div>
            <p className="text-sm font-medium">File picker encountered an error</p>
            <p className="text-xs text-muted-foreground mt-1">{this.state.error.message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
