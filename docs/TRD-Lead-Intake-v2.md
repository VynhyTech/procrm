# Technical Requirements Document (TRD)
# Lead Intake & Management — v2 Architecture

**Version:** 2.0
**Date:** June 2026
**Status:** Draft
**Implements:** FRD-Lead-Intake-v2

---

## 1. Database Schema Changes

### 1.1 Lead Model — Restructure

**Remove these fields from Lead:**
- `budget` (moves to Interest)
- `propertyType` (moves to Interest)
- `preferredArea` (moves to Interest)
- `leadScore` (moves to a separate scoring concern)
- `scoreReasoning` (moves to AI cache)
- `convertedAccountId` (conversion tracked differently)
- `convertedContactId` (conversion tracked differently)
- `convertedOpportunityId` (conversion tracked differently)

**Add these fields to Lead:**
```
preferredContactMethod  String?    // Email, Phone, SMS, WhatsApp
campaignId              String?    // FK → Campaign (backend-resolved)
intakeMode              String     // manual, webhook, landing_page, campaign_form, syndication
matchedLeadId           String?    // If duplicate detected, FK → Lead
matchStrength           String?    // strong, weak, null
emailNormalized         String?    // Lowercased, trimmed (indexed for matching)
phoneNormalized         String?    // E.164 format (indexed for matching)
```

**Modify these fields:**
```
status    Change values to: New, InPool, Claimed, Working, Qualified, Disqualified, Converted, Merged
ownerUserId  Make OPTIONAL (null = in pool, set = claimed/assigned)
```

**New indexes:**
```
@@index([orgId, emailNormalized])    // For duplicate matching
@@index([orgId, phoneNormalized])    // For duplicate matching
@@index([orgId, status])             // For pool filtering (status = "InPool")
@@index([campaignId])                // For campaign attribution
```

### 1.2 New Model: Interest

```prisma
model Interest {
  id            String    @id @default(cuid())
  orgId         String
  parentType    String    // "Lead" or "Contact"
  parentId      String    // FK to Lead.id or Contact.id (polymorphic)
  propertyType  String?   // Apartment, Villa, Townhouse, etc.
  budget        Float?
  locationArea  String?
  bedrooms      Int?
  otherDetail   String?
  campaignId    String?   // FK → Campaign
  source        String?   // Channel this interest came from
  status        String    @default("Active") // Active, Cooled, Fulfilled, Dropped
  opportunityId String?   // FK → Opportunity (set when interest becomes a deal)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([orgId])
  @@index([parentType, parentId])
  @@index([status])
  @@index([campaignId])
}
```

### 1.3 New Model: Campaign

```prisma
model Campaign {
  id                      String    @id @default(cuid())
  orgId                   String
  name                    String
  type                    String?   // Email, Facebook, Google, LandingPage, Event, Referral
  status                  String    @default("Active") // Active, Paused, Completed
  startDate               String?
  endDate                 String?
  autoResponseTemplateId  String?   // FK → MessageTemplate
  matchRules              String?   // JSON: rules for matching inbound leads to this campaign
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt

  @@index([orgId])
  @@index([orgId, status])
}
```

### 1.4 New Model: DuplicateExclusion

```prisma
model DuplicateExclusion {
  id        String   @id @default(cuid())
  orgId     String
  leadIdA   String   // First lead in the pair
  leadIdB   String   // Second lead in the pair
  decidedBy String   // UserId of the agent who rejected the match
  createdAt DateTime @default(now())

  @@unique([leadIdA, leadIdB])
  @@index([orgId])
}
```

### 1.5 New Model: HoldingQueue

```prisma
model HoldingQueue {
  id           String   @id @default(cuid())
  orgId        String?
  rawPayload   String   // JSON: the original inbound data
  source       String   // Which entry point
  rejectReason String   // Why it failed validation
  status       String   @default("pending") // pending, resubmitted, discarded
  createdAt    DateTime @default(now())

  @@index([status])
  @@index([createdAt])
}
```

### 1.6 Contact Model — Add Owner

**Add to Contact:**
```
ownerUserId  String    // FK → User (REQUIRED — invariant: never null)
```

