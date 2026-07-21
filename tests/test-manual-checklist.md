# Real Estate CRM — Manual Test Checklist

Run through these scenarios in the browser before each deployment.

## 1. Authentication & Access
- [ ] Open app — redirects to `/login` if not authenticated
- [ ] Sign up with email + password (min 8 characters) — lands on onboarding, then dashboard
- [ ] Logout works — returns to login page
- [ ] Log back in with the same email + password — dashboard loads
- [ ] UserMenu shows user name/email, org switcher, logout button

## 1b. Invite / Claim Flow
- [ ] As an org admin, invite a teammate by email (Settings / Org Members) — get a claim link back
- [ ] Open the claim link in an incognito window — email field is pre-filled and locked
- [ ] Set a password and submit — account created, lands directly in the inviting org (no manual org switch needed)
- [ ] Attempting to reuse the same claim link afterward fails (account already claimed)
- [ ] Log in as an existing user, try inviting the same email again while still pending — a fresh claim link is issued

## 2. Lead Lifecycle (Critical Path)
- [ ] Navigate to Leads — list page loads with filters
- [ ] Click "New Lead" — create form opens
- [ ] Create lead with: First Name, Last Name, Email, Phone, Budget, Property Type, Area, Notes, Source
- [ ] Lead appears in list with "New" status
- [ ] Click lead — detail page loads with all fields
- [ ] Click "Edit" — edit modal opens, change budget, save
- [ ] Click "Qualify" — status changes to "Qualified"
- [ ] Click "Convert" — modal opens with Opportunity Name (leads convert directly to a Contact, no Account entity)
- [ ] Submit conversion — redirects to Opportunity detail (or Contact detail if no opportunity name given)
- [ ] Verify Contact was created (check Contacts list)
- [ ] Go back to lead — shows "Converted" with a link to the Contact (and Opportunity, if created)

## 3. Communication Panel (on Lead Detail)
- [ ] SMS tab — compose area shows, "To:" shows phone number
- [ ] Email tab — compose area shows with subject field, "To:" shows email
- [ ] Chat tab — compose area shows
- [ ] Type a message and click Send — message appears in history with "queued" status
- [ ] Message shows sender name, timestamp, channel icon

## 4. Lead List — Bulk Operations
- [ ] Select multiple leads via checkboxes
- [ ] Bulk action bar appears with count
- [ ] "Status" — modal opens, select status, update
- [ ] "Source" — modal opens, select source, update
- [ ] "Reassign" — modal opens, select agent, reassign
- [ ] "Mass Email" — compose modal, type message, send
- [ ] "Mass SMS" — compose modal, type message, send
- [ ] "Delete" — confirm modal, delete
- [ ] Select All checkbox works
- [ ] Clear selection (X button) works

## 5. Contacts
- [ ] Contacts list loads
- [ ] Click contact — detail page with opportunity roles
- [ ] Click "Edit" — edit modal works
- [ ] Internal Notes section works
- [ ] Bulk delete works

## 6. Opportunities
- [ ] Opportunities list loads
- [ ] Click "New Opportunity" — create form
- [ ] Toggle to Pipeline view — Kanban board shows stages
- [ ] Click opportunity — detail page loads
- [ ] Click "Edit" — edit name, amount, probability, close date
- [ ] Stage progression bar — click a stage to change
- [ ] "Won" and "Lost" buttons work
- [ ] Contact Roles section shows associated contacts
- [ ] Activity timeline shows stage changes
- [ ] Bulk operations (stage update, delete) work

## 7. Tasks
- [ ] Tasks list loads with status/priority filters
- [ ] Click "New Task" — create modal with subject, description, related object, due date, priority
- [ ] Status toggle (checkbox) — Open → InProgress → Completed
- [ ] Overdue tasks show red indicator
- [ ] Pagination works

## 8. Team Chat
- [ ] Click "Create Channel" — enter name, creates channel
- [ ] Select channel — message area loads
- [ ] Type message, send — appears in thread
- [ ] Messages show author avatar, name, timestamp
- [ ] Messages auto-refresh (poll every 5s)

