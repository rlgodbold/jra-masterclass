// ─────────────────────────────────────────────────────────────────────────────
//  MASTERCLASS CONFIG — global settings shared by EVERY session in the series.
//  The recurring SCHEDULE (dates/times/topics) lives in sessions.js. You rarely
//  touch this file — only to change branding, the standard time zone, or the
//  reusable Zoom link.
// ─────────────────────────────────────────────────────────────────────────────

export const webinar = {
  // Display title + the promise (used in headline + <title> + emails)
  title: "The Junk Removal Masterclass Series",
  promise:
    "A free weekly live masterclass for junk removal owners — one topic a week (trucks, marketing, pricing, hiring, operations), taught live by Lee Godbold.",

  durationMinutes: 60,
  timezoneLabel: "ET", // shown to the user next to the time

  // ── Zoom ──────────────────────────────────────────────────────────────────
  // ONE reusable join link for the whole recurring series (a Zoom recurring /
  // "No Fixed Time" meeting works perfectly — same URL every week). Registrants
  // receive it in the success screen + confirmation + reminder emails. A session
  // in sessions.js may override it, but normally they all share this one.
  zoomJoinUrl: "https://us02web.zoom.us/j/86365369540",

  // ── Host / brand ──────────────────────────────────────────────────────────
  brandName: "JRA",
  hostName: "Lee Godbold",
  hostTitle: "Founder, Junk Removal Authority",
  contactEmail: "lee@junkra.com",
};
