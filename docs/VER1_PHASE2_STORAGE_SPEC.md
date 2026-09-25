# IIDX CLEAR TRACKER Ver.1 Phase 2 Storage Specification

## Scope

Phase 2 implements only the browser-side user-data persistence foundation. It does not implement setup flows, CSV import/export, recommendation logic, or screens.

## IndexedDB v1

Database: `iidx-clear-tracker` / version `1`. Serialized user-data schema: `1`.

| Store | Key | Indexes |
|---|---|---|
| `players` | `playerId` | `byPlayerName` |
| `playerChartRecords` | `[playerId, chartId]` | `byPlayerId`, `byChartId` |
| `history` | `historyId` | `byPlayerId`, `byPlayerDate`, `byChartId` |
| `ereterPersonalHistory` | `playerId` | — |
| `setupDrafts` | `playerId` | — |
| `uiSettings` | `key` | — |
| `appMeta` | `key` | — |

`appMeta.userDataSchemaVersion` is written during the initial upgrade. Index selection is internal and does not alter the stored meanings fixed in Phase 0.

## Validation and atomic writes

Every user-data object is validated before it is queued. A multi-store `UserDataCommit` uses one `readwrite` transaction. If validation fails, no transaction starts; if IndexedDB aborts, no queued change is committed. The repository exposes typed per-store reads and writes plus `commit()` for later import/restore features.

## Schema migration policy

`migrateSerializedUserData()` accepts only schema version 1 today, rejects future schemas, and deliberately rejects unsupported old schemas. Future migrations must be explicit one-step entries (`1 → 2 → 3`), validate input before output, and never bypass an intermediate version.

## Legacy localStorage policy

Recognized legacy keys are `iidx-clear-tracker-data-v3`, `iidx-clear-tracker-lamps-v2`, and `iidx-clear-tracker-extras-v1`.

Migration is never automatic on database open. A later setup flow supplies an existing Ver.1 player and an exact legacy-key-to-`chartId` resolver. The migration plan:

1. validates legacy JSON without changing it;
2. converts only resolvable legacy lamps (`ec`, `nc`, `hc`, `exh`) into current lamps;
3. refuses to commit when any lamp key is unresolved or conflicts;
4. commits records and an `appMeta` migration marker in one transaction;
5. never calls `localStorage.removeItem()`.

Legacy score and history values are deliberately not converted: their old current-score / historical-score semantics cannot be safely identified as Ver.1 `PlayerChartRecord` or verified ereter personal history. The old localStorage data remains intact for later review.
