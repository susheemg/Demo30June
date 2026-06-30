"""
Phase 4c: live provider adapters + the fail-safe LLM-backed agent.

The adapters are written against the real SDK call shapes so you drop in an API
key and they run. They are intentionally thin: build messages -> call -> return
raw text. All robustness lives in verdict_parser.

NETWORK NOTE: actual calls are not exercised by the test suite (no keys / no
egress here). Tests cover prompt building and the parser, which is where
reliability is actually determined.

FAIL-SAFE: LLMBackedAgent never returns an unparseable verdict. If parsing
fails, it raises VerdictParseError, and assess_and_gate's caller treats that as
an automatic ESCALATE — we never auto-deliver something we could not read.
"""
from __future__ import annotations

import os as _os
from typing import Optional

from ..models.evidence import ResolvedEvidence
from ..models.policy import EffectiveControl
from .provider import Provider, LLMProvider, LLMRequest, LLMResponse
from .prompt import build_prompt
from .verdict_parser import parse_verdict, VerdictParseError
from .agent import AgentVerdict


class ClaudeAdapter:
    """Adapter for Anthropic's Messages API. Pass an instantiated client.

    Prompt caching: the (static) system prompt is sent as a cache-controlled
    block so repeated calls re-use it as a cache hit (~10% of input-token cost)
    instead of re-charging the full prefix every time. Anthropic only caches a
    prefix once it exceeds the model's minimum (~1024 tokens), and silently
    ignores the marker below that — so this is always safe. Disable with
    BRO_LLM_CACHE=0. Falls back to a plain call on any older-SDK incompatibility.
    """
    name = Provider.CLAUDE

    def __init__(self, client, model: str = "claude-sonnet-4-6",
                 max_tokens: int = 1024) -> None:
        self._client = client
        self._model = model
        self._max_tokens = max_tokens
        self._cache = _os.environ.get("BRO_LLM_CACHE", "1").lower() not in ("0", "false", "no", "off")

    def complete(self, request: LLMRequest) -> LLMResponse:
        web = getattr(request, "web_search", False)
        tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 6}] if web else None
        req_max = getattr(request, "max_tokens", None)
        base_max = req_max if req_max else self._max_tokens

        def _call(system_arg):
            kw = dict(
                model=self._model,
                max_tokens=base_max if not web else max(base_max, 4096),
                system=system_arg,
                messages=[{"role": "user", "content": request.user_content}],
            )
            if tools:
                kw["tools"] = tools
            return self._client.messages.create(**kw)

        resp = None
        if self._cache and request.system_prompt:
            cached_system = [{
                "type": "text",
                "text": request.system_prompt,
                "cache_control": {"type": "ephemeral"},
            }]
            try:
                resp = _call(cached_system)
            except Exception:
                resp = None  # older SDK / unsupported -> fall back to plain
        if resp is None:
            resp = _call(request.system_prompt)

        # surface cache effectiveness when the SDK reports it
        usage = getattr(resp, "usage", None)
        if usage is not None:
            cr = getattr(usage, "cache_read_input_tokens", 0) or 0
            cw = getattr(usage, "cache_creation_input_tokens", 0) or 0
            if cr or cw:
                print(f"[prompt-cache] read={cr} write={cw} "
                      f"input={getattr(usage, 'input_tokens', 0)}")

        text = "".join(
            getattr(b, "text", "") for b in resp.content
            if getattr(b, "type", None) == "text"
        )
        return LLMResponse(provider=Provider.CLAUDE, text=text)


class OpenAIAdapter:
    """Adapter for OpenAI's Chat Completions API. Pass an instantiated client."""
    name = Provider.OPENAI

    def __init__(self, client, model: str = "gpt-4o", max_tokens: int = 1024) -> None:
        self._client = client
        self._model = model
        self._max_tokens = max_tokens

    def complete(self, request: LLMRequest) -> LLMResponse:
        req_max = getattr(request, "max_tokens", None)
        resp = self._client.chat.completions.create(
            model=self._model,
            max_tokens=req_max if req_max else self._max_tokens,
            messages=[
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.user_content},
            ],
        )
        text = resp.choices[0].message.content or ""
        return LLMResponse(provider=Provider.OPENAI, text=text)


class LLMBackedAgent:
    """
    Real AssessmentAgent: builds the prompt, calls the pinned provider via the
    given adapter, and parses the result into a validated verdict. Provenance is
    injected by the agent from the resolved evidence — never trusted to the model.
    """

    def __init__(self, adapter: LLMProvider) -> None:
        self._adapter = adapter

    def assess(
        self,
        control: EffectiveControl,
        resolved: Optional[ResolvedEvidence],
        provider: Provider,
    ) -> AgentVerdict:
        system, user = build_prompt(control, resolved)
        response = self._adapter.complete(
            LLMRequest(domain=control.domain, system_prompt=system, user_content=user)
        )
        return parse_verdict(
            response.text,
            control_id=control.control_id,
            domain=control.domain,
            provider=provider,
            winning_evidence_id=(resolved.winner.evidence_id if resolved else None),
            considered_evidence_ids=(resolved.considered if resolved else ()),
            conflict_present=bool(resolved and resolved.conflicts),
            effective_control_origin=control.origin,
            baseline_version=control.baseline_version,
        )
