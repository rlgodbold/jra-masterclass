# JRA — Junk Removal Masterclass Series (registration site)

Single-page registration site for JRA's free **weekly** live masterclass for junk removal
owners. Captures **name + email**, adds the person to the whole series (register once →
every week's class), persists every signup to an append-only list, sends a confirmation
email (Resend), and drives 24h + 1h reminders that double as each week's topic announcement.

Distinct from the Jenny AI-voice-agent masterclass (jennycallagent.com). Cadence: **Tue = Jenny, Thu = this series** (launch class is Fri 7/17: The Junk Truck Masterclass).

## Run locally
```bash
npm install
npm start          # http://localhost:8080
```
Registrations are written to `./data/registrations.ndjson` (gitignored). Without
`RESEND_API_KEY` set, email is a no-op (logged, not sent) so dev works offline.

## The schedule (the only recurring edit)
Open **`sessions.js`**. Each row is `[date, offset, topic|null]`:
- `date` — `YYYY-MM-DD`, all classes at 2:30 PM ET.
- `offset` — ET offset baked per row (`-04:00` EDT through Nov 1 2026, `-05:00` EST after).
- `topic` — the week's topic, or `null` → the page/email renders "Topic announced soon".

The site auto-features the soonest session that hasn't ended and archives the rest. Fill in
a topic and commit → Render redeploys; the hero, spotlight, calendar, countdown, and the 24h
reminder (the weekly announcement) all read from it. No per-week re-registration.

## Where signups go
- File: `data/registrations.ndjson` (one JSON object per line). On Render this lives on the
  mounted disk at `/var/data`.
- Subscriber list + consent/opt-out state: `data/subscribers.json`; audit log `data/events.ndjson`.
- **Admin dashboard:** `/admin` (paste `ADMIN_TOKEN`) — counts, CSV export, email broadcast.
- **CSV:** `GET /api/admin/export.csv?token=ADMIN_TOKEN`
- Local CSV dump: `npm run export`

## Deploy (Render)
`render.yaml` is a blueprint (starter plan, 1 GB disk at `/var/data`, healthcheck `/api/webinar`,
autoDeploy from `main`). In the Environment tab set the secrets (`RESEND_API_KEY`, `ADMIN_TOKEN`,
`UNSUBSCRIBE_SECRET`). Point `masterclass.junkra.com` at the service — see `HANDOFF.md`.

## Compliance (built in — don't remove)
Every marketing email carries `COMPANY_POSTAL_ADDRESS` + a working one-click unsubscribe
(`List-Unsubscribe` headers). Unsubscribes are honored immediately. The broadcast endpoint
refuses to send without a postal address set.

## Zoom
One reusable series join link in `config.js` (`zoomJoinUrl`) — same URL every week, delivered
in the success screen + confirmation + both reminders.
