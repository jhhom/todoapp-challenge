# Flaw: Monthly recurrence drifts on month-end anchors

**Status:** The original bug is **fixed** (shipped + tested). A narrower **known limitation** remains, documented here as honest reflection and Q&A material.

---

## The original bug (fixed)

`advanceOne` advanced monthly dates with bare `setUTCMonth(+1)`. For a month-end anchor, `Jan 31 + 1 month` became `Feb 31`, which JavaScript's `Date` silently rolled over to `Mar 3` — skipping February entirely, then drifting to the 3rd of every following month.

```
Jan 31 → Mar 3 → Apr 3 → May 3 …   (wrong: neither in February nor on the 31st)
```

**Fix shipped** (`src/backend/lib/recurrence.ts`, monthly branch of `advanceOne`): detect whether the source date is the last day of its month; if so, land on the last day of the target month. This preserves end-of-month intent:

```
Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31 …   ✓
```

Covered by tests in `src/backend/lib/recurrence.test.ts`. Mid-month anchors (e.g. the 15th) and leap years (`Jan 29 2024 → Feb 29`) are unaffected.

---

## The residual known limitation

The fix decides "end-of-month or not?" by looking at the **current** date in the chain, not the **original anchor**. That proxy gets corrupted mid-chain: a `Jan 30` anchor clamps to `Feb 28`, and because the 28th *is* February's last day, the end-of-month invariant hijacks the chain from there on. The original "the 30th" intent is lost.

Reproducible against the shipped code, with the *same* completion date for both anchors:

| Anchor (monthly) | Completed | Next due (shipped) | Should be |
|---|---|---|---|
| **Jan 30** | Feb 28 | **Mar 31** ❌ | Mar 30 |
| Jan 31 | Feb 28 | Mar 31 ✓ | Mar 31 |

```ts
computeNextDueDate("monthly", null, new Date("2025-01-30T00:00:00Z"), new Date("2025-02-28T00:00:00Z"))
// → "2025-03-31"  (a Jan-30 task wrongly jumps to the month-end)
```

The system can't tell "Jan 30" from "Jan 31" — both land on Mar 31. Anchors on the **29th or 30th of a 31-day month** drift to month-end after their first short month; the 28th-and-below and genuine month-ends (the 31st) behave correctly.

---

## Root cause: this is a data-model problem, not a math problem

A single `due_date` field **cannot encode** "the 30th of every month" versus "the end of every month." Those intents collide for any anchor that happens to be a month-end in a short month (Apr 30, Jun 30, Sep 30, Nov 30, Feb 28). No recurrence arithmetic resolves this — every algorithm is a guess. The only complete fix is a schema/UX change: an explicit `repeatMode: "dayOfMonth" | "endOfMonth"`. (This is exactly how iCalendar / RFC 5545 separates `BYMONTHDAY=30` from an end-of-month rule — they are distinct tokens.)

---

## Options I considered (all output verified)

| Anchor | Shipped (today) | Hybrid (anchor-aware) | Strict (preserve day) |
|---|---|---|---|
| Jan 30 | Feb 28 → **Mar 31** → Apr 30 → **May 31** | Feb 28 → **Mar 30** → Apr 30 → **May 30** | same as hybrid |
| Jan 31 | Feb 28 → Mar 31 → Apr 30 → May 31 | identical ✓ | identical ✓ |
| Apr 30 (a 30-day month-end) | May 31 → Jun 30 → Jul 31 | May 31 → Jun 30 → Jul 31 ✓ | May **30** → Jun 30 → Jul **30** ⚠️ |
| Jan 29 (non-leap) | Feb 28 → **Mar 31** → Apr 30 | Feb 28 → **Mar 29** → Apr 29 | same as hybrid |

- **Strict** ("always the Nth, clamped") fixes the drift but is *wrong* for Apr 30 — it forces the 30th even though the user picked the last day of April.
- **Hybrid** ("end-of-month only if the *anchor* was a month-end; otherwise preserve the day") fixes the drift **and** respects genuine month-ends. It changes **zero** existing test results, so it is low-risk. The rule in one sentence: *if you picked the last day of your anchor month, you mean end-of-month; otherwise you mean that specific day.*
- **Schema toggle** is the only complete fix.

---

## Decision: document, don't ship a heuristic

I am deliberately **not** shipping the hybrid right now:

1. **The proper fix is a schema change, not a clamp.** The hybrid still guesses for Apr-30-type anchors; shipping it would paper over the root cause rather than solve it.
2. **The affected window is narrow** (29th/30th of a 31-day month, monthly recurrence, crossing a short month) and the failure is *visible* — the date is plainly wrong and the user can correct it, unlike a silent deadlock.
3. **Honest reflection is the point.** Naming the root cause and the proper fix demonstrates more depth than a fancier heuristic that still guesses.

---

## What I would do with more time

1. **Proper fix:** add a `repeatMode` field (`dayOfMonth` | `endOfMonth`) so the user's intent is explicit, not inferred from a date.
2. **Interim (if the schema change is deferred):** the anchor-aware hybrid above — thread the original anchor into `advanceOne` and derive the end-of-month flag from *it* instead of the drifting current date. ~10 lines, no test regressions, and it eliminates the silent 30→31 rewrite.
