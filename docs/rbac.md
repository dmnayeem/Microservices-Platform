# Roles, permissions & access control

Admin access is a three-layer effective-permission system. Code defaults are the
seed; a super admin overrides them at runtime; individual admins can be tuned on
top. Nothing here needs a code change to reconfigure.

```
code defaults (ROLE_PERMISSIONS)          ← src/lib/rbac.ts
  → runtime role config (per role)        ← SystemSetting "rbac.role_permissions"
    → per-user grants/denials             ← User.permissionOverrides
      = effective permissions             ← src/lib/permissions.ts
```

## Roles

`UserRole` (prisma) — `USER`, `TUTOR`, `SUPER_ADMIN`, **`ADMIN`**, `FINANCE_ADMIN`,
`CONTENT_ADMIN`, `SUPPORT_ADMIN`, `MARKETING_ADMIN`, `MODERATOR`, **`AGENCY`**,
**`AD_MANAGER`** — plus **custom roles** (see below).

- **SUPER_ADMIN** always has every permission — config/overrides can never strip
  it (lock-out safety). Only a super admin can do the protected actions below.
- **ADMIN** — the generic admin below super-admin; broad by default but **never
  finance and never `admins.manage`**. Super-admin tunes it in the editor.
- **AGENCY** — a user-side advertiser/agency console, **not** an admin-panel role
  (auto-grants advertiser/agency/createTasks features via `ROLE_FEATURES`).
- **AD_MANAGER** — admin scoped to the Ads Manager surface.

## Custom roles (super-admin creates any role)

A super admin can create **named custom roles** with any chosen permissions at
`/admin/access` → Roles & Permissions → **Custom roles** (model `CustomRole`,
API `/api/admin/access/custom-roles`). A custom role's permission picker never
offers finance or `admins.manage` (stripped on save). Assign one from a user's
**role dropdown** (a `custom:<id>` option) — the user's enum `role` is set to
`ADMIN` as the admin baseline and `User.customRoleId` points at the role, so
their effective permissions come entirely from the custom role's set (nav +
guards filter accordingly). Deleting a custom role drops assigned users back to
plain `ADMIN` (FK `SetNull`).

## Protected — super-admin-only forever

Enforced regardless of any granted config/override:

- **Finance** (`withdrawals.*`, `payment_methods.*`, `packages.*`, `referrals.*`)
  is held only by **SUPER_ADMIN + the built-in FINANCE_ADMIN** role. The generic
  ADMIN and every custom role can never get it — the editor hides it, and
  `stripProtectedForRole` (in the effective resolver) removes it as a backstop.
- **`admins.manage`** (editing the role matrix, custom roles, per-user overrides)
  is SUPER_ADMIN-only.
- **Acting on a SUPER_ADMIN user** — edit/ban/delete/approve/adjust-balance/
  impersonate/bulk — requires the actor be SUPER_ADMIN (guarded in every
  `api/admin/users/**` mutation; the bulk route also blocks non-super admins from
  acting on any admin account). Assigning the SUPER_ADMIN role (or any admin/
  custom role) is SUPER_ADMIN-only. The UI hides those controls for super-admin
  target rows.

## Who sees what — the super-admin config editor

`/admin/access` → **Roles & Permissions** tab (super admin only, others see it
read-only). Per role you can:

- **Toggle a whole section on/off** (the master switch per category — e.g. turn
  **Finance** off for a role).
- **Expand → advanced** for individual permission checkboxes.
- **Reset** a role to its code defaults.

Saving writes the `rbac.role_permissions` SystemSetting via
`POST /api/admin/access/role-permissions` (super-admin + `admins.manage`). The
effective engine picks it up everywhere immediately (short settings-cache TTL).

## Per-user grants & denials

`/admin/users/[id]/edit` → **🛡️ Permissions** tab (super admin only), tri-state
**Default / Grant / Deny** per permission. This is how you **hide finance from
one specific admin**: open that admin, Deny the finance permissions. Stored on
`User.permissionOverrides` (`{ [permission]: boolean }`), persisted by
`PATCH /api/admin/users/[id]` (super-admin gated).

(The **Feature Access** tab next to it controls end-user *package features* —
advertiser/createTasks/etc. — a separate system.)

## Enforcement — hidden AND blocked

- **Nav** (`AdminSidebar`) renders only the modules the effective set allows —
  disabled sections never appear.
- **Central route guard** (`src/app/admin/layout.tsx`) maps the request path →
  its module → required permission; a direct link to a section the user can't
  access redirects to **`/admin/no-access`** (never the real page). The pathname
  reaches the layout via an `x-pathname` header set in the Edge middleware
  (`src/lib/auth/config.ts`).
- **API routes** under `src/app/api/admin/**` check `can(session.user.id, perm)`
  (effective), so a *denied* admin can't reach an endpoint directly either.

Helpers (`src/lib/permissions.ts`, server-only): `can` / `canAny` / `canAll`,
`getEffectivePermissions(userId)`, `getEffectiveModules(userId)`,
`requirePermission(perm)`, `pathAllowed(pathname, perms)`.

## Task creation is per-type

- **Admin** (`POST /api/admin/tasks`) checks `tasks.create` (umbrella) **or** the
  type's permission — `tasks.create.video`, `…social`, `…quiz`, etc. Configure
  these per role in the editor (folded into *Content & Earning*); the create form
  only offers the types the admin may create.
- **User self-serve** (`POST /api/tasks/create`) needs the `createTasks` feature;
  SOCIAL additionally needs the `socialTasks` feature.

## Adding a permission

1. Add it to the `Permission` union in `src/lib/rbac.ts`.
2. Grant it to `SUPER_ADMIN` (keeps `ALL_PERMISSIONS` complete) and any default
   roles.
3. Add it to a `PERMISSION_CATALOG` group so it shows in both editors.
4. Gate the page/API with `requirePermission` / `can`.
