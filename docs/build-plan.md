# JRA Masterclass Series — Build Plan (v1, 2026-07-12)

**Status: GO (Lee, 2026-07-12) — execute with Opus agents, maximum progress TONIGHT (Sunday). Site deploy is the critical path; dev gets DNS handoff Monday morning.**
Once the repo exists, move this file to `docs/build-plan.md` inside it.

## Mission

Launch the **Junk Removal Masterclass Series** — JRA's free weekly live educational webinar for junk-removal owners (topics: starting, running, managing, expanding a junk removal business). First class: **The Junk Truck Masterclass, Friday 2026-07-17, 2:30 PM ET**, then **every Thursday 2:30 PM ET** from 7/23 (future topics TBD). This is JRA-brand education — DISTINCT from the Jenny AI-voice-agent sales masterclass (jennycallagent.com, Tuesdays). Weekly rhythm: **Tue = Jenny, Thu = this series.**

Deliverables, in order:
1. **Registration site** at `masterclass.junkra.com` (clone of the jenny-webinar codebase, series-first content) — **deploy Monday 7/13**; Lee's developer adds DNS.
2. **Truck class slide deck** (same pipeline as the Jenny deck).
3. **Announcement broadcast** to the existing Jenny webinar list (Wednesday 7/15).
4. **Offer collateral**: terms one-pager, Paul Lilley briefing doc, walkaround shot list, post-deposit follow-up sequence.

## Locked decisions (Lee, 2026-07-12 — do not relitigate)

