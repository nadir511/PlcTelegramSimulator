# Reusable prompts

Invocable prompt files for common tasks. Each runs with a specialized agent from
[../agents/](../agents/).

| Prompt | Purpose | Agent |
| --- | --- | --- |
| [new-adr](new-adr.prompt.md) | Draft a new Architecture Decision Record from the template. | planner |
| [plan-feature](plan-feature.prompt.md) | Produce a short implementation plan before coding. | planner |
| [review-changes](review-changes.prompt.md) | Review the current change set for real issues. | reviewer |

To add one: create `name.prompt.md` with frontmatter (`name`, `description`, optional
`argument-hint` and `agent`), then keep the body a short, ordered task. See
[AGENTS.md](../../AGENTS.md) for the overall workflow.
