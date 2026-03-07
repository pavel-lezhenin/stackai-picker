import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';

type NoSearchResultsProps = {
  query: string;
  onClear: () => void;
};

export function NoSearchResults({ query, onClear }: NoSearchResultsProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Search className="h-10 w-10 text-muted-foreground/50" />
      <div>
        <p className="text-sm font-medium">No results matching &lsquo;{query}&rsquo;</p>
        <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
      </div>
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear Search
      </Button>
    </div>
  );
}
