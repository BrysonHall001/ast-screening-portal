# All-Star Screening Portal — Phase 1

Pre-employment social media screening, built to run the compliant way: the
candidate consents before anything happens, every consequential action is
logged, and the risky screening categories (politics, self-harm) are off
unless a client explicitly opts in past a legal warning.

This README assumes you know roughly nothing about code — just GitHub and
Render. (No separate database service needed: the app uses a Render Postgres
and builds its own tables automatically on first boot.)

---

## ⚠️ Before you screen a real candidate

One file, `lib/legal.ts`, contains every word the candidate reads and signs:
the FCRA disclosure, the authorization, and the California notice. The text
in there right now is a **structurally-correct placeholder**, clearly marked
as `v0.1-placeholder`.

**Send `lib/legal.ts` to the attorney. Paste their approved wording back in,
and change `DISCLOSURE_VERSION` to something like `v1.0`.** The version is
stored with every signature, so you can always prove exactly which text a
candidate saw. That's the entire legal-text update process — one file.

Everything else can be tested freely with fake candidates in the meantime.

---

## What Phase 1 does

- **Staff logins** — admins (full control) and analysts, at `/login`
- **Clients page** — your employer clients, each with their own default
  behavior-category settings and custom keywords
- **New screening** — pick a client, enter the candidate, tweak categories
  for that one screening, and email the candidate their consent link
- **The candidate consent flow** (the important part) — a clean 4-step
  page the candidate opens from their email:
  1. The FCRA disclosure, standalone on its own screen (required by law)
  2. The authorization with typed e-signature, state of residence, and the
     "send me a copy" option (required in California, offered to everyone)
  3. Their social media links, so you screen the right person
  4. Confirmation — a copy of their consent is emailed to them automatically
- **Screening detail page** — the signed consent record (who, when, IP,
  disclosure version), the candidate's profile links, and a full audit trail
- **Category controls with guardrails** — Politics and Self-harm are OFF by
  default and show a legal warning when someone switches them on

**Phase 2 (now included):** once consent completes, the screening page grows
an **Open capture workspace** button. There the analyst:

- Opens the candidate's listed profiles (public content only — the rules are
  pinned in the sidebar)
- Captures posts: platform, link, date, text, and a screenshot (stored in
  the database, max 5 MB each)
- Hits **Analyze** — the AI (OpenAI) reviews each item, including images,
  against ONLY the categories enabled for that screening, plus any client
  keywords
- Gets back per-item flags with confidence and a one-line rationale, chips
  colored by severity

The suppression filter runs on every item: anything whose real content is a
protected characteristic (race, religion, health, disability, sexual
orientation, pregnancy, union activity — or politics/self-harm when those
are disabled) gets marked **Suppressed**, shows greyed-out to the analyst,
and is barred from ever reaching a report. AI results are recommendations:
Phase 3's review queue is where a human confirms or rejects every flag
before anything is delivered.

**Phase 3 (included): the review queue.** From a screening in analysis/review,
open **Review queue**. Every AI flag is a checkbox the analyst keeps or
rejects; missed flags can be added; images can be marked for redaction; a
reviewer note travels into the report. Suppressed items sit in a collapsed
section — visible for quality control, never reviewable into a report (a
mistaken suppression can be restored, and that override is audited). When
every item is reviewed, **Sign off review** locks everything and flips the
screening to Report Ready. Reports are built from the human decisions only —
raw AI output cannot reach one.

**Phase 4 (included): the report.** One click generates a professional PDF —
branded cover with the legal notices, screening summary with the consent
record, a behavioral composition chart, one page per flagged item (category
chips, the post, the image — pixelated if marked redacted — and the analyst
findings), and a consumer-rights appendix. Reports are versioned and stored
immutably; **Preview PDF** shows exactly what the client gets. **Deliver**
emails the client a confidential link (with the FCRA adverse-action reminder
built into the email), flips the screening to Delivered, and — if the
candidate checked "send me a copy" at consent — automatically sends the
candidate their own copy on a separate private link.

**Phase 5 (included): the legal tail.** On a delivered screening:

