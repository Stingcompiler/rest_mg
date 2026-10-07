'use client';

/**
 * ImageSlot — the user-fillable image placeholder from the design (landing hero,
 * map, editor thumbnails). Renders the image when present, or a labelled dashed
 * frame when empty, sized by the caller.
 */
import { cn } from '@/lib/cn';

export interface ImageSlotProps {
  src?: string;
  alt: string;
  /** Shown inside the empty frame. */
  placeholder: string;
  className?: string;
  rounded?: boolean;
}

export function ImageSlot({ src, alt, placeholder, className, rounded = true }: ImageSlotProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn('h-full w-full object-cover', rounded && 'rounded-lg', className)}
      />
    );
  }
  return (
    <div
      className={cn(
        'flex items-center justify-center border-strong border-dashed border-line-strong bg-surface-2 text-ar-base text-text-muted',
        rounded && 'rounded-lg',
        className,
      )}
    >
      {placeholder}
    </div>
  );
}
