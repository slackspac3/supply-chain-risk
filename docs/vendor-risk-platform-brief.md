# Vendor Risk Platform Brief

## Goal

Refactor the current `risk-calculator` pilot into a `Vendor Risk Management` platform that starts with a strong `vendor security / cyber / technology risk` focus and evolves toward a broader `supply chain risk` platform.

The platform should automate the operating model described in:

- `G42 GTR - Vendor Security Risk Management-SOP.docx`
- `Group-Vendor_InfoSec_Assessments 1.xlsm`

For this product, use `GTR` (`Group Technology Risk`) terminology instead of `TRT`.

## PoC Outcome

The PoC should support:

- new vendor assessments
- periodic vendor reassessments
- open risk tracking to closure
- vendor evidence collection and follow-up
- internal review and approval workflow
- a future-safe architecture for Entra, email, SharePoint, and Jira integrations
- digitised InfoSec assessment flow first

Jira integration is not required in the PoC, but the open-risk model must be designed so risks can later sync to Jira issues without reworking the domain model.

## Primary Roles

Internal roles:

- `admin`
- `gtr_analyst`
- `reviewer`
- `approver`
- `procurement`
- `privacy`
- `legal`

External role:

- `vendor_contact`

## External Access Model

The vendor journey should be case-based, not organization-wide self-signup.

PoC access model:

- a case is created internally
- the vendor receives a magic link
- the link allows the vendor to create an account bound to that case
- the vendor can return later for clarifications, evidence uploads, remediation updates, and periodic reassessments
- the invited vendor contact is the only external account holder for that case during the PoC

This implies the platform needs both:

- `case-scoped access`
- `vendor identity linked to one or more cases`

## Product Scope

### In Scope For PoC

- intake and case creation
- vendor profile and service context capture
- external questionnaire completion
- attachment and evidence collection
- internal triage and review
- risk identification and risk register entries
- reviewer feedback loops with vendor
- conditional approval / approval decisions
- remediation due dates and evidence-based closure
- reassessment scheduling
- reassessment execution with versioned responses
- audit log and case history

### Out Of Scope For Initial PoC

- full Entra SSO
- production email delivery
- SharePoint document storage
- Jira bi-directional sync
- procurement platform integration
- advanced analytics across the full supplier base
- broad non-tech supply chain risk taxonomies beyond what is needed to support the vendor security process

## Workflow

### 1. Intake

Internal user creates a vendor case with:

- vendor name
- business owner
- procurement owner
- contract description when available
- service scope from the service catalogue
- vendor category
- whether data access is required
- data types such as PII, IP, finance details, and marketing data
- connectivity / access context
- vendor headquarters location
- subprocessor details and locations
- jurisdiction / residency context
- hosting region when available
- business unit when available
- whether the case is standard or exception handling

The intake should also produce a stage-1 output frame with:

- vendor description
- service type, for example `AI`, `SaaS`, `Consulting`, or `Hardware`
- data access summary
- regulatory impact
- technology provenance
- provisional criticality context for the later scoring engine

### 2. Readiness Intake

The current spreadsheet appears to function as a `Vendor Information Security Readiness Assessment`, not merely a generic upload.

The platform should model this as a structured questionnaire, not as an unstructured document.

Observed sections in the workbook include:

- vendor identity and arrangement details
- legal and regulatory requirements
- information security governance
- standards / frameworks / certifications
- control implementation questions
- jurisdiction and operating environment risk

The questionnaire also implies evidence requests for:

- policies
- standards certifications
- audit outputs
- penetration test reports
- other supporting documents

### 3. Internal Triage

`GTR Analyst` reviews the intake and readiness responses to determine:

- vendor category
- assessment depth
- whether full assessment is required
- whether exception handling applies
- initial criticality

### 4. Full Assessment

The platform should support a deeper assessment round with:

- vendor responses
- supporting attachments
- internal notes
- reviewer comments
- role-specific review tasks for `privacy`, `legal`, and `reviewer` participants
- checklist-based review steps for `privacy` and `legal`

The detailed question format should adapt to service scope:

- `SaaS`: cloud controls, encryption, logging and monitoring, access management, hosting location
- `Consulting`: NDA, security training, endpoint security when devices are not G42-managed, IDAM details
- `Technology provider`: provenance, integrity, and upstream dependency review
- `AI`: model-governance and data-handling questions layered onto the technical control review

### 5. Findings And Risk Register

When issues are identified, `GTR Analyst` creates risk records with:

- title
- statement
- domain
- severity
- inherent / residual view if needed
- remediation action
- owner
- due date
- evidence required for closure
- current status
- optional future `jiraIssueKey`

The AI engine should later be able to review uploaded evidence such as:

- ISO certificates
- SOC 2 reports
- signed policies in PDF form
- masked or sanitised assurance artefacts

### 6. Review And Approval

The platform should support:

- reviewer feedback
- approver decision
- approved
- conditionally approved
- rejected / changes required
- separate `reviewer` and `approver` workflow steps in the PoC

The platform should also support contract-clause recommendation, not only findings and approval.

This means:

- the platform should recommend mandatory information security clause packs based on service or product nature
- clause recommendations should vary for `SaaS`, `AI`, `Consulting`, `Technology Provider`, and similar delivery models
- hosting location, subprocessors, cross-border data handling, resilience commitments, and AI usage should influence the recommended clause set
- `legal` remains the owner of final contract wording and approval
- AI should perform this analysis on the backend through server-side workflows, not through browser-side prompt orchestration

The user also wants rating-oriented outputs, so the case should be able to hold both:

- `criticality` such as `low / medium / high`
- `decision outcome` such as `pass / conditional pass / fail`

