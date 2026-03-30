#!/bin/bash
CLI="node ../../dist/cli/index.js"

echo "=== MULTI-CLAUDE TRANSFER TRIAL ==="

echo "--- MA1: Aligned blurb ---"
$CLI review run --file artifacts/ma1-aligned-blurb.md --type package_blurb --purpose "npm package description" --canon-version canon-v1
echo ""
echo "--- MA2: Aligned feature ---"
$CLI review run --file artifacts/ma2-aligned-feature.md --type feature_brief --purpose "New feature proposal" --canon-version canon-v1
echo ""
echo "--- MA3: Aligned release ---"
$CLI review run --file artifacts/ma3-aligned-release.md --type release_note --purpose "Version release notes" --canon-version canon-v1
echo ""
echo "--- MB1: Salvageable blurb ---"
$CLI review run --file artifacts/mb1-salvageable-blurb.md --type package_blurb --purpose "npm package description" --canon-version canon-v1
echo ""
echo "--- MB2: Salvageable feature ---"
$CLI review run --file artifacts/mb2-salvageable-feature.md --type feature_brief --purpose "New feature proposal" --canon-version canon-v1
echo ""
echo "--- MB3: Salvageable readme ---"
$CLI review run --file artifacts/mb3-salvageable-readme.md --type readme_section --purpose "Getting started section" --canon-version canon-v1
echo ""
echo "--- MB4: Salvageable CLI ---"
$CLI review run --file artifacts/mb4-salvageable-cli.md --type cli_help --purpose "CLI help text" --canon-version canon-v1
echo ""
echo "--- MC1: Hard drift blurb ---"
$CLI review run --file artifacts/mc1-harddrift-blurb.md --type package_blurb --purpose "npm package description" --canon-version canon-v1
echo ""
echo "--- MC2: Hard drift feature ---"
$CLI review run --file artifacts/mc2-harddrift-feature.md --type feature_brief --purpose "New feature proposal" --canon-version canon-v1
echo ""
echo "--- MC3: Hard drift readme ---"
$CLI review run --file artifacts/mc3-harddrift-readme.md --type readme_section --purpose "Architecture section" --canon-version canon-v1
echo ""
echo "=== TRIAL COMPLETE ==="
