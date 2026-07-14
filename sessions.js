// ─────────────────────────────────────────────────────────────────────────────
//  MASTERCLASS SCHEDULE — the recurring weekly series lives here.
//
//  The site AUTO-FEATURES the soonest session that hasn't ended yet and archives
//  the ones that have. Add or remove a line to change the schedule — no weekly
//  edits, no redeploys between sessions.
//
//  All sessions run at 2:30 PM ET. Eastern is -04:00 (EDT) through Nov 1, 2026,
//  then -05:00 (EST) — that offset is baked into each row below. Each session's
//  id is simply its date (YYYY-MM-DD). Each row also carries a TOPIC (null until
//  announced → the page/email renders "Topic announced soon").
// ─────────────────────────────────────────────────────────────────────────────

import { webinar } from "./config.js";

const AT = "T14:30:00"; // 2:30 PM local (Eastern)
const EDT = "-04:00"; // daylight time, through Nov 1 2026
const EST = "-05:00"; // standard time, Nov 2 2026 onward

// [date, offset, topic|null]. Friday 7/17 launch (The Junk Truck Masterclass),
// then every Thursday. Skipped holiday weeks: 11/26 (Thanksgiving), 12/24, 12/31.
const DATES = [
  ["2026-07-17", EDT, "The Junk Truck Masterclass"], // launch (Friday)
  ["2026-07-23", EDT, "Own the Map: Ranking on Google Maps"], // every Thursday from here
  ["2026-07-30", EDT, null],
  ["2026-08-06", EDT, null], ["2026-08-13", EDT, null], ["2026-08-20", EDT, null], ["2026-08-27", EDT, null],
  ["2026-09-03", EDT, null], ["2026-09-10", EDT, null], ["2026-09-17", EDT, null], ["2026-09-24", EDT, null],
  ["2026-10-01", EDT, null], ["2026-10-08", EDT, null], ["2026-10-15", EDT, null], ["2026-10-22", EDT, null], ["2026-10-29", EDT, null],
  ["2026-11-05", EST, null], ["2026-11-12", EST, null], ["2026-11-19", EST, null], // skip 11/26 Thanksgiving
  ["2026-12-03", EST, null], ["2026-12-10", EST, null], ["2026-12-17", EST, null], // skip 12/24 + 12/31
];

// ─────────────────────────────────────────────────────────────────────────────
//  PER-CLASS SPOTLIGHT — the rich "next class" block on the homepage.
//  Keyed by session id (date). Optional: a session with no entry here renders a
//  graceful generic card ("Topic announced soon — register once, we'll email
//  it"). The homepage reads this from /api/webinar, so there is NO hardcoded
//  class copy in the front-end — add a class's story here and it just appears.
//
//    { headline, blurb, bullets:[...] }
//  headline → the big "This <day>: …" line   blurb → one-sentence setup (may be
//  "" to omit)   bullets → checklist of what the class covers (HTML allowed,
//  e.g. <b>…</b>; kept honest — no guarantees).
// ─────────────────────────────────────────────────────────────────────────────
const SPOTLIGHTS = {
  "2026-07-17": {
    headline: "This Friday: The Junk Truck Masterclass",
    blurb: "",
    bullets: [
      "Isuzu vs. truck-and-trailer — settled by <b>your</b> end goal, not by specs",
      "Spec the right cab &amp; chassis for junk duty",
      "The build-out that pays for itself: ramps, winch, lift gate, toolbox, bumper, light guards",
      "Financing with guest Paul Lilley — Section 179, down payments, and the 2-year threshold",
      "The $35/job truck fund: how one truck pays for the next",
      "A walkaround of a real JRA rig",
      "A founders-only truck offer for live attendees",
    ],
  },
  "2026-07-23": {
    headline: "This Thursday: Own the Map",
    blurb:
      "For local junk removal, the Google Maps &ldquo;map pack&rdquo; is where the jobs are. This week we get your Google Business Profile ranking where buyers actually look.",
    bullets: [
      "How Google's map pack — and the new AI answers (Ask Maps) — decide who shows up",
      "The review engine that actually moves rank (not just star count)",
      "The profile foundation most owners get wrong",
      "Local links that punch above their weight",
      "A self-audit you run live on your own profile",
      "A free checklist to take with you",
    ],
  },
};

export const sessions = DATES.map(([date, off, topic]) => ({
  id: date,
  startsAtISO: `${date}${AT}${off}`,
  topic: topic || null,
  spotlight: SPOTLIGHTS[date] || null,
  zoomJoinUrl: webinar.zoomJoinUrl, // one reusable link for the whole series
}));

export const DURATION_MS = (webinar.durationMinutes || 60) * 60 * 1000;

export function sessionEnd(s) {
  return +new Date(s.startsAtISO) + DURATION_MS;
}

// The featured session = the soonest one that hasn't ended yet (null once the
// series is over).
export function currentSession(now = Date.now()) {
  return sessions.find((s) => sessionEnd(s) > now) || null;
}

// Every session still open for registration (not yet ended), soonest first.
export function upcomingSessions(now = Date.now()) {
  return sessions.filter((s) => sessionEnd(s) > now);
}

export function getSession(id) {
  return sessions.find((s) => s.id === id) || null;
}

// The date portion of a stored ISO start is the session id.
export function idFromISO(iso) {
  return String(iso || "").slice(0, 10) || null;
}

// Human label for a session's topic (null → "Topic announced soon").
export function topicLabel(session) {
  return session?.topic || "Topic announced soon";
}

// Formatted date/time (+topic) for a session (or a raw ISO). Always Eastern.
// e.g. { dateStr:"Friday, July 17", timeStr:"2:30 PM", full:"… · 2:30 PM ET",
//        topic:"The Junk Truck Masterclass" }
export function formatWhen(isoOrSession) {
  const iso = typeof isoOrSession === "string" ? isoOrSession : isoOrSession?.startsAtISO;
  const topic = typeof isoOrSession === "string" ? null : isoOrSession?.topic || null;
  if (!iso) return { dateStr: "", timeStr: "", full: "", topic };
  const start = new Date(iso);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York",
  }).format(start);
  const timeStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
  }).format(start);
  return { dateStr, timeStr, full: `${dateStr} · ${timeStr} ${webinar.timezoneLabel}`, topic };
}
