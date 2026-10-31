# Chemistry Executive Transportation

Static, responsive preview website for executive transportation services.

## What works

- Service descriptions and on-page navigation on desktop and mobile.
- Ride request preview with required fields, passenger limits (1–30), and local-calendar date validation.
- A summary of the service, date, time, passengers, locations, and optional notes.
- User input is displayed as plain text. The form does not transmit or persist data.

**This is a demo, not an operational reservation system.** There is no booking backend, customer contact collection, dispatch, payment processing, or confirmation email. A production booking flow requires a selected booking provider or backend and business contact information.

## Local preview

Open `index.html` in a browser, or serve the repository with a static web server. There is no build step or production dependency.

## Browser checks

With Node.js 22 or later installed:

```sh
npm ci
npx playwright install chromium
npm test
```

The tests start their own local server. To test a deployed copy, set `SITE_URL` to its URL before running `npm test`. Tests use synthetic trip information and send no reservations.

## GitHub Pages

In repository Settings → Pages, select **GitHub Actions** as the source. This one-time setup is required before the deployment workflow can succeed; a normal workflow token cannot enable Pages itself.

Pull requests run browser checks. Pushes to `main` run those checks before deploying only `index.html` to GitHub Pages. Tests, dependencies, and repository metadata are excluded from the published artifact.

Expected URL: https://lavender333.github.io/executive-transportation/
