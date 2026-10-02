import { describe, expect, it } from 'vitest';

import { ApiError } from '../http';
import { MAX_IMAGE_BYTES, checkImageFile, isRefusedImage } from '../images';

const fileOf = (type: string, size = 10) => new File([new Uint8Array(size)], 'picked', { type });

describe('checkImageFile', () => {
  it('accepts the formats the server stores', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(checkImageFile(fileOf(type))).toBeNull();
    }
  });

  it('refuses other images and non-images before uploading', () => {
    expect(checkImageFile(fileOf('image/svg+xml'))).toBe('not_accepted');
    expect(checkImageFile(fileOf('image/gif'))).toBe('not_accepted');
    expect(checkImageFile(fileOf('text/html'))).toBe('not_accepted');
  });

  it('refuses a file over the server limit', () => {
    expect(checkImageFile(fileOf('image/png', MAX_IMAGE_BYTES + 1))).toBe('too_big');
  });
});

describe('isRefusedImage', () => {
  it('tells the server refusing the file from any other failure', () => {
    expect(isRefusedImage(new ApiError(400, 'invalid_image', 'no'))).toBe(true);
    expect(isRefusedImage(new ApiError(500, 'error', 'boom'))).toBe(false);
    expect(isRefusedImage(new Error('offline'))).toBe(false);
  });
});
