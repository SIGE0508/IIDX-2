# Ver.1.2 Phase 3: WARM UP

Base: c1ad3e003a9519bec9276316f7e7b655d0361457, branch codex/ver12-phase3.

## Scope

HOME adds up to one chart for each role, ordered LIGHT / BASIC / ACCURACY.
The existing training calculation is reused. TRAINING and NEXT engine/selection
files, masters, dependencies, storage, CSV/backup contracts and version are unchanged.
PLAY LIST is not implemented; WarmUpRow has an optional sibling actions slot.

## Eligibility and inclusive stage table

Only engine-eligible managed official 10-12 charts with CLEAR or better can enter.
Global effective difficulty <= mainBand applies to every role. null mainBand
produces an empty pool; no harder/failed/EASY chart is used as filler.

| Stage | Light | Basic | Accuracy |
| --- | --- | --- | --- |
| phase10 | official10 <= main, <=10.0 | official10 <=main, <=10.5 | official10 <=main, <=10.7 |
| phase11 | official10 9.6-10.2 | official10 10.2-10.7 | official10 10.5-11.0 or official11 10.5-11.2 |
| phase12 main12.0-12.2 | official10 10.2-10.7 | official10 10.5-11.0 or official11 10.7-11.4 | official11 11.2-11.8 |
| phase12 main12.3-12.5 | official10 10.5-10.7 or official11 11.0-11.4 | official11 11.4-11.8 | official11 11.8-12.1 or official12 11.6-12.1 |
| phase12 main12.6-12.7 | official11 10.7-11.4 | official11 11.4-11.8 | official11 11.8-12.1 or official12 11.6-12.2 |

INITIAL phase12 with mainBand <12 uses the phase11 table conservatively.
Missing unofficial difficulty uses official level only if that proxy itself fits
the role's range and mainBand. It stays null in display and ranks below confirmed
difficulty. No fabricated fine difficulty is persisted or displayed.

## Auxiliary metrics and ranking

Within each role: confirmed difficulty first; accuracy prefers HARD-or-better;
then lower known BP/notes ratio; then Radar; finally stable chartId order.
Missing metrics remain candidates. BP 0 is valid; missing/zero notes cannot supply
a BP ratio. SCORE is retained in candidate content for reassessment but is not
used to claim stability. Score/BP/lamp may originate from different plays.

For LIGHT/ACCURACY, lower maximum of the six Radar attributes is preferred.
There is no Radar sum. For BASIC, smaller relative NOTES/CHORD imbalance is
preferred: abs(NOTES-CHORD)/max(1,NOTES,CHORD). Missing Radar is null, never zero,
and follows known Radar when the preceding criteria tie.

## Matching, replacement and independent state

A three-role bitmask matching algorithm chooses maximum coverage without chartId
duplication. A scarce role cannot lose its only chart to an overlapping role.
Among maximum-cardinality assignments, priorities are:
1. Minimize overlap with current NEXT charts.
2. Minimize previous WARM chart reuse on replacement.
3. Prefer confirmed difficulties.
4. Prefer HARD-or-better accuracy.
5. Prefer role ranking, with an injectable random perturbation of up to 3 ranks.

Thus replacement first finds fresh candidates where possible; HARD preference
applies within that choice. Shortage permits reuse/overlap without invalid filler.
The button is disabled when no new chart can be selected. Roles are never filled
twice, and a single chart eligible for several roles is shown only once.

WARM state is App-level memory. Its key includes playerId, phase/mode/mainBand
and candidate content, but deliberately excludes NEXT's current selection.
NEXT replacement cannot redraw WARM. WARM replacement consults the current NEXT
IDs but never mutates NEXT state. Navigation/unrelated renders retain the draw.
If NEXT later selects an existing WARM chart, it stays displayed: independent
selection has priority over forcibly redrawing the other section.

No IndexedDB or web-storage writes are introduced. Reload initializes the draw.

## Verification

19 new automatic tests, 127 total passing. Boundary tests cover the complete
stage table, INITIAL fallback, lamp conditions, unknown difficulty, null main,
BP0/missing notes, SCORE absence, Radar missing/zero, availability, input
immutability, assignment shortages, independent states and component semantics.
Existing 42 Phase-1 TRAINING snapshots still match, with the five-item limits.

Real Edge, isolated context, real masters and synthetic PLAYER data:
- 11 WARM scenarios passed: role order, five replacement rounds, both directions
  of independence, no persistent writes, navigation/unrelated renders, keyboard
  input/return, save reevaluation, eight PLAYER stages, empty and single pools.
- 390px has no horizontal overflow; replacement width/height >=44px.
- Existing Phase-2 NEXT browser scenarios and TRACKER browser regression checked.
- npm ci, npm ls, typecheck, normal/Pages builds, diff checks passed.
- PWA manifests, standalone /IIDX-2/, generated SW, five master precache
  URL/revision pairs, offline launch/master reads, update waiting and IndexedDB
  v2/seven-store sentinel retention passed.
- Known deepmerge GHSA-gcqx-w48m-w2h4: same four low propagated findings, prod0.
- Master source/build bytes remain identical to the approved B-2 master blobs.

Physical Android/iOS installation/touch testing is not part of the Edge viewport
check. No push, PR, main merge, publication, version or tag changes.

## Examples with real master and synthetic records

Fixed random 0.5. Each stage's records set lower charts to a mixture of CLEAR,
HARD, EXH and FC and unmet charts to FAILED. These are verification examples,
not actual user data. The engine itself estimates the stage; it is not overridden.

| Estimated stage | Role pool sizes (Light/Basic/Accuracy) | Light | Basic | Accuracy |
| --- | --- | --- | --- | --- |
| phase10 main10.0 | 113/113/113 | スーパー戦湯ババンバーン DPH ☆10/9.0 | 雪上断火 DPH ☆10/9.0 | 刃図羅 DPH ☆10/9.6 |
| phase11 main11.4 | 620/592/626 | murmur twins DPH ☆10/10.2 | Skywalking DPA ☆10/10.2 | MOON RACE DPH ☆10/10.7 |
| phase12 main12.0 and12.2 | 592/797/586 | MOON RACE DPH ☆10/10.7 | Beautiful Harmony (IIDX Mix) DPA ☆11/11.2 | NEBULA GRASPER DPA ☆11/11.4 |
| phase12 main12.3 and12.5 | 726/423/275 | MOON RACE DPH ☆10/10.7 | 雫 DPA ☆11/11.4 | GALGALIM DPA ☆12/12.1 |
| phase12 main12.6 and12.7 | 472/423/368 | evergreen DPA ☆11/11.0 | 雫 DPA ☆11/11.4 | GALGALIM DPA ☆12/12.1 |

Official10 charts with unofficial9.x remain managed; official9 charts do not.

## Phase 3.5 handoff

PLAY LIST remains unimplemented. Confirmed future requirements: five chartIds per
PLAYER, insertion order, no reorder UI, optional memo <=100 Unicode code points,
no PLAYER-switch UI, durable storage, transaction-safe updates and schema1 backup
compatibility. Add actual sibling actions through WarmUpRow without nesting buttons.
Do not include PLAY LIST in either recommendation or draw key.
