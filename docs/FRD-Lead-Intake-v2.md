# Functional Requirements Document (FRD)
# Lead Intake & Management — v2 Architecture

**Version:** 2.0
**Date:** June 2026
**Status:** Draft
**Based on:** Lead Management — Lead Creation Design Document (Chunk 1)

---

## 1. Overview

This FRD defines the functional requirements for the redesigned lead intake system. The new architecture replaces the current direct-assignment model with a pool-based, claim-driven, interest-separated model designed for real estate brokerages at scale.

### Key Architectural Shifts

| Area | Current (v1) | New (v2) |
|------|-------------|----------|
| Assignment | Manager assigns or round-robin | Shared pool → agent claims |
| Interest data | Fields on Lead (budget, propertyType, area) | Separate Interest entity (multiple per person) |
| Contact ownership | No owner field | Required invariant — always has an owner |
| Campaign tracking | None | Campaign entity with revenue attribution |
| Duplicate handling | None | Detection on intake, merge/reject workflow |
| Data cleaning | None | Email/phone normalization on intake |
| Auto-response | None | Immediate on creation, campaign-aware |

---

## 2. Module: Intake Pipeline

### FR-2001 Lead Entry Points

**Description:** Leads enter the system through two channels, both producing the same standard lead shape.

**Entry Points:**
- **External/Inbound:** Webhooks, landing page forms, campaign forms, syndication feeds. Untrusted, often incomplete.
- **Manual:** Agent creates lead through the CRM UI. Trusted, usually complete.

**Acceptance Criteria:**
- Both entry points produce identical lead records in the database
- External leads are processed through a source-specific adapter before standardization
- Manual leads are tagged with `intake_mode = "manual"` and `created_by = agent userId`
- External leads are tagged with `intake_mode` matching the entry point (e.g., "webhook", "landing_page", "campaign_form")

### FR-2002 Required Fields for Lead Creation

**Description:** Only three data points are required to create a lead.

**Required:**
- Name (first_name and/or last_name — at least one present)
- Email OR phone (at least one)
- Source (where the lead came from)

**Acceptance Criteria:**
- Lead creation fails with a clear error if any of the three are missing
- Manual entry shows inline validation errors
- Inbound leads missing required fields go to a holding queue (not silently dropped)
- All other fields are optional at creation time

### FR-2003 Data Cleaning on Intake

**Description:** All incoming data is standardized before saving to enable reliable matching and deduplication.

**Cleaning Rules:**
- Email: lowercased, trimmed of whitespace
- Phone: converted to E.164 international format (e.g., +1234567890), stripped of spaces/dashes/parens
- Name: trimmed, excess whitespace collapsed

**Acceptance Criteria:**
- Cleaning happens automatically on every lead creation (manual and inbound)
- Original raw values are preserved in an audit field if needed
- Cleaned values are what's stored and used for matching

### FR-2004 Holding Queue for Rejected Inbound Leads

**Description:** Inbound leads that fail validation are not silently lost.

**Acceptance Criteria:**
- Inbound leads missing required fields are saved to a HoldingQueue table with the raw payload and the rejection reason
- Admins can view the holding queue and manually fix/re-submit leads
- Manual entry rejections show inline errors — no queue needed

### FR-2005 Lead Fields

**Description:** The complete set of fields a lead can hold.

| Field | Required | Set By | Notes |
|-------|----------|--------|-------|
| first_name | Yes (at least one name) | Caller | Cleaned on intake |
| last_name | Yes (at least one name) | Caller | Cleaned on intake |
| email | Yes (email or phone) | Caller | Lowercased, trimmed |
| phone | Yes (email or phone) | Caller | E.164 format |
| preferred_contact_method | No | Caller | Email, Phone, SMS, WhatsApp |
| lead_source | Yes | Caller | Which channel |
| campaign_id | No | System | Backend-matched, not caller-supplied |
| intake_mode | Yes | System | manual, webhook, landing_page, campaign_form, syndication |
| created_by | Manual only | System | The agent who entered it |
| lead_status | No — system set | System | New, InPool, Claimed, Working, Qualified, Disqualified, Converted, Merged |
| assigned_user_id | No — system set | System | Null when in pool; set on claim/assign |
| org_id | Yes | System | Tenant isolation |
| created_by_user | No | System | Who columns |
| updated_by_user | No | System | Who columns |
| created_at | Yes | System | Timestamp |
| updated_at | Yes | System | Timestamp |

**Note:** Budget, property type, preferred area, and other interest-related data are NOT fields on the lead. They live in separate Interest records (see FR-2020).

---

## 3. Module: Campaign Management

### FR-2006 Campaign Entity

**Description:** Campaigns represent marketing efforts that generate leads.

