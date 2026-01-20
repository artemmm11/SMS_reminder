# SMS Reminder MVP

A mobile-first web application for scheduling one-time SMS reminders with voice input, optimized for iPhone Safari.

## Features

- **Voice Recording**: Record reminder messages using your microphone
- **iOS Safari Support**: MediaRecorder with WebAudio fallback for maximum compatibility
- **Speech-to-Text**: OpenAI Whisper transcription
- **SMS Delivery**: Twilio integration for reliable SMS sending
- **Scheduled Reminders**: Pick any future date/time with timezone support
- **Rate Limiting**: Protection against abuse (10 requests/hour per IP)

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Supabase recommended)
- **SMS Provider**: Twilio
- **STT**: OpenAI Whisper
- **Scheduler**: Upstash QStash
- **Rate Limiting**: Upstash Redis

## Prerequisites

- Node.js 20+
- PostgreSQL database
- Twilio account
- OpenAI API key
- Upstash account (Redis + QStash)

## Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd sms-reminder-mvp
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

### 3. Database Setup (Supabase)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings > Database
3. Copy the connection string (URI) to `DATABASE_URL`
4. Run database migrations:

```bash
npx prisma db push
```

### 4. Twilio Setup

1. Create account at [twilio.com](https://www.twilio.com)
2. Get a phone number (trial accounts can only send to verified numbers)
3. Find your credentials in Console Dashboard:
   - Account SID → `TWILIO_ACCOUNT_SID`
   - Auth Token → `TWILIO_AUTH_TOKEN`
   - Phone Number → `TWILIO_PHONE_NUMBER` (format: +1234567890)

**Trial Account Limitations:**
- Can only send SMS to verified phone numbers
- Messages include "Sent from Twilio trial account" prefix
- Upgrade to paid account for production use

### 5. OpenAI Setup

1. Get API key from [platform.openai.com](https://platform.openai.com)
2. Set `OPENAI_API_KEY` in `.env`

### 6. Upstash Setup

**Redis (Rate Limiting):**
1. Create database at [upstash.com](https://upstash.com)
2. Copy REST URL and Token to `.env`

**QStash (Scheduling):**
1. Go to QStash tab in Upstash console
2. Copy Token and Signing Keys to `.env`

### 7. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

**Note**: Update `NEXT_PUBLIC_APP_URL` to your Vercel URL.

### Render

1. Create new Web Service
2. Connect repository
3. Build Command: `npm install && npx prisma generate && npm run build`
4. Start Command: `npm start`
5. Add environment variables

### Docker

```bash
# Build
docker build -t sms-reminder .

# Run
docker run -p 3000:3000 --env-file .env sms-reminder
```

## Smoke Test Checklist

- [ ] Page loads on mobile Safari
- [ ] Microphone permission prompt appears
- [ ] Recording starts and shows timer
- [ ] Recording stops and transcription appears
- [ ] Can edit transcript text
- [ ] Phone number validation works
- [ ] Date picker shows future dates only
- [ ] Consent checkbox required
- [ ] Schedule button creates reminder
- [ ] Success message displays
- [ ] SMS arrives at scheduled time

## API Endpoints

### POST /api/stt
Transcribe audio to text.

**Request**: `multipart/form-data` with `audio` file
**Response**: `{ transcript, language, duration }`

### POST /api/schedule
Schedule a new reminder.

**Request**:
```json
{
  "phone": "+1234567890",
  "message": "Your reminder message",
  "runAt": "2024-12-31T23:59:00Z",
  "timezone": "America/New_York",
  "consent": true
}
```

**Response**: `{ success, reminderId, scheduledFor }`

### POST /api/send-sms
Internal endpoint called by QStash at scheduled time.

## Error Handling

The app provides clear error messages for:
- Microphone permission denied
- Browser not supported
- STT transcription failures
- Invalid phone numbers
- Rate limit exceeded
- Twilio sending errors

## Security

- Rate limiting: 10 requests/hour per IP
- No audio stored on disk (memory only)
- Logs sanitized (no PII)
- Input validation with Zod
- Phone number validation with libphonenumber-js

## License

MIT
