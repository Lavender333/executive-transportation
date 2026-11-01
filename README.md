# Executive Transportation

Executive transportation website with customer ride requests and a private manual-dispatch dashboard.

## Activation status

Connected project: `yczxhqelqpcdpqfxmixa`. Booking and tracking functions and the protected database are deployed. Staff account provisioning is a separate administrative step; publishing the site does not create an administrator. Live customer submissions and token access restrictions have been verified; real staff sign-in still requires the designated administrator to activate their account.

## Workflow

Customers enter their name, email, phone, service, pickup date/time/time zone, route, passenger count, and optional notes. The server validates and stores a **pending request**; the receipt explicitly says a ride is not confirmed until staff contacts the customer. It does not promise pricing or availability.

Authorized staff sign in at `dashboard.html`, review requests, contact customers manually, confirm trips, add drivers and vehicles, assign drivers, and mark trips completed or cancelled. A Refresh button loads new requests. Updates use a timestamp check so one dispatcher cannot silently overwrite another's changes. Unavailable drivers cannot receive new assignments. The dashboard provides no automated email/SMS or payment collection. Staff can create a private driver link for an assigned trip. Drivers explicitly start browser GPS sharing, and customers use the private tracking link in their booking receipt. Customer tracking refreshes every 15 seconds and marks locations older than 90 seconds as not live. Drivers must keep the page open and their device awake; this is not a background tracking app. Reassignment, completion, and cancellation revoke driver links and clear location.

## Practice dashboard

Open `demo.html` and sign in with **demo@example.test / demo123**. This isolated practice environment keeps sample requests in browser session storage and makes no production requests. Signing out resets it. The real staff login is `dashboard.html`; demo credentials cannot access real bookings.

## Development and tests

Node.js 22 or later:

```sh
npm ci
npx playwright install chromium
npm test
```

`npm test` builds the frontend, runs Chromium browser tests with mocked network responses, runs server validation tests, and exercises the actual PostgreSQL schema/RLS in an isolated PGlite database. These checks do **not** replace live Supabase authentication and Edge Function checks.

`npm run build` creates `_site/`. Serve that folder using a local static server. Generated assets and `_site/` are ignored by Git. GitHub Actions builds and deploys only `_site/` after tests pass.

## Backend activation

1. Create or select a dedicated Supabase project. Inspect existing tables before applying `database/schema.sql`; this initial schema is intended for an empty project. Apply `database/schema.sql` followed by `database/tracking.sql` and run Supabase security advisors.
2. Deploy `supabase/functions/submit-ride/index.ts` with its `validation.mjs` dependency as `submit-ride`, and `supabase/functions/track-ride/index.ts` as `track-ride`. Keep JWT verification enabled. The function uses Supabase's server-only environment credentials, validates every field, ignores privileged input, enforces hourly limits, and handles duplicate retry references. Its allowed browser origin is `https://lavender333.github.io`; update it if the site moves.
3. Set `public/backend-config.js` with the project URL, a public publishable key, and the legacy **anon** JWT as `functionKey`. The legacy anonymous JWT is used only for compatibility with the Edge gateway's JWT verification. Never put a service-role key or secret key in this file.
4. Provision the first staff account before opening submissions. With server credentials available only in your local environment, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DASHBOARD_URL`, then run `node scripts/staff-admin.cjs STAFF_EMAIL`. For an existing account, add `--recovery`. The script grants staff membership and prints a private, one-time setup link; send it only to that staff member. No email is automatically sent. The member opens the link and sets a password. Never commit setup links or server credentials.
5. Verify a synthetic request through the live function, staff sign-in, request confirmation, driver assignment, and rejection of anonymous/nonstaff data access. Cancel synthetic requests and deactivate synthetic drivers afterward. Verify deployment and staff access before using the system for real operations.

## Access and privacy

- Public clients cannot read or write any booking/driver table directly. New requests go through the validated Edge Function.
- Only verified-email sessions with an entry in `staff_access` can read requests, manage statuses, or manage drivers. Membership uses the signed auth email claim, never user-editable metadata. Do not disable email verification in Auth settings. There is no public staff registration form.
- Server-only credentials can create requests and manage staff access. Removing an email from `staff_access` revokes its data access immediately, including existing sessions.
- Customer and driver links contain separate random tokens; only their hashes are stored. Treat these links as private. Customer tracking returns trip status, driver first name/vehicle, and location, never passenger contact information.
- Staff sessions are scoped to the current browser tab. Signing out clears displayed customer records.
- Rate-limit identifiers are salted hashes; raw network addresses are not stored in application tables. Public requests are capped at ten per email/network per hour. Provider request logs remain subject to Supabase's logging settings.
- Customer details remain in the database for operational use. Establish a retention policy and delete records through authorized backend administration when no longer needed.

## Branding

Footer credit: Made by [Antoinette Williams](https://antoinettewillliams.com/) · [True Lavender Digital Solutions](https://www.thetruelavender.com/#).
