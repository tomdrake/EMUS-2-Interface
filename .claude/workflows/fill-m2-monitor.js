export const meta = {
  name: 'fill-m2-monitor',
  description: 'Implement milestone M2 (live monitor, alarms and oxygen) from docs/briefs/M2-monitor.md using Sonnet agents',
  whenToUse: 'Run after the scaffold is in place. Leaves changes uncommitted for you to read and commit.',
  phases: [
    {
      title: "Backend",
      detail: "implement modules until the acceptance tests pass",
      model: "sonnet"
    },
    {
      title: "Frontend base",
      detail: "API calls, stores and shared pieces",
      model: "sonnet"
    },
    {
      title: "Components",
      detail: "widgets and sheets in parallel, one agent per file set",
      model: "sonnet"
    },
    {
      title: "Wire up",
      detail: "register components, browser checks, notes",
      model: "sonnet"
    },
    {
      title: "Review",
      detail: "independent check against the brief",
      model: "sonnet"
    }
  ],
}

// Pass {model: '<id>'} as args to use a different model for every agent.
const MODEL = (args && args.model) || 'sonnet'
const ID = 'M2'
const BRIEF = 'docs/briefs/M2-monitor.md'
const TESTS = 'backend/tests/test_m2_monitor.py'
const BACKEND = [
  [
    "simulator",
    "Implement backend/app/sources/simulator.py: scenario_values, synth_ecg, synth_pleth, synth_resp and SimulatorSource (info, patient, stream, history, observation_sets, oxygen, now, seek, set_speed). Make the simulator tests pass: `cd backend && ../.venv/bin/python -m pytest -q tests/test_m2_monitor.py -k 'scenario or synthetic'`."
  ],
  [
    "api-stream-alarms",
    "Implement the M2 routes in backend/app/routers/patients.py (list, detail, trend, oxygen, alarm limits), backend/app/routers/stream.py (WebSocket fan-out and demo controls) and backend/app/routers/alarms.py, with a new alarm engine module and persistence helpers as the brief describes. Make every remaining test in backend/tests/test_m2_monitor.py pass."
  ]
]
const BASE = "Create frontend/src/app/live.ts (Zustand store for numerics, waveform ring buffers, alarm state and connection status, plus a WebSocket client with reconnect), add the M2 calls to frontend/src/app/api.ts (patients, trend, oxygen, alarm limits, alarms, demo controls), and make frontend/src/layout/TopBar.tsx show the real patient, oxygen, alarm status and a SIMULATED badge. Start the stream from App.tsx."
const PARTS = [
  [
    "traces",
    "Own these files only: frontend/src/widgets/MonitorRows.tsx and new WaveCanvas.tsx, TrendTrace.tsx, BarTrace.tsx, EventsTrace.tsx, TimerRow.tsx plus one co-located monitor-rows.css imported by MonitorRows.tsx. Real traces and live numerics as the brief's Frontend table describes, including the sweep break and flashing numerics on alarm."
  ],
  [
    "alarms",
    "Own these files only: everything under frontend/src/alarms/ (audio.ts, AlarmBanner.tsx, SilenceButton.tsx, alarms.css), new frontend/src/studio/AlarmLimitsSheet.tsx and new frontend/src/widgets/Alarms.tsx. Server-driven two-minute silence with countdown, alarm banner, tones by priority, limit steppers bounded by the registry."
  ],
  [
    "oxygen-patient-demo",
    "Own these new files only: frontend/src/studio/OxygenSheet.tsx, PatientSheet.tsx, DemoControlsSheet.tsx, frontend/src/widgets/Oxygen.tsx, Patient.tsx and one co-located clinical-sheets.css. Oxygen flow presets and device grid, patient details, scenario picker with speed, jump and restart."
  ]
]

const RULES = `You are implementing part of milestone ${ID} of the EMUS-2 co-design patient monitor.

Read these first, in full: docs/HANDOFF.md (the rules apply to you), ${BRIEF}, and the docstrings of every file you touch.

Rules that matter most:
- Contracts are fixed: do not change backend/app/registry.py, models/design.py, models/clinical.py, news2.py, patching.py, schema.sql or route signatures. If one is wrong, stop and report it under contract_changes instead of changing it.
- Acceptance tests are in ${TESTS}. A test counts as done when it passes with its @todo("${ID}") line removed. Never weaken, skip or delete a test; if a test is wrong, fix it and explain why in open_questions.
- Frontend: no literal colours or hard-coded parameter lists; use the design, the registry and the CSS variables from frontend/src/design/theme.ts. Tappable things are at least var(--touch).
- Simulated or placeholder output must be visibly badged.
- Backend time comes from app.clock.now().
- Do not commit, push or open pull requests. Do not start long-running servers you do not stop.
- Report honestly: tests_passing is true only if you ran the command and it passed.`

const REPORT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    tests_passing: { type: 'boolean' },
    command_run: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
    contract_changes: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'tests_passing', 'command_run', 'files_changed', 'open_questions', 'contract_changes'],
}

const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ready', 'needs-work'] },
    make_test_passed: { type: 'boolean' },
    e2e_passed: { type: 'boolean' },
    todo_markers_left: { type: 'array', items: { type: 'string' } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'should-fix', 'note'] },
          file: { type: 'string' },
          problem: { type: 'string' },
        },
        required: ['severity', 'file', 'problem'],
      },
    },
  },
  required: ['verdict', 'make_test_passed', 'e2e_passed', 'todo_markers_left', 'findings'],
}

