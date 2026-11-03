/** Deterministic pre-Phase-2 inputs; independent of distributed master updates. */
export function trainingScenarios() {
  const now = "2026-11-03T00:00:00.000Z";
  const items = [];
  for (const [level, bands] of [[10, [9.6, 10, 10.5, 10.7]], [11, [10.7, 11, 11.4, 11.8]], [12, [11.8, 12, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7]]]) {
    for (const band of bands) for (let i = 0; i < 12; i++) items.push({ level, band, id: "l" + level + "-" + band + "-" + String(i).padStart(2, "0") });
  }
  const charts = items.map((x, i) => ({ chartId: x.id, songId: "song-" + x.id, chartType: "DPA", officialLevel: x.level, notes: 1000, availability: i % 37 === 0 ? "unavailable" : i % 13 === 0 ? "unknown" : "available" }));
  const master = {
    manifest: { schemaVersion: 1, masterVersion: "regression", updatedAt: now, files: {} },
    chartMaster: { schemaVersion: 1, masterVersion: "regression", updatedAt: now, charts, songs: charts.map(c => ({ songId: c.songId, title: c.chartId, debutVersion: "test", debutVersionNumber: 1, aliases: {} })) },
    unofficial: { records: items.map((x, i) => ({ chartId: x.id, difficulty: i % 19 === 0 ? null : x.band, lastUpdated: now })) },
    ereter: { records: items.map((x, i) => ({ chartId: x.id, ec: i % 7 === 0 ? null : (i % 60) / 10, hc: i % 11 === 0 ? null : (i % 70) / 10, exh: i % 9 === 0 ? null : (i % 80) / 10, lastUpdated: now })) },
    notesRadar: { records: items.filter((_, i) => i % 8 !== 0).map((x, i) => ({ chartId: x.id, verified: true, lastUpdated: now, values: { NOTES: i % 150, PEAK: i % 100, SCRATCH: i % 50, SOF_LAN: i % 20, CHARGE: i % 60, CHORD: i % 120 } })) },
  };
  const ranks = ["UNOBTAINED", "EIGHTH_OR_BELOW", "NINTH", "TENTH", "CHUDEN", "KAIDEN"];
  const patterns = ["empty", "partial", "mixed", "failed", "easy", "clear", "hard"];
  return ranks.flatMap(highestDpRank => patterns.map((pattern, p) => {
    const lamps = ["NO_PLAY", "FAILED", "ASSIST_CLEAR", "EASY_CLEAR", "CLEAR", "HARD_CLEAR", "EX_HARD_CLEAR", "FULL_COMBO"];
    const records = charts.flatMap((c, i) => {
      if (pattern === "empty" || (pattern === "partial" && i % 10 >= 3) || (pattern === "mixed" && i % 3 === 0)) return [];
      const clearLamp = pattern === "mixed" ? lamps[i % lamps.length] : pattern === "easy" ? "EASY_CLEAR" : pattern === "clear" ? "CLEAR" : pattern === "hard" ? "HARD_CLEAR" : "FAILED";
      return [{ playerId: "p", chartId: c.chartId, clearLamp, score: i, bp: 100 - i % 100, updatedAt: now, clearSource: "manual", scoreSource: "manual", bpSource: "manual" }];
    });
    const player = { playerId: "p", iidxId: null, playerName: "Regression", highestDpRank, notesRadar: p % 2 === 0 ? { NOTES: 100, CHORD: 90, PEAK: 20, SCRATCH: 10, CHARGE: 30, SOF_LAN: 5 } : null, ereterOverall: p % 3 === 0 ? 4.5 : null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], SCRATCH: [], CHARGE: [], SOF_LAN: [] }, createdAt: now, updatedAt: now };
    return { name: highestDpRank + "/" + pattern, input: { player, records, master, selectedAttribute: p % 2 === 0 ? "NOTES" : undefined } };
  }));
}
