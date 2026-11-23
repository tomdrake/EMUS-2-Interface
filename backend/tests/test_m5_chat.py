"""M5 acceptance: provider tokens and redesign by chat.

Brief: docs/briefs/M5-chat.md
No test here calls a real LLM: providers are faked or use httpx.MockTransport.
"""

import json

import httpx
import pytest

from app.ai.llm import (
    AnthropicProvider, ChatTurn, LLMProvider, OpenAICompatibleProvider, Proposal,
)
from app.scenarios import SCENARIOS
from tests.conftest import todo

GOOD = [{"op": "replace", "path": "/theme/colours/background", "value": "#0B1E3A"}]
BAD = [{"op": "replace", "path": "/rows/0/parameter", "value": "glucose_cgm"}]


class FakeProvider(LLMProvider):
    id = "anthropic"

    def __init__(self, *replies: Proposal):
        self.replies = list(replies)
        self.calls: list[dict] = []

    async def list_models(self):
        return [{"id": "fake-model", "label": "Fake"}]

    async def propose(self, *, system, turns, model):
        self.calls.append({"system": system, "turns": list(turns), "model": model})
        return self.replies.pop(0)

    async def answer(self, *, system, turns, model):
        self.calls.append({"system": system, "turns": list(turns), "model": model})
        return "Because the R-R intervals are irregular and there are no P waves."


def _use(client, provider):
    from app.routers.chat import get_llm_provider
    client.app.dependency_overrides[get_llm_provider] = lambda: provider
    return provider


def _copy(client):
    return client.post("/api/designs/icu-monitor/duplicate",
                       json={"name": "Chat draft", "author": "RN A"}).json()["meta"]["id"]


# --------------------------------------------------------------------- tokens

@todo("M5")
def test_tokens_are_write_only(client):
    before = client.get("/api/settings/providers").json()
    assert before["providers"]["anthropic"]["configured"] is False
    assert before["providers"]["elm"]["base_url"] == "https://elm.edina.ac.uk/api/v1"
    secret = "sk-ant-test-0123456789abcdef"
    assert client.put("/api/settings/providers/anthropic", json={"api_key": secret}).status_code == 200
    after = client.get("/api/settings/providers")
    info = after.json()["providers"]["anthropic"]
    assert info["configured"] is True and info["key_hint"].endswith("cdef")
    assert secret not in after.text
    client.put("/api/settings/providers/anthropic", json={"api_key": ""})
    assert client.get("/api/settings/providers").json()["providers"]["anthropic"]["configured"] is False


@todo("M5")
def test_environment_variables_take_precedence(client, monkeypatch):
    monkeypatch.setenv("ELM_API_KEY", "elm-env-key-9999")
    info = client.get("/api/settings/providers").json()["providers"]["elm"]
    assert info["configured"] is True and info["from_env"] is True
    assert info["key_hint"].endswith("9999")


@todo("M5")
def test_chat_without_a_token_explains_what_to_do(client):
    d = _copy(client)
    r = client.post("/api/chat", json={"design_id": d, "message": "make it blue"})
    assert r.status_code == 409
    assert "token" in json.dumps(r.json()).lower()


# ----------------------------------------------------------------------- chat

@todo("M5")
def test_valid_proposal_is_previewed_then_applied(client):
    d = _copy(client)
    fake = _use(client, FakeProvider(Proposal(text="", ops=GOOD, summary="Navy background", model="fake-model")))
    r = client.post("/api/chat", json={"design_id": d, "message": "navy background please",
                                       "author": "RN A"}).json()
    assert r["ok"] is True and r["summary"] == "Navy background"
    assert r["document"]["theme"]["colours"]["background"] == "#0B1E3A"
    assert r["touched"] == ["theme"]
    assert client.get(f"/api/designs/{d}").json()["version"] == 1, "nothing saved until applied"

    applied = client.post(f"/api/chat/{r['message_id']}/apply", params={"author": "RN A"}).json()
    assert applied["version"] == 2
    current = client.get(f"/api/designs/{d}").json()
    assert current["source"] == "chat"
    assert current["document"]["theme"]["colours"]["background"] == "#0B1E3A"
    history = client.get(f"/api/designs/{d}/chat").json()
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[1]["outcome"] == "applied"
    assert len(fake.calls) == 1


@todo("M5")
def test_invalid_proposal_gets_one_correction_round(client):
    d = _copy(client)
    fake = _use(client, FakeProvider(Proposal(ops=BAD, summary="x"), Proposal(ops=GOOD, summary="Fixed")))
    r = client.post("/api/chat", json={"design_id": d, "message": "add glucose"}).json()
    assert r["ok"] is True and r["summary"] == "Fixed"
    assert len(fake.calls) == 2
    retry_text = fake.calls[1]["turns"][-1].content
    assert "glucose_cgm" in retry_text or "/rows/0/parameter" in retry_text


@todo("M5")
def test_proposal_that_stays_invalid_changes_nothing(client):
    d = _copy(client)
    _use(client, FakeProvider(Proposal(ops=BAD, summary="x"), Proposal(ops=BAD, summary="x")))
    r = client.post("/api/chat", json={"design_id": d, "message": "add glucose"}).json()
    assert r["ok"] is False and r["errors"] and r.get("document") is None
    assert client.post(f"/api/chat/{r['message_id']}/apply").status_code == 409
    assert client.get(f"/api/designs/{d}").json()["version"] == 1


