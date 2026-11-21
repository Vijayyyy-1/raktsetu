# Backend Issues

Review of `backend/` (NestJS + Prisma API), 21 Nov 2026. Found by reading the code and exercising the API locally; none of these are fixed yet.

## Correctness — fix before the demo

### 1. First-time donors are never matched
- **Where:** `backend/src/common/matching.ts` → `eligible()`
- **Problem:** a donor with no `lastDonationAt` is treated as *not eligible*. Most students have never donated, so a college registry would match almost no one. The sign-up form allows leaving the date empty.
- **Fix:** treat a missing date as eligible:
  ```ts
  return !lastDonationAt || now.getTime() - lastDonationAt.getTime() >= DONATION_WAIT_DAYS * 86400000;
  ```
  Also update the `reason` text in `donors.service.ts` → `eligibility()`.

### 2. Donation interval is the US rule (56 days)
- **Where:** `backend/src/common/matching.ts` → `DONATION_WAIT_DAYS = 56`
- **Problem:** India's NBTC guideline is ~90 days (men) / 120 days (women) between whole-blood donations.
- **Fix:** set `DONATION_WAIT_DAYS = 90` (the model has no sex field, so use the shorter safe common rule). Update the 56-day mentions in `README.md` and `architecture-and-api-overview.md`.

### 3. Unverified requests are public
- **Where:** `backend/src/requests/requests.service.ts` → `listActive()` and `get()`
- **Problem:** the public list returns requests before a coordinator verifies them, so a fake "urgent" request is visible to everyone immediately — the WhatsApp-forward problem again. The new frontend hides them from donors, but the API still returns them.
- **Fix:** add `verified: true` to the public `where` clauses. Coordinators will then need their own list that includes unverified requests (see gaps below).

## Privacy

### 4. Match results expose every donor's phone and email
- **Where:** `backend/src/requests/requests.service.ts` → `match()`
- **Problem:** the plan says contact details should only be released through a separate, deliberate action. Today every match returns decrypted phone + email. The frontend only hides them on screen; the browser already has them.
- **Fix:** remove `phone`/`email` from match results; add `POST /v1/blood-requests/:id/matches/:donorId/contact` (coordinator only) that returns one donor's contact and logs who asked and when.

## Minor

### 5. Matching loads every compatible donor into memory
- **Where:** `match()` — filters distance in JS after `findMany`.
- **Impact:** fine for a few thousand donors; no database-level location pre-filter.
- **Later:** add a latitude/longitude bounding box to the query (or PostGIS) before computing exact distance.

### 6. Deactivated accounts work until their token expires
- **Where:** `backend/src/common/auth.ts` → `JwtAuthGuard`
- **Impact:** the JWT isn't re-checked against `Account.isActive`, so a deactivated user keeps access for up to 1 hour.

### 7. Broken README link — ✅ fixed
- `README.md` linked to `docs/architecture-and-api-overview.md`; the file is at the project root. Corrected during the folder restructure.

## Missing features (gaps, not bugs)

| Frontend need | Status in API |
|---|---|
| Coordinator donor registry | No `GET /donors` endpoint — registry screen removed from the frontend |
| Closed requests (fulfilled / cancelled / expired) | List returns only open requests — "Closed" tab shows only this session's |
| Coordinator view of unverified requests (needed once #3 is fixed) | No coordinator-only list endpoint |
| Notify donors and track replies ("Coming" / "Can't") | Not implemented — no notifications or response records |
| Allocate requested `units` across donors / reserve donors | Not implemented — matching sorts by distance only |

## Suggested order
1. Issues **1–3** — each is a one-to-two line change.
2. Issue **4** — new contact endpoint + frontend "Contact" button calls it.
3. Coordinator list endpoints (all requests, donors) to restore the Closed tab and registry screen.
