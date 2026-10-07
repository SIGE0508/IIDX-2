/** Small edge tolerance prevents flickering at fractional scroll positions. */
export function scrollButtonState(scrollTop: number, viewportHeight: number, pageHeight: number, previous?: { up: boolean; down: boolean }) {
  const maximum = Math.max(0, pageHeight - viewportHeight);
  const position = Math.max(0, Math.min(scrollTop, maximum));
  // Once hidden at an edge, require a deliberate move away before showing
  // again. Mobile browser bars and overscroll can fluctuate near the edge.
  return { up: maximum > 24 && position > (previous?.up === false ? 80 : 24), down: maximum > 24 && maximum - position > (previous?.down === false ? 80 : 24) };
}