const reports = []
const run = async (label, phaseTitle, task) => {
  const r = await agent(`${RULES}\n\nYour task: ${task}`, { label, phase: phaseTitle, model: MODEL, schema: REPORT })
  reports.push({ label, ...(r || { summary: 'agent returned nothing', tests_passing: false }) })
  return r
}
const stop = (where) => {
  log(`Stopped at ${where}: its checks did not pass. Nothing was committed.`)
  return { milestone: ID, completed: false, stopped_at: where, reports }
}

// Backend steps depend on each other, so they run one after another.
phase('Backend')
for (const [label, task] of BACKEND) {
  const r = await run(`${ID} backend: ${label}`, 'Backend',
    `${task}\nFinish by running \`make test-backend\` from the repository root and report the result.`)
  if (!r || !r.tests_passing) return stop(`backend: ${label}`)
}

if (BASE) {
  phase('Frontend base')
  const base = await run(`${ID} frontend base`, 'Frontend base',
    `${BASE}\nFinish by running \`make test-frontend\` and report the result.`)
  if (!base || !base.tests_passing) return stop('frontend base')

  // Each agent owns different files, so they can work at the same time.
  phase('Components')
  const built = await parallel(PARTS.map(([label, task]) => () =>
    run(`${ID} component: ${label}`, 'Components',
      `${task}\nOther agents are editing other files at the same moment: touch only the files named here. Do NOT edit frontend/src/widgets/index.tsx, frontend/src/studio/index.tsx, frontend/src/app/api.ts, frontend/src/app/App.tsx, frontend/src/styles.css or frontend/e2e/smoke.cjs; the next step registers your components. If you need something from a shared file, list it in open_questions. Finish with \`cd frontend && npx tsc --noEmit\`; type errors in files you do not own are expected at this stage, so report tests_passing true if your own files are clean.`)))
  if (built.some((r) => !r || !r.tests_passing)) log('One or more components reported problems; the wiring step will try to resolve them.')

  phase('Wire up')
  const wired = await run(`${ID} wire up`, 'Wire up',
    `The component agents have written their files; their reports follow.\n${JSON.stringify(reports.filter((r) => r.label.includes('component')))}\n\nRegister the new components in frontend/src/widgets/index.tsx and frontend/src/studio/index.tsx (replacing the ${ID} placeholders), resolve anything they listed as needed from shared files, and add the browser checks the brief lists under "Done when" to frontend/e2e/smoke.cjs below the marked line. Then run \`make test\`, \`make build\`, start the server in the background on a spare port (for example \`cd backend && EMUS_DB=$(mktemp -d)/e2e.sqlite3 ../.venv/bin/python -m uvicorn app.main:app --port 8123 &\`), run \`cd frontend && node e2e/smoke.cjs http://127.0.0.1:8123\`, look at the screenshots in frontend/e2e/screenshots/ and fix what looks wrong, then stop the server. Finally append a "Notes for review" section to ${BRIEF} as docs/HANDOFF.md rule 9 describes. tests_passing is true only if make test and the browser check both passed.`)
  if (!wired || !wired.tests_passing) log('Wiring reported failing checks; see the review.')
} else {
  phase('Wire up')
  await run(`${ID} notes`, 'Wire up',
    `Run \`make test\` and append a "Notes for review" section to ${BRIEF} as docs/HANDOFF.md rule 9 describes, using these reports: ${JSON.stringify(reports)}`)
}

// A separate agent that did none of the work checks it against the brief.
phase('Review')
const review = await agent(
  `You are reviewing milestone ${ID} of the EMUS-2 co-design patient monitor. You did not write it. Do not fix anything; report.

Read docs/HANDOFF.md and ${BRIEF}. Then check, by running commands and reading the diff (\`git status\`, \`git diff\`):
1. \`make test\` passes. Report make_test_passed from the actual result.
2. No @todo("${ID}") remains in ${TESTS} (list any that do), and no acceptance test was weakened, skipped or deleted: compare the test file with \`git diff\` and flag any change other than removing @todo lines, unless the notes justify it.
3. The fixed contract files are unchanged, or any change is justified in the notes.
4. Every item under "Done when" in the brief is met. For browser items, build, start the server on a spare port, run frontend/e2e/smoke.cjs, look at the screenshots, then stop the server. Report e2e_passed from the actual result.
5. HANDOFF rules: nothing hard-coded that the design should control; touch targets; everything within two touches; simulated and placeholder output visibly badged; no secrets or patient identifiers in logs, errors or LLM prompts.
6. Anything clinically misleading on screen (a wrong unit, a value shown as real when it is simulated, a partial NEWS2 total shown as complete).

Verdict 'ready' only if 1 to 4 hold and there are no blockers. Be specific: file and what is wrong.`,
  { label: `${ID} review`, phase: 'Review', model: MODEL, schema: REVIEW })

return {
  milestone: ID,
  completed: true,
  review,
  reports,
  next: 'Read the review. Fix what you agree with, then commit with a message starting "' + ID + ':". Nothing has been committed.',
}
