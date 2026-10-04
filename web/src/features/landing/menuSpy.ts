/**
 * Which menu category the visitor is reading (batch 19).
 *
 * The category bar used to filter the menu to one category; now the whole
 * menu is one list with a title per category, and the bar marks where the
 * visitor is. A category is "being read" once its title has passed under the
 * sticky bars: the last one to have done so wins, and before any has, the
 * first. `top` is each title's distance from the top of the viewport, and
 * `line` is the bottom edge of the sticky bars.
 */
export interface SectionTop {
  id: string;
  top: number;
}

export function activeSection(sections: readonly SectionTop[], line: number): string | null {
  if (sections.length === 0) return null;
  let active = sections[0]!.id;
  for (const section of sections) {
    if (section.top <= line) active = section.id;
  }
  return active;
}
