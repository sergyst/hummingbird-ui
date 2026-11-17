# Hummingbird Alerts – UI

React (Vite) console for working with **alerts** in the [Hummingbird](https://docs.hummingbird.co) sandbox API.
It talks to the Spring Boot server in [hummingbird-backend](https://github.com/sergyst/hummingbird-backend) via `/api`.

## Pages
* **Overview** – dashboard with stats and recent alerts. Nothing refreshes on its own (the pending count and backend status in the sidebar included): use **Refresh** on the page or in the sidebar.  The same goes for the other pages, Scenarios included: its alert tracker has a **Refresh** button.
* **Alerts** – table of submitted alerts with state and case outcome (`opened`, `escalated`, `filed`, `not_filed`, `dismissed`), filters, search, and submit-new-alert. It does not refresh itself: **Refresh** reloads the list and counts, and **Check pending** asks Hummingbird about alerts that are still pending.
* **New alert** – the alert form: rule, comments, tags, subject, a transaction, plus **workflow** (default `triage`, empty = your
  organization's initial workflow), repeatable **crypto addresses** (address, blockchain, optional id) and **other info**
  (label/value) rows, and an example for the whitelist flow. When the backend points at a local server a **Simulate** menu
  appears; it appends a `mock:…` instruction to the comments for [hummingbird-mock](https://github.com/sergyst/hummingbird-mock)
  (fail, stuck, dismissed, filed, slow processing, HTTP errors, …). Real Hummingbird ignores those instructions.
* **Cases** – cases Hummingbird created from your alerts (`GET /api/cases`, default workflow `triage`), with "Load more"
  paging and a **Refresh** button (there is no auto-refresh on this page).
  Workflow, stage and status aren't in Hummingbird's list response, so the page uses the backend's `GET /api/cases/summaries`, which
  looks each case up server-side (bounded, cached until the case changes); **Refresh** bypasses that cache. Click a row for the case details and its reviews (`GET /api/cases/{token}`, `GET /api/reviews?case_token=`), or use
  **View case** in an alert's drawer. The backend passes Hummingbird's JSON through unchanged; the page follows the
  documented shapes (case list items are `{cursor, case:{token, created_at, updated_at}}`; the case detail has `reviews`,
  `decisions` and `filings`) and every case has a *Raw response* section.
* **Scenarios** – plays a fictional customer's activity through a simulated bank monitoring system and shows what Hummingbird would (not) receive:

| Scenario | Bank side | Sent to Hummingbird |
| --- | --- | --- |
| Normal deposit and withdrawal | Salary $2,500 in, $300 ATM out | **Nothing**: no rule fires |
| False alarm | $18,000 inbound wire vs. $3,000 typical month | 1 alert, 1 transaction → ends `not_filed` |
| Suspicious: structuring | 5 cash deposits $9,100–$9,900 in 48 h, then $46,000 wire out | 1 alert, 6 transactions → `filed` |

The alert scenarios send real (fictional, sandbox) alerts, so the backend needs credentials. The page follows each alert:
sent → processed → investigator decision → filing status.

## Run it
```bash
npm install
npm run dev        # http://localhost:5173, proxies /api -> http://localhost:8080
```
Point the proxy elsewhere with `API_TARGET=http://host:port npm run dev`.

### Without Java or credentials
```bash
npm run mock       # fake backend on :8080 with sample alerts
```
Alerts move from pending to processed, and scenario alerts then progress through the investigator's outcome
(about 75 s for the suspicious one, ending `filed`). Run it in one terminal and `npm run dev` in another.

### Build
```bash
npm run build      # output in dist/
```
To ship a single jar, copy `dist/` into the backend's `src/main/resources/static/` and package the backend
(see the hummingbird-backend README).

## Notes
* Use the **sandbox** with test data only.
* Alerts live in the backend's in-memory H2 database and disappear when it restarts.
