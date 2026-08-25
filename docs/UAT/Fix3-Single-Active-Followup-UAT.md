# UAT — Fix #3: Single Active Follow-up + Mobile Scheduling

**Feature:** A lead has at most one ACTIVE follow-up; the newest scheduling action wins;
terminal statuses clear follow-ups; the schedule flow works on mobile.
**Build under test:** commit `d893ad9` (branch merged to `main`).
**Status:** Backend verified on production (migration applied, invariants hold). This UAT covers
the **user-facing behaviour**.

---

## How to run this UAT

- **Environment:** Use a **UAT/staging Neon branch** (a copy of production) with the app pointed at
  it — do **not** run write scenarios against production. A branch can be created in the Neon console
  (Branches → New branch from production) and its `DATABASE_URL`/`DIRECT_URL` set on a preview/UAT
  deployment.
- **Accounts needed:** one Sales/agent user and one Admin user.
- **Test data:** pick (or create) 3–4 active leads you can freely modify. Note their lead numbers below.
- Mark each row **Pass / Fail** and add notes. Anything Fail → capture a screenshot + lead number.

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Environment / URL | |
| App version / commit | d893ad9 |
| Sample lead(s) | |

---

## 1. Single active follow-up — newest action wins

| # | Steps | Expected | Result | Notes |
|---|-------|----------|:------:|-------|
| 1.1 | Open a lead with no follow-up. Schedule one for **25th**. | Card header badge shows `Active: 25 <mon> · <type>`. Exactly one follow-up shown as active. | | |
| 1.2 | Schedule another for **28th** (later date). | Toast: `Follow-up moved 25 … → 28 …`. Badge now shows 28th. Still exactly one active. | | |
| 1.3 | Schedule another for **26th** (earlier than 28th). | Newest action wins → badge shows **26th** (not 28th). Still one active. | | |
| 1.4 | Expand any "past follow-ups" history on the lead. | The 25th and 28th appear as **Superseded** history (not deleted, not active). | | |

## 2. Terminal statuses clear the follow-up

For each status, start from a lead that **has** an active follow-up.

| # | Steps | Expected | Result | Notes |
|---|-------|----------|:------:|-------|
| 2.1 | Mark lead **Lost**. | Header shows `No active follow-up`; lead disappears from Focus Queue, Follow-ups list, CRM & Sales dashboards, and the follow-ups export. | | |
| 2.2 | Mark another lead **Won**. | Same: zero active follow-ups, absent from all queues/dashboards. | | |
| 2.3 | Move a lead to **On Hold**. | Same. | | |
| 2.4 | Move a lead to **Recycle**. | Same. | | |
| 2.5 | Mark a lead **Invalid Lead** (Activity → Junk). | Same. | | |
| 2.6 | Check the daily digest / overdue notifications next run. | None of the above leads are included. | | |

## 3. Reactivation requires a new follow-up date

| # | Steps | Expected | Result | Notes |
|---|-------|----------|:------:|-------|
| 3.1 | Take an **On Hold** lead → change stage to **Prospect** (or any active stage). | UI prompts for a **follow-up date + type** in the same step; cannot proceed without a date. | | |
| 3.2 | Provide a date and confirm. | Lead re-enters the pipeline with exactly one active follow-up on that date; badge updates. | | |
| 3.3 | Repeat from a **Recycle** lead. | Same prompt + behaviour. | | |

## 4. Queues show one row per lead (no duplicates)

| # | Steps | Expected | Result | Notes |
|---|-------|----------|:------:|-------|
| 4.1 | Open **Focus Queue** (as an agent). | Each lead appears **once**. No "29 FUs / 38 FUs" style inflated counts. | | |
| 4.2 | Look at the count chip on a card. | Reads `N past follow-ups` (history), not a misleading open-item count. The active date is shown prominently. | | |
| 4.3 | Check the overdue / today / 3d / 7d stat counts. | Each counts one active follow-up per lead; no lead double-counted; no terminal-status leads included. | | |

## 5. Active date is visible while scheduling

| # | Steps | Expected | Result | Notes |
|---|-------|----------|:------:|-------|
| 5.1 | Lead detail → Follow-ups card header. | Badge `Active: <date> · <type>` (red when overdue) or muted `No active follow-up`. | | |
| 5.2 | Open the **Schedule Follow-up** dialog on a lead that already has one. | Banner: *"Current active follow-up: <date> (<type>). Scheduling a new date will replace it."* | | |
| 5.3 | In Focus Queue, open **Schedule Next**, and the in-queue **Contacted / Schedule Next / Site Visit Done** forms. | Same "current active follow-up" banner shown. | | |
| 5.4 | Complete a scheduling that replaces an existing one. | Toast names the replaced date: `Follow-up moved X → Y`. | | |

## 6. Mobile scheduling (real Android Chrome, ~360×640)

| # | Steps | Expected | Result | Notes |
|---|-------|----------|:------:|-------|
| 6.1 | Open a lead, scroll to the bottom. | Page scrolls fully; nothing hidden under the browser toolbar. | | |
| 6.2 | Tap **Schedule Follow-up**. | Opens on the **first tap** (bottom sheet). No dead taps, no double-tap needed. | | |
| 6.3 | With the on-screen keyboard open, fill Type/Priority/Date/Time/Notes and reach **Schedule**. | Every field and the Schedule button are reachable (sheet scrolls). | | |
| 6.4 | Use the separate **Date** and **Time** inputs. | Both work; time defaults to 09:00. | | |
| 6.5 | Tap Done / Done+Next / delete controls. | Comfortable tap targets (no mis-taps). | | |

## 7. History integrity (spot check)

| # | Steps | Expected | Result | Notes |
|---|-------|----------|:------:|-------|
| 7.1 | After several reschedules on one lead, review its follow-up history. | Old rows remain as **Superseded**/**Completed**/**Cancelled** — none disappeared. | | |
| 7.2 | (Admin, optional) Delete an active follow-up. | It is cancelled (kept as history) and the lead mirror clears; it leaves the active view. | | |

## 8. Regression — unrelated flows unaffected

| # | Steps | Expected | Result | Notes |
|---|-------|----------|:------:|-------|
| 8.1 | Mark a lead **Won** with settlement value + commission %. | Won flow, revenue/commission unchanged. | | |
| 8.2 | Create a brand-new lead with a follow-up date + type. | Lead created with exactly one active follow-up; badge shows it. | | |
| 8.3 | Bulk Excel update setting follow-up dates. | Each updated lead ends with one active follow-up (or cleared, if moved to a terminal status). | | |

---

## Sign-off

| Role | Name | Pass/Fail | Date |
|---|---|---|---|
| Tester | | | |
| Product owner | | | |

**Overall UAT result:** ☐ Pass ☐ Pass with notes ☐ Fail

**Notes / defects:**
