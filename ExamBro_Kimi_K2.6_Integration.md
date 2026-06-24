# ExamBro — Kimi K2.6 Integration (Topic + News Research)

**Status:** planned — not yet applied
**Scope:** move **topic research** and **news research** off `claude-opus-4-8` onto Moonshot **`kimi-k2.6`**.
**Unchanged:** writer, critic, image generation stay on their current models.

---

## 1. Model facts

| | Value |
|---|---|
| Provider | Moonshot AI (Kimi) |
| Model id | `kimi-k2.6` |
| Base URL (international) | `https://api.moonshot.ai/v1` |
| Base URL (China) | `https://api.moonshot.cn/v1` |
| API style | OpenAI-compatible (`chat.completions`) |
| SDK | reuse existing `openai` — **no new dependency** |
| Console | https://platform.moonshot.ai |

> Keys are **not** shared between `.ai` (international) and `.cn` (China). An `.ai` key against the `.cn` host returns `401 Invalid Authentication`. Pin the base URL that matches where the key was issued.

The two roles are **different call types** — do not assume one change covers both:

- **Topic research** — plain completion, reasons over the already-fetched news digest. No web search. Easy swap.
- **News research** — does live web searching. On Claude this used Anthropic's server-side `web_search` tool. Kimi has **no drop-in**; it uses the `$web_search` builtin-function **tool-call loop**. Needs a new function.

---

## 2. Changes required (5 spots)

### 2.1 `backend/app/config.py`
- Extend the provider union (line ~12):
  ```python
  Provider = Literal["anthropic", "openai", "google", "moonshot"]
  ```
- Add fields:
  ```python
  moonshot_api_key: str = ""
  moonshot_base_url: str = "https://api.moonshot.ai/v1"   # use .cn host if key is a China key
  ```

### 2.2 `backend/.env` (and `.env.example` with name only)
```
MOONSHOT_API_KEY=<your key>
# NEWS_MODEL feeds BOTH topic_decider and news_search
NEWS_MODEL=kimi-k2.6
```

### 2.3 `backend/app/agents/llm.py` — moonshot branch in `complete()`
Handles **topic research**. `complete_json()` rides on `complete()`, so it needs no separate change.
```python
if provider == "moonshot":
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=s.moonshot_api_key, base_url=s.moonshot_base_url)
    resp = await client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""
```

### 2.4 `backend/app/agents/llm.py` — new `kimi_web_search()`
Handles **news research**. Replaces the Anthropic-only `claude_web_search`. Implements Moonshot's
`$web_search` builtin-function loop. **You do not run the search** — for a builtin function you echo the
tool-call arguments straight back; Moonshot executes it server-side.
```python
async def kimi_web_search(system: str, user: str, max_tokens: int = 4096) -> str:
    """News research via Moonshot $web_search builtin (replaces claude_web_search)."""
    from openai import AsyncOpenAI

    s = get_settings()
    client = AsyncOpenAI(api_key=s.moonshot_api_key, base_url=s.moonshot_base_url)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    tools = [{"type": "builtin_function", "function": {"name": "$web_search"}}]

    finish = None
    while finish in (None, "tool_calls"):
        resp = await client.chat.completions.create(
            model=s.news_model,
            max_tokens=max_tokens,
            messages=messages,
            tools=tools,
            extra_body={"thinking": {"type": "disabled"}},  # REQUIRED with $web_search
        )
        choice = resp.choices[0]
        finish = choice.finish_reason
        if finish == "tool_calls":
            messages.append(choice.message)
            for tc in choice.message.tool_calls:
                # builtin function: echo args back, Moonshot runs the search itself
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": tc.function.name,
                    "content": tc.function.arguments,
                })
    return choice.message.content or ""
```

### 2.5 Call-site swaps
- `backend/app/agents/news_search.py` (~line 28): `llm.claude_web_search(...)` → `llm.kimi_web_search(...)`
- `backend/app/agents/topic_decider.py` (lines ~93 and ~104): the hardcoded `"anthropic"` provider →
  `"moonshot"`. (Provider is hardcoded in this file, not read from config — env alone will not switch it.)

The old `claude_web_search` and the `web_search_20260209` tool become dead code — remove or leave.

---

## 3. Gotchas

- `extra_body={"thinking": {"type": "disabled"}}` is **mandatory** when `$web_search` is enabled — the model errors otherwise.
- Each web-search call bills **$0.005** on the Moonshot side, separate from token cost.
- JSON parsing is unaffected — `_extract_json` is prompt-based (no `response_format`), works on Kimi's final message.
- `critic ≠ writer` startup rule is untouched — topic/news are separate slots from the writer.
- `get_settings()` is `@lru_cache` — restart the backend after editing `.env`, or the old (empty) key stays cached.

---

## 4. `401 Invalid Authentication` — causes & triage

Ordered most-likely first.

1. **Wrong host for the key** — `.ai` key hitting `api.moonshot.cn` (or vice versa). Keys are not cross-valid. Match `moonshot_base_url` to where the key was issued.
2. **Key not loaded** — missing/typo'd `MOONSHOT_API_KEY`, config field not added (pydantic `extra="ignore"` drops unknown vars silently), or stale cached settings (restart).
3. **Malformed value** — trailing space, quotes, newline, partial paste. `.env` line must be raw: `MOONSHOT_API_KEY=sk-...`.
4. **Wrong key passed** — code grabbed `openai_api_key` instead of `moonshot_api_key`.
5. **Revoked / wrong org/project** — key deleted, regenerated, or from another console org.
6. **Account not activated / no billing** — key exists but project not enabled.

Bypass-code test:
```bash
curl https://api.moonshot.ai/v1/chat/completions \
  -H "Authorization: Bearer $MOONSHOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"kimi-k2.6","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
```
- 200 → key is good; the bug is base_url or key-loading in code.
- 401 → key itself is bad; regenerate and re-check `.ai` vs `.cn`.

---

## 5. Sources
- Kimi model list — https://platform.kimi.ai/docs/models
- Kimi web-search guide — https://platform.kimi.ai/docs/guide/use-web-search
- Kimi K2.6 — https://huggingface.co/moonshotai/Kimi-K2.6
