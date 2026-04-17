# SplitTable MVP (Next.js App Router PWA)

Production-oriented restaurant management MVP as a **web PWA** (not native), with local workspace persistence for development.

## Core decisions

- No full authentication/role system in MVP (no NextAuth/Clerk yet)
- Customer entry via QR table URL: `/table/[token]`
- Internal dashboards remain simple for MVP: `/admin`, `/waiter`, `/kitchen`, `/cashier`
- Business logic is in service modules (`src/features/*`), not page components
- All writes/reads use server APIs with zod-validated inputs

## Tech

- Next.js App Router + TypeScript
- Local JSON persistence inside `data/local-store.json`
- zod validation
- PWA manifest + service worker + install prompt + standalone mode

## Project structure

- `src/app/*`: App Router pages, role-based route groups, layouts, and API routes
- `src/app/(admin|waiter|kitchen|cashier)/*`: role-isolated dashboard flows
- `src/app/(public)/table/[token]/*`: public QR customer flow
- `src/components/layout/*`: reusable shell/layout primitives
- `src/features/*`: modular services and zod schemas (business domain modules)
- `src/lib/*`: shared runtime utilities and navigation config
- `src/hooks/*`, `src/validations/*`, `src/types/*`: clean shared extension points
- `prisma/schema.prisma`: full data model

## MVP modules implemented

- Restaurant/branch management
- Table management with QR code/token
- QR-based table guest access
- Menu categories and menu items
- Table session management (open/join)
- Customer ordering
- Waiter ordering
- Kitchen queue board
- Cashier invoice calculation
- Split bill modes:
  - `FULL_BY_ONE`
  - `EQUAL`
  - `BY_GUEST_ITEMS`

## Quick start

1. Copy env file

```bash
cp .env.example .env
```

2. Install deps

```bash
npm install
```

3. Run the app

4. Optional seed

```bash
npm run db:seed
```

or call `POST /api/seed` once from the app to restore the default local dataset.

5. Run app

```bash
npm run dev
```

## Important endpoints

- `GET /api/admin/snapshot`
- `POST /api/admin/branches`
- `POST /api/admin/tables`
- `POST /api/admin/menu-categories`
- `POST /api/admin/menu-items`
- `GET /api/admin/qr/[tableToken]`
- `GET /api/guest/[tableCode]`
- `POST /api/sessions/open`
- `POST /api/sessions/join`
- `GET /api/sessions`
- `POST /api/orders/customer`
- `POST /api/orders/waiter`
- `GET /api/kitchen`
- `PATCH /api/kitchen/items/[orderItemId]`
- `POST /api/cashier/invoices`

## Notes

- MVP intentionally skips advanced shared-item split logic.
- For `BY_GUEST_ITEMS`, every billable item must be assigned to a guest.
- Local development data is persisted in `data/local-store.json`.
