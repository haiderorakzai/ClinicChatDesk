# ClinicChatDesk Deployment Guide — Recommended First Launch

## Recommended architecture

For your first customers, keep the stack intentionally simple:

- **Domain/DNS:** Cloudflare Registrar or your existing registrar
- **Hosting:** Railway
- **Database:** SQLite on a persistent Railway Volume for the pilot/early stage
- **AI:** OpenAI API, server-side only
- **Messaging:** Meta WhatsApp Business Platform / Cloud API
- **Payments:** manual invoices for first customers; integrate a SaaS billing provider later

This version is designed for one Railway web service and one persistent volume. When you have meaningful volume (for example dozens of active clinics or high message concurrency), migrate the data layer to managed PostgreSQL before adding multiple application replicas.

---

## 1. Buy your domain

Choose a short brand domain such as `getclinicchatdesk.com`, `clinicchatdesk.app`, or another available name. Do not print marketing materials until availability/trademark checks are complete.

You can buy the domain from Cloudflare Registrar or another registrar. Keep DNS under your control.

Suggested URLs:

- `https://yourdomain.com` — sales site
- `https://yourdomain.com/login` — clinic login
- `https://yourdomain.com/app` — clinic admin
- `https://yourdomain.com/super-admin` — your owner dashboard
- `https://yourdomain.com/webhook/whatsapp` — Meta webhook

You do **not** need a separate domain or hosting account for each clinic.

---

## 2. Put the code in a private GitHub repository

Create a private repository and upload this project. Do not upload `.env` or real credentials.

Your repository should contain `.env.example`, but never `.env`.

---

## 3. Create a Railway project

1. Create a Railway account.
2. Create a new project.
3. Deploy from your private GitHub repository.
4. Railway should detect Node automatically.
5. Confirm the start command is `node src/server.mjs`.
6. Generate a temporary Railway domain and test `/health`.

---

## 4. Add a persistent volume

The database must survive deployments/restarts.

1. Add a Railway Volume to the ClinicChatDesk service.
2. Mount it at:

```text
/data
```

3. Set:

```text
DATA_DIR=/data
```

Never run the production database only on ephemeral application storage.

---

## 5. Add Railway environment variables

Generate secrets locally:

```bash
node scripts/generate-secrets.mjs
```

Then add the values to Railway Variables. Minimum variables:

```text
NODE_ENV=production
PUBLIC_URL=https://yourdomain.com
DATA_DIR=/data
SESSION_SECRET=<generated>
APP_ENCRYPTION_KEY=<generated>
WHATSAPP_VERIFY_TOKEN=<generated>
SUPER_ADMIN_EMAIL=<your email>
SUPER_ADMIN_PASSWORD=<strong initial password>
DEMO_MODE=true
```

Do not put secrets in GitHub.

### OpenAI

After the basic website is verified, add:

```text
OPENAI_API_KEY=<your key>
OPENAI_MODEL=gpt-5.6-luna
OPENAI_FALLBACK_MODEL=gpt-5.6-terra
DEMO_MODE=false
```

The key stays in Railway only. Clinics never receive it.

---

## 6. Connect the custom domain

In Railway → service → Settings → Networking → Custom Domain, enter your domain. Railway will provide DNS records. Add them at your DNS provider and wait for verification/SSL.

Then update:

```text
PUBLIC_URL=https://yourdomain.com
```

---

## 7. Log in as platform owner

Visit:

```text
https://yourdomain.com/login
```

Use the `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` that existed the first time the production database started.

The Super Admin can:

- see every clinic
- activate/suspend clinics
- change plan
- see AI request counts
- perform managed WhatsApp connection for a clinic

For security, change/remove the bootstrap password variable after you have confirmed the account works. The password hash is already stored in the database.

---

## 8. Test clinic signup

Open an incognito browser and visit:

```text
https://yourdomain.com/signup
```

Create a test clinic. It should receive a private clinic dashboard and should not see other clinics.

Fill:

- clinic profile
- address and timezone
- opening hours
- services/prices/durations
- FAQs
- AI name/greeting/languages

Use **Live Test** before WhatsApp.

---

## 9. OpenAI production test

