import { isManagedChart } from "../domain/chart";
import { validateScoreForChart } from "../domain/score";
import { resolveChart } from "../master/lookup";
import type { ChartMaster, ChartType, ClearLamp, PlayerChartRecord, SongMaster } from "../domain/types";
import { parseCsv } from "./csv";

const variants: ReadonlyArray<{ name: "NORMAL" | "HYPER" | "ANOTHER" | "LEGGENDARIA"; chartType: ChartType }> = [{ name: "NORMAL", chartType: "DPN" }, { name: "HYPER", chartType: "DPH" }, { name: "ANOTHER", chartType: "DPA" }, { name: "LEGGENDARIA", chartType: "DPL" }];
const lampMap: Readonly<Record<string, ClearLamp>> = { "NO PLAY": "NO_PLAY", FAILED: "FAILED", "EASY CLEAR": "EASY_CLEAR", CLEAR: "CLEAR", "HARD CLEAR": "HARD_CLEAR", "EX HARD CLEAR": "EX_HARD_CLEAR", "FULLCOMBO CLEAR": "FULL_COMBO" };
export interface OfficialCsvPreview { records: PlayerChartRecord[]; errors: string[]; rowCount: number; }

export function previewOfficialCsv(text: string, playerId: string, songs: readonly SongMaster[], charts: readonly ChartMaster[], existing: readonly PlayerChartRecord[], now: string): OfficialCsvPreview {
  const rows = parseCsv(text); if (rows.length < 1) throw new Error("Official CSV is empty."); const header = rows[0]; const titleIndex = header.indexOf("タイトル"); if (titleIndex < 0) throw new Error("Official CSV header 'タイトル' is missing.");
  const indices = variants.map((variant) => ({ ...variant, level: header.indexOf(`${variant.name} 難易度`), score: header.indexOf(`${variant.name} スコア`), bp: header.indexOf(`${variant.name} ミスカウント`), lamp: header.indexOf(`${variant.name} クリアタイプ`) })); if (indices.some((item) => item.level < 0 || item.score < 0 || item.bp < 0 || item.lamp < 0)) throw new Error("Official CSV DP headers are missing.");
  const current = new Map(existing.map((record) => [record.chartId, record])); const result = new Map<string, PlayerChartRecord>(); const errors: string[] = [];
  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    for (const variant of indices) {
      try {
        const level = row[variant.level] ?? "0";
        if (level === "0") continue;
        // Official exports occasionally add leading/trailing presentation whitespace.
        // Normalize only that whitespace; matching remains exact thereafter.
        const lookup = resolveChart({ title: (row[titleIndex] ?? "").trim(), chartType: variant.chartType, source: "officialCsv" }, songs, charts);
        if (lookup.status !== "matched") {
          // The official export includes lower-level DP charts outside Ver.1's
          // management scope. They may deliberately be absent from the master.
          if (Number(level) <= 9) continue;
          throw new Error(`${variant.name}: ${lookup.status === "ambiguous" ? "managed chart match is ambiguous." : "managed chart is unresolved."}`);
        }
        if (!isManagedChart(lookup.chart)) continue;
        const lamp = lampMap[row[variant.lamp]];
        if (!lamp) throw new Error(`${variant.name}: clear type is invalid.`);
        const scoreText = row[variant.score];
        if (!/^\d+$/.test(scoreText)) throw new Error(`${variant.name}: SCORE is invalid.`);
        const parsedScore = Number(scoreText);
        validateScoreForChart(parsedScore, lookup.chart);
        const score = parsedScore === 0 ? undefined : parsedScore;
        const bpText = row[variant.bp];
        const bp = /^\d+$/.test(bpText) ? Number(bpText) : bpText === "---" ? undefined : (() => { throw new Error(`${variant.name}: BP is invalid.`); })();
        const before = result.get(lookup.chart.chartId) ?? current.get(lookup.chart.chartId) ?? { playerId, chartId: lookup.chart.chartId, clearLamp: "NO_PLAY" as ClearLamp, score: null, bp: null, clearSource: null, scoreSource: null, bpSource: null, updatedAt: now };
        result.set(lookup.chart.chartId, { ...before, clearLamp: lamp, score: score ?? before.score, bp: bp ?? before.bp, clearSource: lamp !== before.clearLamp ? "official_csv" : before.clearSource, scoreSource: score !== undefined && score !== before.score ? "official_csv" : before.scoreSource, bpSource: bp !== undefined && bp !== before.bp ? "official_csv" : before.bpSource, updatedAt: now });
      } catch (error) {
        errors.push(`Row ${line} ${variant.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });
  return { records: [...result.values()], errors, rowCount: rows.length - 1 };
}