- **Adverse action** — the FCRA two-step, enforced in order: pre-adverse
  notice (report copy + rights) first, final notice second, with a business-
  day counter and a warning if you try to finalize before 5 days or while a
  dispute is open.
- **Disputes** — log what the candidate disputes (they get an automatic
  acknowledgment), watch the 30-day reinvestigation countdown, record the
  resolution (they get that too). If the report changes, regenerate — every
  previously-sent link always serves the newest version.
- **Retention** — admin-only purge for closed screenings: deletes captured
  content, images, and report PDFs; keeps the consent record and audit trail
  as proof the screening was lawful.

---

## Setup, in order (~15 minutes — whenever you're ready to deploy)

No rush on this: nothing here needs to happen until you actually want the
app live. The steps will be identical then.

### Step 1 — Create the database (on Render, ~2 clicks)

1. On [render.com](https://render.com): **New → PostgreSQL**. Name it
   `ast-screening-db`, pick the same region you'll use for the app, create.
2. On the database's page, copy the **Internal Database URL**. That's it —
   no SQL editors, no schema pasting. The app creates all of its own tables
   the first time it starts.

### Step 2 — Push this code to GitHub

Drag this folder into a GitHub Codespace (or empty repo) the way you always
do, then run the push command from the chat.

### Step 3 — Deploy on Render

1. On [render.com](https://render.com): **New → Web Service**, connect the
   `ast-screening-portal` repo.
2. Settings:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
3. Add these **environment variables**:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Internal Database URL from Step 1 |
   | `SESSION_SECRET` | any long random string (30+ characters, mash the keyboard) |
   | `APP_URL` | your Render URL, e.g. `https://ast-screening-portal.onrender.com` (add it after the first deploy) |
   | `OPENAI_API_KEY` | from [platform.openai.com](https://platform.openai.com/api-keys) — powers the AI analysis. Without it, everything works except the Analyze button. Optional: `OPENAI_MODEL` to override the default model. |

4. Deploy. After it's live, set `APP_URL` to the real URL and redeploy —
   consent links in emails use it.

### Step 4 — Create your admin account

Visit `https://your-app.onrender.com/setup` and create the first admin.
The page permanently locks itself afterward. Add teammates on the **Team**
page.

### Step 5 (optional, later) — Email sending

Until you configure email, the app **logs emails to the Render console
instead of sending them** — everything else works, and you can copy the
consent link straight from the screening page and text/email it manually.

To send for real, add SMTP credentials (Resend, Mailgun, SES, and Gmail app
passwords all work):

| Key | Example |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | your API key |
| `MAIL_FROM` | `screening@allstartalent.com` |

---

## Try it end to end (5 minutes)

1. **Clients** → create a test client. Peek at its category settings —
   notice Politics and Self-harm are off, and show a warning if enabled.
2. **New screening** → use your own email as the "candidate."
3. Open the consent link (from your inbox, or **Copy consent link** on the
   screening page) — preferably in a private browser window, since it's a
   public candidate page.
4. Walk the 4 steps as the candidate.
5. Back in the portal: the screening flips to **Consent completed**, the
   signed record shows name/time/IP/version, your profile links are listed,
   and the audit trail shows every step.

---

## Where things live (for future you)

| File | What it is |
|---|---|
| `lib/legal.ts` | ALL candidate-facing legal text + version. The attorney file. |
| `lib/categories.ts` | The behavior category list and defaults |
| `lib/schema.sql` | Database schema — the app runs this itself on boot |
| `app/consent/[token]/` | The candidate consent flow |
| `app/admin/` | Everything staff sees |
| `lib/email.ts` | Email wording |
| `lib/analyze.ts` | The AI analysis prompt + suppression rules |

---

## Compliance notes baked into the build

- The disclosure renders on its own screen with nothing else on it
  (FCRA "standalone document" requirement).
- Signature records store the disclosure version, timestamp, IP, and
  user agent.
- The candidate automatically gets a copy of what they signed.
- California candidates can request a report copy (recorded per-consent).
- The category list contains **no protected-class categories** at all, and
  the Phase 2 analyzer will suppress protected-class content on top of that.
- Every consequential action lands in `audit_log`.
- Consent links die when a screening is cancelled.
