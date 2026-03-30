## Feature: Run History Export

Export completed run state as a structured JSON artifact for external analysis.

**Entry point:** `roleos export <run-id> --format json`

**What it produces:** A run report containing the mission type, role chain, step outcomes, evidence items, escalation events, and friction metrics. Each step includes its verdict, artifact validation result, and time-to-complete.

**Why it matters:** Operators who run Role OS across multiple repos need a way to compare run outcomes, identify recurring escalation patterns, and measure whether routing confidence improves over time. This export feeds external dashboards without coupling the core to any specific analytics tool.

**Routing:** This is a feature-ship mission with Backend Engineer, Test Engineer, and Critic Reviewer.