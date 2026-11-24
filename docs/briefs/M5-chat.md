# M5: API tokens and redesign by chat

Read `docs/HANDOFF.md` first. Needs M4. Acceptance tests: `backend/tests/test_m5_chat.py`.

## Goal

A clinician types "make the heart rate bigger and put NEWS2 on the left" and sees
the change previewed on the monitor, then applies or discards it. Works with a
Claude API key or an Edinburgh ELM token (for example a Qwen model hosted by ELM).
The model can only change the design document.

## Before writing provider code

Read the current Claude API reference (in Claude Code: the `claude-api` skill) for
model ids, the Messages tool-use format, headers and error shapes. Do not write
them from memory. ELM facts: OpenAI-compatible gateway at
`https://elm.edina.ac.uk/api/v1`; `GET /models` and `POST /chat/completions`;
bearer token; model list not public, so always fetch it live.

## Backend

| File | Build |
|---|---|
| `app/ai/llm.py` | `AnthropicProvider`, `OpenAICompatibleProvider`, `extract_json_proposal`, `propose_validated`. Use the injected `client` when given. |
| `app/routers/settings.py` | Provider settings and tokens. |
| `app/routers/chat.py` | `get_llm_provider`, chat, apply, discard, history. |

- **Tokens** are stored in the `secrets` table and never returned: only
  `configured`, `key_hint` (last four characters) and `from_env`. Environment
  variables `ANTHROPIC_API_KEY`, `ELM_API_KEY`, `ELM_BASE_URL` win over stored values.
  Never log a token; scrub tokens from provider error text before raising `LLMError`.
- **Prompt**: `build_system_prompt(design)` plus the stored conversation for that
  design. Nothing about any patient.
- **Tool call**: wrap `PROPOSE_PATCH_TOOL` in each provider's envelope. If the
  model returns no tool call, try `extract_json_proposal` on its text; if that
  finds nothing, treat the text as a question or refusal and pass it through.
- **Validation loop** (`propose_validated`): apply with `patching.apply_patch`; on
  failure send the errors back as a user turn and ask for a corrected patch, at
  most once; if still invalid, return `ok: false` with the errors and store the
  message with outcome `invalid`.
- **Certainty** (optional, where available): if an OpenAI-compatible endpoint
  returns `logprobs`, compute `token_logprob` over the tool-call arguments and
  return it in `Proposal.certainty`. Check what ELM returns; record the answer in
  the notes. Do not invent a value when the endpoint gives none.
- Chat messages, proposals and outcomes are stored in `chat_messages`; applying
  saves a design version with `source='chat'` linked by `chat_message_id`.
- No token configured: 409 with a message that says where to add one.
- Timeouts (60 s), and a clear message for 401, 429 and 5xx.

## Frontend

| File | Build |
|---|---|
| new `src/studio/ApiTokensSheet.tsx` | Per provider: token field (password type, shows the hint when set, "Remove"), base URL for ELM and custom gateways, model picker filled from the live list, "Test" button, which provider is active. A short line on where tokens are kept. |
| new `src/studio/AssistantSheet.tsx` | Docked to one side so the monitor stays visible. Message list, large text box, send. A proposal shows its summary, the sections it touches, and Apply / Discard; while it is pending the monitor shows it as the draft. A few starter prompts as chips. Shows provider and model in use. On-screen keyboard friendly. |

## Done when

- All `@todo("M5")` tests pass with the decorator removed; `make test` is green.
- Browser check added using a fake provider switched on by an environment variable
  for tests only (for example `EMUS_FAKE_LLM=1` returning a fixed patch): send a
  request, see the preview on screen, apply it, reload, and it is still there.
- With a real token (needs a person): one request each through Claude and ELM.
  Record in the notes which models were tried and whether tool calls worked.
