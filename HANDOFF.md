# DNS handoff — masterclass.junkra.com

The registration site for the **Junk Removal Masterclass Series** is already built,
deployed, and running on Render at:

> **https://jra-masterclass.onrender.com**

It just needs **one DNS record** to go live on the real domain. That's the whole job.

---

## The one record to add

At the DNS provider for `junkra.com`, add:

| Type  | Name / Host   | Value / Target                  | Proxy / TTL              |
|-------|---------------|---------------------------------|--------------------------|
| CNAME | `masterclass` | `jra-masterclass.onrender.com`  | **DNS only** · TTL Auto  |

- **If DNS is on Cloudflare:** set the proxy status to **DNS only (grey cloud)**, not
  proxied (orange). Render terminates TLS itself; leaving it orange will break the cert
  handshake.
- Just the subdomain `masterclass` — no apex/root change, nothing else to touch.

## After the record is added

1. **TLS is automatic.** Once DNS resolves, Render issues a Let's Encrypt certificate on
   its own — no action needed. Allow up to ~30–60 min for propagation + cert issuance.
2. **Verify:**
   - `dig +short masterclass.junkra.com` → should return the Render host / its IPs.
   - Open **https://masterclass.junkra.com** → the masterclass landing page loads with a
     valid padlock (green lock), and the "Next class" shows **Friday, July 17 · The Junk
     Truck Masterclass**.
   - `curl -s https://masterclass.junkra.com/api/webinar` → JSON with
     `"current": { "id": "2026-07-17", "topic": "The Junk Truck Masterclass", ... }`.

The custom domain `masterclass.junkra.com` is **already registered on the Render service**
(showing "unverified" only because DNS isn't pointed yet — it flips to verified
automatically once the CNAME resolves).

## If anything looks off
- Domain stuck "unverified" after an hour → re-check the CNAME value is exactly
  `jra-masterclass.onrender.com` and (Cloudflare) the record is **grey cloud / DNS only**.
- Everything else (app, email, disk, env) is already configured on Render — this DNS record
  is the only outstanding item.
