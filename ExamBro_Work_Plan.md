# ExamBro Instagram Automation — Work Plan (for PM)

**Goal:** build the full app in one go (no phased release), using the existing UI prototype as the real frontend and building the backend alongside it.

*Date: 13 June 2026*

---

## How to approach this (read first)

- **Use the prototype as the real frontend.** The design and all screens are done. With AI-assisted coding the frontend is quick, so wire up the prototype directly — don't redesign or rebuild the UI from scratch.  
- **Build the backend in parallel.** While the frontend is being connected, the backend pipeline gets built at the same time.  
- **Build everything together**, then test properly before going live. No staged Phase 1 / 2 / 3 release.  
- **One thing must start on day one:** the Meta/Instagram approval. It takes the longest (6–8 weeks) and blocks the launch, so it can't wait.

---

## Start on day one (these take the longest)

1. **Apply for Meta App Review \+ business verification.** Needed for *both* auto-publishing *and* competitor data. Realistically 6–8 weeks, so begin immediately and let it run in the background.  
2. **Get all accounts and keys:** the AI providers (writer model, critic model, image model, news/search), plus an Instagram Business/Creator account linked to a Facebook Page.  
3. **Set up the project foundation:** code repository, database, hosting, and secure key storage.

---

## The build — step by step

4. **Turn the prototype into the working app shell.** Set up the real screens, navigation, and the owner's login, using the prototype as-is.  
     
5. **Lock the AI choices (remove the biggest risks early):**  
     
   - **Hindi writer test:** try the candidate models on the same Hindi prompts, the owner judges, pick the best Hindi writer.  
   - **Critic accuracy test:** the quality-checker must agree with the owner on at least **80% of 50 test posts** (owner judges blind first, then compare) before it's trusted to run on its own.  
   - **Image test:** confirm the image tool produces clean **English** text in images, then sign off.  
   - **News test:** confirm exam news (JEE/NEET/CUET/GUJCET) can be pulled reliably.  
   - **Prepare brand assets:** brand voice rules, a set of best past posts as examples, and the never-post list.

   

6. **Build the Settings and the data behind them:** content pillars (editable), Business Foundation (incl. never-post list), Target Audience, competitor handles, publishing connection, and posting rhythm.  
     
7. **Build the daily content engine:**  
     
   - Gather the inputs: exam news, competitor trends, the owner's past posts and their performance.  
   - **Topic Decider:** combine the inputs and produce **3 topics** following the agreed priority order (owner's idea wins → urgent news can break rotation → never-post filters everything → pillars rotate → performance and competitor trends guide the rest).  
   - **Writer ⇄ Critic loop:** the writer drafts in Hindi; a **different** AI model checks it against the brand rubric (never-post rules are hard rejects); loop up to 2–3 times until it passes.  
   - **Image maker** (English text; decides single image vs carousel) and **reel-script generator** (offered automatically on important posts).  
   - **Publishing:** auto-publish approved **image** posts to Instagram; **reels stay manual** (owner shoots from the script).

   

8. **Wire the two-tap flow end to end:** morning job at 9:00 AM → **email** the owner → **Tap 1** (pick a topic) → build the post → **email** → **Tap 2** (review and approve). The review screen must support **editing caption / hashtags / reel directly**, **regenerating the image on its own**, and **AI-rewriting one part at a time**. Then publish → done. Include the **missed-day queue** (topics wait if the owner skips a day).  
     
9. **Connect the frontend to the backend** — replace the prototype's placeholder content with real data flowing through the screens.  
     
10. **Set up tracking from the start:** save every draft version and its critic score, and **link each published post back to its topic and pillar** so performance and the Insights tab work. Record engagement (saves, shares, reach).

---

## Test before launch

11. Confirm the **critic accuracy test passes** (the 80% above).  
12. **Real trial run:** the owner uses the app daily for about **two weeks**, and we measure that **\~90% of posts are approved without edits** over 14 continuous days.  
13. Fix quality issues found in the trial — these will mostly be the critic's rules and the Hindi writing.

---

## Launch

14. When **Meta approval is through** *and* the **quality bar is met**, turn on auto-publishing and go live.  
15. Write short **maintenance and handoff notes** so the system can be supported afterwards.

---

## What runs in parallel (so nothing waits unnecessarily)

- **Meta approval** runs in the background the entire time.  
- **Frontend wiring** and **backend pipeline** are built at the same time.  
- **AI quality testing** (writer test, critic test, image sign-off) happens early, alongside the setup work.

---

## Needed from the owner / still to confirm

- AI keys and a budget ceiling.  
- Instagram Business account \+ Facebook Page \+ the documents for Meta business verification.  
- Brand guide and the best past posts (for examples and the critic).  
- The owner's time as the **Hindi judge** — for the writer test, the critic test, and the 2-week trial.  
- Confirm hosting. Notifications are **email for now** (a better channel like WhatsApp/Telegram can come later — keep it easy to swap).

---

## Two things not to miss (cheap now, expensive later)

- **Start Meta approval on day one.** It's the single thing most likely to delay launch.  
- **Build the post-to-topic link from the start.** Without it, "what's working" and the Insights tab have no data to show — and adding it later means rework.

