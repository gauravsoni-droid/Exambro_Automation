"""Provider-agnostic LLM layer. Direct SDK calls, no framework (TRD §2: no LangChain).

Three providers (anthropic / openai / google) behind two functions:
- complete()      → plain text
- complete_json() → validated Pydantic model (up to 3 retries on parse failure)

Writer provider/model comes from config (bake-off winner); critic must differ in family.
"""

import json
import logging
import re

from pydantic import BaseModel, ValidationError

from app.config import Provider, get_settings

logger = logging.getLogger(__name__)

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)
_CODE_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.DOTALL)

_MAX_JSON_ATTEMPTS = 3

# Providers that support response_format={"type":"json_object"} via the OpenAI SDK.
# Anthropic uses a different API; Google uses response_mime_type — neither is set here.
_JSON_MODE_PROVIDERS: frozenset[str] = frozenset({"kimi", "openai"})


async def complete(
    provider: Provider,
    model: str,
    system: str,
    user: str,
    max_tokens: int = 4096,
    response_format: dict | None = None,
) -> str:
    s = get_settings()

    logger.info("[PROVIDER TEST] provider=%s model=%s", provider, model)

    if provider == "anthropic":
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=s.anthropic_api_key)
        resp = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(b.text for b in resp.content if b.type == "text")

    if provider == "openai":
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=s.openai_api_key)
        resp = await client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            **({"response_format": response_format} if response_format else {}),
        )
        return resp.choices[0].message.content or ""

    if provider == "kimi":
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=s.moonshot_api_key,
            base_url="https://api.moonshot.ai/v1",
        )
        resp = await client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            extra_body={"thinking": {"type": "disabled"}},
            **({"response_format": response_format} if response_format else {}),
        )

        if response_format:
            logger.debug(
                "Kimi JSON mode active — thinking=disabled response_format=%s", response_format
            )

        # ── Diagnostic logging for empty-response investigation ──────────────
        num_choices = len(resp.choices) if resp.choices else 0
        logger.info(
            "Kimi raw response — model=%s id=%s choices=%d usage=%s",
            resp.model, resp.id, num_choices,
            (
                f"prompt={resp.usage.prompt_tokens} "
                f"completion={resp.usage.completion_tokens} "
                f"total={resp.usage.total_tokens}"
            ) if resp.usage else "None",
        )
        if not resp.choices:
            logger.error("Kimi returned 0 choices — full response: %s", resp)
            return ""

        choice = resp.choices[0]
        msg = choice.message
        finish_reason = choice.finish_reason
        content = msg.content
        refusal = getattr(msg, "refusal", None)

        logger.info(
            "Kimi choice[0] — finish_reason=%s content_len=%s refusal=%s",
            finish_reason,
            len(content) if content is not None else "None",
            refusal,
        )

        if finish_reason and finish_reason != "stop":
            logger.warning(
                "Kimi non-stop finish_reason=%s model=%s "
                "— likely cause of empty/truncated response",
                finish_reason, model,
            )

        if refusal:
            logger.warning(
                "Kimi content refusal — model=%s refusal=%s", model, refusal
            )

        if content is None:
            logger.warning(
                "Kimi content is None — finish_reason=%s refusal=%s "
                "tool_calls=%s",
                finish_reason,
                refusal,
                getattr(msg, "tool_calls", None),
            )

        return content or ""

    if provider == "google":
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=s.google_api_key)
        resp = await client.aio.models.generate_content(
            model=model,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system, max_output_tokens=max_tokens
            ),
        )
        return resp.text or ""

    raise ValueError(f"Unknown provider: {provider}")


def _is_truncated(text: str) -> bool:
    """Return True when braces/brackets are unbalanced or a string is unterminated.

    Walks the text character-by-character respecting string escapes so nested
    structures and escaped quotes don't confuse the count.
    """
    depth = 0
    in_string = False
    escape = False
    for ch in text:
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
    return depth != 0 or in_string


def _extract_json(text: str) -> dict:
    """Pull the first JSON object from text, handling prose and code fences."""
    text = text.strip()

    # 1. Try code fence block (handles ```json ... ``` anywhere in the text)
    fence_match = _CODE_FENCE.search(text)
    if fence_match:
        candidate = fence_match.group(1).strip()
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # 2. Try the full stripped text as-is
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 3. Extract the outermost {...} block, ignoring surrounding prose
    match = _JSON_BLOCK.search(text)
    if match:
        return json.loads(match.group())

    raise json.JSONDecodeError("No JSON object found in LLM response", text, 0)