**Fields:**
| Field | Required | Notes |
|-------|----------|-------|
| id | Yes | Unique identifier |
| org_id | Yes | Tenant isolation |
| name | Yes | Campaign name |
| type | No | Email, Facebook, Google, Landing Page, Event, Referral |
| status | Yes | Active, Paused, Completed |
| start_date | No | When the campaign started |
| end_date | No | When the campaign ends |
| auto_response_template_id | No | Template to send when a lead comes from this campaign |
| created_at | Yes | Timestamp |

### FR-2007 Campaign Matching

**Description:** When a lead comes in, the system matches it to a campaign based on backend rules — not from the incoming data.

**Acceptance Criteria:**
- Campaign is resolved server-side using source metadata (UTM params, form ID, landing page URL)
- Incoming data cannot set campaign_id directly (prevents spoofing)
- If no campaign matches, the lead has no campaign (this is valid)
- Campaign is set on the Interest record, not on the lead itself

---

## 4. Module: Lead Pool & Claiming

### FR-2008 Lead Pool

**Description:** New leads with no match to existing records enter a shared global pool with no assigned agent.

**Acceptance Criteria:**
- New leads are created with `assigned_user_id = null` and `lead_status = "InPool"`
- The pool is visible to all agents in the organization
- Pool can be filtered by source, intake_mode, and creation date
- Pool is the default view for agents (not "my leads")

### FR-2009 Lead Claiming

**Description:** Any agent can claim a lead from the pool. Claiming is atomic — only one agent can win.

**Acceptance Criteria:**
- Agent clicks "Claim" on a pool lead
- System atomically sets `assigned_user_id = agent` and `lead_status = "Claimed"`
- If another agent tries to claim simultaneously, they receive "Already claimed" error
- Claimed leads leave the pool view and appear in the claiming agent's "My Leads"
- Claim is logged as an Activity

### FR-2010 Unclaimed Lead Escalation

**Description:** Leads sitting unclaimed past a configurable threshold are escalated to a supervisor.

**Acceptance Criteria:**
- Each organization can configure an escalation threshold (in minutes)
- When threshold is exceeded, a notification is sent to the supervisor
- Lead remains in the pool and claimable during escalation
- Supervisor can manually assign the lead (overriding the claim model)
- Escalation is logged as an Activity

---

## 5. Module: Auto-Response

### FR-2011 Auto-Response on Lead Creation

**Description:** Every new lead receives an immediate auto-response regardless of whether it's a new prospect, duplicate, or existing contact re-inquiry.

**Response Selection (priority order):**
1. If lead has a matched campaign with a response template → send campaign response
2. If source has a default response template → send source default
3. If neither → no message sent, but the attempt is recorded

**Acceptance Criteria:**
- Response fires asynchronously (never blocks lead creation)
- Response is deliberately generic — confirms inquiry received, says agent will follow up
- Same message for new leads, duplicates, and contact re-inquiries
- Response is logged as a CommunicationMessage on the lead
- An Activity is created noting the auto-response was sent

---

## 6. Module: Duplicate Detection

### FR-2012 Duplicate Detection on Intake

**Description:** When a lead is created, it is checked against existing open leads for matches.

**Match Levels:**
- **Strong match:** Same name AND same email or phone. Almost certainly same person.
- **Weak match:** Same name only, no matching email or phone. Might be different people.

**Acceptance Criteria:**
- Matching uses cleaned/normalized values (lowercased email, E.164 phone)
- Match check happens after data cleaning, before the lead is saved
- A lead is ALWAYS created regardless of match — the match is a signal, never a blocker
- Match results are stored with the lead (matched_lead_id, match_strength)
- Different campaign or source does not prevent a match

### FR-2013 Duplicate Resolution (Merge / Reject / Reassign)

**Description:** When an agent claims or views a lead flagged as a potential duplicate, they resolve it.

**Three Actions:**
- **Merge:** Confirmed same person. Two leads combine into one. Surviving lead keeps all unique data from both. All Interest records, Activities, and campaign touches are preserved. Claiming agent owns the merged result.
- **Reject match:** Confirmed different people. Leads stay independent. System remembers this decision and stops flagging the pair.
- **Reassign:** Hand the lead to another agent without resolving the duplicate.

**Acceptance Criteria:**
- System never auto-merges — detection and recommendation only, human decides
- Merge preserves all Interest records (re-points to surviving lead)
- Merge preserves all Activities and CommunicationMessages
- Reject creates a DuplicateExclusion record so the pair is never re-flagged
- A lead always has exactly one owner or sits unclaimed in pool
- Merge is logged in the audit trail

---

## 7. Module: Existing Contact Re-Inquiry

### FR-2014 Contact Matching on Inbound

**Description:** Inbound leads are checked against existing contacts (converted leads). Strong match only: same name AND same email or phone.

