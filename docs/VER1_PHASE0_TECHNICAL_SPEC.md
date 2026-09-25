# IIDX CLEAR TRACKER Ver.1 Phase 0 Technical Specification

## Status and scope

This is the frozen technical baseline for the Ver.1 redesign. Product rules in Ver.0.1–Ver.0.6 take precedence. Phase 1 only supplies pure domain and master-data utilities; it must not create IndexedDB data, screens, imports, migrations, or TRAINING recommendations.

## Technology and project policy

- React 19 + TypeScript, with Vite for the browser build.
- Browser IndexedDB only; no server database, cloud sync, account login, or runtime shared-master scraping in Ver.1.
- Shared master data is bundled, versioned JSON under `public/masters/v1/`.
- The only planned external exception is a user-initiated ereter personal-history retrieval. It is neither automatic nor a shared-master update.
- Native browser APIs and TypeScript boundary validation are used. Internal index design remains an implementation detail.

## Project layout

```text
app/                         Future React routes/screen composition
src/domain/                  Domain types, constants and pure rules
src/master/                  Master schemas, validation, exact lookup
src/storage/                 Future IndexedDB/migrations/backups
src/import/                  Future CSV parsing and previews
src/ereter/                  Future user-initiated personal-history retrieval
src/training/                Future derived recommendations
src/features/                Future screen-specific view models
public/masters/v1/           Versioned bundled shared-master JSON
tests/                       Unit, import, migration and integration tests
docs/                        Product and technical specifications
```

## Shared-master contract

The release contains a manifest and four independently versioned, source-separated files:

```text
public/masters/v1/manifest.json
public/masters/v1/chart-master.json
public/masters/v1/unofficial.json
public/masters/v1/ereter.json
public/masters/v1/notes-radar.json
```

Every file has `{ schemaVersion: 1, masterVersion, updatedAt }`; the manifest also records the path and version of all four files. It may additionally contain `generatedAt` and per-file `recordCount`; these are compatible verification fields, not a replacement for the filename/version contract. A failed validation retains the last valid set. Master chart matching is exact official title or source-specific alias plus chart type—never fuzzy matching.

`chart-master` stores permanent opaque `songId` / `chartId`, `DPN|DPH|DPA|DPL`, official level, chart-level `notes: number | null`, and `available|unavailable|unknown`. `unofficial`, shared `ereter` EC/HC/EXH, and verified `notes-radar` records are separate and reference `chartId`.

The Google spreadsheet is the source of truth. Its four sheets are exported as UTF-8 CSV files under `data/master-input/`; `npm run generate:masters` validates them together and creates the five release JSON files under `public/masters/v1/`. Generated JSON is never hand-edited. The generator resolves columns by exact header name, validates the full input before it writes output, and uses its generation time as `lastUpdated` for each external-source record.

The chart master retains all DP charts; official DP ☆10–☆12 remains an app-side `isManagedChart()` rule. The `Notes` source cell may be blank and then generates `null`; when present it must be a positive integer. `availability` is required and exactly `available`, `unavailable`, or `unknown`. External sheet generation joins through `chartId`, not aliases. Alias arrays remain song-level and permit the same alias across different chart types; within one source and chart type, every alias must resolve to exactly one chart.

`effectiveDifficulty` is derived, never stored in masters: round unofficial difficulty half-up to one decimal; otherwise use official level.

## Essential domain contracts

- Management scope: official DP ☆10–☆12.
- Current availability: `availability !== "unavailable"`; therefore `unknown` is included.
- TRAINING and HOME/PLAYER/ANALYSIS attainment metrics combine both predicates. DPN remains a managed chart type; individual UI filters are a separate UI decision.
- Lamps are canonical `NO_PLAY` through `FULL_COMBO`; Score and BP are stored/displayed in Ver.1 but do not rank TRAINING.
- Player records, lamp history, setup drafts, UI settings, and app metadata remain separate stores. `NO_PLAY` means that the app has no valid registered lamp, not that the player has never played it.

## IndexedDB and migration baseline

Database name: `iidx-clear-tracker`; initial database version: `1`; serialized user-data schema version: `1`.

Planned stores are `players`, `playerChartRecords` keyed by `[playerId, chartId]`, `history`, `ereterPersonalHistory`, `setupDrafts`, `uiSettings`, and `appMeta`. Imports/restores will use one read-write transaction. Schema and backup migrations are explicit ordered steps; future/unsupported backups are rejected. Operational timestamps such as last backup/restore are not backup payload.

## Planned import/export contract

Official CSV is normalized before exact matching. Valid fields overwrite, while score `0`, BP `---`, blanks, and unavailable Score/BP preserve prior values. Structural failure aborts the whole import; row-level match/value errors are previewed and skipped.

CLEAR TRACKER CSV version 1 has this canonical order:

```text
formatVersion,chartId,title,chartType,debutVersion,officialLevel,unofficialDifficulty,clearLamp,score,bp
```

Only lamp/score/BP are editable. Invalid, duplicate, or unknown chart IDs reject the whole import; confirmed lower-lamp/lower-score/higher-BP corrections are supported. Backup JSON contains user data only—not masters or operational metadata—and replaces user payload atomically after complete validation.

## ereter personal history

The future explicit action `ereterから歴代記録を取得` retrieves all-time best Score, rank, and score rate only. Both registered IIDX ID and player name must exactly match the response; otherwise no data is stored. It is read-only, separate from both current `PlayerChartRecord` and shared ERETER EC/HC/EXH, excluded from Ver.1 TRAINING, included in backups, and re-fetch replaces the last successful verified snapshot while preserving it on failure. The remaining product decisions before implementation are response-row failure handling, record scope, score-rate unit, and UI placement.

## Responsive policy

Mobile-first responsive UI provides the same actions/data at every width. Compact screens use one-column cards and horizontally scrollable tabs; wide layouts may use tables and side-by-side panels. Exact breakpoints are implementation details.
