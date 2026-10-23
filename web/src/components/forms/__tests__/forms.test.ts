/**
 * Forms, from the Design Reference v2.2 (batch 62, §15 and §8).
 *
 * Gaps the comparison with the reference found in our forms:
 *   - nothing said which fields were optional or required;
 *   - a field was checked only at submit, and the answer was one line at the
 *     top of the form rather than on the field with what to do about it;
 *   - an edit page kept unsaved changes without saying so;
 *   - a figure from the server did not say when it was read, and a failed
 *     refresh replaced the figures with an error, hiding the last good ones.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StaleNote } from '../../feedback/feedback';
import { TextField } from '../../primitives/controls';
import { UnsavedBar } from '../UnsavedBar';
import { minLength, positiveAmount, required, sameAs, validateAll } from '../validation';

describe('the rules a field is checked with', () => {
  it('requires something other than blanks', () => {
    const rule = required('اكتب الاسم');
    expect(rule('')).toBe('اكتب الاسم');
    expect(rule('   ')).toBe('اكتب الاسم');
    expect(rule('أحمد')).toBeUndefined();
  });

  it('wants an amount in digits, above zero', () => {
    const rule = positiveAmount('اكتب السعر');
    expect(rule('')).toBe('اكتب السعر');
    expect(rule('abc')).toBe('اكتب السعر');
    expect(rule('0')).toBe('اكتب السعر');
    expect(rule('000')).toBe('اكتب السعر');
    expect(rule('18,000')).toBeUndefined();
    expect(rule('2500')).toBeUndefined();
  });

  it('wants a minimum length, and the same text twice', () => {
    expect(minLength(8, 'قصيرة')('1234567')).toBe('قصيرة');
    expect(minLength(8, 'قصيرة')('12345678')).toBeUndefined();
    expect(sameAs(() => 'abc', 'مختلفة')('abd')).toBe('مختلفة');
    expect(sameAs(() => 'abc', 'مختلفة')('abc')).toBeUndefined();
  });

  it('checks every field at once and names only the ones that fail', () => {
    const errors = validateAll(
      { name: required('اكتب الاسم'), price: positiveAmount('اكتب السعر') },
      { name: 'كباب', price: '' },
    );
    expect(errors).toEqual({ price: 'اكتب السعر' });
    expect(validateAll({ name: required('x') }, { name: 'a' })).toEqual({});
  });
});

describe('a text field', () => {
  const html = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(TextField, { label: 'الاسم', ...props }));

  it('says when it is optional, in words and in brackets, not by a star', () => {
    expect(html({ requirement: 'optional' })).toContain('(اختياري)');
    expect(html({})).not.toContain('(اختياري)');
  });

  it('says when it is required, and tells assistive technology', () => {
    const markup = html({ requirement: 'required' });
    expect(markup).toContain('(إلزامي)');
    expect(markup).toContain('aria-required="true"');
  });

  it('shows its error under itself, read out, and tied to the field', () => {
    const markup = html({ error: 'اكتب الاسم' });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('اكتب الاسم');
    expect(markup).toContain('aria-invalid="true"');
    const id = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(markup).toContain(`id="${id}"`);
  });
});

describe('the unsaved-changes bar', () => {
  const bar = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(UnsavedBar, {
        message: 'تغييرات غير محفوظة',
        saveLabel: 'حفظ',
        discardLabel: 'تجاهل',
        onSave: () => {},
        onDiscard: () => {},
        ...props,
      }),
    );

  it('sticks to the top of the page with a choice: save or discard', () => {
    const markup = bar();
    expect(markup).toMatch(/\bsticky\b[^"]*\btop-0\b/);
    expect(markup).toContain('تغييرات غير محفوظة');
    expect(markup).toContain('حفظ');
    expect(markup).toContain('تجاهل');
  });

  it('stops a second press while it saves', () => {
    expect(bar({ saving: true })).toMatch(/<button[^>]*disabled[^>]*>[^<]*حفظ/);
  });
});

describe('the note that says when a figure was read', () => {
  const note = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(StaleNote, { text: 'آخر تحديث 19:20', ...props }));

  it('shows the time quietly when all is well', () => {
    const markup = note({});
    expect(markup).toContain('آخر تحديث 19:20');
    expect(markup).not.toContain('role="alert"');
  });

  it('says the refresh failed, keeps the last time, and offers to try again', () => {
    const markup = note({ failed: true, retryLabel: 'إعادة المحاولة', onRetry: () => {} });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('آخر تحديث 19:20');
    expect(markup).toContain('إعادة المحاولة');
  });
});
