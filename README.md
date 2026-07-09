# QuickStock Prototype

QuickStock is a small offline-first sales and inventory prototype built with Expo Router and WatermelonDB. The current codebase focuses on the mobile client and local persistence. The backend sync service will be added later.

## What is implemented now

- A single mobile screen that lists products from WatermelonDB.
- Local create, edit, and delete flows for products.
- Persistent offline storage through WatermelonDB + SQLite.
- A starter data seed so the app is useful on first launch.

## What is intentionally not implemented yet

- The sync API that accepts pending sales from the client.
- The delayed external confirmation callback that flips a sale from `pending` to `confirmed`.
- Multi-user support and authentication.

## Tech Stack

- Expo SDK 54
- Expo Router
- React Native
- WatermelonDB
- SQLite adapter for persistent local storage

## Project Structure

- [app/](app) contains the active Expo Router screens.
- [model/](model) contains the WatermelonDB schema, model, migrations, and database initializer.
- [app-example/](app-example) is the original starter template and is no longer the active app.
- [android/](android) contains the native Android project created for the development build.

## How the app works

The current screen in [app/index.tsx](app/index.tsx) uses [model/getDatabase()](model/index.ts#L1) to open a cached WatermelonDB instance. On first run it seeds a small list of products, then renders the stored records from the local database.

WatermelonDB is configured in [model/index.ts](model/index.ts) with:

- a SQLite adapter,
- the app schema from [model/schema.ts](model/schema.ts),
- the `Product` model from [model/Product.ts](model/Product.ts),
- and migration metadata from [model/migrations.ts](model/migrations.ts).

The project uses decorators and WatermelonDB-specific Babel support in [.babelrc.config.js](.babelrc.config.js), which is required for the model annotations to work correctly.

## Local setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Start the development server.

   ```bash
   npm run start
   ```

3. Run on a device or emulator using a development build.

   ```bash
   npm run android
   ```

   Expo Go is not enough for the database layer here because WatermelonDB needs the native SQLite bridge provided by a development client.

## Important runtime note

If the app shows the database error state, it usually means the native WatermelonDB bridge is missing from the build. Rebuild the dev client and reinstall it on the device or emulator before testing the database screen again.

## Architecture Notes

The intended final architecture for the exercise is:

1. Expo client for product and sale entry.
2. WatermelonDB for offline local persistence.
3. Small sync queue on the client for deferred network submission.
4. Express or FastAPI backend for sales ingestion.
5. A delayed confirmation endpoint that updates sale status after a short timeout.

For now, only the client-side persistence and CRUD flow are in place.

## Assumptions

- The prototype is single-user and local to one device.
- Product data is stored offline first and should survive app restarts.
- The backend will be added separately and should not block the client-side demo.
- Functionality is more important than visual polish for this exercise.

## What I would do next

- Add a `Sale` model and local outbox table.
- Replace the seed-only flow with real product and sale screens.
- Add a backend API with durable storage.
- Implement retry-based sync and polling for sale confirmation.

## Manual verification

- Open the app in a development build.
- Confirm the product list loads from local storage.
- Add, edit, and delete a product.
- Restart the app and confirm the data is still present offline.

## Resetting the starter template

The original Expo starter remains in [app-example/](app-example) as a reference. If you want to return to a blank starter structure, run:

```bash
npm run reset-project
```
