# Revenue Recovery — Operating Guide

## Lost Lead Recovery

A patient becomes a lead when the AI uses clinic-approved service/price or appointment-availability tools. If the patient does not subsequently confirm an appointment, the system can create a recovery case after the configured inactivity delay.

Clinic dashboard:

`Revenue Recovery → Lost Lead Recovery`

Recommended pilot setting:

- Enabled: Yes
- Follow-up delay: 2 hours
- Keep the follow-up administrative and helpful; do not add medical claims or pressure.

### WhatsApp template requirement

If the patient is still inside WhatsApp's active customer-service window, the system can send a normal free-form follow-up. Outside that window, configure an approved WhatsApp template using:

```text
WHATSAPP_RECOVERY_TEMPLATE_NAME=
WHATSAPP_RECOVERY_TEMPLATE_LANG=en_US
WHATSAPP_RECOVERY_TEMPLATE_PREVIEW=
```

`*_PREVIEW` is only the text shown in ClinicChatDesk's conversation history; the actual template body is controlled in Meta.

## Cancellation Auto-Fill

A clinic employee can open `Appointments` and choose **Cancel + refill** for a confirmed appointment. The AI can also cancel a patient's next appointment when the patient clearly requests cancellation.

The system then:

1. frees the appointment slot;
2. creates a cancellation opportunity;
3. finds recent unconverted leads for the same service;
4. sends the slot to one eligible patient;
5. waits for YES/NO or expiry;
6. moves to the next candidate if necessary;
7. stops immediately when the slot is booked.

Set offer expiry with:

```text
CANCELLATION_OFFER_EXPIRY_MINUTES=20
```

If the candidate is outside WhatsApp's active customer-service window, configure:

```text
WHATSAPP_CANCELLATION_TEMPLATE_NAME=
WHATSAPP_CANCELLATION_TEMPLATE_LANG=en_US
WHATSAPP_CANCELLATION_TEMPLATE_PREVIEW=
```

The template should make it clear that an appointment slot has become available and should not contain medical claims.

## Voice-Note Receptionist

Enable per clinic under:

`Revenue Recovery → Voice-Note Receptionist`

Required server settings:

```text
OPENAI_API_KEY=...
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
DEMO_MODE=false
```

Flow:

`WhatsApp voice note → Meta media ID → temporary in-memory download → OpenAI transcription → transcript saved → normal AI receptionist flow`

The starter intentionally does not save downloaded audio to disk. The transcript is stored as a message and follows `MESSAGE_RETENTION_DAYS`.

Before selling the feature in a jurisdiction, make sure your privacy notice and clinic agreement accurately describe AI/audio processing and the providers involved.

## Revenue attribution

Appointments receive a source:

- `ai` — normal AI booking
- `recovered_lead` — booking after a sent lost-lead recovery case
- `cancellation_autofill` — booking that refilled a cancelled slot

The clinic dashboard reports recovered value using the service price stored by the clinic. This is **estimated booked service value**, not guaranteed collected revenue.

## Recommended first-pilot safeguards

- Start with one recovery follow-up, not repeated aggressive messaging.
- Let clinic staff approve prices and service names before AI activation.
- Keep cancellation offers sequential.
- Keep medical emergencies on human handoff.
- Review the first 100 automated recovery messages manually from the Conversations dashboard.
