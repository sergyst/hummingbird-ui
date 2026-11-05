# Hummingbird Alerts – UI

React (Vite) console for working with **alerts** in the [Hummingbird](https://docs.hummingbird.co) sandbox API.
It talks to the Spring Boot server in [hummingbird-backend](https://github.com/sergyst/hummingbird-backend) via `/api`.

## Pages
* **Alerts** – table of submitted alerts with state and case outcome (`opened`, `escalated`, `filed`, `not_filed`, `dismissed`), filters, search, refresh, and submit-new-alert.
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
