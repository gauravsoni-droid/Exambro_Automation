# ExamBro — How Topics Are Decided

### The Topic Decider logic (for PM / developer)

**Date:** 13 June 2026 **Status:** Reference. Explains what influences the 3 morning topic suggestions and in what priority. Pairs with the Implementation Plan. *(All-in-one build — no phased rollout.)*

---

## What this is

Every morning at 9:00 AM the system prepares **3 topic suggestions** for the owner to pick from (Tap 1). This document lists everything that influences those 3 topics, and the order of priority when inputs compete.

We are building the full system in one go, so **every input below is live from day one.**

---

## The short version (priority order)

When the system decides the 3 topics, it follows this order:

1. **A manual idea from the owner wins.** If the owner dropped an idea in the Idea Box, it becomes the first topic — regardless of pillar rotation.  
2. **Urgent exam news can break the normal rotation.** Big, time-sensitive news (exam dates, results) can claim a slot even if it breaks the usual mix.  
3. **The "never-post" list filters everything.** Anything that breaks a brand rule is removed before it can be suggested — always, no exceptions.  
4. **Pillars rotate to fill the rest.** Remaining slots come from different content pillars, avoiding yesterday's pillar.  
5. **Within all that, the smart signals guide the final picks** — the system leans toward what's performing well and what competitors have missed.

Human first → brand-safe always → balanced mix by default → guided by what works and what's missing.

---

## What decides topics (all inputs, all live)

**1\. Content pillars \+ the rotation rule (the backbone)** The 3 suggestions must come from **3 different pillars**, and the system **skips the pillar the owner picked yesterday**. This is a hard rule — it's what keeps the page balanced instead of drifting into the same theme repeatedly.

**2\. The owner's manual ideas (Idea Box) — the strongest input** If the owner has dropped an idea in, it takes the first slot and **wins regardless of pillar rotation**. The AI shapes it into a proper topic, but the owner's intent leads. The human always overrides the machine.

**3\. Fresh exam news** Claude's web search pulls live JEE / NEET / CUET / GUJCET news — dates, notifications, results. This surfaces timely topics. **Urgent news may break the rotation rule** to claim a slot.

**4\. The owner's own past posts** Used so the system doesn't repeat what was recently covered, and stays consistent with ExamBro's style.

**5\. Business Foundation**

- *Light steer:* nudges suggestions toward the owner's stated "topics we like to post."  
- *Hard filter:* the **never-post list removes anything off-brand** (false promises, guaranteed-rank claims, naming competitors) **before it is ever suggested.**

**6\. What's worked for you (performance)** The system sees which pillars and topics get **saved and shared**, and leans toward those.

**7\. Competitor activity** Two directions: what themes competitors are pushing (trends worth matching) .

**8\. Exam-calendar proximity** How close you are to an exam shifts the focus (exam-near → more news and revision).

**9\. Adaptive strategy** Re-weights the pillar rotation over time, keyed off the exam calendar (exam season → more news/prep; off-season → more concepts). It adjusts *the mix* the pillars provide.

---

## A worked example (one morning)

Yesterday the owner picked a **Motivation** post. Last night they dropped an idea: *"the new NEET attempt-limit rule."*

This morning the system produces:

- **Topic 1 — "New NEET attempt-limit rule explained"** → the owner's idea wins slot 1 (tagged to its nearest pillar, *Exam news*).  
-   
- **Topic 2 — "The mole-concept mistake in PYQs"** → pillar: *PYQ / concept*. Chosen partly because competitors haven't covered it (a gap).  
- **Topic 3 — "How toppers plan revision week"** → pillar: *Study tips*. Favoured because your study-tip posts have been getting saved.

Note what happened: *Motivation* was excluded (picked yesterday), all three are different pillars, the owner's idea led, performance and competitor signals shaped slots 2 and 3, and a draft topic that said "guaranteed rank" was filtered out by the never-post rule before it could appear.

---

## Important clarifications

- **Target Audience barely affects topic *selection*.** Region, city, and "who we serve" mainly shape how a post is *written* (tone, examples). They only nudge topics indirectly — e.g. giving GUJCET slightly more weight for a Gujarat audience. Don't build it as a primary topic driver.  
- **The never-post list is a hard filter, not a preference.** It always removes matching topics.  
- **The human always has the final say** — through the Idea Box (before) and the Tap 1 approval (the owner can reject all 3 and regenerate).  
- **The performance signal starts weak.** Even though it's live from day one, there's no history until the first posts gather saves and shares. Early on the system should lean on pillars, news, and the owner's ideas, and weight performance more heavily as data builds — never treat thin early numbers as strong signal.

---

## What this requires to be ready at launch (for the PM)

Because every input is live from day one, the data sources behind the "smart" signals must be in place **before go-live**, not added later:

- **Competitor \+ own-account data** depends on the **Meta App Review / Business Discovery setup** — a multi-week lead item. Start it early so it's approved before launch.  
- **The performance signal** depends on **post-to-metrics attribution** — the system must be able to match each published post back to its topic/pillar to read its saves/shares. Solve this from the start.

---

## What to build (for the developer)

The Topic Decider is a single step that runs at 09:00 IST and outputs **3 topics, each tagged to a pillar**, by applying the priority order above to these inputs:

`active pillars` · `pending owner idea` · `yesterday's picked pillar` · `recent own posts` · `live exam news` · `business foundation (likes + never-post list)` · `own-post performance` · `competitor activity` · `exam calendar / strategy weighting`

---

*This describes the decision logic only. How each topic is then written and quality-checked is covered separately in the Implementation Plan.*  
