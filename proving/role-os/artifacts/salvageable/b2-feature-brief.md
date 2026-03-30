## Feature: Smart Role Suggestions

When a user describes their task, Role OS helpfully suggests the most relevant roles from its collection. The suggestion engine considers task keywords and recommends 3-5 roles that might be useful. Users can then pick the ones they like and assemble their own workflow.

**Why:** This makes Role OS more approachable for new users who aren't familiar with all the available helpers. It reduces the learning curve and helps people get started quickly.

**Implementation:** Add a `roleos suggest` command that takes a task description and returns recommended roles with brief descriptions of what each one does.