## 9. AI Features (on Lead Detail)
- [ ] Click "Score" — AI scoring runs, score badge appears
- [ ] Click "Insights" — AI summary and recommendations load
- [ ] Score reasoning text displays
- [ ] Recommendations show action, reason, priority
- [ ] Cached results load instantly on revisit
- [ ] **Deferred (Phase 8 not done)**: this section will fail until aiFeatures.ts is migrated off the deleted Synthetiq Claude client — expected, not a regression

## 10. Reports
- [ ] Report builder loads with entity picker
- [ ] Select entity (Lead), group by (status), chart type (bar)
- [ ] Click "Run Report" — chart and table render
- [ ] Add filter — results update on re-run
- [ ] Click "Save" — save modal, enter name, save
- [ ] Saved report appears in sidebar
- [ ] Click saved report — loads config
- [ ] Delete saved report works

## 11. Agent Performance
- [ ] Leaderboard loads with summary cards
- [ ] Charts show (conversion rate, pipeline value)
- [ ] Sort dropdown works (by leads, revenue, etc.)
- [ ] Click agent row — drilldown expands with leads by status, opportunities by stage
- [ ] Summary stats show win rate, pipeline, open/overdue tasks

## 12. Settings
- [ ] Structure tab — BU and Team management
  - [ ] Create Business Unit
  - [ ] Edit Business Unit (hover for edit icon)
  - [ ] Deactivate Business Unit
  - [ ] Create Team (under a BU)
  - [ ] Edit Team
  - [ ] Click team — team members panel opens
  - [ ] Add team member from dropdown
  - [ ] Remove team member
- [ ] Message Templates tab
  - [ ] Create Email template with placeholders
  - [ ] Create SMS template
  - [ ] Edit template
  - [ ] Delete template
  - [ ] Templates show channel badge and category
- [ ] CRM Roles tab
  - [ ] Click "Initialize / Update Roles"
  - [ ] Shows created/updated status for each role

## 13. Admin / Roles
- [ ] Roles & Permissions page (`/roles`) — view roles, create role, assign scopes
- [ ] **Known gap, not caused by this migration**: the platform-admin sidebar's "Users" (`/admin/users`) and "Organizations" (`/admin/organizations`) links have no matching route in `App.tsx` — they 404 (SPA fallback shows the app shell but no page content). No corresponding page component exists in `src/web/pages` either. Pre-existing gap, not something this migration broke — flagging rather than silently building new admin pages that weren't part of decoupling from Synthetiq.

## 14. Audit Log
- [ ] Audit log loads with entries
- [ ] Filter by Entity Type dropdown
- [ ] Filter by Action dropdown
- [ ] Filter by User dropdown (shows org members)
- [ ] Date range filter works
- [ ] Click entry — expands to show field-level changes
- [ ] "Export CSV" button downloads file
- [ ] Pagination works

## 15. Compliance
- [ ] Deletion Requests tab
  - [ ] Create new request with email
  - [ ] Click "Review & Process" — impact preview modal shows record counts
  - [ ] Confirm deletion — status changes to "completed"
- [ ] Data Export tab
  - [ ] Enter email — click Export
  - [ ] Results show lead/contact/activity counts
  - [ ] "Download JSON" button works
- [ ] Retention Policies tab
  - [ ] Select entity type, set days, save
  - [ ] Policy appears in table

## 16. Tenant Management
- [ ] Tenant list shows all organizations
- [ ] Click "New Tenant" — create with name and plan
- [ ] "Suspend" shows confirmation modal
- [ ] Confirm suspend — status changes
- [ ] "Activate" restores access

## 17. Responsive Design
- [ ] Resize browser to mobile width
- [ ] Sidebar collapses, hamburger menu appears
- [ ] Navigation works on mobile
- [ ] Tables have horizontal scroll on mobile
- [ ] Forms are usable on mobile

## 18. Dark Mode
- [ ] Switch system preference to dark mode
- [ ] All pages render correctly in dark theme
- [ ] Charts and badges are visible
- [ ] No white flash on page transitions
