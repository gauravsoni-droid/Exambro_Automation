# Meta / Instagram API Setup — ExamBro

**Purpose:** This document explains everything required to make the two "smart" signals in the Topic Decider go live — **#6 own-post performance** (saves, shares, reach, views) and **#7 competitor activity** (what competitor accounts are posting and how it performs publicly). Both run on the **same Instagram Graph API**, so one app + one approval covers both.

**Status:** Reference / action list for the owner. No code depends on this yet — the backend tables (`metrics`, `feed_items`) and `settings.competitor_handles` already exist and will sit empty until the steps below are done.

**Date:** 15 June 2026 · API version targeted: **Graph API v22.0** (current).

> **Current approach (June 2026):** the developer has been invited into **ExamBro's Meta Business Portfolio** (Business Suite), not building on a personal account. This is the better setup — the app lives in the same portfolio as the Instagram asset. **Read [§12](#12-working-as-an-invited-developer-current-approach) — it replaces the personal-account steps in §4 and §6** and tells you exactly what you can/can't do given your role. §4 and §6 remain as the generic reference.

---

## 1. The big picture (read this first)

To read Instagram data programmatically you cannot use a personal Instagram login. Meta only exposes data through a chain of linked business objects:

```
Facebook account (yours)
  └── Meta Developer App  ........... the API "key holder" (App ID + App Secret)
        └── Facebook Page  .......... a Page you own (free to create)
              └── Instagram Professional account  ... ExamBro IG, set to Business/Creator
                    └── Access Token  ............... what the backend sends on every API call
```

