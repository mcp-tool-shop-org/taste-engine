## Feature: Cross-Repo Drift Detection

Add a mode where Role OS compares how a concept (like "authentication" or "error handling") is described across multiple repos under the same org. If one repo frames it operationally and another uses vague language, surface that as a drift finding.

**Why:** Org-wide consistency matters. If Role OS already catches drift within a single run, extending to cross-repo comparison catches terminology creep and framing divergence before it becomes entrenched. This preserves the operating-system thesis at org scale.

**Entry:** `roleos drift-scan --org` runs across all initialized repos and produces a drift report grouped by concept.