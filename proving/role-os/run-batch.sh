#!/bin/bash
# Batch review runner for proving set
# Run from: F:/AI/taste-engine/proving/role-os/
CLI="node ../../dist/cli/index.js"

echo "=== BATCH 1: First 6 reviews ==="
echo ""

echo "--- A1: Aligned package blurb ---"
$CLI review run --file artifacts/aligned/a1-package-blurb.md --type package_blurb --purpose "npm package description" --canon-version canon-v1
echo ""

echo "--- A2: Aligned readme section ---"
$CLI review run --file artifacts/aligned/a2-readme-section.md --type readme_section --purpose "Recovery and escalation docs" --canon-version canon-v1
echo ""

echo "--- B1: Salvageable package blurb ---"
$CLI review run --file artifacts/salvageable/b1-package-blurb.md --type package_blurb --purpose "npm package description" --canon-version canon-v1
echo ""

echo "--- B2: Salvageable feature brief ---"
$CLI review run --file artifacts/salvageable/b2-feature-brief.md --type feature_brief --purpose "New feature proposal" --canon-version canon-v1
echo ""

echo "--- C1: Hard drift package blurb ---"
$CLI review run --file artifacts/hard-drift/c1-package-blurb.md --type package_blurb --purpose "npm package description" --canon-version canon-v1
echo ""

echo "--- C2: Hard drift feature brief ---"
$CLI review run --file artifacts/hard-drift/c2-feature-brief.md --type feature_brief --purpose "New feature proposal" --canon-version canon-v1
echo ""

echo "=== BATCH 2: Remaining 9 reviews ==="
echo ""

echo "--- A3: Aligned CLI help ---"
$CLI review run --file artifacts/aligned/a3-cli-help.md --type cli_help --purpose "CLI help text" --canon-version canon-v1
echo ""

echo "--- A4: Aligned feature brief ---"
$CLI review run --file artifacts/aligned/a4-feature-brief.md --type feature_brief --purpose "New feature proposal" --canon-version canon-v1
echo ""

echo "--- A5: Aligned release note ---"
$CLI review run --file artifacts/aligned/a5-release-note.md --type release_note --purpose "Version release notes" --canon-version canon-v1
echo ""

echo "--- B3: Salvageable readme section ---"
$CLI review run --file artifacts/salvageable/b3-readme-section.md --type readme_section --purpose "Getting started docs" --canon-version canon-v1
echo ""

echo "--- B4: Salvageable CLI help ---"
$CLI review run --file artifacts/salvageable/b4-cli-help.md --type cli_help --purpose "CLI help text" --canon-version canon-v1
echo ""

echo "--- B5: Salvageable release note ---"
$CLI review run --file artifacts/salvageable/b5-release-note.md --type release_note --purpose "Version release notes" --canon-version canon-v1
echo ""

echo "--- B6: Salvageable naming proposal ---"
$CLI review run --file artifacts/salvageable/b6-naming-proposal.md --type naming_proposal --purpose "Rename core terminology" --canon-version canon-v1
echo ""

echo "--- C3: Hard drift readme section ---"
$CLI review run --file artifacts/hard-drift/c3-readme-section.md --type readme_section --purpose "How it works section" --canon-version canon-v1
echo ""

echo "--- C4: Hard drift naming proposal ---"
$CLI review run --file artifacts/hard-drift/c4-naming-proposal.md --type naming_proposal --purpose "Product rebrand proposal" --canon-version canon-v1
echo ""

echo "=== ALL REVIEWS COMPLETE ==="