**Acceptance Criteria:**
- If strong match to existing contact: NO lead is created
- Instead: an Interest record is created on the contact, and an Activity is logged
- The inquiry is routed directly to the contact's owner (never enters the pool)
- Contact owner is notified of re-engagement
- Generic auto-response still fires (same as for new leads)

### FR-2015 Contact Ownership Invariant

**Description:** Every contact always has an owner. This is an invariant that is never broken.

**Acceptance Criteria:**
- Contacts are never created without an `owner_user_id`
- On lead conversion, lead's `assigned_user_id` becomes the contact's `owner_user_id`
- If lead is unassigned at conversion time, conversion is blocked
- Owner can be changed via reassignment at any time

---

## 8. Module: Ownership Continuity

### FR-2016 Ownership Transfer on Conversion

**Description:** When a lead converts to a contact, the lead's owner becomes the contact's owner automatically.

**Acceptance Criteria:**
- No reassignment or return to pool on conversion
- Contact owner = Lead owner
- All downstream entities (Interests, Opportunities) inherit the same owner by default

### FR-2017 Reassignment

**Description:** Ownership can be changed at any point by the owner or a supervisor.

**Acceptance Criteria:**
- Works for both leads and contacts
- Reassignment is logged as an Activity and in the audit trail
- Continuity is the default — reassignment is the exception

---

## 9. Module: Interest Entity

### FR-2020 Interest as a Separate Entity

**Description:** An Interest record captures what a person wants. It is stored separately from the lead/contact, not as fields on them.

**Rationale:** A person can want multiple things simultaneously (a home to live in AND a rental to invest in). Storing interest as fields on the lead only allows one answer.

### FR-2021 Interest Fields

| Field | Required | Notes |
|-------|----------|-------|
| id | Yes | Unique identifier |
| org_id | Yes | Tenant isolation |
| parent_type | Yes | "Lead" or "Contact" (polymorphic) |
| parent_id | Yes | FK to Lead or Contact |
| property_type | No | Apartment, Villa, Commercial, etc. |
| budget | No | Budget for this specific interest |
| location_area | No | Where they're looking |
| bedrooms | No | Number of bedrooms |
| other_detail | No | Free text for additional preferences |
| campaign_id | No | If this interest came from a campaign |
| source | No | Channel this interest came from |
| status | Yes | Active, Cooled, Fulfilled, Dropped |
| created_at | Yes | When the interest was recorded |
| updated_at | Yes | Last modification |

### FR-2022 Interest Lifecycle

**Acceptance Criteria:**
- A lead/contact can have multiple active interests simultaneously
- No concept of "primary interest" — all active interests are equally valid
- Interest is created only on real signal (form submission, agent logging) — no empty rows
- On lead conversion: Interest records re-point from lead to contact (parent_type changes)
- On lead merge: Interest records from the absorbed lead re-point to the surviving lead
- Interest status tracks independently: Active → Cooled / Fulfilled / Dropped

### FR-2023 Interest → Opportunity

**Description:** When an interest is actively pursued, it becomes an Opportunity.

**Acceptance Criteria:**
- One Interest → at most one Opportunity
- Opportunity inherits Interest's context: property, budget, campaign, source
- This enables unambiguous revenue-to-campaign attribution
- Not every Interest becomes an Opportunity (can stay Active, cool off, or drop)
- Opportunity links back to its source Interest via `interest_id`

---

## 10. Module: Preferred Contact Method

### FR-2025 Preferred Contact Method

**Description:** A person's preferred way to be contacted (Email, Phone, SMS, WhatsApp).

**Acceptance Criteria:**
- Field on both Lead and Contact
- Optional — agent uses judgment if not provided
- Persists from Lead through Contact (travels with the person)
- Can be updated on subsequent interactions
- Distinct from the channel an inquiry arrived on (which is captured on Activity)

---

## 11. Priority Order for Implementation

| Priority | Module | Reason |
|----------|--------|--------|
| 1 | Interest entity (FR-2020–2023) | Architectural foundation — everything depends on it |
| 2 | Lead field restructure (FR-2005) | Remove interest fields from Lead, add new fields |
| 3 | Lead Pool & Claiming (FR-2008–2009) | Core workflow change |
| 4 | Campaign entity (FR-2006–2007) | Needed for attribution |
| 5 | Duplicate detection (FR-2012–2013) | Data quality at scale |
| 6 | Contact ownership (FR-2015–2016) | Ownership continuity invariant |
| 7 | Contact re-inquiry matching (FR-2014) | Prevents duplicate leads for existing customers |
| 8 | Auto-response (FR-2011) | Prospect experience |
| 9 | Data cleaning (FR-2003) | Enables reliable matching |
| 10 | Escalation (FR-2010) | Prevents leads from falling through |
| 11 | Holding queue (FR-2004) | Prevents inbound data loss |
