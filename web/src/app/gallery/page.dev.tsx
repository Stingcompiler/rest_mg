import { GalleryBoard } from './GalleryBoard';

/**
 * /gallery — a development view of the whole component library in both themes
 * and both directions. Not linked from the product; a bench, not a screen.
 */
export const dynamic = 'force-static';

export default function GalleryPage() {
  return <GalleryBoard />;
}