**Add index:**
```
@@index([ownerUserId])
```

### 1.7 Opportunity Model — Add Interest Link

**Add to Opportunity:**
```
interestId  String?   // FK → Interest (traces the deal to the interest that created it)
```

---

## 2. Data Cleaning Service

### 2.1 Normalization Functions

Create `src/server/lib/dataCleaner.ts`:

```typescript
export function normalizeEmail(email: string): string
  // lowercase, trim, remove dots before @ for gmail (optional)

export function normalizePhone(phone: string): string
  // Strip non-digit chars, detect country code, format as E.164
  // e.g., "(123) 456-7890" → "+11234567890"
  // e.g., "70493795684" → "+7170493795684" (with configured default country)

export function normalizeName(name: string): string
  // trim, collapse multiple spaces, title-case
```

### 2.2 Integration Points

- Called in `leads.create` mutation BEFORE saving
- Called in `leads.update` mutation when email/phone changes
- Applied to both manual and inbound entry points

---

## 3. Lead Pool & Claiming

### 3.1 Pool Query

New procedure: `leads.getPool`
- Returns leads where `status = "InPool"` and `assigned_user_id IS NULL`
- Filterable by source, intake_mode, creation date
- Ordered by createdAt ASC (oldest first)
- Accessible to all agents (scopedProcedure([]))

### 3.2 Claim Procedure

New procedure: `leads.claim`
- Input: `{ leadId: string }`
- Atomically: check `assigned_user_id IS NULL`, then set `assigned_user_id = ctx.userId` and `status = "Claimed"`
- If lead already claimed: throw CONFLICT error with "Already claimed by another agent"
- Log Activity: "Lead claimed by {agent}"
- Log AuditLog: claim event

**Concurrency:** Use Prisma's `update` with `where: { id, assignedUserId: null }` — if 0 rows updated, lead was already claimed.

### 3.3 Pool View (Frontend)

New page or tab on Leads page: "Lead Pool"
- Shows only InPool leads
- Prominent "Claim" button on each row
- Real-time or periodic refresh to show current pool state
- When claimed, lead disappears from pool with optimistic UI update

---

## 4. Duplicate Detection

### 4.1 Detection Logic

On every `leads.create`:

```
1. Query existing open leads (status NOT IN ['Converted', 'Merged', 'Disqualified'])
   WHERE orgId = current org
   AND (emailNormalized = new.emailNormalized OR phoneNormalized = new.phoneNormalized)

2. For each match:
   - If name matches AND (email OR phone matches) → strong match
   - If name matches only → weak match

3. Check DuplicateExclusion table — skip pairs already rejected

4. Store match info on the new lead: matchedLeadId, matchStrength

5. ALWAYS create the lead — match is informational, never blocking
```

### 4.2 Merge Logic

New procedure: `leads.merge`
- Input: `{ survivingLeadId, absorbedLeadId }`
- Steps:
  1. Re-point all Interest records from absorbed → surviving lead
  2. Re-point all CrmActivity records from absorbed → surviving lead
  3. Re-point all CommunicationMessage records from absorbed → surviving lead
  4. Re-point all InternalComment records from absorbed → surviving lead
  5. Copy any unique fields (email, phone) from absorbed to surviving if surviving is blank
  6. Set absorbed lead status = "Merged", set `mergedIntoId = survivingLeadId`
  7. Log Activity and AuditLog

### 4.3 Reject Match Logic

New procedure: `leads.rejectMatch`
- Input: `{ leadIdA, leadIdB }`
- Creates DuplicateExclusion record
- Clears matchedLeadId on both leads
- Prevents future re-flagging of this pair

---

## 5. Contact Re-Inquiry Flow

### 5.1 Contact Matching on Inbound

Before creating a lead from an inbound source:

```
1. Check existing contacts WHERE orgId AND
   (emailNormalized = normalized OR phoneNormalized = normalized)
   AND name matches (first + last)

2. If strong match found:
   - DO NOT create a lead
   - Create an Interest record on the contact
   - Create an Activity on the contact ("Re-inquiry from {source}")
   - Notify the contact's owner
   - Send generic auto-response
   - Return { matched: true, contactId }

3. If no contact match: proceed with normal lead creation
```

