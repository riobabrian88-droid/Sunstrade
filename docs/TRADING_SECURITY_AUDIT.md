# SunStrade trading security and balance audit

Date: 2026-10-10
Scope: static review of repository source and SQL files on `main`. This is not a live Supabase configuration audit, penetration test, or independent financial-systems certification.

## Status

**Paper trading only. Do not enable real-money execution based on this review.** The current order RPC updates simulated wallets, positions, orders, and trade history in one database transaction, which is a useful foundation, but production database settings and deployed SQL have not been verified.

## Findings requiring action

### High priority: profile self-update policy may expose privileged fields

`0001_init.sql` creates a broad `Users can update own profile` policy using `auth.uid() = id`. The policy is row-scoped, but does not restrict which columns the user can update. If the deployed table grants `UPDATE` on `profiles` to `authenticated` and privileged columns such as `is_admin` or `is_suspended` are present, a user may be able to change their own privileged fields. This is a potentially critical privilege-escalation path and must be verified in the live database immediately.

Recommended: revoke broad table-level UPDATE from client roles and grant updates only on explicitly user-editable columns, or route profile edits through a narrowly scoped RPC. Verify admin/suspension fields cannot be changed by a normal authenticated user. Preserve admin functions with their own server-side authorization.

### High priority: deployed order function must be identified

The repository contains multiple SQL definitions of `public.place_order`. The versions differ in how they treat limit/stop orders. One version accepts `limit` but proceeds through immediate market-style execution; another version creates pending orders. Which behavior is active depends on the SQL actually applied to Supabase, not which file is newest in GitHub.

Recommended: inspect the live function definition and migration history. Keep one canonical, reviewed definition and test market, limit, and stop behavior before relying on it.

### High priority: validate all wallet mutations and transaction permissions

The wallet UI submits deposit/withdrawal requests to `wallet_transactions`; it does not itself alter the balance. The database-side schema, RLS policies, and any approval functions were not located in the reviewed paths, so it is not yet possible to certify that users cannot approve their own requests or alter balances directly.

Recommended: inspect live grants and policies for `wallets`, `wallet_transactions`, `positions`, `orders`, and `trades`. Clients should not have direct write access to balances, positions, filled orders, or trade ledger rows. Deposit/withdrawal approval must be server-authorized, atomic, auditable, and idempotent.

### Medium-high priority: pending orders and reservation accounting

The pending-order processor checks current balances/positions when it triggers, but pending orders do not appear to reserve buying power or sellable quantity when created. This may be an intentional simplified paper-trading behavior, but multiple open orders can compete for the same available funds or position and later be rejected.

Recommended: implement explicit reservations or clearly document that pending orders are unreserved; add tests for multiple pending buys/sells, simultaneous trigger processing, cancellation, and insufficient funds/positions.

### Medium priority: idempotency and concurrency tests

The market-order RPC locks a user's wallet row before applying a fill, which helps serialize wallet changes. However, there is no client-supplied idempotency key in the reviewed RPC, so retrying a request after a network timeout can place a second simulated order.

Recommended: add an idempotency key unique per user/order request, enforce it with a database constraint, and test concurrent duplicate requests and simultaneous buys/sells.

### Medium priority: public price route invokes privileged pending-order processing

`app/api/prices/route.ts` creates a Supabase client with `SUPABASE_SERVICE_ROLE_KEY`, updates market prices, and calls `process_pending_orders()`. This GET route has no visible request authentication or rate limiting. A public caller may repeatedly trigger provider requests and privileged order processing, creating avoidable load and operational risk.

Recommended: separate public price reads from privileged price updates/order processing. Protect scheduled processing with a secret-authenticated cron route and add caching/rate limits to public market reads. Never expose the service-role key to the browser.

## Required test plan before any real-money consideration

1. Verify deployed schema, grants, RLS policies, triggers, RPC definitions, and secret handling in the actual Supabase project.
2. Attempt profile privilege escalation as a normal test user; it must fail.
3. Attempt direct client writes to wallets, positions, orders, trades, and transaction approval fields; all unauthorized writes must fail.
4. Run concurrent and duplicate-order tests with synthetic accounts and paper balances.
5. Reconcile each test's opening balance + buys/sells + approved wallet adjustments against closing balance and position quantities.
6. Test pending-order creation, fill, rejection, cancellation, and retries.
7. Confirm no live exchange credentials, real payment rails, or real-money execution paths are enabled.
8. Obtain an independent security review and legal/compliance review before any real-money launch.


## Hardening changes added to the repository

The following changes have been committed during this review:

- `app/profile/page.tsx` now updates only `full_name`; it no longer uses an upsert that also requires profile insert permission.
- `supabase/trading_security_hardening.sql` revokes client write privileges for profile rows and trading ledger tables, grants authenticated users only column-level update on `profiles.full_name`, tightens the profile row policy, and restricts `place_order` and `process_pending_orders` execution to intended roles.
- These changes are **not active in Supabase just because they exist in GitHub**. The SQL must be reviewed and applied to a staging database first, then tested. Only after validation should it be applied to the production Supabase project.

The profile finding remains open until the SQL has been applied and a normal authenticated test user is shown to be unable to edit privileged profile fields. The direct-write controls likewise remain unverified against the live database.

## Review outcome so far

No database connection or live Supabase project access was available for this review. We have not run concurrent order tests, balance reconciliation, penetration tests, or verified the deployed Vercel environment. The public `GET /api/prices` route still performs privileged asset updates and invokes pending-order processing; it remains an open issue to separate read-only market quotes from secret-protected scheduled processing before any real-money consideration.

## Limitations

This report is based on source files in GitHub only. It does not prove which SQL scripts have been run in Supabase, inspect production environment variables, execute tests against the database, or verify the deployed Vercel build. Findings should be closed only after the live configuration and tests are independently checked.
