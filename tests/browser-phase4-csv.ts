import { openTrackerDatabase } from "../src/storage/database";
import { UserDataRepository } from "../src/storage/repository";
import { previewOfficialCsv } from "../src/import/official-csv";
import { CLEAR_TRACKER_CSV_HEADERS, exportClearTrackerCsv, previewClearTrackerCsv } from "../src/import/clear-tracker-csv";
import { commitRecordImport, commitClearTrackerPreview } from "../src/import/operations";
import type { Player, ChartMaster, SongMaster, PlayerChartRecord } from "../src/domain/types";

const output = document.querySelector<HTMLPreElement>("#result")!;
const now = "2026-11-05T00:00:00Z";
const chart: ChartMaster = { chartId: "synthetic-csv-chart", songId: "synthetic-song", chartType: "DPA", officialLevel: 12, notes: 1000, availability: "available" };
const song: SongMaster = { songId: chart.songId, title: "Synthetic CSV Song", debutVersion: "1st", debutVersionNumber: 1, aliases: {} };
const player: Player = { playerId: "synthetic-csv-player", playerName: null, iidxId: null, highestDpRank: "CHUDEN", notesRadar: null, ereterOverall: 7, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], SCRATCH: [], CHARGE: [], SOF_LAN: [] }, playList: [{ chartId: chart.chartId, memo: "retained" }], createdAt: now, updatedAt: now };
const record: PlayerChartRecord = { playerId: player.playerId, chartId: chart.chartId, clearLamp: "CLEAR", score: 1500, bp: 20, previousScore: 1400, previousBp: 30, clearSource: "manual", scoreSource: "manual", bpSource: "manual", updatedAt: now };
const ok = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
async function main() {
  const name = "iidx-phase4-csv-test-" + crypto.randomUUID();
  const db = await openTrackerDatabase(indexedDB, name), repository = new UserDataRepository(db);
  const checks: string[] = []; let sequence = 0; const id = () => "synthetic-history-" + sequence++;
  try {
    await repository.commit({ players: [player], playerChartRecords: [record, { ...record, chartId: "untouched" }] });
    await repository.saveHistory({ historyId: "existing-history", playerId: player.playerId, chartId: chart.chartId, date: now, oldLamp: "FAILED", newLamp: "CLEAR", source: "manual" });
    const headers = ["タイトル", ...["NORMAL", "HYPER", "ANOTHER", "LEGGENDARIA"].flatMap(type => ["難易度", "スコア", "ミスカウント", "クリアタイプ"].map(field => type + " " + field))];
    const values = [song.title, "0", "0", "---", "NO PLAY", "0", "0", "---", "NO PLAY", "12", "0", "---", "HARD CLEAR", "0", "0", "---", "NO PLAY"];
    const official = previewOfficialCsv(headers.join(",") + "\n" + values.join(","), player.playerId, [song], [chart], [record], now);
    ok(official.errors.length === 0, "official preview");
    await commitRecordImport(repository, player.playerId, official.records, [record], "official_csv", now, id);
    let saved = (await repository.getPlayerChartRecord(player.playerId, chart.chartId))!;
    ok(saved.clearLamp === "HARD_CLEAR" && saved.score === 1500 && saved.bp === 20 && saved.previousScore === 1400 && saved.previousBp === 30, "official values/archive preservation");
    ok((await repository.listHistory(player.playerId)).length === 2, "lamp update must append HISTORY");
    checks.push("official DP CSV preserves SCORE0/BP--- and archives; lamp upgrade appends HISTORY");

    const tracker = (lamp: string, score: string, bp: string) => CLEAR_TRACKER_CSV_HEADERS.join(",") + "\n" + ["1", chart.chartId, song.title, "DPA", "1st", "12", "12.0", lamp, score, bp].join(",");
    let preview = previewClearTrackerCsv(tracker("EX HARD CLEAR", "", ""), player.playerId, [chart], [saved], now);
    await commitClearTrackerPreview(repository, preview, player.playerId, now, id);
    saved = (await repository.getPlayerChartRecord(player.playerId, chart.chartId))!;
    ok(saved.clearLamp === "EX_HARD_CLEAR" && saved.score === 1500 && saved.bp === 20, "blank metrics preservation");
    checks.push("CLEAR TRACKER CSV blank metrics preserve existing numeric values");

    preview = previewClearTrackerCsv(tracker("EX HARD CLEAR", "1600", "0"), player.playerId, [chart], [saved], now);
    await commitClearTrackerPreview(repository, preview, player.playerId, now, id);
    saved = (await repository.getPlayerChartRecord(player.playerId, chart.chartId))!;
    const events = await repository.listHistory(player.playerId);
    ok(saved.score === 1600 && saved.bp === 0 && saved.previousScore === 1400 && saved.previousBp === 30, "score/BP0 import");
    ok(events.some(event => event.scoreUpdate?.after === 1600 && event.bpUpdate?.after === 0), "combined metrics history");
    ok(events.some(event => event.historyId === "existing-history"), "old HISTORY lost");
    checks.push("numeric SCORE/BP0 updates append combined HISTORY and preserve previous entries");

    const before = JSON.stringify(await repository.listPlayerChartRecords(player.playerId));
    preview = previewClearTrackerCsv(tracker("CLEAR", "2001", "0"), player.playerId, [chart], [saved], now);
    let rejected = false; try { await commitClearTrackerPreview(repository, preview, player.playerId, now, id); } catch { rejected = true; }
    ok(rejected && JSON.stringify(await repository.listPlayerChartRecords(player.playerId)) === before, "invalid CSV changes data");
    checks.push("invalid SCORE CSV rejects without partial record changes");

    const exported = exportClearTrackerCsv([chart], [song], new Map([[chart.chartId, 12]]), [saved]);
    ok(previewClearTrackerCsv(exported, player.playerId, [chart], [saved], now).changes.length === 0, "CSV roundtrip changed values");
    ok(JSON.stringify(await repository.getPlayer(player.playerId)) === JSON.stringify(player), "CSV modified PLAYER/Radar/ERE/PLAY LIST");
    ok((await repository.getPlayerChartRecord(player.playerId, "untouched"))?.score === record.score, "unrelated chart changed");
    checks.push("CSV roundtrip leaves PLAYER/NEXT PLAY, unrelated charts and historical data intact");

    const historyBefore = JSON.stringify(await repository.listHistory(player.playerId));
    await repository.resetScoreBp(player.playerId, now);
    const reset = (await repository.getPlayerChartRecord(player.playerId, chart.chartId))!;
    ok(reset.clearLamp === "EX_HARD_CLEAR" && reset.score === null && reset.bp === null && reset.previousScore === 1600 && reset.previousBp === 0, "reset data");
    ok(JSON.stringify(await repository.listHistory(player.playerId)) === historyBefore, "reset created history");
    ok(JSON.stringify(await repository.getPlayer(player.playerId)) === JSON.stringify(player), "reset changed player");
    checks.push("SCORE/BP reset preserves lamp, archives BP0 and retains HISTORY/PLAYER/NEXT PLAY");
    output.textContent = "PASS\n" + checks.join("\n");
  } finally {
    repository.close();
    await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("isolated CSV cleanup blocked")); });
  }
}
main().catch(error => { output.textContent = "FAIL\n" + String(error?.stack ?? error); });