### 5.2 Notification

When a contact re-inquiry is detected:
- Create an in-app notification for the contact owner
- Notification text: "Your contact {name} just showed fresh interest — follow up"
- Link to the contact's detail page

---

## 6. Auto-Response System

### 6.1 Response Selection

```
function selectAutoResponse(lead, campaign, source):
  if campaign?.autoResponseTemplateId:
    return getTemplate(campaign.autoResponseTemplateId)
  if sourceDefaultTemplates[source]:
    return sourceDefaultTemplates[source]
  return null  // no response, but log the attempt
```

### 6.2 Execution

- Fires asynchronously after lead creation (non-blocking)
- Creates a CommunicationMessage with status "queued"
- Creates an Activity noting the auto-response
- When delivery services (Twilio/SendGrid) are connected, queued messages are sent

---

## 7. Interest → Opportunity Flow

### 7.1 Creating an Opportunity from an Interest

New procedure: `interests.convertToOpportunity`
- Input: `{ interestId, opportunityName }`
- Steps:
  1. Get the Interest and its parent (lead or contact)
  2. Get or create an Account for the parent
  3. Create Opportunity with:
     - `interestId` = source interest
     - `amount` = interest.budget
     - `source` = interest.source
     - `ownerUserId` = parent's owner
     - Campaign from the interest (for revenue attribution)
  4. Set interest.opportunityId = new opportunity
  5. Set interest.status = "Fulfilled"

---

## 8. Escalation Configuration

### 8.1 Org Settings

Add to Organization or AppSettings:
```
escalationThresholdMinutes  Int  @default(30)
escalationSupervisorId      String?  // FK → User
```

### 8.2 Escalation Check

Could be implemented as:
- A scheduled workflow that runs every 5 minutes
- Queries leads WHERE status = "InPool" AND createdAt < (now - threshold)
- Creates notification for supervisor
- Logs escalation Activity on each affected lead

---

## 9. Migration Strategy

### Phase 1: Schema Migration (non-breaking)
1. Add new fields to Lead (preferredContactMethod, campaignId, intakeMode, matchedLeadId, matchStrength, emailNormalized, phoneNormalized)
2. Add new models (Interest, Campaign, DuplicateExclusion, HoldingQueue)
3. Add ownerUserId to Contact
4. Add interestId to Opportunity
5. Make Lead.ownerUserId optional
6. Run migration to populate emailNormalized/phoneNormalized from existing data
7. Create Interest records from existing Lead.budget/propertyType/preferredArea data

### Phase 2: Logic Migration
1. Update lead creation to clean data and check duplicates
2. Add pool/claim workflow alongside existing assignment (dual mode)
3. Add contact matching on inbound
4. Wire up auto-response

### Phase 3: Field Removal (breaking)
1. Remove budget, propertyType, preferredArea from Lead (after all data migrated to Interest)
2. Remove convertedAccountId, convertedContactId, convertedOpportunityId from Lead
3. Update all UI to use Interest records instead of lead fields

### Phase 4: UI Updates
1. Lead Pool page/tab
2. Claim button and workflow
3. Duplicate resolution UI (merge/reject/reassign)
4. Interest management on lead/contact detail pages
5. Campaign management page
6. Contact re-inquiry notifications

---

## 10. API Endpoints Summary

### New Endpoints

| Procedure | Type | Scope | Description |
|-----------|------|-------|-------------|
| `leads.getPool` | query | [] | Get unclaimed leads in the pool |
| `leads.claim` | mutation | [] | Claim a lead from the pool |
| `leads.merge` | mutation | [leads:edit] | Merge two duplicate leads |
| `leads.rejectMatch` | mutation | [leads:edit] | Mark two leads as not duplicates |
| `interests.list` | query | [] | Get interests for a lead/contact |
| `interests.create` | mutation | [leads:edit] | Add an interest to a lead/contact |
| `interests.update` | mutation | [leads:edit] | Update interest status/details |
| `interests.convertToOpportunity` | mutation | [leads:convert] | Create opportunity from interest |
| `campaigns.list` | query | [reports:view] | List campaigns |
| `campaigns.create` | mutation | [reports:edit] | Create a campaign |
| `campaigns.update` | mutation | [reports:edit] | Update a campaign |
| `campaigns.getById` | query | [reports:view] | Get campaign details |
| `holdingQueue.list` | query | [leads:viewAll] | View rejected inbound leads |
| `holdingQueue.resubmit` | mutation | [leads:edit] | Fix and resubmit a held lead |

