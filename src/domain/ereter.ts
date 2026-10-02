/** User-facing format for the shared ERETER master. */
export function formatEreterValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "－";
}
