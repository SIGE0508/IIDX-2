import assert from "node:assert/strict";
import { browserDriver, serveBuild, readBuildMaster } from "./browser-validation-utils.mjs";
const master = readBuildMaster(), hosting = await serveBuild();
let browser;
try {
  browser = await browserDriver();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.addInitScript(() => { Math.random = () => 0.5; });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(hosting.origin + "/IIDX-2/"); await page.locator("section").first().waitFor();
  const titles = new Map(master.chartMaster.songs.map(song => [song.songId, song.title]));
  const charts = master.chartMaster.charts.filter(chart => chart.availability !== "unavailable" && chart.officialLevel >= 10 && chart.officialLevel <= 12);
  const longest = [...charts].sort((a, b) => titles.get(b.songId).length - titles.get(a.songId).length).slice(0, 5);
  const difficulties = new Map(master.unofficial.records.map(row => [row.chartId, row.difficulty]));
  const now = "2026-11-05T00:00:00Z";
  const player = { playerId: "phase4-layout-synthetic", playerName: "SYNTHETIC", iidxId: null, highestDpRank: "CHUDEN", ereterOverall: null, notesRadar: null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], SCRATCH: [], CHARGE: [], SOF_LAN: [] }, playList: longest.map((chart, i) => ({ chartId: chart.chartId, memo: (i % 2 ? "😀" : "W").repeat(100) })), createdAt: now, updatedAt: now };
  const records = charts.map(chart => ({ playerId: player.playerId, chartId: chart.chartId, clearLamp: chart.officialLevel < 12 ? "HARD_CLEAR" : (difficulties.get(chart.chartId) ?? 12) < 12.5 ? "CLEAR" : "FAILED", score: null, bp: null, clearSource: "manual", scoreSource: null, bpSource: null, updatedAt: now }));
  await page.evaluate(async data => {
    const db = await new Promise((resolve, reject) => { const q = indexedDB.open("iidx-clear-tracker"); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    await new Promise((resolve, reject) => { const t = db.transaction(["players", "playerChartRecords"], "readwrite"); t.objectStore("players").put(data.player); data.records.forEach(record => t.objectStore("playerChartRecords").put(record)); t.oncomplete = resolve; t.onerror = () => reject(t.error); }); db.close();
  }, { player, records });
  await page.reload(); await page.getByRole("heading", { name: "HOME", exact: true }).waitFor();
  await page.locator(".next-play-row").first().waitFor();
  assert.equal(await page.locator(".next-play-row").count(), 5);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.locator(".next-play-row textarea").evaluateAll(nodes => nodes.every(node => Array.from(node.value).length === 100 && node.scrollWidth <= node.clientWidth)));
  assert.ok(await page.locator(".next-play button,.next-play-add,.warm-up .section-title button,.next-training .section-title button").evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
  const smallButtons = await page.locator("main button").evaluateAll(nodes => nodes.filter(node => !node.hidden && node.getBoundingClientRect().height > 0 && node.getBoundingClientRect().height < 44).map(node => ({ label: node.textContent.slice(0,40), height: node.getBoundingClientRect().height })));
  assert.equal(smallButtons.length, 0, "Tap targets below44px: " + JSON.stringify(smallButtons));
  console.log("PASS 390px: five longest chart titles / 100-codepoint memos wrap, no horizontal overflow, 44px targets");

  const collisions = await page.evaluate(async () => {
    const issues = [], maximum = document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y <= maximum; y += 60) {
      scrollTo({ top: y, behavior: "instant" });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const arrows = [...document.querySelectorAll(".scroll-button:not([hidden])")];
      const controls = [...document.querySelectorAll("main button:not([disabled]),main input,main select,main textarea")];
      for (const arrow of arrows) for (const control of controls) {
        const a = arrow.getBoundingClientRect(), c = control.getBoundingClientRect();
        const left = Math.max(a.left, c.left), right = Math.min(a.right, c.right), top = Math.max(a.top, c.top), bottom = Math.min(a.bottom, c.bottom);
        if (left < right && top < bottom && document.elementFromPoint((left + right) / 2, (top + bottom) / 2)?.closest(".scroll-button") === arrow) {
          issues.push({ scroll: y, arrow: arrow.className, control: control.tagName, label: (control.getAttribute("aria-label") ?? control.textContent ?? "").slice(0, 35) });
        }
      }
    }
    return issues;
  });
  assert.equal(collisions.length, 0, "Floating scroll buttons intercept underlying controls: " + JSON.stringify(collisions.slice(0, 5)));
  console.log("PASS scroll controls never intercept form/action controls across HOME scroll positions");
  await page.locator(".next-play-row textarea").first().focus();
  assert.ok(await page.locator(".next-play-row textarea").first().evaluate(node => document.activeElement === node));
  for (const width of [768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => [...document.querySelectorAll("main *")].filter(node => node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(node => ({ tag: node.tagName, class: node.className, whiteSpace: getComputedStyle(node).whiteSpace, width: node.clientWidth, scrollWidth: node.scrollWidth })));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Horizontal overflow at " + width + ": " + JSON.stringify(overflow));
  }
  console.log("PASS desktop/tablet widths 768/1280/1440 without horizontal overflow");
  assert.deepEqual(errors, []);
  await context.close();
} finally { await browser?.close(); await hosting.close(); }
