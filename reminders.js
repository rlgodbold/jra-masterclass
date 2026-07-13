// In-process reminder scheduler. Every few minutes it checks the upcoming
// masterclass sessions and sends 24h / 1h reminder emails to the series list.
// Idempotent (flags persist on disk), so restarts never double-send.
//
// REGISTER-ONCE SEMANTICS: a subscriber joins the SERIES, not a single date.
// So we iterate EVERY active subscriber for each near-start session — the 24h
// email doubles as that week's topic announcement. Reminder state is still
// tracked per (session, subscriber), so a person gets each week's 24h + 1h
// exactly once and restarts/multiple future sessions never double-send.

import { activeSubscribers, markReminderSent, reminderSent } from "./store.js";
import { sendReminderEmail } from "./email.js";
import { upcomingSessions } from "./sessions.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const TICK = 5 * MIN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let running = false;

export async function runReminderTick() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    let sent = 0;
    // Check every still-open session; only the one(s) near their start match a
    // window. Reminder state is tracked per (session, subscriber), so restarts
    // and multiple future sessions never cross-fire or double-send.
    for (const session of upcomingSessions(now)) {
      const start = +new Date(session.startsAtISO);
      // 24h window: from 24h out until 3h out (last-minute signups just get the 1h).
      const send24 = now >= start - 24 * HOUR && now <= start - 3 * HOUR;
      // 1h window: from 75 min out until start.
      const send1 = now >= start - 75 * MIN && now <= start;
      if (!send24 && !send1) continue;

      // Register-once: everyone on the active series list gets each class's
      // reminders (not just the people who registered on this specific date).
      for (const s of activeSubscribers()) {
        if (send24 && !reminderSent(session.id, s.email, "r24")) {
          const r = await sendReminderEmail({ name: s.name, email: s.email, kind: "24h", session });
          if (r?.ok !== false) markReminderSent(session.id, s.email, "r24");
          sent++;
          await sleep(150);
        }
        if (send1 && !reminderSent(session.id, s.email, "r1")) {
          const r = await sendReminderEmail({ name: s.name, email: s.email, kind: "1h", session });
          if (r?.ok !== false) markReminderSent(session.id, s.email, "r1");
          sent++;
          await sleep(150);
        }
      }
    }
    if (sent) console.log(`[reminders] sent ${sent} reminder email(s)`);
  } catch (e) {
    console.error("[reminders] tick error:", e.message);
  } finally {
    running = false;
  }
}

export function startReminderScheduler() {
  runReminderTick();
  setInterval(runReminderTick, TICK);
  console.log("[reminders] scheduler started (every 5 min)");
}
