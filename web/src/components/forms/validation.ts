/**
 * The rules a field is checked with (batch 62, Design Reference §15.3).
 *
 * A rule returns what is wrong and how to put it right, or nothing. They are
 * plain functions so a screen builds its form's rules once and the same rules
 * serve the field's blur, the submit and the tests.
 */
export type Rule = (value: string) => string | undefined;

/** Something other than blanks. */
export const required =
  (message: string): Rule =>
  (value) =>
    value.trim() ? undefined : message;

/** An amount in digits, above zero. Commas and spaces between digits are fine. */
export const positiveAmount =
  (message: string): Rule =>
  (value) => {
    const digits = value.replace(/[,\s]/g, '');
    return /^\d+$/.test(digits) && /[1-9]/.test(digits) ? undefined : message;
  };

export const minLength =
  (length: number, message: string): Rule =>
  (value) =>
    value.length >= length ? undefined : message;

/** The same text as another field, read when the rule runs. */
export const sameAs =
  (other: () => string, message: string): Rule =>
  (value) =>
    value === other() ? undefined : message;

export type Rules<T extends Record<string, string>> = { [K in keyof T]?: Rule };
export type FieldErrors<T extends Record<string, string>> = { [K in keyof T]?: string };

/** Every rule at once; only the fields that fail appear in the answer. */
export function validateAll<T extends Record<string, string>>(rules: Rules<T>, values: T): FieldErrors<T> {
  const errors: FieldErrors<T> = {};
  for (const key of Object.keys(rules) as (keyof T)[]) {
    const message = rules[key]?.(values[key] as string);
    if (message) errors[key] = message;
  }
  return errors;
}
