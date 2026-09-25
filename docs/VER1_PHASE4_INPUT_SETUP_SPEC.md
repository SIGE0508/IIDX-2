# IIDX CLEAR TRACKER Ver.1 Phase 4 implementation

Phase 4 connects the Phase 1 masters, Phase 2 IndexedDB repository, and Phase 3 Player/setup services to the browser UI. It implements first-time setup, official DP CSV import, CLEAR TRACKER CSV export/import, complete backup/restore, and QUICK INPUT. TRAINING is outside this phase.

Official CSV follows the verified UTF-8 BOM Japanese-header file. NORMAL, HYPER, ANOTHER and LEGGENDARIA map to DPN, DPH, DPA and DPL. BEGINNER is ignored. Exact official title or official alias plus chart type is required. SCORE 0 and BP `---` preserve prior values. Row errors are excluded and shown before the confirmed normal rows are committed.

SCORE is a non-negative integer. Where CHART_MASTER has Notes, the shared maximum is `Notes * 2`; values above it are rejected. Where Notes is null, the upper bound is intentionally not checked. This common validation applies to official CSV, CLEAR TRACKER CSV and QUICK INPUT. Notes are read-only master data. QUICK INPUT shows the current score and, when available, its maximum.

CLEAR TRACKER CSV uses formatVersion 1, UTF-8 BOM, comma separation and CRLF output while accepting CRLF/LF. Any invalid, duplicate, unknown or out-of-scope chart aborts the full import. Only clearLamp, score and bp update user records. Its confirmed changes and upward lamp HISTORY use one transaction.

Backup schema version 1 contains all players, records, history, ereter personal history, setup drafts and UI settings. Restore validates the complete payload then replaces those stores atomically. appMeta is not replaced; lastBackupAt is preserved and lastRestoreAt is updated. Older backup timestamps warn but do not prohibit explicit restore.

Initial setup persists a versioned setupDraft and supports resume/discard, official CSV staging, manual upward bulk registration, individual corrections, and the later route. Finalization atomically creates Player and initial records, removes the draft, and creates no HISTORY. QUICK INPUT records an upward lamp HISTORY only; downward corrections do not create history.
