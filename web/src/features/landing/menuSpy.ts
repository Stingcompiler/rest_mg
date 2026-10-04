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

/**
 * Where "being read" is measured from (batch 20). On a phone the categories
 * are a bar under the top bar, so the line is the bar's bottom edge. From
 * 1024px they are a column beside the dishes, whose bottom edge is far down
 * the page, so the line is the top bar's bottom edge plus the gap the titles
 * stop at.
 */
export function readingLine({ wide, headerBottom, barBottom }: { wide: boolean; headerBottom: number; barBottom: number }): number {
  return wide ? headerBottom + 24 : barBottom + 8;
}
