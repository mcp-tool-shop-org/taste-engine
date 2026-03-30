## Feature: Packet Budget Alerts

Add real-time budget tracking per packet during execution. When a worker exceeds the configured time budget (default 6 min, ceiling 8 min for UI), the console emits a warning and the operator can intervene via `console act stop-worker`. Budget overruns are recorded in the audit trail and factor into fitness scoring for future runs.

**Why:** Trial 8B showed that giant packets blow budgets silently. Budget alerts make overruns visible before they cascade into wave-level delays.

**Packet shape:** Law packet defines budget thresholds. Wiring packet hooks into the existing timer infrastructure. No mixed law-and-wiring — the coupling guard prevents it.