Set `DEMO_MODE=false` and add the OpenAI key. Test at least:

- price question
- opening-hours question
- booking availability
- appointment confirmation
- cancellation/negative confirmation
- unsupported service
- wrong/ambiguous price request
- urgent medical message → human handoff
- English + Arabic + Urdu if you will sell those languages

Do not sell the AI as medical diagnosis/treatment.

---

## 10. Meta / WhatsApp for first clinics

For the first few clinics, use a **managed onboarding** process while your Meta tech-provider setup is being completed.

Your Super Admin has a WhatsApp connection form containing:

- display number
- Phone Number ID
- WABA ID
- access token

The token is encrypted before storage using `APP_ENCRYPTION_KEY`.

Set these global Railway variables as well:

```text
META_GRAPH_VERSION=<current supported version>
META_APP_SECRET=<your Meta app secret>
WHATSAPP_VERIFY_TOKEN=<same verify token configured in Meta>
```

Configure Meta's webhook callback as:

```text
https://yourdomain.com/webhook/whatsapp
```

Subscribe the required WhatsApp webhook events for messages.

### Later: self-service connection

When your Meta app is approved for the necessary WhatsApp Embedded Signup permissions, configure:

```text
META_APP_ID=
META_EMBEDDED_SIGNUP_CONFIG_ID=
```

Then replace managed onboarding with a clinic-facing “Connect WhatsApp” flow. This is the right long-term SaaS experience.

---

## 11. Do clinics need hosting?

**No.** Never ask ordinary clinic customers to buy hosting, create a server, install Node, manage a database, or obtain an OpenAI key.

You sell them a service:

1. Clinic buys a plan.
2. Clinic receives login credentials / creates its account.
3. Clinic supplies business information.
4. You or the clinic connects its WhatsApp Business assets.
5. Clinic uses your dashboard on phone/computer.
6. You operate hosting, AI, backups and integrations centrally.

If a large enterprise asks for dedicated/self-hosted deployment, treat that as a separate high-priced enterprise product later.

---

## 12. Payments

For the first 3–10 clinics, do not delay launch for automated billing. Use invoices/bank transfer/payment links and activate the clinic manually from Super Admin.

After you validate pricing and retention, integrate a recurring SaaS payment provider and map payment status to:

```text
trial → active → suspended/cancelled
```

---

## 13. Backups and operations

Before accepting real customers:

- enable the hosting provider's backup option for the persistent volume where available
- maintain an additional off-platform encrypted backup procedure
- keep `APP_ENCRYPTION_KEY` backed up securely; losing it means stored WhatsApp tokens cannot be decrypted
- use strong unique admin passwords
- enable MFA on Railway, GitHub, Meta and OpenAI accounts
- set OpenAI and hosting spending limits/alerts where available
- review logs for repeated login failures and WhatsApp webhook errors

---

## 14. Patient/privacy limits for launch

For early pilots, intentionally restrict the service to:

- general clinic FAQs
- prices
- opening hours
- location
- appointment requests
- lead capture
- administrative follow-up

Do not ask patients to upload medical records, lab reports, prescriptions or other health records until you have completed the appropriate legal/compliance design for your target jurisdiction.

The app automatically supports configurable message retention through:

```text
MESSAGE_RETENTION_DAYS=30
```

Set an appropriate retention period with legal guidance.

---

## 15. Go-live checklist

- [ ] Domain connected with HTTPS
- [ ] Railway production service healthy
- [ ] Persistent `/data` volume mounted
- [ ] Super Admin login tested
- [ ] Clinic signup tested
- [ ] Data isolation tested between two clinic accounts
- [ ] OpenAI key server-side only
- [ ] AI price/hours/booking tests passed
- [ ] Emergency → human handoff passed
- [ ] Meta webhook verified
- [ ] First clinic WhatsApp connected
- [ ] Incoming and outgoing real WhatsApp test passed
- [ ] Backup procedure enabled/tested
- [ ] Terms and Privacy replaced/reviewed
- [ ] Support email/domain configured
- [ ] First clinic agreement/pilot terms prepared

Once those are checked, you can begin selling managed pilots.

---

