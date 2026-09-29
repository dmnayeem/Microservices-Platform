# Visibility & admin access — update plan (2026-09-29)

This updates what already exists: `/admin/visibility`, `page-visibility*.ts`, per-user overrides, `/admin/access` and RBAC. Nothing is rebuilt from scratch.

## Done first (security)
- `/api/admin/settings` refuses the `rbac.*`, `page_visibility.*` and `admin_modules.*` keys unless the caller is super admin. Before this, any admin holding `settings.edit` could rewrite the role→permission table.

## User side — super admin hides any page or feature
1. **Rules get an "Everyone" bucket.** `PageVisibilityRules.global: string[]`, shown as an "Everyone" column in the matrix.
2. **The Roles tab lists every role**, built from `UserRole` instead of a hard-coded list.
3. **The registry covers every page.** Add:
   - /missions, /affiliate, /my-package, /saved, /custom-tasks
   - /kyc, /payment-methods, /profile, /groups, /hashtag, /u
   - /course-creator, /learn, /certificates
   - the tutor area
   - A safe list stays always visible: /no-access, /2fa-setup, /update-password and settings/security.
4. **Enforced on the server.**
   - The `(main)` layout redirects a hidden page to /no-access before it renders. The client guard stays for client-side navigation.
   - The APIs behind a hidden page refuse via `assertPageVisible` (a map of page → API prefixes).
5. **Every entry point is filtered.** Hubs and cards (earning hub, /tasks categories, dashboard cards, quick links) drop hidden pages as well as the nav.
6. **One Visibility hub** at `/admin/visibility` with tabs:
   - Pages: Everyone / Package / Role
   - Features: plan × feature, linking to the package form
   - Task categories
   - Per user: the existing tri-state panel

## Admin side — super admin controls which admin pages exist, and for whom
7. **Rules and overrides.**
   - SystemSetting `admin_modules.rules = { disabled: href[], roles: Record<role, href[]> }`.
   - `User.moduleOverrides Json?` (migration) holds per-admin show/hide per module.
8. **Applied in `getEffectiveModules` and in the admin layout's `pathAllowed`.**
   - A disabled or denied module is hidden and blocked for everyone but the super admin.
   - A per-admin grant adds that module's permissions, still passing through `stripProtectedForRole`, so it can never leak finance access.
   - Denial is page-level: modules share permissions, and the UI says so.
9. **`/admin/access` gets two additions.**
   - An "Admin pages" tab: modules × roles, plus an "Off for all admins" column.
   - A per-admin tri-state module panel, shown on the admin's account.
10. **Two module fixes.**
    - Register `/admin/offerwall-callbacks` as a module.
    - The `/admin/visibility` module becomes super-admin-only, matching its page.

## Never
- Super admins are never locked out.
- The safe list (security and 2FA pages) can never be hidden.
- Money routes keep their own checks; visibility only adds refusals and never grants.
