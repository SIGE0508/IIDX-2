# Ver.1.2 Phase 3.5: NEXT PLAY

Base: cd5041c3e950f6e60ece426bdf0013a700549d74 (Phase 4 plan-only commit).
Branch: codex/ver12-phase35-playlist. UI name: NEXT PLAY; stored field: Player.playList.

## Confirmed behavior

- Five charts per PLAYER, chartId identity, duplicate registration rejected.
- Insertion order, no sorting UI; deleting/readding places the chart last.
- Memo: optional empty string, up to 100 Unicode code points (Array.from).
  Combining marks and ZWJ count as individual code points; no silent truncation.
- Add from TRACKER / NEXT TRAINING / WARM UP without navigating or redrawing either
  recommendation. Existing QUICK INPUT and Radar controls remain separate buttons.
- HOME lists title/type/official and unofficial difficulty/current lamp, memo
  editing and individual deletion. Keyboard operation uses native buttons.
- Persist across navigation/reload; play save never automatically removes charts.
- Registered/full/pending buttons disabled. Errors are announced, latest Player
  is reread, and a failed memo save keeps the edit available for retry.
- 390px wrapping and minimum 44px action targets; no nested buttons.
- No PLAYER switching UI is added. PLAYER replacement uses that Player's list.

## Additive data compatibility

Player.playList?: { chartId: string; memo: string }[] is an optional user field.
Absent fields are treated as empty without rewriting existing DB records.
Only an actual list edit stores the new field. Existing IDs and records are kept.
No IndexedDB version/store/index migration or startup bulk rewrite is introduced.
Database remains iidx-clear-tracker v2 / seven stores; user data schema remains2.

assertPlayer validates a present list. Duplicate IDs, sixth entry, invalid memo
type and overlength memo reject the operation before put/restore. New adds must
be managed, currently playable charts from the current master. Existing unavailable
or missing entries are retained, displayed with an explanation, and remain
editable/removable. Play records, HISTORY, SCORE/BP, Radar and ERETER are unchanged
by NEXT PLAY edits.

JSON backup keeps schemaVersion1 and the six payload arrays. The Player field
travels with ordinary export. parseBackup explicitly defaults missing playList to
[], rejects malformed present fields (including null), and preserves entry order.
Reference validation checks every list chartId against all current master charts,
including unavailable charts. Nonempty-list restore must supply the current
chartId set; no clear/put is attempted until validation succeeds. The existing
single-transaction whole-user-data restore is retained.

Old backups replace the current list with empty lists, rather than merging.
The restore confirmation explains this. Invalid input and failed restore retain
the existing data. Recovery uses the user's pre-operation JSON backup; there is no
automatic destructive migration or deletion of old localStorage.

SCORE/BP reset does not touch lists. Explicit full initialization clears lists
with players and the other user stores. CSV contracts remain unchanged.

## Atomic updates and concurrency

UserDataRepository.updatePlayer reads, validates, applies a synchronous update,
validates again and writes the latest Player in one players readwrite transaction.
It resolves only after commit and rejects original validation/put/abort errors.
Player ID and creation time cannot change through this operation.

List operations pass an add/memo/remove command instead of a stale complete array.
Existing profile, personal ERETER, Radar and detail update services use the same
latest-Player transaction, so unrelated concurrent fields are preserved.

- Concurrent adds cannot exceed five or duplicate chartIds, even across DB connections.
- Concurrent edits to different entries merge.
- Memo edits to an already removed chart reject, never resurrect it.
- Concurrent writes to the same memo use the last committed memo; this is not a
  revision-based conflict editor.
- Other tabs are not instantly synchronized. Their next list operation reads the
  latest Player; failure refreshes the view and reports the conflict.
- UI disables its list controls during a save, but storage validation remains the
  authority against cross-tab races and stale UI state.

## Recommendation isolation

TRAINING, HOME pool, NEXT draw and WARM engine/selection files are untouched.
Their outputs/keys do not include playList or Player.updatedAt. Editing NEXT PLAY
may recompute a memoized calculation after Player state changes, but identical
candidate content retains each displayed draw and its history.

## Tests and verification

15 added Node tests; all142 automatic tests pass (existing127 retained).
Tests cover code points, five/duplicate limits, insertion order, mutation safety,
managed/available adds, Player separation, stale profile-field preservation,
schema1 old/new backups, invalid references, UI semantics/escaping, and all42
synthetic training scenarios' engine/candidate/WARM output and draw-key parity.

tests/browser-next-play.ts and browser-next-play.html add11 isolated real
IndexedDB scenarios:
1. v2/seven stores and reopening old Player without a bulk rewrite.
2. Seven simultaneous adds on two connections result in exactly five unique entries.
3. Concurrent duplicate rejection and separate Player ownership.
4. Stale profile/Radar/ERETER updates and independent memos merge.
5. Invalid length, missing Player, deleted-chart edit reject.
6. Injected QuotaExceededError retains the complete Player.
7. Native transaction abort after queued put rolls back.
8. Schema1 roundtrip and unknown-chart restore rejection.
9. Restore abort after store clears rolls back all payload data.
10. SCORE/BP reset retains lists; old backup empties them.
11. Full reset deletes lists with all user stores.

The existing tests/browser-indexeddb.html suite also passes. Both use dedicated
random test database names in an isolated browser context and clean up only those
databases. They do not access real user data.

Production Pages build / real Edge isolated UI:14 scenarios pass, covering three
registration paths, stale second-tab duplicate, Unicode/empty memo, injected UI
save failure and retry, profile retention, keyboard QUICK INPUT/play save, reload,
full/registered state, deletion order, 390px, and old/new UI backup roundtrip.

Regression browser scenarios pass: TRACKER13, NEXT9 and WARM11. Warm's external
browser probe now explicitly selects the chart action among sibling buttons.

npm ci, npm ls, all tests, TypeScript app check and added browser test type check,
normal/Pages builds, PWA/static precache checks and diff checks pass. PWA verifies
standalone /IIDX-2/, generated SW, five master revisions, offline startup/master
reads, update waiting and retention of DB v2/seven-store sentinel data.

Audit remains the exact B-2 deepmerge GHSA-gcqx-w48m-w2h4 chain:
four low affected packages (deepmerge / @rollup/plugin-node-resolve /
workbox-build / vite-plugin-pwa), production-only audit0. No dependency changes.
Approved master Git/source/build bytes, version1.1.0 and v1.1.0 tag are unchanged.

## Remaining Phase 4 work

Actual PLAYER recommendation-quality validation follows
VER12_PHASE4_VALIDATION_PLAN.md separately; it was not run here.
All added fixtures, memos, backups and browser operations are synthetic.
No real PLAYER export is stored in source, fixtures, logs or Git.
Physical Android/iOS installation and touch-device testing remain outstanding.

No push, PR, main merge, Pages publication, app version or tag operation.