# v2 Revenue Recovery deployment additions

## OpenAI voice transcription

Add this server-side variable alongside your normal OpenAI variables:

```text
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

Voice-note processing will not work in `DEMO_MODE=true`; this is intentional so local demos do not unexpectedly create API usage.

## WhatsApp templates for automated recovery

WhatsApp free-form business replies are limited to the active customer-service window following the patient's message. For business-initiated recovery or cancellation offers outside that window, create and approve the relevant Meta message templates, then configure:

```text
WHATSAPP_RECOVERY_TEMPLATE_NAME=
WHATSAPP_RECOVERY_TEMPLATE_LANG=en_US
WHATSAPP_RECOVERY_TEMPLATE_PREVIEW=

WHATSAPP_CANCELLATION_TEMPLATE_NAME=
WHATSAPP_CANCELLATION_TEMPLATE_LANG=en_US
WHATSAPP_CANCELLATION_TEMPLATE_PREVIEW=

CANCELLATION_OFFER_EXPIRY_MINUTES=20
```

If an approved template is required but not configured, ClinicChatDesk deliberately marks the action as `template_required` rather than trying to send a non-compliant free-form message.

## Test before the first paying pilot

Add these to the go-live test matrix:

- [ ] High-intent patient asks price/service but does not book → recovery case appears after configured delay
- [ ] Recovery message sends inside the active WhatsApp service window
- [ ] Outside-window recovery shows `template_required` when no template is configured
- [ ] Approved recovery template sends successfully when configured
- [ ] Cancel confirmed appointment → cancellation opportunity appears
- [ ] Matching unconverted lead receives the cancelled slot
- [ ] Patient replies YES → slot is booked and other offers stop
- [ ] Patient replies NO / offer expires → next candidate is tried
- [ ] Voice note reaches webhook → media downloads → transcript appears in conversation
- [ ] Voice-note transcript can book an appointment normally
- [ ] Voice-note emergency language still triggers human handoff
- [ ] Clinic dashboard recovered-value numbers match configured service prices

See `REVENUE_RECOVERY_GUIDE.md` for operating details.


## Port note
The local Windows demo uses port **3100**. In Railway production, Railway provides its own `PORT` environment variable automatically; do not hard-code 3100 there. Set `PUBLIC_URL` to your real HTTPS domain and `DATA_DIR=/data`.

---

## v2.5 automatic Meta Embedded Signup

For self-service clinic WhatsApp onboarding, configure these Railway variables in addition to the existing webhook/App Secret variables:

```text
META_APP_ID=<Meta app ID>
META_APP_SECRET=<Meta app secret>
META_EMBEDDED_SIGNUP_CONFIG_ID=<Facebook Login for Business / Embedded Signup v4 config ID>
META_GRAPH_VERSION=v26.0
META_EMBEDDED_SIGNUP_ES_VERSION=v4
META_EMBEDDED_SIGNUP_SESSION_INFO_VERSION=3
META_EMBEDDED_SIGNUP_FEATURE_TYPE=
META_OAUTH_REDIRECT_URI=
```

Keep `META_APP_SECRET` server-side only. The browser receives only the App ID and configuration ID. Do not change `APP_ENCRYPTION_KEY` on an existing production database.

The clinic dashboard now launches the Coexistence flow for **Connect existing WhatsApp Business** by passing `whatsapp_business_app_onboarding`, while **Set up a new number** launches standard Embedded Signup. The backend exchanges the one-time code, encrypts the business token, completes new-number registration when required, and subscribes the WABA to the existing `/webhook/whatsapp` endpoint.

See `META_EMBEDDED_SIGNUP_GUIDE.md` and `V2.5_UPDATE_GUIDE.txt`.

## v2.6 professional UI and onboarding

No new environment variables are required. Deploy the code update over the existing v2.5.4 installation, keep the Railway persistent `/data` volume attached, and do not rotate `APP_ENCRYPTION_KEY`. The database migration safely adds onboarding fields and a per-clinic staff table on first boot. After deployment, confirm `/health` reports `2.6.0`, then test `/`, `/pricing`, `/signup`, the Setup wizard, Team area, Live Test and WhatsApp page.
