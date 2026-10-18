<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- UI data flows through typed services in `src/services/api.ts` backed by one central repository (`src/data/repository.ts`) where counts, KPIs and lifecycle are derived from linked records; mutations go through hooks in `src/hooks/useWeather.ts` that invalidate queries, so every page stays consistent and a real backend can be swapped in.
- Event filters (PS 26069 date/event/location/verification + source/media/GPS) live in one shared store (`src/features/events/filters.ts`) with the filter→sort→paginate pipeline and `toQueryParams` for future backend params; the bar (`EventFilterBar.tsx`) stages changes until Apply. Why: map, stream, table, KPIs and analytics stay in sync.
- Maps use MapLibre GL JS with OpenStreetMap raster tiles; keep the map client-side so SSR remains safe.
- Section pages are generated from `src/lib/navigation.ts`; every nav item has a matching route file, and unbuilt sections render `PlaceholderPage`.
- Role access lives in `src/lib/roles.ts`: each role has its own nav (`ROLE_NAV`) and route access is derived from it via `canAccess`, enforced by `RouteGate` in AppShell; why: one source for menus and permissions. Current role is a client-side demo switcher — must move to server-verified roles once sign-in exists.
- UI text for citizen-facing screens goes through `src/i18n` (`useT` + `translations.ts`, English fallback); why: one dictionary per language, never per-component strings. Report content is never UI-translated — AI translations are shown separately and labelled demo.
- Every repository mutation writes an `AuditEntry` via `record()` in `src/data/repository.ts`; why: the audit log reflects real session actions, not a static table.
- Error, empty and loading screens use `src/components/hs/states.tsx` (`StateScreen` + skeletons); why: consistent design and no raw errors shown.
- Media uploads go through the `Uploader` interface in `src/services/upload.ts`; why: the demo simulator can be swapped for presigned uploads without UI changes.
- Source health, pipeline and ML metrics are deterministic demo modules (`src/data/sourceHealth.ts`, `src/features/ml`); why: stable values until real monitoring APIs replace them.
- AI report triage runs server-side via createServerFn (`src/lib/triage.functions.ts` → `triage.server.ts`); why: keeps the AI key and prompt off the browser. Citizen status notifications live in `src/features/public/CitizenBell.tsx` (session-only).
