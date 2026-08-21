# ClinicChatDesk v2.5 — Meta Embedded Signup

## Client experience

The clinic sees only the **WhatsApp** page in ClinicChatDesk.

### Existing clinic number (recommended for established clinics)

**Connect existing WhatsApp Business** launches Meta Embedded Signup with the WhatsApp Business App onboarding feature. This is the Coexistence path: eligible clinics can keep using the WhatsApp Business App while ClinicChatDesk also connects through Cloud API.

### New number

**Set up a new number** launches the standard Embedded Signup path. After authorization, ClinicChatDesk generates and encrypts the 6-digit two-step registration PIN, registers the Cloud API phone number through Meta, then subscribes the WABA webhook.

## What Meta handles

Meta authenticates the clinic, lets it choose/create its business and WhatsApp assets, verifies/authorizes the phone number, and returns a one-time authorization code plus session information such as WABA ID and Phone Number ID.

## What ClinicChatDesk handles automatically

1. Receives the one-time code in the browser callback from `FB.login`.
2. Sends that code immediately to the authenticated ClinicChatDesk backend.
3. Exchanges it server-to-server using `META_APP_ID` + `META_APP_SECRET`.
4. Verifies the selected WABA/phone against Meta.
5. Encrypts the resulting business access token using `APP_ENCRYPTION_KEY`.
6. Registers a new Cloud API phone number when the new-number path is used.
7. Calls `/{WABA_ID}/subscribed_apps` so your existing webhook receives events.
8. Stores the connection against the authenticated clinic only.
9. Shows **Connected ✓**.

The browser never receives `META_APP_SECRET`, the stored Meta access token, or the generated two-step PIN.

## Existing webhook

All clinics can use the same callback:

`https://clinicchatdesk.com/webhook/whatsapp`

Incoming WhatsApp payloads include a `phone_number_id`. ClinicChatDesk maps that ID to the correct `business_id`, then loads that clinic's services, prices, hours, appointments and AI settings.

## Required Railway variables

```text
META_APP_ID=
META_APP_SECRET=
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_GRAPH_VERSION=v26.0
META_EMBEDDED_SIGNUP_ES_VERSION=v4
META_EMBEDDED_SIGNUP_SESSION_INFO_VERSION=3
WHATSAPP_VERIFY_TOKEN=
PUBLIC_URL=https://clinicchatdesk.com
```

Keep `META_EMBEDDED_SIGNUP_FEATURE_TYPE` blank. v2.5 sets `whatsapp_business_app_onboarding` only for the existing-number button.

## Failure recovery

OAuth codes are single-use. v2.5 saves the exchanged business token before registration/subscription. If a later Meta request fails, the clinic sees **Needs attention** and can use **Retry connection** without repeating Embedded Signup when the stored authorization is still usable.

## App Review / production

Embedded Signup code does not bypass Meta approval. Production onboarding still depends on the permissions/advanced access, Tech Provider status, business verification, App Review and account eligibility required by Meta for your app.
