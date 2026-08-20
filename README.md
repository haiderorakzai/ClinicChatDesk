# ClinicChatDesk SaaS — Production Starter v2

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
- Deploy marker: v2.3
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
- Per-clinic WhatsApp credentials encrypted at rest
- Monthly AI request/token counters
- Configurable message retention
- Secure HttpOnly session cookies and password hashing
- Railway-ready configuration and `/health`
- Automatic safe database migration from the earlier v1 schema

## Important architecture decision

**Clinics do not host anything.** You host one ClinicChatDesk SaaS in your cloud account. Each clinic receives a private workspace and connects its clinic WhatsApp number to your platform.

For the first paying clinics, use **managed WhatsApp onboarding** from Super Admin. After your Meta tech-provider / Embedded Signup path is approved and tested, replace managed token entry with self-service connection.

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

The smoke test verifies the lost-lead queue, cancellation auto-fill booking path and voice-note tracking without making a live OpenAI or WhatsApp request.

## Production

See `DEPLOYMENT_GUIDE.md` and `REVENUE_RECOVERY_GUIDE.md`.

## Medical/privacy boundary

ClinicChatDesk is designed for **administrative receptionist tasks**, not diagnosis or treatment. Before processing real patient/health data, obtain appropriate legal/compliance review for the jurisdictions where you sell. The included Privacy/Terms pages remain launch drafts until completed with your legal entity details and reviewed for the target market.