| Decision | Value |
|---|---|
| Cadence | Fri 7/17 launch → Thursdays 2:30 PM ET ongoing. Skip 11/26 (Thanksgiving), 12/24, 12/31. |
| Audience | Anybody (new + scaling owners) |
| Registration | Name + email only. **Register ONCE** → joins the series list, gets every week's class emails. No per-week re-registration, no date picker. |
| Domain | `masterclass.junkra.com` (Lee's dev sets DNS; hand him the CNAME target) |
| Payments | **NONE on the site.** Deposits collected via **QuickBooks payment request sent during the close call**. No Stripe. |
| Broadcast | Announce the series to the existing Jenny webinar list (consented JRA marketing list) |
| Email infra | Reuse Resend + `Lee Godbold <leegodbold@mailer.junkra.com>` (verified domain) |
| Demo proof | Walkaround VIDEO of Lee's real Isuzu (Lee films; shot list = our deliverable) |
| Finance guest | Paul Lilley — full purchase + financing process, 8–10 min cap, planted Qs |
| Value-stack offer | **Deferred** — do NOT present a bundled package this webinar |

### THE OFFER (final — exact structure, get the words right)

> **The Founders' Truck Slot — 6 available.**
> **$100 deposit** (non-refundable, **fully credited to your truck**) locks:
> 1. **Today's truck price, frozen for 12 months** (builds currently **starting at $91,000**)
> 2. **$2,500 off** any qualifying order placed within the 12-month window
> 3. **An additional $2,500 — $5,000 total off** — if at order time a **2026 model is still available through STB (Specialty Truck Bodies, JRA's sister company)**

- Cap: **6**. One per customer. Non-stackable. Anchored to the published/current price sheet.
- **No 90-day fence** — the window is 12 months, period. The 2026-availability bonus supplies the urgency.
- **Buyer-reality framing (use this in the deck):** most attendees will NOT save $91k cash in 12 months — but they CAN build a significant **down payment**. The pitch is a 3-step: *"Lock the price today ($100) → build your down payment at $35/job → order within 12 months; Paul finances the rest."*
- Fund math anchor: **~1,000 jobs/year per truck** (Lee's number; seasonality + maintenance make higher unrealistic). $35/job ≈ $35k/yr → cash truck in ~2.6 years; a strong down payment well within the 12-month lock.

## Guardrails (hard rules)

- **Never touch the jenny-webinar repo or its Render service** (`jenny-webinar` / srv-d91e5lrsq97s738er2u0) except: (a) READ its code as the clone source, (b) send the approved broadcast via its admin API.
- No secrets committed to git. New `ADMIN_TOKEN` + `UNSUBSCRIBE_SECRET` for the new service (do not reuse Jenny's).
- CAN-SPAM: `COMPANY_POSTAL_ADDRESS` must be set before any broadcast; unsubscribe machinery stays intact in the clone.
- Honest copy: host bio says **"hundreds"** of owners (not thousands). No earnings claims. Truck facts Lee/Paul must confirm on-air get a `[LEE CONFIRM]` marker in speaker notes, never asserted as fact in slide body: CDL 26,001-lb threshold, Section 179/bonus-depreciation current limits, insurance figures, Isuzu model specifics, STB 2026 inventory.
- The offer terms above are exact — do not embellish (no extra bonuses, no deadline invention).

## Phase 1 — Registration site (target: deployed Monday 7/13)

### 1.1 Repo setup
- Source: `/Users/leegodbold/Documents/LG/jenny-webinar` (github.com/rlgodbold/jenny-webinar). Copy files into a NEW project dir `/Users/leegodbold/Documents/LG/jra-masterclass` (fresh `git init`; do not fork history). New GitHub repo `rlgodbold/jra-masterclass` (match jenny-webinar's visibility).
- Architecture you're inheriting (all ESM Node/Express, zero-build static front-end): `config.js` (branding/Zoom), `sessions.js` (schedule + auto-rollover; **ET offsets baked per row**: `-04:00` through Nov 1, `-05:00` after), `server.js` (register API, admin, broadcast, attendees, unsubscribe), `store.js` (subscribers.json + events.ndjson on DATA_DIR, atomic writes, HMAC unsub tokens), `email.js` (Resend; dry-run without key), `reminders.js` (in-process 24h/1h scheduler, idempotent per session+email), `public/index.html` (self-contained inline CSS/JS), `render.yaml`.

### 1.2 Code changes from the Jenny base
1. **`sessions.js` — schedule + topics.** Sessions become `[date, offset, topic|null]`:
   - `2026-07-17` (Fri) — topic: **"The Junk Truck Masterclass"**
   - Thursdays: 7/23, 7/30, 8/6, 8/13, 8/20, 8/27, 9/3, 9/10, 9/17, 9/24, 10/1, 10/8, 10/15, 10/22, 10/29 (all `-04:00`); 11/5, 11/12, 11/19, 12/3, 12/10, 12/17 (all `-05:00`). **Skipped: 11/26, 12/24, 12/31.** Topics: `null` → render "Topic announced soon" / "TBD".
   - All at `T14:30:00`. Export topic through `formatWhen`/API.
2. **Register-once semantics.** Remove the date-picker; `POST /api/register` attaches the registrant to the *featured* session AND the subscriber record is the series membership. **`reminders.js`: iterate `activeSubscribers()` instead of `activeForSession()`** — every active subscriber gets each class's 24h + 1h reminder (the 24h email doubles as the weekly topic announcement). Keep the per-(session,email) `reminded` flags exactly as-is (idempotency). Keep session tracking on the subscriber (analytics: which class brought them in).
3. **`config.js`.** Title "The Junk Removal Masterclass Series"; brandName "JRA"; host Lee Godbold, Founder, Junk Removal Authority; contact lee@junkra.com; `zoomJoinUrl: "https://us02web.zoom.us/j/86365369540"` (series recurring link, supplied by Lee 2026-07-12).
4. **`email.js` templates → series-flavored.** Confirmation: "You're in the series — first class: {topic}, {date}". 24h reminder: "Tomorrow: {topic}" (this IS the weekly announcement; if topic TBD, "Tomorrow's masterclass" + tease). 1h: "We're live in 1 hour: {topic}". Update footer: "because you registered for the JRA Junk Removal Masterclass Series". Attendee-notification email: rename accordingly.
5. **`public/index.html` — full content rebuild** (keep the proven bright/friendly v3 design system: white + blue #2563eb, soft shadows, rounded, green checks, Inter, mobile-first; reuse `lee.jpg` from the jenny repo):
   - **Hero (series-first):** eyebrow "Free weekly live masterclass series for junk removal owners". Headline direction: **"Build a junk removal business that runs without you."** Sub: every week, one topic — trucks, marketing, pricing, hiring, operations — taught live by Lee Godbold (JRA). Form: name + email, "Save my seat — it's free". Next-class chip + countdown.
   - **Next-class spotlight (swaps weekly, driven by sessions.js):** "This Friday: The Junk Truck Masterclass" — bullets: Isuzu vs truck-and-trailer (settled by YOUR end goal) · spec the right cab & chassis · build-out that pays for itself (ramps, winch, lift gate, toolbox, bumper, light guards) · financing with guest Paul Lilley (Section 179, down payments, the 2-year threshold) · the $35/job truck fund · walkaround of a real JRA rig · a founders-only truck offer for live attendees.
   - **Calendar section:** "Every week. One topic. Live." — list Fri 7/17 (Trucks) + next ~6 Thursdays with dates, TBD topics as "Topic announced soon"; note "New topic announced each week by email."
   - **Topic pillars (curriculum without dates):** Trucks & Equipment · Marketing & Lead Gen · Pricing & Sales · Hiring & Teams · Operations & Systems · Money, Financing & Exit.
   - **Host section:** Lee bio ("hundreds of owners"), photo.
   - **Final CTA.** SEO title/meta for "junk removal masterclass / training".
   - Remove Jenny-specific proof stats (24/7, <1s) — not this product.
6. **Keep unchanged:** admin dashboard, broadcast, CSV export, attendees page, unsubscribe flows, NDJSON registration log.

### 1.3 Verification (before deploy)
- `npm start` locally → preview: register → success state; NDJSON row + subscribers.json written; confirmation dry-run logged with topic + correct date; `/api/webinar` returns featured=2026-07-17 with topic; calendar renders TBDs; countdown correct; mobile stacks clean; unsubscribe round-trip works; admin stats gated.
- Reminder logic: unit-style check that a subscriber registered on 7/13 receives 24h/1h for 7/17 AND for 7/23 (register-once semantics).

### 1.4 Deploy + dev handoff (Monday)
- Render: new web service `jra-masterclass` (starter plan, virginia, 1GB disk at `/var/data`, healthcheck `/api/webinar`, autoDeploy from main) via blueprint `render.yaml`. Env: `DATA_DIR=/var/data`, `PUBLIC_BASE_URL=https://masterclass.junkra.com`, `COMPANY_NAME=Junk Removal Authority`, `COMPANY_POSTAL_ADDRESS="950 Windy Rd. Suite 200, Apex, NC 27502"`, `NOTIFICATION_FROM_EMAIL="Lee Godbold <leegodbold@mailer.junkra.com>"`, `RESEND_API_KEY` (copy value from the jenny-webinar service's env in the Render dashboard), fresh `ADMIN_TOKEN` + `UNSUBSCRIBE_SECRET` (random hex, give to Lee privately), `ATTENDEE_NOTIFY_EMAILS=lee@junkra.com,shane@junkra.com`.
- Add custom domain `masterclass.junkra.com` in Render → **write `HANDOFF.md` for Lee's dev**: exactly one DNS record — `CNAME masterclass → <service>.onrender.com` (DNS-only/grey if Cloudflare) — plus how to verify (site loads, green lock).
- Smoke-test on the onrender URL immediately; re-test on the custom domain once DNS lands.

## Phase 2 — Truck class deck (target: draft Tuesday, review Wednesday)

Same production pipeline as the Jenny deck (HTML→PDF→pptx and/or Google Slides import; navy dark style acceptable, or JRA-brand colors if Lee supplies assets). Full speaker notes on every slide. Run-of-show (~50 min + 10 Q&A):

1. **0–3 The one question** — "What's your end goal: a job you own, or a business that runs without you?" (the spine; every later beat calls back)
2. **3–10 Two paths head-to-head** — honest truck+trailer vs Isuzu table (cost, capacity/trip, unloading, maneuvering, **who can drive it — non-CDL under 26,001 GVWR, automatic, any hire**, brand/pricing power, insurance/risk, resale, duplicability). Resolve via end goal, not specs. Include the pay-twice switching-cost point.
3. **10–18 Spec the rig** — **Lee's recommendation (LOCKED, 2026-07-12): Isuzu NPR-HD, GAS motor, standard cab, backup camera, powered adjustable mirrors.**
   - **VERIFIED specs (2026-07-12 — assert these on the slide):** 6.6L V8 gas (GM L8T), **350 hp / 425 lb-ft**, 8-speed automatic, **GVWR 14,500 lbs (Class 4 — massively under the 26,001-lb non-CDL line; ANY employee with a regular license can drive it)**, body/payload allowance **~8,300–9,000 lbs**.
   - **Gas-over-diesel case (full — make this a strong slide):** (a) **misfuel-proof** — a young/new driver literally can't put gas in a diesel by mistake (a real, expensive fleet risk, gone); (b) **~$5,000 cheaper** purchase price; (c) **no DEF, no regen** → simpler and cheaper maintenance; (d) **fuel at any gas station**; (e) diesel gets slightly better mpg, but gasoline's lower price per gallon offsets it → **net lower total cost** for stop-and-go city junk duty.
   - Still teach: GVWR/non-CDL, new vs used, chassis + STB body/upfit lead times, where to buy.
   - `[LEE CONFIRM on-air]`: the 26,001-lb CDL threshold is federal (state rules / air-brake & other endorsements can vary); the ~$5k gas-vs-diesel delta; exact payload (varies by body/options ordered).
4. **18–28 Build-out walkaround** ⭐ — Lee's VIDEO + **Lee's LOCKED body/build-out spec (2026-07-12), each item tied to why:**
   - **Dual steel walls** — flat metal inner wall (easy dumping, nothing to snag), metal outer wall. NOT plywood like most junk-co builders (plywood needs re-maintenance every few years + looks cheaper).
   - **Smooth flat outer panels** — all support INSIDE the walls, no bends/ribs → a massive clean canvas for graphics.
   - **Electric tarp system, top-mount tarp arms** — smooth canvas, better tarp angle clearing the load = fewer rips. **Tarp controls mounted OUTSIDE the truck** — driver must get out to operate, so he never rips the tarp dragging it blind over snagged debris.
   - **LED lighting, lots of it** + **conspicuity tape** — safety.
   - **Ladders on side AND rear door** — access top of load + tarp.
   - **Toolbox with interior dry storage** (hand tools, sawzalls, moving blankets) + **wheelbarrow rack on top** + **trash-can storage** for empties. **No hooks hanging gear off the truck — looks sloppy.**
   - **Power inverter inside the toolbox** — run power tools anywhere, charge batteries.
   - **Ramp or liftgate; Lee recommends adding a WINCH** — for very heavy items it can beat a liftgate because it brings the item TO the truck (riding mowers, bagsters, hot tubs).
   - **Aluminum ramp, easy in/out; MULTIPLE ramp attachment points** — load whichever section of the box you want.
   - **Dual independent barn doors** — close one without the other.
   - **Rear bumper flush with the box rear** — doubles as a step into the truck / onto the ladder. **Light guards** in front of lights (dump-site damage).
   - **Generally NO underbody boxes** — they eat payload.
   - **STB disclosure (do it HERE, proudly — NOT at the offer):** these bodies are built by **Specialty Truck Bodies (STB)**, Lee's sister company — **250+ junk removal trucks built since 2020**. Frame it as the credential, not a disclaimer ("that's exactly why I know where every other builder cuts corners"). `[LEE CONFIRM]`: the 250+ count is current before airing.
   - **Graphics doctrine:** massive memorable LOGO (largest element) + phone number + website. Nothing else. Name should say what you do — if it doesn't, change it, or add "Junk Removal." No filler text: viewers get a few seconds; extra text distracts. They'll Google you.
   - Narrative link: the smooth-wall body exists FOR the graphics — the truck is a rolling billboard by design (bridges into the graphics doctrine).
5. **28–42 The money** — sequence shrinks the number: (a) sticker: builds start at **$91,000**, said plainly; (b) **Section 179/bonus depreciation** worked example (~30% rate → ~$27k year-one tax savings → effective ~$63k) `[PAUL/CPA CONFIRMS ON-AIR]`; (c) **Paul Lilley segment (8–10 min hard cap)**: full purchase + financing process, down-payment norms, the **2-year-in-business threshold** + workarounds (large down payment, business history, strong personal credit, other income); (d) **the $35/job truck fund**: 1,000 jobs/yr → $35k/yr; grid at 60/85/125 jobs/mo; "truck #1 buys truck #2 in cash in ~2.6 years"; within 12 months = a serious down payment → tees the offer.
6. **42–46 Safety + maintenance punch list** — condensed; explicitly trailer future episodes ("fleet uptime is its own class — you're on the list").
7. **46–50 The offer + close** — offer slide EXACTLY per the locked structure (6 slots · $100 credited · 12-month price lock on $91k+ builds · $2,500 off · +$2,500 while 2026s last through STB = $5,000). The 3-step pitch (lock → fund the down payment → order; Paul finances). Process: "want in? say so in chat / stay on after — we'll send a **QuickBooks payment request** while you're here." End-goal callback close.
8. **Q&A plants:** "Really no CDL?" · "I'm under 2 years in business — what are my options?" · "Used vs new?" · "Why not a dump trailer?"

## Phase 3 — Announcement broadcast (Wednesday 7/15)

Send via the **jennycallagent.com** admin (`POST /api/admin/broadcast`, its own ADMIN_TOKEN — from the Render dashboard env or Lee) to its active list (~20 owners, consented). Subject direction: "New free weekly series: the Junk Removal Masterclass — first class Friday (trucks)". Body: what the series is, Friday's truck class bullets (incl. Paul + real-rig walkaround + a founders-only truck offer), CTA → register at masterclass.junkra.com. **Test-send to lee@junkra.com first; Lee approves before the list send.** Do not email unsubscribed records. Also give Lee 2–3 short social captions with the link.

## Phase 4 — Offer collateral (by Thursday 7/16)

1. **Terms one-pager** (PDF/page): deposit $100, non-refundable, credited to purchase; 12-month price lock from deposit date on the current published price of qualifying builds; $2,500 discount on order in-window; additional $2,500 only if a 2026 model is available **to order through STB** at order time; 6 slots; one per customer; non-stackable; deposit via QuickBooks payment request.
2. **Paul Lilley briefing doc:** his 8–10 min scope, the 3 planted questions, the hand-off cues, what NOT to cover (no rate quotes as promises).
3. **Walkaround shot list** for Lee (deliver Monday so he can film early): dump cycle full raise/lower, ramp deploy + walk-up, winch pull (hot tub if possible), toolbox open + layout tour, rear bumper + light guards close-ups, cab interior features, wrap 360°, 30-sec "why this truck" to camera.
4. **Post-deposit follow-up sequence** (deposits are options; options convert on calls): within 48h — personal call from Lee/truck team + spec sheet + Paul pre-qual intro + build-slot timeline email.

## Definition of done

- [ ] Site live on masterclass.junkra.com (or onrender URL + HANDOFF.md delivered to dev), register→confirm→reminders verified, featured class = 7/17 Trucks, calendar shows Thursday cadence with TBDs
- [ ] Deck delivered (pptx + Google Slides), offer slide matches locked terms word-for-word, all `[LEE CONFIRM]` markers resolved or flagged in notes
- [ ] Broadcast approved by Lee and sent; social captions delivered
- [ ] Terms one-pager, Paul briefing, shot list, follow-up sequence delivered
- [ ] Nothing in the jenny-webinar repo/service modified

## Needed from Lee (blockers marked ⛔) — updated 2026-07-12 evening

1. ~~GO~~ ✅ **GO given — Opus agents, tonight.**
2. ~~Zoom~~ ✅ `https://us02web.zoom.us/j/86365369540`
3. Paul Lilley — Lee talking to him. Briefing doc = our deliverable regardless.
4. ~~Truck content~~ ✅ NPR-HD gas + full body spec captured above. Still open: real price examples beyond "$91k starting," insurance requirement numbers, STB 2026 inventory count (for honest scarcity).
5. Walkaround footage — shot list delivered tonight (built from Lee's body spec); film by Wednesday.
6. JRA brand assets (logo/colors) — optional; blue style ships otherwise.
7. ~~QB owner~~ ✅ **Shane fires the QuickBooks payment requests.** Rec: Shane pre-creates 6 draft requests before the webinar so close-time is send-only.
