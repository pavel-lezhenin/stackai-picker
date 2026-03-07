import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

type FileListErrorProps = {
  message?: string;
  onRetry: () => void;
};

export function FileListError({ message, onRetry }: FileListErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div>
        <p className="text-sm font-medium">Failed to load files</p>
        <p className="text-xs text-muted-foreground mt-1">
          {message ?? 'An unexpected error occurred'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}
