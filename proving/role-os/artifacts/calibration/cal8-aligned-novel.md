## Feature: Canon Weight Tuning from Run Outcomes

After a mission completes, record which roles performed well and which caused escalations. Feed this into the calibration engine to adjust role routing weights over time. Roles that consistently produce clean handoffs gain routing priority. Roles that frequently trigger escalation get downweighted for that mission type.

**Why:** Role OS already records run outcomes and has a calibration module. This closes the loop by making routing smarter from real operational data rather than static scoring heuristics.

**Routing:** This is a feature-ship mission. Backend Engineer builds the weight update logic, Test Engineer validates against historical run data, Critic reviews for feedback-loop safety.