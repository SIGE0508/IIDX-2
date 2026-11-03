# Ver.1.2 Phase 2: NEXT TRAINING

## Scope and compatibility

Phase 1 (bba82a2) is the baseline. No master, dependency, version, storage,
CSV/JSON backup, TRAINING eligibility, PWA policy or Phase 3 changes.

calculateTrainingWithCandidates performs the existing calculation once and exposes
five category lists before their display limits. calculateTraining still returns
the original TrainingResult; each TRAINING list remains limited to five. In
particular, the original clear-target supplementation trigger (<5) and +0.1 band
rule remain unchanged, independent of the HOME limit of 30.

## HOME candidates and target selection

- Existing clear/cleanup targets supply EASY for level 12 and CLEAR for levels 10/11.
- Level-12 EASY records at or below mainBand also supply normal CLEAR targets.
  EC is not a normal-CLEAR difficulty metric; these additional targets sort by
  effective difficulty descending, then chartId.
- HARD and EXH reuse the full existing lists, including required HC/EXH values.
  HOME restricts non-challenge candidates to effective difficulty <= mainBand,
  without imposing an HC/EXH <= personal ERETER eligibility threshold.
- Challenge retains its original engine conditions and may exceed mainBand.
- A level-12 EASY chart with both CLEAR/HARD options chooses HARD if HC <= the
  registered personal ERETER. Otherwise it chooses HARD only below mainBand and
  in the easier half of at least four same-band HC peers. All ties at the boundary
  count together; a chartId tie-break cannot make a tied HC easier.
- HC peers are all eligible, available-or-unknown level-12 charts with HC in the
  same effective-difficulty band (rounded to tenths), regardless of current lamp.
  This keeps the reference group independent of individual lamp upgrades.
- With insufficient peers, or without either HARD condition, choose CLEAR.
  CLEAR records can choose HARD and HARD records EXH when the original engine
  permits them. Personal ERETER influences the choice, never absolute exclusion.

Options retain all eligible source categories/reasons and alternate goals. The
preferred goal supplies the displayed target/reasons. A chart occupies one place.
Ranked goal lists are interleaved EASY/CLEAR/HARD/EXH/CHALLENGE to at most 30;
short goal lists yield capacity to other eligible lists. No unsuitable filler.

## Display and replacement

Select at most three, favoring different goals within the same recency tier,
with at most one challenge. Prefer charts absent from the last three actual
HOME displays. If insufficient, reuse by oldest last appearance first. Recency
has priority over goal diversity. Identity is chartId even if its target changes.
Randomness is injectable for deterministic tests.

App-level memory retains selection/history across navigation and unrelated
renders. Candidate-content changes trigger reassessment; PLAYER changes reset
history. Hidden recomputations are not counted as HOME displays. Nothing is
persisted. The replacement button is disabled when no other chart exists, with
an explicit explanation. Empty pools remain empty; challenge-only pools may
show fewer than three due to the one-challenge limit.

The HOME cards display title, chart type, official/unofficial difficulty, target
lamp and Japanese reasons. Wrapping and minimum widths support a 390px viewport.

## Regression evidence

The Phase-1 snapshot was captured before engine changes for 42 deterministic
scenarios (six ranks and seven record patterns). SHA-256 covers the complete
TrainingResult, including order, reasons and non-target fields. Review deliberate
TRAINING changes before replacing these baselines; do not blindly regenerate.

20 additional automated tests cover snapshot parity, full lists, eligibility,
30/24-candidate pools, goal resolution, 3/4 HC peer boundary, deduplication,
round-robin goals, three-display history, shortage reuse, PLAYER/content changes,
actual-display acknowledgement and input immutability. Existing 88 tests remain.

Isolated real Edge tests use real master charts with synthetic PLAYER/records:
30 candidates, six per goal; ten consecutive replacements avoid all prior three
sets; no draw writes to IndexedDB/web storage; navigation/unrelated renders retain
selection; saving changes reassesses candidates; PLAYER replacement, empty and
single-candidate pools behave correctly; 390px layout has no horizontal overflow.
No personal browser profile or user records are touched.

PWA checks cover normal/Pages manifests, /IIDX-2/, standalone, generated SW,
five master precache revisions, offline startup and master loading, update
waiting, and preservation of an IndexedDB v2/seven-store sentinel. Master/static
revisions remain the B-2 baseline; application assets change as expected.
Known deepmerge advisory GHSA-gcqx-w48m-w2h4 remains four low propagated findings,
with production-only audit zero; see SECURITY_RISK_DEEPMERGE.md.

## Phase 3 handoff

Keep WARM UP state, replacement and display history independent. Deduplicate
against the other currently displayed section where possible without redrawing
it. Reuse the single training calculation, not repeated engine invocations.
Real Android/iOS installation and touch-device checks remain separate from the
390px Edge viewport verification.
