# Multi-tenant Manual Verification

## Preconditions
- API server running (`npm run dev:api` or `npm run dev`).
- App running (`npm run dev`).
- Control DB reachable.

## Test Users
- Tenant A user: `alice@acme.com`
- Tenant A user 2: `bob@acme.com`
- Tenant B user: `charlie@globex.com`

Use the login flow or set `active_user_profile` in localStorage with matching email.

## 1) Connection isolation by tenant
1. Login as `alice@acme.com`, create connection `A-CONN`.
2. Login as `charlie@globex.com`, open datasource list.
3. Verify `A-CONN` is **not visible**.

Expected: tenant B cannot see tenant A connections.

## 2) Connection visibility inside same tenant
1. Login as `alice@acme.com`, create `A2-CONN`.
2. Login as `bob@acme.com` (same domain/tenant).
3. Verify shared connections (default `tenant_shared`) are visible.

Expected: same-tenant users can see shared records.

## 3) Mutation guardrails
1. As tenant A, capture connection id for `A-CONN`.
2. Switch to tenant B (`charlie@globex.com`).
3. Attempt update/delete of tenant A connection id via API.

Expected: API returns `403` and no data is mutated.

## 4) Saved Apps tenancy
1. As tenant A, save app in Builder (`APP-A-1`).
2. As tenant B, open saved apps.

Expected: `APP-A-1` is not visible in tenant B.

## 5) Activity log entries
1. Perform create/update/delete for connections/apps/dashboards as tenant A.
2. Query `activity_log` in control DB:
   - `SELECT tenant_id, user_id, entity_type, action, created_at FROM activity_log ORDER BY id DESC LIMIT 20;`
3. Verify entries are present with expected tenant/user/entity/action.

Expected: actions are tracked with correct tenant and user.
