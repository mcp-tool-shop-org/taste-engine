#!/bin/bash

echo "=== REVISION PROVING SET ==="
echo ""

echo "=== ROLE-OS (3 artifacts) ==="

echo "--- B2: Smart Role Suggestions (salvageable_drift) ---"
cd F:/AI/taste-engine/proving/role-os
node ../../dist/cli/index.js revise run --artifact 55e4df66 --canon-version canon-v1
echo ""

echo "--- B3: Generic readme section (salvageable_drift) ---"
node ../../dist/cli/index.js revise run --artifact 77557783 --canon-version canon-v1
echo ""

echo "--- B4: Soft CLI help (salvageable_drift) ---"
node ../../dist/cli/index.js revise run --artifact 940743e3 --canon-version canon-v1
echo ""

echo "=== MULTI-CLAUDE (3 artifacts) ==="

echo "--- MB1: AI agent orchestration blurb (salvageable_drift) ---"
cd F:/AI/taste-engine/proving/multi-claude
node ../../dist/cli/index.js revise run --artifact a46ba274 --canon-version canon-v1
echo ""

echo "--- MB2: Auto-approve feature (salvageable_drift) ---"
node ../../dist/cli/index.js revise run --artifact ba85437e --canon-version canon-v1
echo ""

echo "--- MB3: Let AI handle the rest readme (salvageable_drift) ---"
node ../../dist/cli/index.js revise run --artifact ecb81ad9 --canon-version canon-v1
echo ""

echo "=== REVISION PROVING COMPLETE ==="
