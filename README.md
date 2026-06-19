# Outbound Caller

An outbound sales calling system built on [ElevenLabs Conversational AI](https://elevenlabs.io/conversational-ai) and Twilio. Upload a lead list, configure an AI agent with your sales script, and the system works through the list automatically — placing calls, handling retries, and updating statuses as calls complete.

![Node](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

---

> **Before pushing to a public repo:** delete `backend/.env` (it may contain real credentials) and rotate any keys you've already used. See [Pre-publish checklist](#pre-publish-checklist).

---

## How it works

```
  Dashboard / API
       │
       │  POST /api/leads  (manual or bulk Excel/Word upload)
       ▼
   ┌─────────┐     callWorker.js polls every 5s
   │ MongoDB │ ◄──────────────────────────────────┐
   │ (leads) │                                    │
   └────┬────┘                                    │ update status
        │  pending lead found                     │
        ▼                                         │
  POST /v1/convai/twilio/outbound-call            │
  (ElevenLabs API)                                │
        │                                         │
        ▼                                         │
  ┌─────────────────┐                             │
  │   ElevenLabs    │  runs your AI sales agent   │
  │  + Twilio call  │  records + transcribes      │
  └────────┬────────┘                             │
           │ call ends                            │
           ▼                                      │
  POST /webhooks/elevenlabs  ───────────────────►─┘
  (your server)
```

No Redis, no BullMQ, no WebSocket server. MongoDB is the queue. ElevenLabs handles all telephony via Twilio under the hood.

---

## Stack

- **Backend:** Node.js, Express, Mongoose, Multer (file uploads)
- **Frontend:** React 18, Vite, Tailwind CSS, Recharts
- **Database:** MongoDB
- **Calling:** ElevenLabs Conversational AI + Twilio (managed by ElevenLabs)
- **Deployment:** Docker + Docker Compose

---

## Prerequisites

- Node.js 20+
- MongoDB (local, Docker, or Atlas)
- An [ElevenLabs](https://elevenlabs.io) account with Conversational AI access
- A Twilio account (connected to ElevenLabs — ElevenLabs manages the Twilio integration)
- An HTTPS domain or [ngrok](https://ngrok.com) tunnel for webhooks

---

## Setup

### 1. Configure ElevenLabs

Do this first — you need the agent ID and phone number ID before the backend will work.

1. Go to **Conversational AI → Agents → Create Agent**
2. In **System Prompt**, write your sales script (see [example below](#agent-script-example))
3. Under **Analysis**, add a criterion named `appointment_set`:
   - *"The lead agreed to a specific time or day for a follow-up call"*
4. Go to **Phone Numbers** inside the agent → **Add phone number → Twilio**
   - Enter your Twilio Account SID and Auth Token
   - Pick or buy a phone number
   - Copy the `phone_number_id` ElevenLabs shows you
5. Under **Webhooks**, add `https://YOUR_DOMAIN/webhooks/elevenlabs` and copy the signing secret

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in your values — see Environment variables section below
```

Start in development (two terminals):

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run worker:dev
```

Or run everything with Docker:

```bash
docker-compose up --build
```

This starts MongoDB, the API server, and the call worker together.

**Webhooks in local dev:** ElevenLabs needs to reach your server. Run ngrok in a third terminal:

```bash
ngrok http 3000
# Copy the https://xxxx.ngrok-free.app URL
# Set BASE_URL=https://xxxx.ngrok-free.app in .env
# Update the webhook URL in ElevenLabs dashboard to match
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL can stay blank if backend is on localhost:3000
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

For production builds:

```bash
# Set VITE_API_URL=https://your-backend-domain.com/api in .env first
npm run build
# Serve dist/ from any static host (Vercel, Nginx, Cloudflare Pages, etc.)
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | `production` disables detailed error output |
| `BASE_URL` | — | Your HTTPS domain; ElevenLabs POSTs webhooks here |
| `CORS_ORIGIN` | `*` | Set to your frontend domain in production |
| `MONGODB_URI` | — | MongoDB connection string |
| `ELEVENLABS_API_KEY` | — | From elevenlabs.io → API Keys |
| `ELEVENLABS_AGENT_ID` | — | From your agent's settings page |
| `ELEVENLABS_PHONE_NUMBER_ID` | — | From agent → Phone Numbers |
| `ELEVENLABS_WEBHOOK_SECRET` | — | From agent → Webhooks (required in production) |
| `WORKER_CONCURRENCY` | `5` | Max parallel outbound calls |
| `CALLS_PER_HOUR` | `30` | Rate limit — check your Twilio plan |
| `POLL_INTERVAL_MS` | `5000` | How often the worker checks for new leads |
| `RETRY_DELAY_MINUTES` | `30` | Gap before retrying a no-answer or busy |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(empty)* | Backend API base URL. Leave blank to use the Vite proxy on localhost |

---

## Agent script example

Paste this into the ElevenLabs agent System Prompt and customise it for your business:

```
You are Alex, a friendly appointment setter for [Your Company].
The lead's name is {{first_name}} {{last_name}} from {{company}}.

Goal: briefly introduce what we do and book a 15-minute call with a sales agent.

1. Greet them by first name and introduce yourself — warm and natural
2. Explain what [Your Company] does in one sentence
3. Ask one short qualifying question ("Is that something you're dealing with right now?")
4. If they engage: "I'd love to set up a quick 15-minute call with one of our specialists —
   what day works best for you this week?"
5. Confirm the time and say "Perfect, you'll get a confirmation text."
6. If they say no: thank them politely and end the call

Rules:
- Keep the call under 2 minutes
- One ask only — never be pushy
- If they ask to be removed, say "Of course, have a great day" and end immediately
- Don't promise pricing or technical details
```

---

## Lead status flow

```
pending → calling → appointment_set   ✓ meeting booked
                 → declined           ✗ lead said no
                 → no_answer          → retried (up to maxRetries, default 3)
                 → busy               → retried
                 → max_retries        ✗ retry limit reached
                 → dnc               ✗ do-not-call (set manually)
```

Leads that hang up in under 15 seconds are treated as `no_answer` and retried.

---

## Uploading leads

**Excel / CSV (`.xlsx`, `.xls`)** — the parser looks for these column names (case-insensitive, underscores or spaces):

| `first_name` | `last_name` | `phone` | `email` | `company` |
|---|---|---|---|---|
| Jane | Smith | +15550000001 | jane@acme.com | Acme Corp |

Phone numbers are normalised to E.164 automatically — `5551234567`, `(555) 123-4567`, and `+15551234567` all work. 10-digit US numbers get `+1` prepended.

**Word (`.docx`)** — table format works, or pipe-delimited lines (`Name | Phone | Email | Company`).

---

## API reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/leads` | List leads. Query: `status`, `search`, `page`, `limit` |
| GET | `/api/leads/stats` | Counts by status, today's calls, acceptance rate |
| GET | `/api/leads/:id` | Lead detail + full call session history |
| POST | `/api/leads` | Create a single lead |
| POST | `/api/leads/bulk-upload` | Upload Excel or Word file (`multipart/form-data`, field: `file`) |
| POST | `/api/leads/start-calling` | Mark pending leads ready; worker picks them up on next poll |
| POST | `/api/leads/:id/retry` | Reset a lead to `pending` |
| PATCH | `/api/leads/:id` | Update `firstName`, `lastName`, `email`, `company`, `status`, `maxRetries` |
| DELETE | `/api/leads/:id` | Soft delete |
| GET | `/api/queue/stats` | Active call count, leads waiting |
| POST | `/api/queue/pause` | Stop the worker from placing new calls |
| POST | `/api/queue/resume` | Resume the worker |
| POST | `/webhooks/elevenlabs` | ElevenLabs webhook — don't call this manually |
| GET | `/api/health` | Health check |

---

## Pre-publish checklist

Before making this repo public:

1. **Delete `backend/.env`** — it may have real API keys in it
2. **Delete `twilio_2FA_recovery_code.txt`** from the project root
3. **Rotate your credentials** — Twilio auth token, ElevenLabs API key — in their respective dashboards
4. Add a screenshot of your dashboard to `docs/screenshot.png` and uncomment the image line near the top of this README

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
