# IIDX CLEAR TRACKER Ver.1 Phase 5 TRAINING engine

Phase 5 implements TRAINING as a pure derived calculation. It reads Player, PlayerChartRecord and the four shared masters and never writes player data. SCORE and BP are intentionally absent from all ranking decisions.

## Mode and progress

The initial range comes from highest DP rank: unobtained/eighth-or-below 9.0–10.5, ninth 10.7–11.6, tenth 12.0–12.2, chuden 12.1–12.5, and kaiden 12.4–12.6. Coverage counts non-NO PLAY records in that range over every eligible chart in the range. Below 30% uses initial mode; 30% or above uses performance mode.

In performance mode, unobtained/eighth-or-below/ninth start at official level 10, while tenth/chuden/kaiden start at level 12. Official level 10 and 11 advance at 75% CLEAR or above. Level 12 starts at effective difficulty 12.0 and advances through 12.7 at 75% EASY CLEAR or above. Empty level-12 bands are skipped. Official level-12 charts below 12.0 are introduction bands: they remain visible in derived progress data but do not participate in the main gate, normal clear targets, or cleanup targets.

Unavailable charts are excluded from coverage, progress and recommendations. Unknown charts are included. Missing unofficial difficulty falls back to official level after the shared one-decimal normalization rule.

## Categories

- Clear targets: up to 10. Initial mode uses the lowest unmet band in the initial range. Level 12 uses the current main band and ERETER EC ascending, with missing EC last. Level 10/11 use their current official level and effective difficulty ascending.
- Cleanup: up to 2 in performance mode, from lower bands nearest to the main band. Level 12 excludes introduction bands and uses ERETER EC within a band.
- HARD: up to 2, level 12 only, EASY CLEAR/CLEAR records ordered by ERETER HC ascending with missing values last.
- EXH: up to 1, level 12 only, HARD CLEAR records ordered by ERETER EXH ascending with missing values last.
- Challenge: up to 2 from exactly one effective-difficulty step above. The average of the player's two highest Radar attributes ranks candidates. Missing chart Radar excludes only this category. At level 11, same-level candidates precede level-12 introduction candidates. There is no challenge above 12.7.
- Attribute practice: up to 5 from the current band and one band on each side. It orders by absolute Radar distance, then values at or above the player value, then the current band, then chartId. It is unavailable without player Radar or a selected attribute.

All final ties use chartId, so identical inputs produce identical results. ERETER and Radar absence never prevents ordinary clear, cleanup, HARD, or EXH recommendations.