@todo("M5")
def test_question_from_the_model_is_passed_through(client):
    d = _copy(client)
    _use(client, FakeProvider(Proposal(text="Which screen do you mean?", ops=None)))
    r = client.post("/api/chat", json={"design_id": d, "message": "make it bigger"}).json()
    assert r["text"] == "Which screen do you mean?" and r["ops"] is None


@todo("M5")
def test_discard(client):
    d = _copy(client)
    _use(client, FakeProvider(Proposal(ops=GOOD, summary="Navy")))
    r = client.post("/api/chat", json={"design_id": d, "message": "navy"}).json()
    assert client.post(f"/api/chat/{r['message_id']}/discard").status_code == 200
    assert client.post(f"/api/chat/{r['message_id']}/apply").status_code == 409
    assert client.get(f"/api/designs/{d}/chat").json()[1]["outcome"] == "discarded"


@todo("M5")
def test_no_patient_data_reaches_the_model(client):
    d = _copy(client)
    fake = _use(client, FakeProvider(Proposal(ops=GOOD, summary="Navy")))
    client.post("/api/chat", json={"design_id": d, "message": "navy"})
    sent = fake.calls[0]["system"] + " ".join(t.content for t in fake.calls[0]["turns"])
    for s in SCENARIOS.values():
        assert s["patient"]["family_name"] not in sent
        assert s["patient"]["nhs_number"] not in sent
    assert '"home_screen"' in sent and "propose_design_patch" in sent


# ------------------------------------------------------------- wire formats

@todo("M5")
def test_extract_json_proposal_fallback():
    from app.ai.llm import extract_json_proposal
    text = 'Sure.\n```json\n{"summary": "Navy", "ops": ' + json.dumps(GOOD) + "}\n```\nDone."
    assert extract_json_proposal(text) == ("Navy", GOOD)
    assert extract_json_proposal("I cannot do that.") is None


def _mock(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@todo("M5")
async def test_openai_compatible_provider_lists_models_from_elm():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"], seen["auth"] = str(request.url), request.headers.get("authorization")
        return httpx.Response(200, json={"data": [{"id": "qwen-example"}, {"id": "other"}]})

    p = OpenAICompatibleProvider("elm-key", client=_mock(handler))
    models = await p.list_models()
    assert seen["url"] == "https://elm.edina.ac.uk/api/v1/models"
    assert seen["auth"] == "Bearer elm-key"
    assert [m["id"] for m in models] == ["qwen-example", "other"]


@todo("M5")
async def test_openai_compatible_provider_tool_call_and_text_fallback():
    def tool_reply(request):
        body = json.loads(request.content)
        assert body["model"] == "qwen-example"
        assert body["tools"][0]["function"]["name"] == "propose_design_patch"
        assert body["messages"][0]["role"] == "system"
        return httpx.Response(200, json={"model": "qwen-example", "choices": [{"message": {
            "role": "assistant", "content": None, "tool_calls": [{
                "id": "c1", "type": "function", "function": {
                    "name": "propose_design_patch",
                    "arguments": json.dumps({"summary": "Navy", "ops": GOOD})}}]}}]})

    p = OpenAICompatibleProvider("k", client=_mock(tool_reply))
    out = await p.propose(system="s", turns=[ChatTurn("user", "navy")], model="qwen-example")
    assert out.ops == GOOD and out.summary == "Navy"

    def text_reply(request):
        content = '```json\n{"summary": "Navy", "ops": ' + json.dumps(GOOD) + "}\n```"
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": content}}]})

    p = OpenAICompatibleProvider("k", client=_mock(text_reply))
    out = await p.propose(system="s", turns=[ChatTurn("user", "navy")], model="m")
    assert out.ops == GOOD


@todo("M5")
async def test_anthropic_provider_tool_use():
    def handler(request):
        assert request.url.path == "/v1/messages"
        assert request.headers["x-api-key"] == "sk-ant-x"
        assert request.headers.get("anthropic-version")
        body = json.loads(request.content)
        assert body["system"] and body["tools"][0]["name"] == "propose_design_patch"
        assert "input_schema" in body["tools"][0]
        return httpx.Response(200, json={"model": body["model"], "content": [
            {"type": "text", "text": "Here you go."},
            {"type": "tool_use", "id": "t1", "name": "propose_design_patch",
             "input": {"summary": "Navy", "ops": GOOD}}], "stop_reason": "tool_use"})

    p = AnthropicProvider("sk-ant-x", client=_mock(handler))
    out = await p.propose(system="s", turns=[ChatTurn("user", "navy")], model="some-claude-model")
    assert out.ops == GOOD and out.summary == "Navy" and out.text == "Here you go."


@todo("M5")
async def test_provider_errors_are_safe_to_show():
    from app.ai.llm import LLMError

    def handler(request):
        return httpx.Response(401, json={"error": {"message": "invalid x-api-key sk-ant-SECRET"}})

    p = AnthropicProvider("sk-ant-SECRET", client=_mock(handler))
    with pytest.raises(LLMError) as e:
        await p.propose(system="s", turns=[ChatTurn("user", "x")], model="m")
    assert e.value.status == 401 and "sk-ant-SECRET" not in str(e.value)
