# Blood Donation Web

Standalone React + Vite frontend for the Blood Donation API. It runs independently on port `5173` and calls the API at `http://localhost:3000/v1` by default.

The Docker Compose setup starts this app alongside the API. To run only the frontend during local development:

```sh
cd web
npm install
npm run dev -- --host 0.0.0.0
```

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` if the API runs at another address. The API must allow the frontend's origin through its `WEB_ORIGIN` setting. Authentication tokens are kept in memory and are cleared when the page is refreshed.

The page supports donor registration, sign-in, profile and availability updates, eligibility checks, public request browsing, coordinator sign-in, request creation and verification, donor matching, and request fulfillment/cancellation.
