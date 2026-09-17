# Getaway odd-roster scoring

**Verdict: PLAYTEST-READY; human balance testing remains.** Scope: allow 5, 7 and 9 players alongside the existing even rosters, using a visible scoring bonus for the smaller crew. The user accepted this as the first balance experiment.

## Rules

- All players participate with the same movement, capacity, pickup, banking, shove and protection rules.
- Teams differ by at most one player. Crew sizes are fixed at launch; disconnects and withdrawals do not change the bonus.
- Raw banked bags remain integers. The smaller crew earns points at the exact larger-crew-size / smaller-crew-size ratio: 3/2, 4/3 or 5/4. Equal crews retain one point per bag.
- Winner and tie comparisons use the exact ratio; display formatting must not decide a result. Visible and party-awarded points use at most two decimal places. For seven players, the ×1.33 label abbreviates the exact 4/3 factor.
- The projector, phone and results explain that the smaller crew has a scoring bonus. Everyone in a crew receives the same adjusted result.

## Verification evidence

Tested the uncommitted candidate based on `cd34695`, including the existing Getaway production build plus odd-roster game changes and the shared room's decimal-score validation/accumulation. No deployment or merge.

| Gate | Result | Evidence |
|---|---|---|
| Automated behavior and build | PASS | Final frozen-source `npm run verify` exit 0: 31 room + 259 client tests, 290 total; TypeScript and production build pass. Independent focused Getaway/eligibility/audio checks 42/42, `npm run check` and `git diff --check` pass. |
| Scoring and eligibility | PASS | Tests cover all 4–10 rosters, normalized wins reversing raw bag order, exact ties, unchanged even scoring and fixed launch denominators after withdrawal/reconnect. Fully connected 5/7/9 games advance beyond the shortage timeout without pausing; actual loss on either crew still pauses and reconnect resumes. |
| Shared standings boundary | PASS | Room accepts only finite, bounded scores with at most two decimal places, rejects excess precision/out-of-range scores, and rounds cumulative totals to hundredths. Public room tests cover fractional results and accumulation. |
| Five-player real journey | PASS | Integrated production preview on port 5207; room `5YHM` via host proxy 5209 and five isolated phone origins. Old build visibly blocked launch; new build launched the same party as 3 vs 2. Full practice/runway/live/closure/results completed without a false shortage pause. Five Cobalt bags became 7.5 points on the phone and projector; both Cobalt players received +7.5 in party standings. |
| Persistence and next game | PASS | Projector reload retained the 7.5-point standings. Next-game lobby preserved scores and accepted four more players. |
| Nine-player layout | PASS | 5 vs 4 launch, visible ×1.25 on phone/HUD and explicit smaller-crew explanation in the runway. Inspected at actual 1280×720 host and 844×390 phone viewport dimensions. |
| Independent review | PASS | No unresolved high/medium code or spec finding. Review caught the even-team shortage assumption and obsolete invalid-roster copy; the final source and tests cover both. |
| Human fairness | HUMAN PLAYTEST NEEDED | The handicap is an accepted experiment, not a demonstrated balance result. |

The real five-player run banked only the smaller crew's haul; equal-haul comparisons and seven-player exact 4/3 arithmetic are covered by automated tests, not claimed as human or live-browser comparisons. Nine-player QA covers launch and short live play, not a second full match. Controllers are separate local-storage origins in one browser on one computer, not physical phones.

Existing production evidence remains applicable to unchanged movement, audio, arena, timing, animation and resource lifecycle. This change adds no new assets, input mechanism or scheduled loop; checks focus on roster logic, decimal scoring, layouts and standings rather than repeating the entire earlier performance campaign.

Evidence screenshots: `/tmp/getaway-odd-qa/five-host-result.png`, `/tmp/getaway-odd-qa/five-phone-bonus.png`, and `/tmp/getaway-odd-qa/nine-host-bonus.png`. The first pair covers a fractional delivery and persisted result; the third covers the distinct maximum odd-roster layout.

## Runtime observations and cleanup

The host error query was empty. The frame-based phone QA reported two `MutationObserver.observe` errors, one during the old-build baseline and one during a later iframe reload. The controller remained live and usable. Navigating to the direct `/j/5YHM` route retained identity and bonus and produced no additional error. The origin of those two QA observations was not established; they are not reported as a proven application defect or silently counted as a clean phone console.

The nine-player check remained live beyond the shortage timeout, then exited through the standard confirmation. The lobby kept the earlier 7.5-point totals and did not count the canceled round. All ten temporary browser tabs and both preview/proxy processes were closed; scratch proxy code was removed, leaving the three screenshots.

## Human balance gate

The bonus equalizes nominal hauling capacity, not map coverage or interception pressure. Five players (2 vs 3) is the hardest case because the larger crew can dedicate its extra player to interference. Test escorting, camping, varied haul sizes and victim agency with real groups before claiming odd crews are balanced. Do not silently add movement or combat handicaps to this experiment.
