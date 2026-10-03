// Masonry layout for the list cards: how many columns fit, and which list goes in which column.
// The CSS reads these numbers back as custom properties (see .app in App.css), so they live here only.
const LIST_MIN_PX = 360;
export const LIST_MAX_PX = 480;
export const LIST_GAP_PX = 7;
/** Least space between the cards and the window edge. */
export const LIST_EDGE_PX = 12;

/** Columns that fit in a `windowWidth` px window at LIST_MIN_PX each, never more than there are lists. */
export function columnCount(windowWidth: number, lists: number): number {
  const fit = Math.floor((windowWidth - 2 * LIST_EDGE_PX + LIST_GAP_PX) / (LIST_MIN_PX + LIST_GAP_PX));
  return Math.max(1, Math.min(fit, lists));
}

/** Deals lists, in order, onto the column that is shortest so far (ties go left).
 *  ponytail: height ≈ service count + 2 for the header, not measured. It ignores collapsed
 *  lists and expanded hosts on purpose: a measured layout would move cards between columns
 *  every time one opens or closes. Measure only if lopsided columns turn into a real complaint. */
export function toColumns<T extends { services: unknown[] }>(lists: T[], cols: number): T[][] {
  const out: T[][] = Array.from({ length: cols }, () => []);
  const height = new Array<number>(cols).fill(0);
  for (const list of lists) {
    const c = height.indexOf(Math.min(...height));
    out[c].push(list);
    height[c] += list.services.length + 2;
  }
  return out;
}