### Modified Endpoints

| Procedure | Changes |
|-----------|---------|
| `leads.create` | Add data cleaning, duplicate detection, pool placement, auto-response trigger |
| `leads.convert` | Transfer ownership to contact, re-point Interest records |
| `leads.getAllLeads` | Add "InPool" status filter, add pool-specific view |
| `leads.getById` | Include Interest records in response |
| `contacts.getById` | Include Interest records and ownerUserId |

---

## 11. New Scopes

| Scope | Description | orgAssignable |
|-------|-------------|:---:|
| `campaigns:view` | View campaigns | true |
| `campaigns:edit` | Create/edit campaigns | true |
| `leads:claim` | Claim leads from the pool | true |
| `leads:merge` | Merge duplicate leads | true |
| `interests:edit` | Create/edit interest records | true |

---

## 12. RLS Table Patterns

| New Table | Pattern | Config |
|-----------|---------|--------|
| Interest | orgColumn | orgId |
| Campaign | orgColumn | orgId |
| DuplicateExclusion | orgColumn | orgId |
| HoldingQueue | — | Admin-only access |

---

## 13. ERD: New Architecture

```
Lead (pool-based, interest-separated)
  │
  ├── Interest[] (what they want — multiple per lead)
  │     ├── property_type, budget, location
  │     ├── campaign_id (attribution)
  │     ├── status: Active / Cooled / Fulfilled / Dropped
  │     └── → Opportunity (when pursued)
  │
  ├── matchedLeadId → Lead (duplicate detection)
  │
  ├── CrmActivity[] (events)
  ├── CommunicationMessage[] (comms)
  ├── InternalComment[] (team notes)
  │
  └── Converts to → Contact (with ownership transfer)
                       ├── ownerUserId (REQUIRED)
                       ├── Interest[] (re-pointed from lead)
                       └── → Opportunity (from interest)

Campaign
  ├── Interest[] (which interests came from this campaign)
  └── autoResponseTemplateId → MessageTemplate

DuplicateExclusion
  ├── leadIdA, leadIdB (pair that's been rejected as not-same-person)

HoldingQueue
  └── rawPayload, rejectReason (failed inbound leads awaiting manual fix)
```

---

## 14. Files to Create/Modify

### New Files
- `src/server/lib/dataCleaner.ts` — Email/phone/name normalization
- `src/server/routes/interests.ts` — Interest CRUD + convert to opportunity
- `src/server/routes/campaigns.ts` — Campaign management
- `src/server/routes/holdingQueue.ts` — Rejected lead management
- `src/web/pages/LeadPoolPage.tsx` — Pool view with claim button
- `src/web/pages/CampaignListPage.tsx` — Campaign management
- `src/web/components/InterestPanel.tsx` — Interest list/create on lead/contact detail
- `src/web/components/DuplicateResolutionModal.tsx` — Merge/reject/reassign

### Modify
- `prisma/schema.prisma` — All schema changes above
- `scopes.json` — New scopes and RLS
- `src/server/routes/leads.ts` — Pool, claim, duplicate detection, data cleaning
- `src/server/routes/contacts.ts` — Add ownerUserId, re-inquiry matching
- `src/server/routes/opportunities.ts` — Add interestId link
- `src/web/pages/LeadListPage.tsx` — Add pool tab, claim button
- `src/web/pages/LeadDetailPage.tsx` — Interest panel, duplicate resolution
- `src/web/pages/ContactDetailPage.tsx` — Interest panel, owner display
- `src/web/components/Layout.tsx` — Add Campaign nav item
- `src/web/App.tsx` — New routes
