/**
 * What the server stores as a photo, checked before uploading so the person is
 * told at once rather than after a round trip.
 *
 * The server has the final say (api/apps/core/images.py): it decodes and
 * re-encodes every upload and answers `invalid_image` for anything it will not
 * store, whatever the browser reported the file to be.
 */
import { ApiError } from './http';

export const ACCEPTED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** For an `<input type="file">` accept attribute. */
export const IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(',');

/** Mirrors IMAGE_UPLOAD_MAX_BYTES on the server. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageProblem = 'not_accepted' | 'too_big';

export function checkImageFile(file: File): ImageProblem | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'not_accepted';
  if (file.size > MAX_IMAGE_BYTES) return 'too_big';
  return null;
}

/** The i18n key that explains a problem with a picked file. */
export function imageProblemKey(problem: ImageProblem): 'common.imageNotAccepted' | 'common.imageTooBig' {
  return problem === 'too_big' ? 'common.imageTooBig' : 'common.imageNotAccepted';
}

/** Did the server refuse the file itself, as opposed to failing for another reason? */
export function isRefusedImage(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'invalid_image';
}