Every API call the backend makes is: **App + Token → asks about → your IG account (or, via Business Discovery, a competitor's public IG account).**

Two distinct data reads, both from this one chain:

| # | Signal | Endpoint | What it reads |
|---|---|---|---|
| **#6** | Own performance | `GET /{ig-media-id}/insights` | Your posts' `views, reach, saved, shares, likes, comments` |
| **#7** | Competitor activity | `GET /{your-ig-id}?fields=business_discovery.username(...)` | A competitor's public posts: caption, `like_count`, `comments_count`, media type, permalink |

> **Key limit to understand now:** `saved` and `shares` are **private insights** — available **only for your own account**. For competitors you can only ever see **public** numbers (likes, comments, follower count). This is a Meta rule, not a missing feature. Our schema already reflects this (`feed_items.metrics` is marked "public only").

---

## 2. What you need to create — checklist

- [x] A **Facebook account** (personal is fine; it owns the app).
- [x] A **Facebook Page** for ExamBro (free; required to attach the IG account).
- [x] The **ExamBro Instagram account converted to a Professional account** (Business or Creator).
- [x] The IG account **linked to the Facebook Page**.
- [ ] A **Meta Developer App** (Business type).
- [ ] **Instagram Graph API product** added to the app.
- [ ] The required **permissions** approved (see §5).
- [ ] A **long-lived / system-user access token** (see §6).
- [ ] **App Review + Business Verification** completed for production use (see §7).

Steps 1–6 can be done in an afternoon. Step 7 (App Review) is the **multi-week** item — **start it first / early**, everything else can proceed in parallel.

---

## 3. Step-by-step: accounts and linking

### 3.1 Convert the ExamBro Instagram account to Professional
1. Instagram app → **Settings → Account type and tools → Switch to professional account**.
2. Choose **Business** (recommended) or Creator. Business exposes the full insights set we need.
3. This is reversible and free; followers/posts are unaffected.

### 3.2 Create a Facebook Page (if none)
1. facebook.com → **Pages → Create new Page**. Name it "ExamBro". Category: Education.
2. No need to post anything — it only exists to anchor the IG account.

### 3.3 Link Instagram to the Page
1. Instagram app → **Settings → Business tools and controls → connect a Facebook Page** → select the ExamBro Page.
2. Confirm in Facebook **Page → Settings → Linked accounts → Instagram** that it shows connected.

> Without this Page link, the Graph API cannot "see" the Instagram account at all.

---

## 4. Step-by-step: the Meta Developer App

> **If you have Business Portfolio access (current approach), use [§12](#12-working-as-an-invited-developer-current-approach) instead** — you create the app *inside* the portfolio so it can reach the IG asset. The steps below are the generic personal-account version.

1. Go to **developers.facebook.com** → log in with the Facebook account → **My Apps → Create App**.
2. App type: **Business**.
3. Fill app name ("ExamBro Automation"), contact email.
4. In the app dashboard → **Add Product → Instagram Graph API** (and **Facebook Login for Business** for token generation).
5. Note the **App ID** and **App Secret** (Settings → Basic). These go into the backend env (see §8). **Never commit the secret.**
6. Add yourself as an app **Admin/Developer** under **App Roles** so you can generate tokens before review.

---

## 5. Permissions (scopes) the app must request

For both signals you need these on the token:

| Permission | Needed for | Notes |
|---|---|---|
| `instagram_basic` | #6 + #7 | Read account + media basics. |
| `instagram_manage_insights` | #6 (own metrics) **and** #7 | Required for media insights **and** for `business_discovery`. |
| `pages_show_list` | linking | List the Page that owns the IG account. |
| `pages_read_engagement` | linking | Read Page→IG connection. |
| `business_management` | App Review / system user | Needed when using a System User token (recommended for a server). |

During development these work in **Development mode** for accounts with a role on the app. For production (any account, unattended server) they require **App Review** (§7).

---

## 6. Access tokens — which one and why

Tokens are the credential the backend sends on every call. There are three kinds; we want the **third** for an unattended server.

1. **Short-lived user token** (~1 hour) — only for first-time generation in the Graph API Explorer. Too short for a server.
2. **Long-lived user token** (~60 days) — exchange the short-lived one for this. Works, but **expires every 60 days** → someone must refresh it. Acceptable for a quick start.
3. **System User token (recommended)** — created in **business.facebook.com → Business Settings → Users → System Users**. Can be **long-lived and effectively non-expiring**, tied to the business not a person. Best for a 24/7 backend that runs at 09:00 daily.

**How to get the long-lived token (quick start):**
1. **Graph API Explorer** (developers.facebook.com/tools/explorer) → select the app → **Generate Access Token** with the scopes in §5.
2. Exchange short→long-lived:
   ```
   GET https://graph.facebook.com/v22.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={APP_ID}
     &client_secret={APP_SECRET}
     &fb_exchange_token={SHORT_LIVED_TOKEN}
   ```
3. Get your **IG Business Account ID** (the backend needs it):
   ```
   GET https://graph.facebook.com/v22.0/me/accounts?access_token={TOKEN}      → find the Page ID
   GET https://graph.facebook.com/v22.0/{PAGE_ID}?fields=instagram_business_account&access_token={TOKEN}
   ```
   The returned `instagram_business_account.id` is your **IG_USER_ID**.

---

## 7. App Review + Business Verification (the slow part — start early)

To use the permissions in §5 **outside** of accounts that have a role on the app (i.e. in production, unattended), Meta requires:

1. **Business Verification** — verify the legal business in Business Manager (documents: business name, address; can take days).
2. **App Review** — submit each advanced permission (`instagram_basic`, `instagram_manage_insights`) with:
   - A **screencast** showing how the app uses the data (e.g. "the dashboard shows ExamBro post performance and competitor benchmarks to decide topics").
   - A written use-case description.
   - A test path Meta's reviewer can follow.
3. Meta reviews and approves/rejects. **Plan for 1–3 weeks**, possibly more with back-and-forth.

> **This is why the Topic Decider doc's "every input live day one" needs a caveat.** The code can be ready on day one, but competitor + performance **data** only flows after Meta approves. Treat App Review as the critical-path launch dependency.

---

## 8. What the backend will need (env vars)

When wiring is done, the backend reads these (names indicative — final names set at implementation):

```
META_APP_ID=...                # only needed to refresh/mint tokens
META_APP_SECRET=...            # only needed to refresh; env only, never in git
IG_ACCESS_TOKEN=...            # long-lived / system-user token
IG_USER_ID=...                # your IG business account id (the node we query)
META_GRAPH_VERSION=v22.0
```

> **With a System User token (non-expiring, §12) the backend never refreshes**, so `META_APP_ID` + `META_APP_SECRET` are **optional at runtime** — the two that actually run the calls are `IG_ACCESS_TOKEN` + `IG_USER_ID`. Keep App ID/Secret anyway for any future re-minting.

Competitor handles are **already** modeled in the DB: `settings.competitor_handles text[]` — the owner lists competitor usernames there, and the backend loops Business Discovery over them.

---

## 9. Reference API calls (for the developer)

**#6 — own media list, then insights per media:**
```
GET /v22.0/{IG_USER_ID}/media?fields=id,caption,media_type,timestamp,permalink&access_token={TOKEN}
GET /v22.0/{IG_MEDIA_ID}/insights?metric=views,reach,saved,shares,likes,comments&access_token={TOKEN}
```
> v22.0 note: `impressions` and `video_views` are **deprecated** — use `views`. Our `metrics` table already uses `views`.

**#7 — competitor public data via Business Discovery (one call per handle):**
```
GET /v22.0/{IG_USER_ID}
  ?fields=business_discovery.username({COMPETITOR_USERNAME}){followers_count,media_count,media{caption,like_count,comments_count,media_type,timestamp,permalink}}
  &access_token={TOKEN}
```
Returns `null` / error if the competitor is **private or a personal account** — Business Discovery only works on Business/Creator accounts. Handle that gracefully per handle.

**Rate limits:** Instagram Graph API is heavily throttled (per-app, per-user hourly caps). Because competitor data has no history, **store a snapshot each run** in `feed_items` rather than calling repeatedly. Daily 09:00 cadence is well within limits.

---

## 10. Exam calendar (#8) — note, NOT a Meta dependency

Separate from Instagram. There is **no official machine-readable API** for NTA exam dates (JEE / NEET / CUET), and **GUJCET is run by GSEB (Gujarat board), a different source entirely**. Plan:

- Maintain a small owner-editable `exam_calendar` table, seeded manually from the published NTA 2026 calendar + GSEB for GUJCET.
- Optionally let the existing Claude web-search agent propose date updates for the owner to confirm.

No accounts, tokens, or review needed — this can be live immediately and is independent of everything above.

---

## 11. Summary — what to do, in order

> Using the Business Portfolio path? Follow **[§12](#12-working-as-an-invited-developer-current-approach)** for steps 2–3 below; the rest is unchanged.

1. **Done:** convert IG → Professional, create FB Page, link them (§3).
2. **Today:** create the app **inside the ExamBro portfolio**, add Instagram Graph API product (§12 / §4).
3. **This week:** create a **System User**, generate a non-expiring token, fetch IG_USER_ID (§12 / §6).
4. **Start now, finishes in weeks:** Business Verification (**owner**) + App Review (§7) — the long pole.
5. **In parallel, no dependency:** build the exam calendar table (§10) and the 4 internal Topic-Decider signals.
6. Hand the backend the env vars in §8; competitor + performance go live the moment App Review clears.

---

## 12. Working as an invited developer (current approach)

You've been added to **ExamBro's Meta Business Portfolio** with **full access (Admin)**. That means you can drive almost the entire setup yourself — the only true owner-only step is **Business Verification** (it needs the legal business documents, which are the owner's identity, not yours).

### 12.0 First — you're in the wrong tool

`adsmanager.facebook.com` (Ads Manager) is **not** where this work happens. You don't need Ads Manager at all. Use these two:

- **business.facebook.com/settings** → **Business Settings** — assets, people, system users, apps, verification.
- **developers.facebook.com** → app dashboard, products, App Review.

### 12.1 Capability by role (you = Admin / full access)

| Task | Min role needed | You (Admin) |
|---|---|---|
| Register your account as a Meta developer | your own account | ✅ |
| Create the app **inside the ExamBro portfolio** | business **Admin** | ✅ |
| Add Instagram Graph API product to the app | app admin (creator) | ✅ |
| Assign IG account + Page as app assets | business **Admin** | ✅ |
| Create **System User + generate token** | business **Admin** | ✅ |
| Submit **App Review** | app admin | ✅ |
| **Business Verification** (legal docs) | Admin **+ owner's documents** | ⚠️ **needs owner** |

So: **everything except Business Verification is yours to do.** Hand that one to the owner and run in parallel.

### 12.2 Full path (Admin, Business Portfolio)

1. **developers.facebook.com** → log in with your invited account → accept developer terms → **verify your phone** (new accounts must). Now you're a registered developer.
2. **business.facebook.com/settings → People** → click your name → confirm it says **Admin / Full control**. (You said you have full access → this should be Admin.)
3. **Business Settings → Accounts → Apps → Add → Create a New App ID.** Type **Business**. Name it "ExamBro Automation". → This creates the app **owned by the ExamBro portfolio**, so it can legally touch the IG asset (the whole reason portfolio access matters).
4. Open the app at **developers.facebook.com → My Apps → ExamBro Automation** → **Add Product → Instagram Graph API** (+ **Facebook Login for Business** if you also want interactive token testing).
5. **Business Settings → Apps → [ExamBro Automation] → Add Assets** → attach the **Instagram account** and the **Facebook Page**. (Now the app can query that IG account.)
6. **Business Settings → Users → System Users → Add** →
   - Name: `exambro-backend`, role **Admin** (or Employee with explicit asset access).
   - **Assign assets:** give it the app + the Instagram account + the Page.
   - **Generate New Token** → select the app → tick scopes: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management` → set **token expiration: Never**.
   - Copy it once and store safely → **this is your `IG_ACCESS_TOKEN`** (non-expiring; the ideal kind for a 24/7 backend).
7. **Fetch `IG_USER_ID`** (Graph API Explorer with that token, or curl):
   ```
   GET /v22.0/me/accounts?access_token={TOKEN}                              → find the Page ID
   GET /v22.0/{PAGE_ID}?fields=instagram_business_account&access_token={TOKEN}
   ```
   `instagram_business_account.id` = your **IG_USER_ID**.
8. **Owner action — Business Verification:** Business Settings → **Security Center** → start verification, submit business documents. Days-to-weeks. Start now, parallel to everything.
9. **You — App Review:** in the app, request **Advanced Access** for `instagram_basic` + `instagram_manage_insights`. Needs a privacy-policy URL, app icon, and a screencast showing the data use. Submit and wait (1–3 weeks).

### 12.3 What changes vs §4 / §6

- **App creation** moves from *personal account* (§4) to **Business Settings → Apps** (step 3) so the app is portfolio-owned and can reach the IG asset.
- **Token** comes from a **System User** (step 6), not the short→long exchange in §6. System User token is **non-expiring**, so the backend needs only `IG_ACCESS_TOKEN` + `IG_USER_ID` to run (App ID/Secret optional — see §8).

### 12.4 Test before App Review clears

Because the app and the IG account are in the same portfolio and your System User has a role on that asset, you can pull **your own** account data (#6) in **Development mode** right after step 7 — useful to validate the integration early. Full unattended production (and any account you don't have a role on) still requires the App Review in step 9.

### 12.5 Owner-only blockers — hand these off now

1. **Business Verification** (step 8) — legal documents.
2. Final responsibility on **App Review** content (privacy policy hosted on ExamBro's domain, business email). You can prepare it; owner should approve.

---

## Sources
- [Instagram Business Discovery API: What Can You Actually Get? — keyapi.ai](https://www.keyapi.ai/blog/instagram-business-discovery-api/)
- [Instagram Graph API: Complete Developer Guide for 2026 — wpsocialninja.com](https://wpsocialninja.com/instagram-graph-api/)
- [Instagram Graph API: Complete Developer Guide for 2026 — elfsight.com](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
- [Instagram Media and Profile Insights Metrics Deprecation — docs.emplifi.io](https://docs.emplifi.io/platform/latest/home/instagram-media-and-profile-insights-metrics-depre)
- [NTA Exam Calendar 2026 — testbook.com](https://testbook.com/news/nta-exam-calendar-2026/)
