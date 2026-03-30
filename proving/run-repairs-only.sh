#!/bin/bash

echo "=== STRUCTURAL REPAIRS ONLY ==="

echo "--- REPAIR B2: Smart Role Suggestions (role-os) ---"
cd F:/AI/taste-engine/proving/role-os
node ../../dist/cli/index.js repair run --artifact 55e4df66 --canon-version canon-v1 --max-concepts 2
echo ""

echo "--- REPAIR B3: Generic readme (role-os) ---"
node ../../dist/cli/index.js repair run --artifact 77557783 --canon-version canon-v1 --max-concepts 2
echo ""

echo "--- REPAIR S1: Persona Browser (role-os) ---"
LATEST_S1=$(node -e "const D=require('better-sqlite3');const d=new D('.taste/taste.db');const r=d.prepare(\"SELECT id FROM candidate_artifacts WHERE title='s1-persona-routing' ORDER BY rowid DESC LIMIT 1\").get();console.log(r.id);d.close()")
node ../../dist/cli/index.js repair run --artifact $LATEST_S1 --canon-version canon-v1 --max-concepts 2
echo ""

echo "--- REPAIR S3: Approachable Onboarding (role-os) ---"
LATEST_S3=$(node -e "const D=require('better-sqlite3');const d=new D('.taste/taste.db');const r=d.prepare(\"SELECT id FROM candidate_artifacts WHERE title='s3-approachable-onboarding' ORDER BY rowid DESC LIMIT 1\").get();console.log(r.id);d.close()")
node ../../dist/cli/index.js repair run --artifact $LATEST_S3 --canon-version canon-v1 --max-concepts 2
echo ""

echo "--- REPAIR MB2: Auto-approve feature (multi-claude) ---"
cd F:/AI/taste-engine/proving/multi-claude
node ../../dist/cli/index.js repair run --artifact ba85437e --canon-version canon-v1 --max-concepts 2
echo ""

echo "--- REPAIR S2: Autonomous Parallel (multi-claude) ---"
LATEST_S2=$(node -e "const D=require('better-sqlite3');const d=new D('.taste/taste.db');const r=d.prepare(\"SELECT id FROM candidate_artifacts WHERE title='s2-autonomous-swarm' ORDER BY rowid DESC LIMIT 1\").get();console.log(r.id);d.close()")
node ../../dist/cli/index.js repair run --artifact $LATEST_S2 --canon-version canon-v1 --max-concepts 2
echo ""

echo "=== REPAIRS COMPLETE ==="