async def complete_json[T: BaseModel](
    provider: Provider,
    model: str,
    system: str,
    user: str,
    schema: type[T],
    max_tokens: int = 4096,
) -> T:
    """Completion parsed into a Pydantic model. Retries up to 3 times on failure."""
    json_system = (
        f"{system}\n\n"
        "Respond with ONLY a single valid JSON object matching this JSON Schema "
        "(no prose, no code fences):\n"
        f"{json.dumps(schema.model_json_schema(), ensure_ascii=False)}"
    )

    # JSON mode hard-enforces no prose preamble on providers that support it,
    # preventing finish_reason=length from verbose intros eating into the budget.
    _rf = {"type": "json_object"} if provider in _JSON_MODE_PROVIDERS else None

    last_error: Exception = RuntimeError("No attempts made")
    current_user = user

    for attempt in range(1, _MAX_JSON_ATTEMPTS + 1):
        raw = await complete(provider, model, json_system, current_user, max_tokens, _rf)

        # ── Empty response ───────────────────────────────────────────────────
        if not raw.strip():
            last_error = RuntimeError("LLM returned an empty response")
            logger.warning(
                "Empty response — provider=%s model=%s schema=%s attempt=%d/%d",
                provider, model, schema.__name__, attempt, _MAX_JSON_ATTEMPTS,
            )
            current_user = (
                f"{user}\n\nYour previous response was empty. "
                "Return ONLY the JSON object — no explanation, no prose."
            )
            continue

        logger.info(
            "LLM raw response attempt=%d/%d provider=%s model=%s schema=%s len=%d\n%.500s",
            attempt, _MAX_JSON_ATTEMPTS, provider, model, schema.__name__, len(raw), raw,
        )

        # ── Step 1: JSON parse ───────────────────────────────────────────────
        try:
            data = _extract_json(raw)
        except json.JSONDecodeError as exc:
            last_error = exc
            truncated = _is_truncated(raw)
            logger.warning(
                "JSON parse failed — provider=%s model=%s schema=%s attempt=%d/%d "
                "truncated=%s len=%d error=%s first500=%.500s",
                provider, model, schema.__name__, attempt, _MAX_JSON_ATTEMPTS,
                truncated, len(raw), exc, raw,
            )
            current_user = (
                f"{user}\n\nYour previous response was cut off before the JSON "
                "was complete (unclosed braces or unterminated string). "
                "Return the COMPLETE JSON object in one response — do not truncate."
            ) if truncated else (
                f"{user}\n\nYour previous response failed JSON parsing:\n{exc}\n"
                "Return ONLY the corrected JSON object."
            )
            continue

        # ── Step 2: Schema validation ────────────────────────────────────────
        try:
            return schema.model_validate(data)
        except ValidationError as exc:
            last_error = exc
            missing = [e["loc"][-1] for e in exc.errors() if e.get("type") == "missing"]
            logger.warning(
                "Schema validation failed — provider=%s model=%s schema=%s attempt=%d/%d "
                "missing_fields=%s errors=%s",
                provider, model, schema.__name__, attempt, _MAX_JSON_ATTEMPTS,
                missing if missing else "none", exc,
            )
            current_user = (
                f"{user}\n\nYour previous response failed schema validation "
                f"for {schema.__name__}:\n{exc}\n"
                "Return ONLY the corrected JSON object with all required fields."
            )

    raise RuntimeError(
        f"complete_json failed after {_MAX_JSON_ATTEMPTS} attempts "
        f"(provider={provider} model={model} schema={schema.__name__}): {last_error}"
    ) from last_error


async def claude_web_search(system: str, user: str, max_tokens: int = 4096) -> str:
    """Always uses Anthropic SDK + web_search_20260209 for live web search.

    Model is configurable via NEWS_MODEL in .env (default: claude-opus-4-8).
    NEWS_PROVIDER is intentionally ignored — live web search is Anthropic-only.
    """
    from anthropic import AsyncAnthropic

    s = get_settings()
    model = s.news_model

    logger.info("[LIVE NEWS TEST] model=%s", model)

    client = AsyncAnthropic(api_key=s.anthropic_api_key)
    resp = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 8}],
        messages=[{"role": "user", "content": user}],
    )
    block_types = [b.type for b in resp.content]
    web_search_invoked = any(b.type in ("tool_use", "tool_result") for b in resp.content)
    logger.info(
        "[LIVE NEWS TEST] content_blocks=%d block_types=%s web_search_invoked=%s",
        len(resp.content), block_types, web_search_invoked,
    )
    return "".join(b.text for b in resp.content if b.type == "text")
