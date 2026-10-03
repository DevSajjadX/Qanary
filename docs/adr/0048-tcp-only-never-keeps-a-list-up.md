# 0048. A TCP-only endpoint never keeps a list up

- **Status:** accepted (amends ADR-0021's rollup rule and ADR-0023's fully-blocked rule)
- **Date:** 2026-10-03
- **Deciders:** Esi-Abolfazl

## Context

ADR-0021 made a wildcard endpoint TCP-only: it reads `reachable` when the TCP connect succeeds
and never runs TLS. It also made `reachable` a non-failure, so it could never count towards a
list's `all_down`.

Filtering usually lets TCP through and breaks TLS, which is exactly what `blocked` means. A
wildcard can't read `blocked`, because it has no TLS leg. So when a whole list is filtered, its
normal endpoints read `blocked` and its wildcards read `reachable`. One wildcard kept the list
out of `all_down`, and so out of the red name chip, the orb's alarm and the outage alert. For
the same reason a list with a wildcard could never be "fully blocked" (ADR-0023).

This was a known gap, left as a follow-up in ADR-0024. Cut-off (`is_cut_off`) already treated `reachable` as no evidence: it was down only when
nothing was `up`, nothing was `checking` and something failed.

## Decision

**A TCP-only `reachable` endpoint is no evidence either way.** One rule, `disconnected` in
`models.rs`, says whether a set of endpoints is disconnected: none is `up`, none is
`checking`, and at least one is `blocked` or `down`.

- A Service's `fully_failing` is `disconnected` over its endpoints.
- A List's `all_down` (`list_all_down`) is `disconnected` over every endpoint in the list, so a
  service of only wildcards no longer holds the list up.
- Cut-off is `disconnected` over every endpoint everywhere.
- The frontend's fully-blocked test (`isFullyBlocked` in `transitions.ts`) applies the same
  idea: at least one `blocked`, and every other endpoint `blocked` or `reachable`.

A list of only TCP-only endpoints is never down: nothing in it failed.

## Alternatives considered

- **Count `reachable` as a failure.** Rejected: a healthy all-wildcard list would read down.
- **Keep ADR-0021's rule.** Rejected: any wildcard hides a filtered list, which is the outage
  Qanary exists to show.
- **Run TLS for wildcards again.** Rejected for the reasons in ADR-0021: a made-up subdomain
  fails TLS on healthy zones too.

## Consequences

### Positive:

- A filtered list reads down (and fully blocked) even when it holds wildcard endpoints.
- `all_down`, `fully_failing` and cut-off share one function instead of three copies.

### Negative / accepted trade-offs:

- A list whose only verified endpoints are down while its wildcards still connect reads down.
  That is intended: TCP alone can't tell a working zone from a filtered one.
- A service like `[blocked, reachable]` now counts as fully failing, so its probes back off
  like any failing service (scheduler.rs `fail_streak`) and a recovery shows a little later.
- The "TCP-only is neutral" idea lives in Rust (`disconnected`) and in TypeScript
  (`isFullyBlocked`). Each side has its own tests.

### Follow-ups:

- Compute fully-blocked in the backend next to `all_down`, so the rule lives in one language.
