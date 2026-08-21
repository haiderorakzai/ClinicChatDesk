# ClinicChatDesk — first clinic onboarding

Your clinic customer does **not** buy hosting, install Node.js, manage an OpenAI key, or run a server. You host ClinicChatDesk and give the clinic a private account.

## 1. Before the onboarding call

Ask the clinic to prepare:

- clinic name, address, phone and timezone
- opening hours
- services/treatments, prices and approximate duration
- doctors/staff names if they want them referenced
- booking and cancellation rules
- common non-medical FAQs
- preferred AI name, greeting and languages
- the WhatsApp Business number they want to connect

Avoid importing medical records or unnecessary sensitive patient information into the starter product.

## 2. Create the clinic account

The clinic signs up on your website or you create/invite the account during a managed pilot. Verify that the clinic only sees its own conversations, appointments, services, settings and usage.

## 3. Configure Business Knowledge

With the clinic, review:

1. services and exact prices
2. opening hours
3. booking durations/rules
4. location/contact details
5. approved FAQs
6. emergency/human-handoff wording

Run test questions before going live. The AI should retrieve operational facts from the clinic's configured data rather than inventing prices or availability.

## 4. Configure the three Revenue Recovery features

### Lost Lead Recovery

Turn it on only after the clinic approves the follow-up style and delay. Start conservatively (for example, one follow-up after a few hours) and review outcomes during the pilot.

The dashboard shows queued, sent and recovered cases plus attributed recovered value.

### Cancellation Auto-Fill

Enable it after confirming which services can be auto-filled. When a confirmed appointment is cancelled, ClinicChatDesk builds a candidate queue and offers the exact released slot to one eligible patient at a time. The queue stops when somebody accepts or candidates are exhausted.

### Voice-Note Receptionist

Enable voice notes and test real samples in the clinic's expected languages. Incoming WhatsApp audio is downloaded temporarily, transcribed, stored as a text transcript in the conversation, and then handled through the same receptionist/booking/safety flow. The starter does not intentionally persist the raw audio file.

## 5. Connect WhatsApp

For the first pilots, use managed onboarding in Super Admin. Configure the clinic's WhatsApp Business credentials and test:

- inbound patient text
- outbound AI reply
- a voice note
- booking confirmation
- human takeover / return to AI
- cancellation and slot refill

For proactive messages outside the active customer-service window, configure approved WhatsApp templates in the server environment before enabling automated campaigns broadly.

## 6. Run a launch test matrix

Test at least:

- service price question
- opening-hours question
- appointment request
- explicit booking confirmation
- cancellation
- cancellation auto-fill YES and NO
- high-intent lead that leaves without booking
- lost-lead follow-up
- voice note
- unclear question
- medical/emergency wording → human escalation
- receptionist takes over and returns conversation to AI

## 7. Go live gradually

For a first pilot, keep a human receptionist actively reviewing conversations. Start with administrative use cases only: enquiries, prices, hours, booking, rescheduling/cancellation, reminders/follow-ups and human handoff.

## 8. What the clinic receives

- private login on your domain
- conversations and voice-note transcripts
- appointments and cancellation controls
- services/prices and business knowledge
- Revenue Recovery dashboard
- AI settings and pause/human takeover
- WhatsApp connection status

## 9. What the clinic never receives

- your OpenAI API key
- your Meta app secret
- your hosting credentials
- direct database access
- another clinic's information

---

## v2.5 client WhatsApp onboarding

The normal client path is now self-service:

1. Clinic creates its ClinicChatDesk workspace.
2. Clinic completes country, currency, timezone, services and hours.
3. Clinic opens **WhatsApp**.
4. If the clinic already uses the WhatsApp Business App, choose **Connect existing WhatsApp Business**. This launches Meta's Coexistence path for eligible numbers.
5. If the clinic is starting with a fresh number, choose **Set up a new number**.
6. The clinic completes Meta's official signup window.
7. ClinicChatDesk automatically finishes the API connection and shows **Connected ✓**.

The clinic must never be asked to copy a WABA ID, Phone Number ID, access token, App Secret or webhook URL. Meta billing/payment details, when requested by Meta, are handled by Meta and are not stored by ClinicChatDesk.
