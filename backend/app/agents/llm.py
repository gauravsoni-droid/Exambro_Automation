"""Provider-agnostic LLM layer. Direct SDK calls, no framework (TRD §2: no LangChain).

Three providers (anthropic / openai / google) behind two functions:
- complete()      → plain text
- complete_json() → validated Pydantic model (retry once on parse failure)

Writer provider/model comes from config (bake-off winner); critic must differ in family.
"""

import json
import logging
import re

from pydantic import BaseModel, ValidationError

from app.config import Provider, get_settings

logger = logging.getLogger(__name__)

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


async def complete(
    provider: Provider,
    model: str,
    system: str,
    user: str,
    max_tokens: int = 4096,
) -> str:
    s = get_settings()

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
        )
        return resp.choices[0].message.content or ""

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


def _extract_json(text: str) -> dict:
    """LLMs sometimes wrap JSON in prose or code fences — pull out the object."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = _JSON_BLOCK.search(text)
        if match:
            return json.loads(match.group())
        raise


async def complete_json[T: BaseModel](
    provider: Provider,
    model: str,
    system: str,
    user: str,
    schema: type[T],
    max_tokens: int = 4096,
) -> T:
    """Completion parsed into a Pydantic model. One retry with the error fed back."""
    json_system = (
        f"{system}\n\n"
        "Respond with ONLY a single valid JSON object matching this JSON Schema "
        "(no prose, no code fences):\n"
        f"{json.dumps(schema.model_json_schema(), ensure_ascii=False)}"
    )
    raw = await complete(provider, model, json_system, user, max_tokens)
    try:
        return schema.model_validate(_extract_json(raw))
    except (ValidationError, json.JSONDecodeError) as exc:
        logger.warning("JSON parse failed for %s, retrying: %s", schema.__name__, exc)
        retry_user = (
            f"{user}\n\nYour previous response failed validation:\n{exc}\n"
            "Return ONLY the corrected JSON object."
        )
        raw = await complete(provider, model, json_system, retry_user, max_tokens)
        return schema.model_validate(_extract_json(raw))


async def claude_web_search(system: str, user: str, max_tokens: int = 4096) -> str:
    """Claude with the server-side web search tool (news research — TRD §3)."""
    from anthropic import AsyncAnthropic

    s = get_settings()
    client = AsyncAnthropic(api_key=s.anthropic_api_key)
    resp = await client.messages.create(
        model=s.news_model,
        max_tokens=max_tokens,
        system=system,
        tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 8}],
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in resp.content if b.type == "text")
