# IIDX CLEAR TRACKER Ver.1 Phase 3: setup and PLAYER foundation

## Scope

Phase 3 provides non-UI application services for first-time setup and PLAYER data. CSV parsing/import, QUICK INPUT, TRAINING, navigation, and visual layout remain outside this phase.

## Initial setup lifecycle

`beginSetup()` creates a resumable `setupDrafts` record keyed by a preallocated `playerId`. Its payload is versioned and contains only tentative chart records. Saving the DP highest rank and registration method rewrites this draft; reopening rejects malformed/unknown payloads rather than silently changing pending data.

For the manual route, `applyInitialBulkLamp()` targets currently playable managed charts in the selected official level and only raises lamps. `correctInitialLamp()` permits either direction, including `NO_PLAY`, for an individual chart. `unknown` remains eligible and `unavailable` is excluded.

`completeSetup()` requires the rank and a registration method; it atomically writes Player and staged records, then deletes the draft. It creates no `HISTORY`: setup represents pre-existing data. The CSV route is intentionally not implemented; a later import phase can populate the same draft payload. `discardSetup()` only deletes a draft.

## PLAYER services

Profile updates preserve `createdAt`; rank remains required and IIDX ID/name nullable. Player radar has exactly six current values and `radarTotal()` derives their sum. No radar history is stored.

`summarizePlayerPlayData()` uses the Phase 1 chart master and player records. Its ☆10–12 denominator includes managed charts with `available` or `unknown`, excluding only `unavailable`. The numerator and lamp breakdown exclude `NO_PLAY`. It is a data view-model, not UI.

## Persistence and history

Phase 3 uses the Phase 2 repository. Draft saves affect only `setupDrafts`; final setup uses one transaction across `players`, `playerChartRecords`, and `setupDrafts`. Initial setup never writes `history`. Normal post-setup updates and import history belong to later phases.

## Browser IndexedDB test carry-over

Real-browser store-creation, transaction-abort, and upgrade tests remain unperformed in the Node-only environment. They are scheduled for Phase 4, the first browser integration phase, and will include Phase 3 finalization atomicity.
