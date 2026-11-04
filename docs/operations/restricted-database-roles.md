# Restricted job and operations database logins

Create these logins with **SQL**, not Neon Console, CLI or role-creation API. During staging setup an API-created login was observed with CREATEDB, CREATEROLE, BYPASSRLS and `neon_superuser` membership. That is an administrative credential even if its name says “sweeper”. Neon documents that SQL-created roles receive ordinary defaults while its management interfaces create administrator roles. [Neon role management](https://neon.com/docs/manage/roles).

The root operator has now created and tested SQL login `tryon_rehearsal_ops` on the exact staging branch. Reported verification: no superuser/create/inherit/bypass attributes, no customer-table privileges, only the three approved operations functions, and successful bounded cleanup with zero overdue counts. Its credential is private; this document does not install it anywhere. The unused API-created `tryon_rehearsal_sweeper` must not be installed; removal remains a separately controlled operator action until confirmed.

## Provision privately, after verifying the target

1. Resolve endpoint → branch with Neon metadata. Assert staging `ep-billowing-bar-bb2324fe` → `br-icy-bread-bbzngw6q` in project `empty-bird-73072158`; assert any production target separately. Never infer isolation from a branch or role name.
2. Confirm the required job/closure/ops migrations and function owners. Use a fresh distinct name for each environment and purpose. Do not reuse an API-created role or “fix” it by merely setting NOINHERIT.
3. Generate a strong random password in the private operator process (for example `secrets.token_urlsafe(48)`). Have approved secret storage ready. Execute the owner-side statement below with a safely quoted identifier/password, never string interpolation of raw values, shell arguments, output, screenshots, clipboard, SQL history or committed files. Keep SQL/driver debug logging off for this operation.
4. Verify attributes/memberships/ownership as owner, then connect as the **actual new login** and verify effective privileges. Only after these checks pass may the operator pass the new DSN directly to its approved service secret store.

SQL shape (the example intentionally creates no usable password; the private provisioning process must set the generated password without displaying it):

```sql
CREATE ROLE tryon_production_ops LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION
  PASSWORD NULL;

GRANT CONNECT ON DATABASE neondb TO tryon_production_ops;
GRANT USAGE ON SCHEMA public TO tryon_production_ops;
GRANT EXECUTE ON FUNCTION
  public.tryon_sweep(), public.tryon_ops_counts(), public.closure_ops_counts()
TO tryon_production_ops;
```

For the separate worker, use the same restrictive CREATE ROLE attributes and CONNECT/USAGE grants, but grant only:

```sql
GRANT EXECUTE ON FUNCTION
  public.tryon_claim(uuid,text), public.tryon_settle(uuid,text,bytea),
  public.tryon_extra(uuid,text,text)
TO tryon_production_worker;
```

When using psycopg, compose names with `sql.Identifier` and the private password with `sql.Literal`; do not log the composed statement. An interactive operator can instead set the generated password through a protected password prompt. A NULL password cannot authenticate. NOINHERIT does not remove memberships or their SET ROLE capability; keep these logins out of administrative roles entirely. [PostgreSQL role attributes](https://www.postgresql.org/docs/current/sql-createrole.html).

Do not grant database/schema CREATE, table/sequence access, ownership, membership of `neon_superuser` or the web owner, or GRANT OPTION. Inspect privileges inherited through PUBLIC: revoking a direct grant from one login does not cancel a privilege granted to PUBLIC. If inherited access is too broad, review the affected shared grant and application dependency before changing it; do not bulk-revoke unrelated production permissions.

## Required actual-login assertions

Run these SELECT-only checks through the new login. They print privilege metadata, not customer content or credentials:

```sql
SELECT current_database() = 'neondb' AS correct_database,
       current_user = session_user AS not_using_set_role;
-- Also assert current_user equals the exact expected login in the private runner.

SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolinherit, rolbypassrls, rolreplication
FROM pg_roles WHERE rolname = current_user;
-- Expect true, false, false, false, false, false, false.

SELECT count(*) AS memberships
FROM pg_auth_members
WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user);
-- Expect zero, including indirect admin membership entry points.

SELECT
  has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
  has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema,
  has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_public,
  has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_in_public;
-- Expect true, false, true, false.

SELECT count(*) AS public_tables_with_any_privilege
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
  AND has_table_privilege(current_user, c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
-- Expect zero.

SELECT count(*) AS owned_objects
FROM (
  SELECT datdba AS owner FROM pg_database
  UNION ALL SELECT nspowner FROM pg_namespace
  UNION ALL SELECT relowner FROM pg_class
  UNION ALL SELECT proowner FROM pg_proc
) o
WHERE o.owner = (SELECT oid FROM pg_roles WHERE rolname = current_user);
-- Expect zero.

SELECT p.oid::regprocedure::text AS function,
       has_function_privilege(current_user, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('tryon_claim','tryon_settle','tryon_extra','tryon_sweep',
                   'tryon_ops_counts','closure_ops_counts','request_account_closure')
ORDER BY function;
```

For operations, only sweep and both count functions must be true; claim/settle/extra/account closure must be false. For worker, only claim/settle/extra must be true; all operations/account closure functions false. Independently assert the intended signatures exist, owners differ from the login, SECURITY DEFINER functions fix `search_path=pg_catalog`, and PUBLIC has no EXECUTE on these sensitive functions.

Also issue `SELECT 1 FROM public.users_billing LIMIT 0`, and analogous ledger/job/profile queries, using the actual login: require SQLSTATE `42501`, without fetching rows. This catches effective privilege mistakes without exposing content. A real allowed operations run must return bounded aggregate counts; the sweep changes retention/job state, so run it only after that environment's cleanup has been authorized. Worker allow/deny and refund behavior use known synthetic staging jobs, never existing customer jobs.

Capture only role flags, expected function matrices, denied-query SQLSTATEs, target IDs and aggregate counts. Install the credential only after every check passes. Store staging and production DSNs in their own protected GitHub environments; the worker DSN goes only to that environment's worker.
