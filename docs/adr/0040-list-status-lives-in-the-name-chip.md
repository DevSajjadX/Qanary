# 0040. A list's status lives in its name chip; row labels are plain text

- **Status:** accepted (supersedes the Critical badge and boxed labels of ADR-0032)
- **Date:** 2026-10-02
- **Deciders:** Esi-Abolfazl

## Context

ADR-0032 put a **Critical** badge before the count and a boxed **Blocked** / **Down** on rows. In use:

- The badge read as a warning on a healthy list: Critical is a setting, not a problem.
- A down list showed its alarm in a separate pill, away from the name the eye goes to first.
- Boxed, bold, shadowed row labels outshouted the list header.

Yellow means warn and red means down in this app, so neither can mark "Critical, and fine".

## Decision

- **Critical mark** — a shield inside the name chip (`.list-name-crit`), green (`--state-up`) while
  the list is healthy: watched, and OK.
- **A Critical list fully down** — the whole chip turns solid red and pulses, the shield gains a "!"
  (`.list-name-alarm`). The separate pill is gone.
- **Any other list fully down** — the chip takes a soft red tint and a thin, slow ring
  (`.list-name-down`): seen, but lower priority.
- **Row labels** — **Blocked**, **Down** and **TCP only** are thin text in their status colors, no
  border, weight or shadow.

## Alternatives considered

- **Green-tinted chip with a ring** — the most visible, but reads as an "up" badge competing with
  the rows' green dots.
- **Brighter gray shield** — barely distinguishable from the old one.
- **Brand yellow accent** — yellow already means warn.

## Consequences

**Positive:** one place to look per list; Critical no longer looks like trouble.

**Negative / accepted trade-offs:** a healthy Critical list relies on a 13px green shield; color
alone carries the difference between the two down states (the "!" and the motion back it up).

**Follow-ups:** none.
