# Security findings & remediation log

The **Security** stage runs four scanners in parallel. Each has a *gate* (fails the build)
and a *full report* archived in Jenkins (`reports/*.json` + merged `reports/security-summary.md`).

| Scanner | Type | Protects against | Gate |
|---|---|---|---|
| ESLint + `eslint-plugin-security` + `eslint-plugin-no-unsanitized` | SAST | `eval`, unsafe regex, child_process, DOM XSS sinks (`innerHTML`) | any error |
| `npm audit` | SCA | known CVEs in npm packages we ship | moderate+ in production deps |
| Trivy image | Container | CVEs in OS packages + node_modules inside the image | fixable HIGH/CRITICAL |
| Trivy fs | Secrets / IaC | leaked keys in git, insecure Dockerfile settings | any secret |

Every fixed finding has a **regression test** in `tests/integration/security.test.js`, so it cannot silently return.

---

## How the findings were discovered

First pipeline run on commit `ci: Jenkins 7-stage pipeline…` → **Security stage FAILED**:

```
SCA - npm audit        qs <=6.15.3 (moderate)  body-parser 2.2.2 (low)     -> gate FAILED
SAST - ESLint security public/auth.js:7   Unsafe assignment to innerHTML   -> gate FAILED
                       public/cart.js:95  Unsafe assignment to innerHTML
```

Manual review of the same code (prompted by the SAST results) found the access-control and
authentication issues below. Findings SEC-1 and SEC-5 were **reproduced against the original
SIT774 code** before fixing (see "Evidence").

---

## Findings

| ID | Finding | Found by | Severity | Status |
|---|---|---|---|---|
| SEC-1 | `/api/users` and `GET /api/queries` readable by anyone (names, e-mails, phones, points) | code review | **High** (OWASP A01 Broken Access Control) | ✅ Fixed |
| SEC-2 | Stored XSS: `full_name` / cart titles injected into `innerHTML` | SAST (no-unsanitized) + review | **High** (A03 Injection) | ✅ Fixed |
| SEC-3 | Session secret hard-coded (`'bookstore-secret-key'`) in `server.js` | code review | **High** (A02/A07) - anyone with repo access can forge sessions | ✅ Fixed |
| SEC-4 | Client decides the price: `total` and item `price` taken from the browser | code review + `$0.00` bug | **High** (business logic / A04 Insecure Design) | ✅ Fixed |
| SEC-5 | Login reveals whether an e-mail exists ("No account found…" vs "Incorrect password"), no rate limit, no session regeneration | code review | Medium (A07 Identification & Auth failures) | ✅ Fixed |
| SEC-6 | `qs` ≤ 6.15.3 - GHSA-x5fp-wj9c-mxmx (array-limit bypass), GHSA-4mjr-xmp4-gh2g (DoS) | npm audit | Moderate | ✅ Fixed (`npm audit fix` → qs 6.16.0) |
| SEC-7 | `body-parser` 2.2.2 - GHSA-v422-hmwv-36x6 (invalid `limit` disables size check → DoS) | npm audit | Low | ✅ Fixed (→ 2.3.0) + explicit `limit: '100kb'` |
| SEC-8 | Errors returned as HTML with SQL message + stack trace (`no such column: points at database.js:78…`) | observed in bug reproduction | Medium (A05 Security Misconfiguration - information disclosure) | ✅ Fixed |
| SEC-9 | No security headers (CSP, X-Frame-Options, nosniff), `X-Powered-By: Express` | review | Low | ✅ Fixed (helmet) |
| SEC-10 | Jenkins controller container runs as root (Trivy `DS-0002` HIGH) | Trivy fs | High in general, **accepted** for local demo | ⚠️ Accepted risk |
| FP-1 | `security/detect-non-literal-fs-filename` on `database.js` | SAST | - | False positive (path comes from operator `DB_PATH`, never from a request) - suppressed inline with justification |

### Fix details

- **SEC-1** - `requireAdmin` middleware; admins configured by `ADMIN_EMAILS` env var (no hard-coded admin).
  Anonymous → 401, customer → 403, admin → 200. `useradmin.html` shows a proper message; navbar shows *Admin* link only to admins.
- **SEC-2** - `auth.js` and `cart.js` rebuilt with DOM APIs + `textContent`; inline page scripts
  (`checkout.html`, `profile.html`) escape every value with `escape.js`; only `https://` image URLs accepted.
- **SEC-3** - `SESSION_SECRET` from Jenkins credentials; app **refuses to start** in staging/production
  without a ≥ 32-char secret; development uses a random per-process secret.
- **SEC-4** - server-side catalogue (`src/services/catalog.js`) re-prices every line; client total ignored;
  quantity limited to 1–20; order + items + points written in **one transaction**.
- **SEC-5** - identical `401 Invalid email or password.` for both cases, dummy bcrypt compare to equalise timing,
  `express-rate-limit` (failed attempts per IP / 15 min, `AUTH_RATE_LIMIT`), `req.session.regenerate()` on login/register,
  cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` when `COOKIE_SECURE=true` behind HTTPS). Failed logins feed the
  `BookstoreLoginBruteForce` alert.
- **SEC-8** - central JSON error handler: client gets `{"error":"Internal server error"}`, details go to server logs only.

### Evidence (original SIT774 code)

```
ORIGINAL app - registered with full_name = <img src=x onerror="window.__xss=1">
  -> window.__xss === true on /index.html                      (SEC-2 stored XSS executes)
ORIGINAL GET /api/users without logging in -> 200 [{"id":1,"full_name":..,"email":"x@e.com","phone":..}]  (SEC-1)
FIXED app  - same payload shown as literal text "Hi, <img src=x …>", window.__xss === false
```

### Residual risks (documented, not fixed)

| Risk | Why accepted | Mitigation path |
|---|---|---|
| CSP still allows `'unsafe-inline'` scripts | SIT774 pages use inline `<script>` and `onclick=""` | move scripts to files, then use nonces |
| `express-session` MemoryStore | single container demo; sessions lost on redeploy | Redis / SQLite session store |
| Chaos endpoints enabled in production env | needed to demonstrate alerting in the assessment | `CHAOS_ENABLED=false` in real prod |
| Jenkins runs as root (SEC-10) | needs the host Docker socket on Docker Desktop | non-root user + `group_add` docker GID, or rootless build agents |
| No CSRF token | `SameSite=Lax` cookie + JSON-only APIs block classic CSRF | add CSRF tokens if HTML form posts are introduced |

## Supply chain

Trivy **v0.69.4** (and Docker Hub images 0.69.5/0.69.6) were compromised in March 2026
(GHSA-69fq-xp46-6x23 / CVE-2026-33634). The Jenkins image pins **v0.69.3** and verifies its SHA-256
before installing. `npm ci` installs exactly what `package-lock.json` specifies (with integrity hashes).
