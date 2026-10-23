'use client';

/**
 * A form's field errors (batch 62, Design Reference §15.3).
 *
 *   - a field is checked when it is **left** (`blur`), not at every key;
 *   - once it shows an error, typing re-checks it so the message goes away the
 *     moment the condition is met (`change`);
 *   - a submit checks everything and takes the person to the first field to
 *     fix (`submit`), because the errors may not all be in view.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { validateAll, type FieldErrors, type Rules } from './validation';

export function useFieldErrors<T extends Record<string, string>>(rules: Rules<T>) {
  const [errors, setErrors] = useState<FieldErrors<T>>({});
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const toFocus = useRef(false);

  const check = useCallback((key: keyof T, value: string) => {
    const message = rulesRef.current[key]?.(value);
    setErrors((current) => {
      if (current[key] === message) return current;
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }, []);

  const blur = useCallback((key: keyof T, value: string) => check(key, value), [check]);

  const change = useCallback(
    (key: keyof T, value: string) => {
      setErrors((current) => {
        if (!current[key]) return current;
        const message = rulesRef.current[key]?.(value);
        if (message === current[key]) return current;
        const next = { ...current };
        if (message) next[key] = message;
        else delete next[key];
        return next;
      });
    },
    [],
  );

  /** True when nothing is wrong; otherwise shows the errors and focuses the first field to fix. */
  const submit = useCallback((values: T): boolean => {
    const found = validateAll(rulesRef.current, values);
    setErrors(found);
    const bad = Object.keys(found).length > 0;
    toFocus.current = bad;
    return !bad;
  }, []);

  const clear = useCallback(() => setErrors({}), []);

  useEffect(() => {
    if (!toFocus.current) return;
    toFocus.current = false;
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  return { errors, blur, change, submit, clear };
}
