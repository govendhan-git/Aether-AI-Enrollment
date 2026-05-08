# AetherEnroll

AI-orchestrated enrollment app for employees and brokers.

- Next.js 14 (App Router) + TypeScript
- Clerk auth (MFA-capable)
- MongoDB + Mongoose
- Tailwind CSS + themes per Legal Entity
- AI SDK (OpenAI-compatible) for workflow assistance and orchestration

## Setup

1. Copy `.env.example` to `.env` and fill values (Clerk, MongoDB, OpenAI if used).
2. Install deps and run dev.

## Seeding

- Provide `MONGODB_URI` in `.env` then run `npm run seed`.

## Notes

- Enrollment session persists selections step-by-step.
- On submit, confirmation number is generated and dashboard can reflect status (follow-ups pending).
