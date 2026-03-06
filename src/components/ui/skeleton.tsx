import { cn } from '@/lib/utils';

function Skeleton({ className, style, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'rounded-md',
        'animate-[shimmer_5.0s_ease-in-out_infinite]',
        'bg-[length:200%_100%]',
        className,
      )}
      style={{
        backgroundImage:
          'linear-gradient(to right, var(--skeleton-base) 0%, var(--skeleton-shine) 50%, var(--skeleton-base) 100%)',
        animationDelay: 'var(--skeleton-delay, 0ms)',
        ...style,
      }}
      {...props}
    />
  );
}

export { Skeleton };