The future scoring engine should be designed to draw from:

- stage 1 data criticality
- stage 1 hosting location and subprocessor detail
- stage 2 findings
- stage 3 detailed questionnaire responses
- stage 4 evidence review

The backend AI layer should also be responsible for:

- checking the case against required clauses
- comparing required clauses with current draft clauses
- evaluating the scenario, vendor context, and service type together
- generating recommendations and draft risk framing on the server side

### 7. Open Risk Tracking

Open findings should persist after the assessment closes.

Needed lifecycle states:

- `open`
- `in_progress`
- `pending_vendor`
- `pending_internal_review`
- `accepted`
- `closed`
- `overdue`

Each risk should maintain:

- due dates
- comments
- evidence submissions
- closure decisions
- history

The final assessment output should include:

- vendor risk assessment summary statement
- risk statement when applicable
- likelihood
- impact
- mitigation detail
- recommended contract clause pack summary where applicable

### 8. Periodic Reassessment

Periodic reassessment must be first-class in the PoC.

The platform should support:

- next review date on the vendor case
- scheduled reassessment records
- reassessment questionnaires reusing prior answers where appropriate
- delta review against prior submissions
- automatic carry-forward of unresolved risks
- change-request reassessments on existing agreements under the existing case
- a new case for a new contract

Suggested schedule model:

- `high`: annual, or more frequent when open risks remain
- `medium`: every 3 years, or earlier if service scope changes
- `low`: on demand

The approval and control checkpoint model currently required is:

- `Tier 1 Critical`: agreement drafted with the risk statement and must-have controls
- `Tier 2 Important`: exception approval
- `Tier 3 Low Risk`: autoapproved

## Domain Model

The current codebase has auth, review, admin, audit, and shared state concepts that can be reused, but the product needs a new domain model centered on vendor cases.

Recommended top-level entities:

- `organisation`
- `internal_user`
- `vendor_organisation`
- `vendor_contact`
- `vendor_case`
- `assessment_cycle`
- `questionnaire_template`
- `questionnaire_response`
- `attachment`
- `review_task`
- `risk_record`
- `approval_decision`
- `activity_event`

Important modeling rules:

- a `vendor_case` can have multiple `assessment_cycle` records
- a cycle can be `initial`, `periodic`, or `exception`
- responses and attachments must be versioned
- risks must survive across cycles until explicitly closed
- approval decisions should be attached to a cycle, not only to the vendor overall

## Recommended PoC UX

### Internal Workspace

Internal users need:

- case list
- vendor case detail page
- assessment review workspace
- risk register workspace
- approval panel
- reassessment scheduler
- audit trail

### Vendor Workspace

Vendors need:

- magic-link sign-in
- case overview
- questionnaire stepper
- attachment upload
- feedback / clarification thread
- remediation update view
- reassessment tasks

## Architecture Direction

Use the existing repo as a shell, but pivot away from the current risk-scenario workflow.

Recommended direction:

- keep the SPA + serverless API structure for the PoC
- preserve reusable modules for auth, review queues, admin settings, and audit logging where helpful
- introduce a new vendor-risk domain layer rather than forcing vendor workflows into the current scenario engine
- keep attachment storage behind a storage abstraction so SharePoint can replace the PoC implementation later
- keep outbound notification logic behind an adapter so email can be added later
- keep risk records ready for future Jira sync with a nullable issue reference and sync state

## Questionnaire Notes

Based on the provided workbook, the current file is best treated as a source questionnaire template to be transformed into native application forms.

The workbook should not remain the long-term user interface.

Reasons:

- it already has structured prompts that map well to application fields
- it requests evidence and comments repeatedly
- it will be hard to version, validate, and compare over time if kept as a spreadsheet artifact only
- reassessment and feedback loops are much easier with native form sections and structured answers

## Implementation Assumptions

1. The first questionnaire to digitise is the InfoSec assessment flow represented by the provided workbook.
2. `reviewer` and `approver` stay as separate workflow steps.
3. Rating logic remains part of the target product and should not be reduced to manual-only status decisions.
4. The PoC keeps vendor access limited to the invited case contact.
5. `privacy` and `legal` use dedicated review checklists.

## Analyst Feedback To Resolve

The latest analyst feedback introduces possible scope changes for the PoC. These should be treated as product decisions rather than silently folded into implementation.

### Points That Still Look Stable

- the intake form shape
- AI-assisted intake interpretation
- dynamic questionnaire depth based on service type
- separate reviewer and approver steps
- AI support for findings, evidence review, clause checks, and recommendations
- tiered control checkpoint outputs

### Points That May Change PoC Scope

1. `privacy` may be excluded from the first PoC because it is an external team and may slow delivery.
2. `legal` may be excluded from the first PoC because MSA handling may remain with procurement and legal review may sit outside the platform initially.
3. `procurement` may be included only at the final risk gate or contract stage, not in the main assessment workflow.
4. open-risk tracking and periodic reassessment may need to be deferred or narrowed while the analyst reconsiders that requirement.

### Recommended Reading Of The Analyst Feedback

If the priority is speed to a usable first PoC, a narrower operating model is likely the right move:

- core workflow roles:
  - `gtr_analyst`
  - `reviewer`
  - `approver`
  - `admin`
  - `vendor_contact`
- optional later-phase roles:
  - `privacy`
  - `legal`
  - `procurement`

With that narrower model:

- `privacy` and `legal` checklists should stay in the design, but can be feature-flagged or disabled in the first PoC release
- `procurement` can be limited to contract / approval handoff metadata
- open-risk tracking and reassessment can stay in the domain model, but the first shipped flow can focus on initial assessment and approval only if needed
