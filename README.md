# ClinicChatDesk SaaS v2.5.0

**v2.5 adds automatic Meta Embedded Signup inside the clinic dashboard.** A clinic can click **Connect existing WhatsApp Business** (Coexistence) or **Set up a new number**, complete Meta's official signup window, and ClinicChatDesk automatically captures the authorized WABA/phone IDs, exchanges the one-time authorization code server-side, encrypts the business token, completes new-number registration when needed, subscribes the WABA to your existing webhook, and shows **Connected ✓**.

The clinic never copies a token, WABA ID, Phone Number ID, App Secret or webhook URL. Existing Super Admin managed onboarding remains available as a fallback. v2.4's self-service Live Demo and per-clinic localization remain included.

A multi-tenant SaaS for selling a clinic-specific AI WhatsApp front desk with **Revenue Recovery**.

## Signature features in v2

### 1. Lost Lead Recovery
- Records patient intent when they ask about a configured service/price or appointment availability.
- Detects high-intent patients who leave without a confirmed appointment.
- Queues an automatic WhatsApp follow-up after the clinic-configured delay.
- Attributes later appointments back to `recovered_lead` and reports the recovered service value.
- Respects WhatsApp messaging-window behavior: outside the active customer-service window, an approved template must be configured.

### 2. Cancellation Auto-Fill
- Clinic staff can cancel a confirmed appointment from the Appointments screen using **Cancel + refill**.
- Patient-requested cancellation is also available to the AI through a deterministic tool.
- The system creates a cancelled-slot opportunity and finds recent unconverted leads interested in the same service.
- Patients are offered the slot **sequentially**, not all at once.
- Offers expire after a configurable number of minutes; the next candidate is tried automatically.
- The first accepted offer creates the replacement appointment and records `cancellation_autofill` as its source.

### 3. Voice-Note Receptionist
- WhatsApp audio/voice messages are detected from the webhook.
- Media is retrieved through the WhatsApp Business Platform.
- Audio is sent to OpenAI's transcription endpoint using `OPENAI_TRANSCRIBE_MODEL`.
- The transcript goes through the same receptionist, booking, safety and human-handoff logic as typed messages.
- This starter does not intentionally persist the raw audio file; it stores the transcript, WhatsApp media ID and transcription metadata with normal message retention.
- The clinic dashboard has a live voice-file test before go-live.

## Core SaaS included

- Public marketing website + pricing
- Clinic signup/login
- Clinic admin dashboard
- Super-admin dashboard for the platform owner
- Multi-clinic data isolation by `business_id`
- Clinic profile, opening hours, services/prices, FAQs and AI settings
- Conversations, voice-note transcripts, human takeover and appointments
- Revenue Recovery dashboard and attribution
- OpenAI Responses API integration with function tools
- Deterministic booking confirmation gate
- Emergency/sensitive-message human handoff
- WhatsApp Cloud API webhook/send/media integration
- Meta Embedded Signup v4 launcher with Coexistence for existing WhatsApp Business App numbers
- Automatic OAuth code exchange, WABA webhook subscription and new-number registration
- Per-clinic WhatsApp access tokens and generated two-step PINs encrypted at rest
- Connection verify, retry, reconnect and disconnect controls
- Monthly AI request/token counters
- Configurable message retention
- Secure HttpOnly session cookies and password hashing
- Railway-ready configuration and `/health`
- Automatic safe database migration from the earlier v1 schema

## Important architecture decision

**Clinics do not host anything.** You host one ClinicChatDesk SaaS in your cloud account. Each clinic receives a private workspace and connects its clinic WhatsApp number to your platform.

Clinics should normally self-connect from **Clinic Dashboard → WhatsApp**. The Meta App ID and Embedded Signup configuration ID are public browser configuration; the Meta App Secret stays only on the server. Super Admin managed token entry remains available only as a fallback/support path.

## Local test

1. Copy `.env.example` to `.env`.
2. Run `node scripts/generate-secrets.mjs` and put the generated values in `.env`.
3. Set a strong `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`.
4. Keep `DEMO_MODE=true` for normal text/demo testing.
5. Run:

```bash
node src/server.mjs
```

Open `http://localhost:3100`.

### Voice-note test

Voice transcription is a real API feature and therefore needs:

```text
OPENAI_API_KEY=...
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
DEMO_MODE=false
```

Never expose the API key in the website/browser.

## Automated test

```bash
npm run smoke
```

The smoke test verifies automatic Embedded Signup token storage/subscription with mocked Meta responses, new-number PIN registration, lost-lead recovery, cancellation auto-fill, localization and voice-note tracking without contacting Meta or OpenAI.

## Production

See `DEPLOYMENT_GUIDE.md` and `REVENUE_RECOVERY_GUIDE.md`.

## Medical/privacy boundary

ClinicChatDesk is designed for **administrative receptionist tasks**, not diagnosis or treatment. Before processing real patient/health data, obtain appropriate legal/compliance review for the jurisdictions where you sell. The included Privacy/Terms pages should still receive legal review for the markets where you sell, especially before processing regulated health information.
