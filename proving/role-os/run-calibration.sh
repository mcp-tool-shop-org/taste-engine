#!/bin/bash
CLI="node ../../dist/cli/index.js"

echo "=== CALIBRATION MINI-PACK ==="
echo ""

echo "--- CAL1: B1-boundary (prompt management + keeps missions/routing) ---"
$CLI review run --file artifacts/calibration/cal1-b1-boundary.md --type package_blurb --purpose "npm package description" --canon-version canon-v1
echo ""

echo "--- CAL2: B1-boundary (library framing + keeps routing/evidence) ---"
$CLI review run --file artifacts/calibration/cal2-b1-boundary.md --type package_blurb --purpose "npm package description" --canon-version canon-v1
echo ""

echo "--- CAL3: B6-boundary (glossary addition, keeps core terms) ---"
$CLI review run --file artifacts/calibration/cal3-b6-boundary.md --type naming_proposal --purpose "Terminology refinement for onboarding" --canon-version canon-v1
echo ""

echo "--- CAL4: B6-boundary (rename surface terms, keep architecture) ---"
$CLI review run --file artifacts/calibration/cal4-b6-boundary.md --type naming_proposal --purpose "Soften operational language" --canon-version canon-v1
echo ""

echo "--- CAL5: C3-boundary (full assistant reframing, hides structure) ---"
$CLI review run --file artifacts/calibration/cal5-c3-boundary.md --type readme_section --purpose "How it works section" --canon-version canon-v1
echo ""

echo "--- CAL6: C3-boundary (preserves structure, approachable) ---"
$CLI review run --file artifacts/calibration/cal6-c3-boundary.md --type readme_section --purpose "How it works section" --canon-version canon-v1
echo ""

echo "--- CAL7: Novel but aligned (cross-repo drift detection) ---"
$CLI review run --file artifacts/calibration/cal7-aligned-novel.md --type feature_brief --purpose "New feature proposal" --canon-version canon-v1
echo ""

echo "--- CAL8: Novel but aligned (canon weight tuning) ---"
$CLI review run --file artifacts/calibration/cal8-aligned-novel.md --type feature_brief --purpose "New feature proposal" --canon-version canon-v1
echo ""

echo "=== CALIBRATION COMPLETE ==="
