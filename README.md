# Blood Donation Registry API

Local NestJS + Prisma + PostgreSQL prototype for a community donor registry. It supports JWT login, donor profiles, verified blood requests, eligibility estimates, and matching by blood group and distance. It has no hospital integration.

See [Architecture and API Overview](architecture-and-api-overview.md) for the service layout, data model, request flow, endpoint contracts, and current limitations.

## Project layout

- `backend/` — NestJS API, Prisma schema, migrations and seed
- `frontend/` — RaktSetu React app (Vite, Tailwind, shadcn/ui)
- `web/` — original minimal demo UI (not started by Compose)
- `docker/` — Docker Compose setup (Postgres, API, frontend)

## Start with Docker

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `JWT_SECRET` to a long random value. Set `DATA_ENCRYPTION_KEY` to 64 hex characters (generate with `openssl rand -hex 32`). Set the coordinator password to a local demo password. An optional ignored `backend/.env.local` is loaded last and overrides `.env` for machine-specific values.
3. Run `docker compose -f docker/docker-compose.yml up` (or `cd docker && docker compose up`) and wait for the API startup and Prisma setup to finish.
4. Open the frontend at <http://localhost:5173> or API Swagger at <http://localhost:3000/docs>.

The frontend is the RaktSetu Vite/React app in [`frontend/`](frontend/) on `http://localhost:5173`; it calls the API at `http://localhost:3000/v1`. The API allows this origin with `WEB_ORIGIN`. PostgreSQL is published on host port `5433` to avoid the common local `5432` conflict. Docker Compose initializes the database, runs the checked-in Prisma migration and idempotent demo seed, then starts NestJS and Vite in watch mode. `docker compose -f docker/docker-compose.yml down -v` removes the local database volume and its data.

The demo coordinator email/password are controlled by `COORDINATOR_EMAIL` and `COORDINATOR_PASSWORD` in `backend/.env`. Fictional donor demo accounts use `anaya@example.test`, `rohan@example.test`, `meera@example.test`, and `kabir@example.test`, with password `DonorDemo123!`.

## API outline

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/v1/auth/register` | Public | Register donor and profile |
| `POST` | `/v1/auth/login` | Public | Get a one-hour JWT |
| `GET` | `/v1/auth/me` | JWT | Inspect current account |
| `GET` | `/v1/donors/me` | Donor JWT | Get own profile and contact |
| `PATCH` | `/v1/donors/me` | Donor JWT | Update own profile/availability |
| `GET` | `/v1/donors/me/eligibility` | Donor JWT | Get 56-day eligibility estimate |
| `GET` | `/v1/blood-requests` | Public | List active requests |
| `GET` | `/v1/blood-requests/:id` | Public | View active request details |
| `POST` | `/v1/blood-requests` | Coordinator JWT | Create a request |
| `POST` | `/v1/blood-requests/:id/verify` | Coordinator JWT | Verify request |
| `POST` | `/v1/blood-requests/:id/matches` | Coordinator JWT | Match donors; response includes contact details for coordination |
| `POST` | `/v1/blood-requests/:id/fulfill` | Coordinator JWT | Close met request |
| `POST` | `/v1/blood-requests/:id/cancel` | Coordinator JWT | Cancel request |

Use `B_POSITIVE`, `O_NEGATIVE`, etc. for the blood group values in JSON. A match requires a verified, open, unexpired request. Expired requests are marked `EXPIRED` as active requests are listed or processed.

Primary IDs for accounts, donors, and blood requests are auto-incrementing integers (`1`, `2`, `3`, ...). The ID migration preserves existing rows and remaps their foreign-key references; route IDs and API response IDs are numbers.

## Data and safety notes

- Donor phone numbers are encrypted with AES-256-GCM using `DATA_ENCRYPTION_KEY`; passwords use bcrypt. Keep `.env` private and do not change the encryption key after storing data unless you plan to re-encrypt donor contacts.
- Donor location in this local demo uses approximate coordinates. Match results return area and rounded distance. Coordinator-only matches return the donor contact number.
- The 56-day donation interval is a prototype estimate, not medical clearance. Donors must confirm eligibility with qualified medical staff.
- Sample names, numbers, and requests are fictional. No patient name or diagnosis is collected.
- Donor reminders and hospital integrations are not part of this initial implementation.
