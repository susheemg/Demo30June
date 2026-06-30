"""Grok + Manus wired as selectable live providers, the active-provider selector,
and the per-provider connectivity test."""
import os
import sys

sys.path.insert(0, "/home/claude/tprm")
os.environ["BRO_TRUST_HEADER"] = "1"

from fastapi.testclient import TestClient  # noqa: E402
from app.bro_app import create_app, make_session_factory, make_engine  # noqa: E402
from app.agents import llm_config as L  # noqa: E402

H = {"x-user": "admin"}
DB = "sqlite:////tmp/ai_prov_test.db"
_KEYS = ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "MANUS_API_KEY",
         "BRO_LLM_PROVIDER", "BRO_LLM_KEY")


def _clear_env():
    for k in _KEYS:
        os.environ.pop(k, None)


def _app():
    p = "/tmp/ai_prov_test.db"
    if os.path.exists(p):
        os.remove(p)
    return TestClient(create_app(DB))


# ---- provider detection + model defaults ----
def test_grok_manus_models():
    assert L._model_for("grok") == "grok-4.3"
    assert L._model_for("manus") == "manus-1.5"


def test_configured_provider_detects_grok_and_manus():
    _clear_env()
    os.environ["XAI_API_KEY"] = "xai-x"
    assert L.configured_provider() == "grok"
    _clear_env()
    os.environ["MANUS_API_KEY"] = "m-x"
    assert L.configured_provider() == "manus"
    _clear_env()


def test_provider_preference_respected():
    _clear_env()
    os.environ["OPENAI_API_KEY"] = "o"
    os.environ["XAI_API_KEY"] = "x"
    os.environ["BRO_LLM_PROVIDER"] = "grok"
    assert L.configured_provider() == "grok"
    _clear_env()


# ---- per-provider test probe ----
def test_test_provider_no_key():
    _clear_env()
    r = L.test_provider("grok")
    assert r["ok"] is False and "no key" in r["error"].lower()


def test_test_provider_unknown():
    assert L.test_provider("bogus")["ok"] is False


def test_test_provider_with_key_reports_sdk_or_calls():
    # In this sandbox the openai SDK is absent, so a key-present probe must report that
    # honestly rather than faking success.
    _clear_env()
    os.environ["XAI_API_KEY"] = "xai-test"
    r = L.test_provider("grok")
    assert r["ok"] is False  # no live SDK here
    assert ("SDK not installed" in (r.get("error") or "")) or ("rror" in (r.get("error") or ""))
    _clear_env()


# ---- endpoints ----
def test_ai_provider_endpoint_sets_and_persists():
    _clear_env()
    os.environ["XAI_API_KEY"] = "xai-x"   # a provider is only 'active' if its key is present
    c = _app()
    st = c.post("/api/v1/ai/provider", headers=H, json={"provider": "grok"}).json()
    assert st["provider"] == "grok"
    from app.features import config_store as CFG
    s = make_session_factory(make_engine(DB))()
    assert (CFG.get_json(s, "ai_active_provider", {}) or {}).get("provider") == "grok"
    _clear_env()


def test_ai_provider_rejects_unknown():
    c = _app()
    assert c.post("/api/v1/ai/provider", headers=H, json={"provider": "nope"}).status_code == 400


def test_ai_test_endpoint_returns_status():
    _clear_env()
    c = _app()
    r = c.post("/api/v1/ai/test/manus", headers=H).json()
    assert r["provider"] == "manus" and r["ok"] is False  # no key set
    _clear_env()


if __name__ == "__main__":
    import traceback
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    for t in tests:
        try:
            t(); print(f"PASS  {t.__name__}"); passed += 1
        except Exception:
            print(f"FAIL  {t.__name__}"); traceback.print_exc()
    print(f"\n{passed}/{len(tests)} passed")
    sys.exit(0 if passed == len(tests) else 1)
