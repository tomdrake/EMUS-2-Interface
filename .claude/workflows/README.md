# Milestone workflows

One script per milestone in `docs/HANDOFF.md`. Each runs Sonnet agents through
backend, frontend base, parallel components, wire-up and an independent review,
and leaves the changes uncommitted.

Start one from Claude Code with, for example, "run the fill-m2-monitor workflow",
or "run the workflow script at .claude/workflows/fill-m2-monitor.js".

Order: `fill-m2-monitor`, `fill-m3-news2`, `fill-m4-studio`, `fill-m5-chat`,
`fill-m6-mimic-epr`, `fill-m7-ai-forecast`, `fill-m8-interop`.

The scripts share one template. If you change the shape of one, change them all.
