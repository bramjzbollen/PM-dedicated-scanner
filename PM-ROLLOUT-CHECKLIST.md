# Polymarket Paper Rollout Checklist

## Phase 1 — MVP Paper (nu)
- [x] PM bot paper-only mode bevestigd (geen live execution)
- [x] Event mapping BTC/ETH/SOL 5m Up/Down aanwezig
- [x] Gamma public API connectiviteit OK
- [x] CLOB public API connectiviteit OK
- [x] Bybit -> decision -> paper bet pipeline getest
- [x] PM tab API endpoints (config/state/events/decisions/bets/stats) reageren
- [x] Eerste paper sessie gestart met safe defaults
- [x] Eerste incoming data bevestigd: suggesties + events + open bet

## Phase 2 — Validation (volgende)
- [ ] 24u dry-run met monitoring (open/close cadence, winrate drift)
- [ ] Datakwaliteit checks (stale feed guard, missing price fallback)
- [ ] Risk smoke test (maxOpenBets/maxDailyLoss enforcement)
- [ ] UI operator flow valideren (toggle/save/refresh/recover)
- [ ] Logging/alerting thresholds vastleggen

## Phase 3 — Hardening
- [ ] Health endpoint + heartbeat voor PM runtime
- [ ] Retry/backoff + circuit breaker rond externe PM APIs
- [ ] Persistente audit trail (beslissing -> bet -> settlement)
- [ ] Runbook + incident playbook + rollback knop
- [ ] Performance/burst test en rate-limit handling
