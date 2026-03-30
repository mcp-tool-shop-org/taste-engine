## Feature: Auto-Approve Mode

Skip the operator approval gates for trusted workflows. When a run completes with all packets verified and no hook escalations, automatically mark it as approved without requiring human intervention. This reduces operator overhead on routine runs.

**Why:** Operators spend time clicking "approve" on runs that always succeed. Auto-approve for low-risk work classes removes unnecessary friction.

**Implementation:** Add a `--auto-approve` flag to `multi-claude run`. When enabled, the system bypasses the promote-check and approval steps if all fitness scores exceed a threshold.