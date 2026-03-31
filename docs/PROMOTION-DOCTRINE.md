# Promotion Doctrine

How surfaces move through the enforcement ladder.

## Ladder

| Mode | What happens | When to use |
|------|-------------|-------------|
| **advisory** | Reports verdicts. No blocking. | First rollout on any surface. Discovery phase. |
| **warn** | Reports + warns on hard drift. Blocks nothing. | Surface has stable signal. Authors are aware. |
| **required** | Warns on salvageable drift. Blocks hard drift + contradiction. Exit code 1 for CI. | Surface is proven clean. False positives are rare. Override receipts available. |

## Promotion Criteria

### advisory → warn

Promote when:
- 5+ reviews on this surface
- Pass rate > 60%
- No persistent false rigidity pattern
- Authors understand what the gate checks

Do not promote when:
- Pass rate < 50%
- Canon is sparse for this artifact type
- Calibration findings show this surface is noisy

### warn → required

Promote when:
- 10+ reviews on this surface
- Pass rate > 80%
- Block rate < 10%
- Override count is low and reasons are genuine
- Repair path is available and used
- Authors trust the gate enough to fix instead of bypass

Do not promote when:
- Pass rate < 70%
- Override rate > 20%
- Calibration shows persistent false rigidity
- Canon does not cover this surface well

### Demotion

Demote when:
- False rigidity rate > 25% after canon update
- Override rate spikes (authors bypassing instead of fixing)
- Canon update invalidates existing surface calibration
- Hot spot detected in rollout report

Demotion is not failure. It is recalibration.

## Override Receipts

When a warn or required gate is bypassed, an override receipt should record:
- Which artifact was bypassed
- What the original verdict was
- Why the author chose to bypass
- Whether a follow-up repair is planned

Override receipts are the trust mechanism. They make exceptions visible without making the gate annoying.

## Per-Surface Notes

### package_blurb / package description
- Highest signal surface. Product identity lives here.
- Prompt-library drift is caught reliably.
- Candidate for early `required` promotion.

### readme_section
- Mixed signal. Some sections are doctrine-heavy, others are operational.
- Keep at `advisory` until per-section targeting is available.
- Watch for false rigidity on operational/technical sections.

### release_note
- Generally well-aligned when written by project authors.
- Good candidate for `warn` after advisory stabilizes.
- Watch for generic language creep.

### feature_brief
- Where structural drift happens most.
- Keep at `advisory` longer than other surfaces.
- Structural repair path is critical for this surface.

### cli_help
- Naming and vocabulary sensitivity is high.
- Good candidate for `warn` once voice/naming canon is stable.

### naming_proposal
- Directly threatens product identity.
- Should be at `warn` from the start.
- `required` only after naming canon is well-calibrated.

## Rollout Report

Run `taste gate report` to see:
- Pass/warn/block counts by artifact type
- Override counts
- Hot spots (surfaces with high failure rates)
- Promotion readiness recommendations

Use the report to decide promotions and demotions. Do not promote on vibes.
