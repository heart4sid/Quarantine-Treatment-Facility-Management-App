import fs from 'node:fs';
import path from 'node:path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber
} from 'docx';

const PRIMARY_COLOR = '1B365D'; // Deep Navy
const ACCENT_BLUE = '2563EB';   // Royal Blue
const ACCENT_TEAL = '0D9488';   // Teal
const TEXT_DARK = '0F172A';     // Slate 900
const TEXT_MUTED = '475569';    // Slate 600
const BG_LIGHT = 'F8FAFC';      // Slate 50
const BORDER_COLOR = 'CBD5E1';  // Slate 300
const HIGHLIGHT_BG = 'EFF6FF';  // Blue 50

function createHeaderP(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 280, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        font: 'Calibri',
        color: PRIMARY_COLOR,
      })
    ]
  });
}

function createSubheaderP(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        font: 'Calibri',
        color: ACCENT_BLUE,
      })
    ]
  });
}

function createH3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 60 },
    children: [
      new TextRun({
        text,
        bold: true,
        font: 'Calibri',
        color: PRIMARY_COLOR,
      })
    ]
  });
}

function createBodyP(text, options = {}) {
  const { bold = false, italic = false, color = TEXT_DARK, spaceAfter = 100 } = options;
  return new Paragraph({
    spacing: { after: spaceAfter, line: 276 },
    children: [
      new TextRun({
        text,
        font: 'Calibri',
        size: 22, // 11pt
        color,
        bold,
        italic
      })
    ]
  });
}

function createMixedP(runs, spaceAfter = 100) {
  return new Paragraph({
    spacing: { after: spaceAfter, line: 276 },
    children: runs.map(r => new TextRun({
      font: 'Calibri',
      size: 22,
      color: TEXT_DARK,
      ...r
    }))
  });
}

function createBulletP(boldPrefix, text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60, line: 260 },
    children: [
      new TextRun({
        text: boldPrefix,
        bold: true,
        font: 'Calibri',
        size: 22,
        color: PRIMARY_COLOR
      }),
      new TextRun({
        text,
        font: 'Calibri',
        size: 22,
        color: TEXT_DARK
      })
    ]
  });
}

function createCallout(title, bodyText, borderColor = ACCENT_BLUE, bgColor = HIGHLIGHT_BG) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: bgColor, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              left: { style: BorderStyle.SINGLE, size: 24, color: borderColor }
            },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    font: 'Calibri',
                    size: 22,
                    color: borderColor
                  })
                ]
              }),
              new Paragraph({
                spacing: { after: 0, line: 260 },
                children: [
                  new TextRun({
                    text: bodyText,
                    font: 'Calibri',
                    size: 21,
                    color: TEXT_DARK
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function createTable(headers, rowsData, colWidthPercentages = []) {
  const tableRows = [];

  // Header Row
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => new TableCell({
        shading: { fill: PRIMARY_COLOR, type: ShadingType.CLEAR },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
          bottom: { style: BorderStyle.SINGLE, size: 8, color: PRIMARY_COLOR },
          left: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
          right: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR }
        },
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
        width: colWidthPercentages[i] ? { size: colWidthPercentages[i], type: WidthType.PERCENTAGE } : undefined,
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: h,
                bold: true,
                font: 'Calibri',
                size: 20, // 10pt
                color: 'FFFFFF'
              })
            ]
          })
        ]
      }))
    })
  );

  // Data Rows
  rowsData.forEach((row, rowIdx) => {
    const isAlt = rowIdx % 2 === 1;
    tableRows.push(
      new TableRow({
        children: row.map((cellText, cellIdx) => new TableCell({
          shading: { fill: isAlt ? BG_LIGHT : 'FFFFFF', type: ShadingType.CLEAR },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
            left: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR },
            right: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR }
          },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          width: colWidthPercentages[cellIdx] ? { size: colWidthPercentages[cellIdx], type: WidthType.PERCENTAGE } : undefined,
          children: [
            new Paragraph({
              spacing: { after: 0, line: 240 },
              children: [
                new TextRun({
                  text: cellText,
                  font: 'Calibri',
                  size: 20,
                  color: TEXT_DARK
                })
              ]
            })
          ]
        }))
      })
    );
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows
  });
}

async function buildDoc() {
  const doc = new Document({
    creator: 'Siddharth Kumar Mishra',
    title: 'TPM Assessment - Quarantine & Treatment Facility Management Platform',
    description: 'Comprehensive Technical Product Manager Assessment submission answering Q1, Q2, Q3, and Q4',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', color: TEXT_DARK }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'TPM Assessment | Quarantine & Treatment Facility Management',
                    font: 'Calibri',
                    size: 18,
                    color: TEXT_MUTED
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Page ',
                    font: 'Calibri',
                    size: 18,
                    color: TEXT_MUTED
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Calibri',
                    size: 18,
                    color: TEXT_MUTED
                  }),
                  new TextRun({
                    text: ' of ',
                    font: 'Calibri',
                    size: 18,
                    color: TEXT_MUTED
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: 'Calibri',
                    size: 18,
                    color: TEXT_MUTED
                  })
                ]
              })
            ]
          })
        },
        children: [
          // Title Header Block
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 80 },
            children: [
              new TextRun({
                text: 'TECHNICAL PRODUCT MANAGER ASSESSMENT',
                font: 'Calibri',
                size: 22,
                bold: true,
                color: ACCENT_BLUE,
                characterSpacing: 40
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: 'Quarantine & Treatment Facility Management Platform',
                font: 'Calibri',
                size: 38, // 19pt
                bold: true,
                color: PRIMARY_COLOR
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: 'Comprehensive Submission Document: Q1 User Matrix, Q2 Functional Prototype & Live Link, Q3 Developer Constraints, and Q4 Sprint Knapsack Optimization',
                font: 'Calibri',
                size: 22,
                italic: true,
                color: TEXT_MUTED
              })
            ]
          }),

          // Metadata Table
          createTable(
            ['Candidate Name', 'Target Position', 'Live Vercel Link', 'GitHub Repository', 'Build & Test Status'],
            [[
              'Siddharth Kumar Mishra',
              'Technical Product Manager',
              'https://quarantine-treatment-facility-manag.vercel.app',
              'https://github.com/heart4sid/Quarantine-Treatment-Facility-Management-App',
              '384/384 Vitest Suites Passed | 0 Build Errors'
            ]],
            [20, 20, 22, 22, 16]
          ),
          new Paragraph({ spacing: { after: 200 } }),

          createCallout(
            'EXECUTIVE OVERVIEW & CLINICAL CONTEXT',
            'This assessment submission articulates the product architecture, operational workflows, developer logic constraints, and quantitative sprint planning for a mission-critical Quarantine and Treatment Facility Management platform. The system operates in a high-consequence biocontainment environment (74-bed capacity, 15% patient mortality baseline) where latency, uncoordinated clinical handoffs, or missed vitals directly impact patient survival and staff safety.',
            PRIMARY_COLOR,
            BG_LIGHT
          ),
          new Paragraph({ spacing: { after: 200 } }),

          // -------------------------------------------------------------
          // QUESTION 1
          // -------------------------------------------------------------
          createHeaderP('QUESTION 1: USER TYPES & FEATURE RELEVANCE MATRIX'),
          createBodyP('Prompt: In your app’s first version, what are the different kinds of users, and which features and actions are relevant for which user types?', { italic: true }),
          new Paragraph({ spacing: { after: 80 } }),

          createSubheaderP('1.1 User Personas & Clinical Responsibilities'),
          createBodyP('To eliminate coordination chaos in a high-stakes quarantine environment, the application enforces a strict Separation of Concerns (SoC) across five primary user roles:'),

          createBulletP('1. Nurse (Bedside Vitals & Patient Care Specialist): ', 'Responsible for routine bedside vitals acquisition across assigned patient cohorts. Operates touch-enabled bedside tablets while wearing bulky personal protective equipment (PPE). Requires ultra-fast tactile entry (large numpad keys, audio feedback), instant fever detection, and shift task progress tracking. Strictly prohibited from signing clinical discharges, writing physician round notes, or executing bed admissions.'),
          createBulletP('2. Doctor / Attending Physician (Clinical Decision Lead): ', 'Responsible for diagnostic assessment, SOAP round notes, treatment ordering, and clinical discharge governance. Evaluates patient trajectories through automated fever-free streak calculations (protocol requirement: 3 consecutive fever-free calendar days). Signs off on clinical discharge readiness or logs auditable exceptions when visiting patients prior to daily vitals capture. Cannot enter bedside vitals (enforces data origin integrity) or execute administrative bed allocation.'),
          createBulletP('3. Admin Staff (Admissions & Facility Coordinator): ', 'Responsible for physical census flow, including patient intake, 74-bed room allocation, waitlist prioritization, and executing physician-approved discharges. Records patient outcomes (Discharged Cured, Transferred, Deceased). Strictly disallowed from overriding clinical criteria or inputting patient medical vitals.'),
          createBulletP('4. Facility Head / Quality Lead (Executive & Safety Oversight): ', 'Responsible for institutional quality metrics, operational throughput, and infection containment. Receives read-only aggregate visibility into occupancy saturation, average length of stay (ALOS), shift task completion compliance, and real-time mortality tracking with automated alert thresholds if facility mortality exceeds the 15% benchmark.'),
          createBulletP('5. System Administrator (IT & Security Governance): ', 'Manages user accounts, credential lifecycle, role assignments, audit log review, and system-wide clinical thresholds (e.g., configuring fever cutoff at 38.0°C / 100.4°F and total bed capacity limits).'),

          createSubheaderP('1.2 Role-Based Feature Relevance & Permissions Matrix'),
          createBodyP('The matrix below delineates permissions for Version 1.0. All write actions are enforced server-side via API route middleware and Zod schema validation; client-side UI visibility toggles merely provide visual guidance.'),

          createTable(
            ['Feature / Action', 'Nurse', 'Doctor', 'Admin', 'Facility Head', 'System Admin'],
            [
              ['Bedside Temperature Entry', 'Write (Primary)', 'Restricted', 'Restricted', 'Restricted', 'Restricted'],
              ['Same-Day Temp Amendment', 'Write (With Reason)', 'Restricted', 'Restricted', 'Restricted', 'Restricted'],
              ['View Patient List / Bed Status', 'Read (Assigned)', 'Read (All Wards)', 'Read (Full Facility)', 'Read (Aggregated)', 'Restricted'],
              ['Fever-Free Streak Tracking', 'Read', 'Read (Decision Tool)', 'Restricted', 'Read (Summary)', 'Restricted'],
              ['Doctor Visit Notes (SOAP)', 'Restricted', 'Write (Primary)', 'Restricted', 'Restricted', 'Restricted'],
              ['Visit Exception Override', 'Restricted', 'Write (Audit Logged)', 'Restricted', 'Restricted', 'Restricted'],
              ['Clinical Discharge Approval', 'Restricted', 'Write (Exclusive)', 'Restricted', 'Restricted', 'Restricted'],
              ['Execute Physical Discharge', 'Restricted', 'Restricted', 'Write (Post-Approval)', 'Restricted', 'Restricted'],
              ['Patient Admission & Triage', 'Restricted', 'Restricted', 'Write (Primary)', 'Restricted', 'Restricted'],
              ['74-Bed Facility Map & Allocation', 'Restricted', 'Restricted', 'Write (Primary)', 'Read-Only Gauge', 'Restricted'],
              ['FIFO Waitlist Management', 'Restricted', 'Restricted', 'Write (Primary)', 'Read-Only Queue', 'Restricted'],
              ['Log Patient Mortality / Outcome', 'Restricted', 'Restricted', 'Write (Mandatory)', 'Restricted', 'Restricted'],
              ['Executive Analytics Dashboard', 'Restricted', 'Restricted', 'Restricted', 'Read (Full KPIs)', 'Restricted'],
              ['Mortality Benchmark Alerts', 'Restricted', 'Restricted', 'Restricted', 'Receive Alerts', 'Restricted'],
              ['User Account & RBAC Mgmt', 'Restricted', 'Restricted', 'Restricted', 'Restricted', 'Write (Full Admin)'],
              ['Audit Log Forensics', 'Restricted', 'Restricted', 'Restricted', 'Read-Only', 'Read / Export'],
              ['Fever Threshold Configuration', 'Restricted', 'Restricted', 'Restricted', 'Restricted', 'Write (Config)']
            ],
            [30, 14, 14, 14, 14, 14]
          ),
          new Paragraph({ spacing: { after: 140 } }),

          createCallout(
            'SERVER-SIDE ENFORCEMENT PHILOSOPHY',
            'Rule of Enforcement: Client-side routing simply optimizes user ergonomics. All mutation endpoints validate the caller session against server RBAC. If a Nurse attempts to hit /api/discharges/approve directly, the server rejects the request with HTTP 403 Forbidden and logs an access violation in the immutable security audit table.',
            PRIMARY_COLOR,
            BG_LIGHT
          ),
          new Paragraph({ spacing: { after: 200 } }),

          // -------------------------------------------------------------
          // QUESTION 2
          // -------------------------------------------------------------
          new Paragraph({ children: [new PageBreak()] }),
          createHeaderP('QUESTION 2: FUNCTIONAL PROTOTYPE & DEPLOYMENT'),
          createBodyP('Prompt: Please build a functional prototype of the app using any AI tool of your choice. Please provide a deployable working link either on Vercel or any platform of your choice. Your submission should include: All basic screens of the app (UI flow), Working functionality for key actions (e.g. nurse records temp), and demonstrable core features.', { italic: true }),
          new Paragraph({ spacing: { after: 80 } }),

          createSubheaderP('2.1 Live Deployment & Repository Links'),
          createBulletP('Production Vercel URL: ', 'https://quarantine-treatment-facility-manag.vercel.app'),
          createBulletP('GitHub Source Repository: ', 'https://github.com/heart4sid/Quarantine-Treatment-Facility-Management-App'),
          createBulletP('Fast Staff Switch PIN: ', '1234 (Tactile Bedside Keypad Switcher)'),
          createBulletP('Demo Accounts: ', 'Nurse: nurse@facility.com (nurse123) | Doctor: doctor@facility.com (doctor123) | Admin: admin@facility.com (admin123)'),

          createSubheaderP('2.2 Full Stack Architecture & Technology Foundation'),
          createBulletP('Core Framework: ', 'Next.js 16 (App Router) with React 19, TypeScript 5, and Tailwind CSS.'),
          createBulletP('Authentication & RBAC: ', 'Better Auth session engine supplemented by Clinical Station Mode with fast 1-tap PIN station switching for sterile shared tablets.'),
          createBulletP('Persistence & Fallback Resilience: ', 'PostgreSQL via Neon Serverless and Drizzle ORM, backed by an in-memory mutable store and IndexedDB cache ensuring seamless evaluation on preview environments without database cold starts.'),
          createBulletP('Offline Capability: ', 'Serwist PWA service worker with IndexedDB mutation outbox syncing automatically when connectivity recovers.'),

          createSubheaderP('2.3 Implemented UI Screens & Core Workflows'),
          createTable(
            ['Screen / Route', 'Target Role', 'Demonstrable Features & Key Workflow Implemented', 'Status'],
            [
              [
                'Station Gateway / Login\n(/ & /login)',
                'All Staff',
                'Three sign-in methods: 1-Tap clinical station launcher, standard email/password authentication with demo autofill chips, and a tactile bedside 4-digit PIN numpad (PIN: 1234).',
                'Live & Verified'
              ],
              [
                'Nurse Station\n(/dashboard/nurse)',
                'Nurse',
                'Assigned cohort patient cards, shift completion progress bar (e.g., 60% -> 80%), bedside temperature recording modal with °C/°F conversion, instant fever detection (>=38.0°C), duplicate check warning, and instant streak updates.',
                'Live & Verified'
              ],
              [
                'Doctor Rounding Station\n(/dashboard/doctor)',
                'Doctor',
                'Prioritized rounding queue, fever streak indicator (target: 3 days), SOAP visit note capture, discharge sign-off button, and 428 Precondition warning with mandatory clinical exception override if patient is unmeasured.',
                'Live & Verified'
              ],
              [
                'Bed Management & Intake\n(/dashboard/beds)',
                'Admin',
                'Real-time interactive 74-bed capacity grid with color-coded bed states (Occupied, Available, Cleaning). Modal patient admission with atomic capacity enforcement blocking admissions at 74/74.',
                'Live & Verified'
              ],
              [
                'Discharge Queue\n(/dashboard/discharge-queue)',
                'Doctor + Admin',
                'Two-stage discharge workflow: Stage 1 filters patients with >=3 fever-free days for Doctor sign-off; Stage 2 transfers approved patients to Admin for physical discharge and outcome logging.',
                'Live & Verified'
              ],
              [
                'Waitlist Queue\n(/dashboard/waitlist)',
                'Admin',
                'FIFO intake queue activated during full occupancy. Surfaces next eligible patient with wait duration metrics and bed-assignment trigger.',
                'Live & Verified'
              ],
              [
                'Executive Analytics\n(/dashboard/analytics)',
                'Facility Head',
                'Real-time mortality tracking against the 15% institutional ceiling, bed occupancy gauge, average length of stay distribution, and shift compliance metrics.',
                'Live & Verified'
              ],
              [
                'Command Hub\n(/hub)',
                'All Staff',
                'Tactical overview displaying live facility health, active shift rosters, quick role switching, and end-to-end scenario simulation.',
                'Live & Verified'
              ]
            ],
            [22, 14, 52, 12]
          ),
          new Paragraph({ spacing: { after: 140 } }),

          createSubheaderP('2.4 Key Demonstrable Workflows & Verification Evidence'),
          createBodyP('The live prototype was verified using automated test suites and end-to-end browser subagents:'),
          createBulletP('Demonstration 1 (Nurse Temperature Logging): ', 'Navigating to Bed A-05 (Patient K. Bradley, admission adm-105). Opening the tactile logging modal, recording 36.8°C with normal status. Verified that the patient card turns green with "Measured Today", shift completion progress moves from 60% to 80%, and fever-free streak increments to 2 days.'),
          createBulletP('Demonstration 2 (Doctor Precondition Warning): ', 'Visiting an unmeasured patient prompts HTTP 428 warning ("No temperature recorded today"). Entering an auditable clinical rationale allows the doctor to proceed while preserving medical safety governance.'),
          createBulletP('Demonstration 3 (Two-Stage Discharge Sign-off): ', 'Patient J. Doe (Bed A-01, 3 days fever-free) appears in the doctor discharge queue. Doctor approves discharge; record transitions to Admin queue; Admin executes physical discharge; Bed A-01 automatically resets to Available status.'),
          createBulletP('Automated Testing Suite: ', '384 passing unit and property-based tests across 14 test suites in Vitest covering state machines, concurrent bed allocation, temperature streak calculations, and RBAC rules.'),
          new Paragraph({ spacing: { after: 200 } }),

          // -------------------------------------------------------------
          // QUESTION 3
          // -------------------------------------------------------------
          new Paragraph({ children: [new PageBreak()] }),
          createHeaderP('QUESTION 3: LOGICAL CONSTRAINTS FOR DEVELOPERS'),
          createBodyP('Prompt: For the entire app overview, what additional logical constraints would you provide to the developers? Include details not immediately apparent from the screen designs, such as when to display warnings or errors to the user, and when to allow or disallow certain actions for specific user types, etc.', { italic: true }),
          new Paragraph({ spacing: { after: 80 } }),

          createCallout(
            'ENGINEERING SPECIFICATION RATIONALE',
            'Screen wireframes describe UI affordances; they do NOT describe edge cases, safety invariants, or race conditions. In a BSL-4 facility with a 15% mortality rate, an unhandled concurrency bug or silent data overwrite creates catastrophic patient safety failures. Below are 12 mandatory architectural and clinical logic constraints provided to the development team.',
            PRIMARY_COLOR,
            BG_LIGHT
          ),
          new Paragraph({ spacing: { after: 140 } }),

          createH3('Constraint 1: Append-Only Vitals (Never Overwrite Historical Data)'),
          createBulletP('Trigger Condition: ', 'Nurse logs a second temperature reading for the same patient on the same calendar day.'),
          createBulletP('System Behavior: ', 'Display modal warning: "Temperature already recorded today (37.2°C at 08:30). Do you want to record an amendment?" If confirmed, append the new reading to the vitals audit table rather than updating the existing row. Fever streak calculations evaluate the highest (worst) reading of the calendar day, but full chronological entries remain immutable.'),
          createBulletP('Category & Rationale: ', 'Clinical Safety & Audit Compliance. Silent overwriting destroys clinical forensic trails required during mortality investigations.'),

          createH3('Constraint 2: Immediate Fever Streak Invalidation (Zero Tolerance)'),
          createBulletP('Trigger Condition: ', 'Any recorded temperature reading equal to or exceeding the fever cutoff (>=38.0°C / 100.4°F).'),
          createBulletP('System Behavior: ', 'The patient’s consecutive fever-free streak resets immediately to 0 days, regardless of how many prior fever-free days were accumulated. If multiple readings are taken on the same calendar day, a single febrile event invalidates the entire day. Daily temperatures must never be averaged.'),
          createBulletP('Category & Rationale: ', 'Infection Control Protocol. Premature discharge of an actively relapsing patient risks fatal disease transmission and high facility mortality.'),

          createH3('Constraint 3: Midnight Calendar Day Boundary (No Rolling 24-Hour Windows)'),
          createBulletP('Trigger Condition: ', 'Determining whether a patient has been "Measured Today" or calculating streak progression.'),
          createBulletP('System Behavior: ', 'A "Day" is strictly defined as 00:00:00 to 23:59:59 in facility local time (UTC+Offset stored in database). Shift handover resets at midnight. A reading at 23:55 and a subsequent reading at 00:10 are valid entries for two separate calendar days. Streak counts calendar days, not 72 elapsed hours.'),
          createBulletP('Category & Rationale: ', 'Shift Operational Usability. Rolling windows cause confusion during morning nursing shift changeovers.'),

          createH3('Constraint 4: Doctor-Before-Nurse Soft Warning with Exception Logging'),
          createBulletP('Trigger Condition: ', 'Doctor attempts to conduct clinical rounds or log visit notes on a patient with no temperature recorded yet today.'),
          createBulletP('System Behavior: ', 'Return HTTP 428 Precondition Required. Display amber modal warning: "Bedside vitals have not been recorded today. Recommended workflow is Nurse vitals prior to Physician rounding." Do NOT hard-block the physician (emergency clinical care cannot wait). Require the physician to input a mandatory reason code and persist this event to the clinical exception audit log.'),
          createBulletP('Category & Rationale: ', 'Clinical Ergonomics. Hard blocks cause dangerous workarounds such as staff fabricating dummy temperature readings to unlock the screen.'),

          createH3('Constraint 5: Mandatory Two-Stage Discharge Protocol (No Auto-Discharges)'),
          createBulletP('Trigger Condition: ', 'Patient achieves 3 consecutive fever-free calendar days.'),
          createBulletP('System Behavior: ', 'System automatically tags the patient as "Discharge Eligible" and moves them to the Doctor Discharge Review Queue. The system MUST NEVER execute an automated discharge. The attending physician must perform clinical sign-off. Once approved, the record transfers to the Admin Queue for physical transportation and bed cleanup.'),
          createBulletP('Category & Rationale: ', 'Clinical Governance. Discharge readiness depends on clinical context (blood panels, secondary complications, family readiness) that automated rules cannot verify.'),

          createH3('Constraint 6: Atomic 74-Bed Capacity Hard Cap (Race Condition Prevention)'),
          createBulletP('Trigger Condition: ', 'Admission requests submitted concurrently when occupancy is near capacity (e.g., 73/74 beds occupied).'),
          createBulletP('System Behavior: ', 'Server-side transaction MUST use row-level locking (e.g., SELECT ... FOR UPDATE on facility bed records) or atomic database counter constraints. If capacity is reached (74/74), reject admission with HTTP 409 Conflict, block form submission, and route patient to FIFO waitlist queue.'),
          createBulletP('Category & Rationale: ', 'Concurrency & Resource Safety. Client-side checks allow race conditions where two simultaneous admissions produce 75 occupied beds in a 74-bed facility.'),

          createH3('Constraint 7: Server-Side Zero-Trust RBAC Enforcement'),
          createBulletP('Trigger Condition: ', 'Any mutation API request or Server Action call.'),
          createBulletP('System Behavior: ', 'Inspect authenticated session token on the server. If caller role does not match required action (e.g., Nurse calling /api/discharges/approve or Admin altering clinical SOAP notes), abort database write and return HTTP 403 Forbidden with security event logging.'),
          createBulletP('Category & Rationale: ', 'Security & Regulatory Compliance. UI-only button hiding provides zero security against script execution or modified HTTP requests.'),

          createH3('Constraint 8: Clinical Mortality Rate Denominator Rule'),
          createBulletP('Trigger Condition: ', 'Calculating institutional mortality percentage on analytics dashboards.'),
          createBulletP('System Behavior: ', 'Formula: Mortality Rate = Deceased / (Discharged Cured + Deceased). Actively admitted patients MUST be excluded from both numerator and denominator, as their clinical outcome remains pending. Use a 30-day rolling window for executive alert triggers to eliminate small-sample noise.'),
          createBulletP('Category & Rationale: ', 'Epidemiological Integrity. Dividing deaths by total admissions artificially depresses mortality rates during intake surges, concealing quality breakdowns.'),

          createH3('Constraint 9: Non-Erasure Data Correction with Mandatory Reason Codes'),
          createBulletP('Trigger Condition: ', 'Staff member corrects an erroneous entry (e.g., wrong patient ID or transcription typo).'),
          createBulletP('System Behavior: ', 'Strictly prohibit SQL DELETE or unversioned UPDATE on clinical records. Create an amendment entity referencing the parent record, capturing original value, amended value, staff ID, timestamp, and a mandatory clinical reason code (e.g., "Sensor miscalibration", "Typographical error").'),
          createBulletP('Category & Rationale: ', 'Medical Legal & HIPAA Compliance. Audit log integrity requires non-repudiation of all clinical modifications.'),

          createH3('Constraint 10: Offline Outbox Queueing with Original Clinical Timestamping'),
          createBulletP('Trigger Condition: ', 'Network connectivity loss on mobile tablet during bedside rounding.'),
          createBulletP('System Behavior: ', 'Queue mutations locally in IndexedDB with optimistic UI updates. When connectivity reconnects, flush the sync queue in FIFO order. Crucial: The synced record MUST preserve the original local entry timestamp as recordedAt, while storing synchronizedAt as server ingestion time.'),
          createBulletP('Category & Rationale: ', 'Data Integrity in Degraded Environments. Using server arrival time falsifies patient clinical timelines and shift handover records.'),

          createH3('Constraint 11: Dynamic System Configuration (No Hardcoded Thresholds)'),
          createBulletP('Trigger Condition: ', 'Application queries fever temperature threshold or bed capacity limits.'),
          createBulletP('System Behavior: ', 'Store clinical parameters in a facility configuration table (default: feverThreshold = 38.0°C, maxBeds = 74). Retrieve values dynamically via cached configuration service. Changing facility thresholds must not require a code rebuild or redeployment.'),
          createBulletP('Category & Rationale: ', 'Maintainability & Adaptability. Different pandemic strains or regional hospital guidelines require rapid protocol adjustments.'),

          createH3('Constraint 12: FIFO Waitlist Management with Human-in-the-Loop Prompts'),
          createBulletP('Trigger Condition: ', 'A bed is released following an executed discharge when waitlist count > 0.'),
          createBulletP('System Behavior: ', 'System MUST NOT automatically admit the next patient. Instead, generate a high-priority alert for Admin: "Bed A-02 is available. Patient [Name] is next in FIFO queue (waiting 4.2 hours). Review and Confirm Admission." Allow manual priority elevation only with mandatory documented clinical triage reason.'),
          createBulletP('Category & Rationale: ', 'Clinical Operations. Patients on waitlists may have deteriorated or been rerouted; human confirmation prevents empty bed blocking.'),
          new Paragraph({ spacing: { after: 200 } }),

          // -------------------------------------------------------------
          // QUESTION 4
          // -------------------------------------------------------------
          new Paragraph({ children: [new PageBreak()] }),
          createHeaderP('QUESTION 4: SPRINT PLANNING & KNAPSACK OPTIMIZATION'),
          createBodyP('Prompt: In the next sprint planning meeting, after reviewing the last sprint, you and your team estimate that their velocity is 25 story points. For the next sprint, you already plan to finish 3 stories of 5 points each. In addition to these, which of the following options would you add to the sprint such that the effort is minimized and the value is maximized? Assume that High priority features are 2X as valuable as medium priority features, and medium priority features are 3X as valuable as low priority features. Features: A (High, 1), B (High, 3), C (High, 5), D (Med, 2), E (Med, 3), F (Med, 1), G (Low, 0.4), H (Low, 0.5), I (Low, 0.3), J (Low, 0.1).', { italic: true }),
          new Paragraph({ spacing: { after: 80 } }),

          createSubheaderP('4.1 Mathematical Formulation & Available Capacity'),
          createBulletP('Team Sprint Velocity: ', '25 Story Points (SP)'),
          createBulletP('Pre-Committed In-Flight Work: ', '3 stories x 5 points each = 15 Story Points'),
          createBulletP('Remaining Available Capacity: ', 'C = 25 - 15 = 10.0 Story Points'),
          createBulletP('Objective Function: ', 'Maximize total business value V = sum(v_i * x_i) while minimizing total engineering effort E = sum(e_i * x_i), subject to E <= 10.0 SP and x_i in {0, 1}.'),
          new Paragraph({ spacing: { after: 60 } }),

          createBodyP('Priority Value Weighting Derivation:'),
          createBulletP('Low Priority Baseline (V_Low): ', '1 Value Point'),
          createBulletP('Medium Priority (V_Med = 3 * V_Low): ', '3 Value Points'),
          createBulletP('High Priority (V_High = 2 * V_Med): ', '6 Value Points'),
          new Paragraph({ spacing: { after: 80 } }),

          createSubheaderP('4.2 Feature Backlog Efficiency & ROI Analysis'),
          createBodyP('To identify optimal candidates, we compute the Value-to-Effort Return on Investment (ROI = Value / Effort) for each feature:'),

          createTable(
            ['Feature', 'Priority', 'Effort (SP)', 'Assigned Value', 'Value/Effort ROI', 'Strategic Role & Clinical Impact'],
            [
              ['Feature J', 'Low', '0.1', '1', '10.00', 'Micro-win; tactical UI adjustment with negligible effort.'],
              ['Feature A', 'High', '1.0', '6', '6.00', 'Top Tier High Priority; immense value delivered in 1 story point.'],
              ['Feature I', 'Low', '0.3', '1', '3.33', 'Quick-win; high efficiency operational fix.'],
              ['Feature F', 'Medium', '1.0', '3', '3.00', 'Top Tier Medium; delivers 3 value points for only 1 story point.'],
              ['Feature G', 'Low', '0.4', '1', '2.50', 'Quick-win; high ROI polish.'],
              ['Feature B', 'High', '3.0', '6', '2.00', 'Core High Priority capability; strong value return.'],
              ['Feature H', 'Low', '0.5', '1', '2.00', 'Solid quick-win; exactly matches 2.0 ROI.'],
              ['Feature D', 'Medium', '2.0', '3', '1.50', 'Balanced workflow enhancement.'],
              ['Feature C', 'High', '5.0', '6', '1.20', 'High Priority Epic; heavy effort (5 SP consumes 50% of available capacity).'],
              ['Feature E', 'Medium', '3.0', '3', '1.00', 'Lowest efficiency candidate (3 SP for only 3 value points).']
            ],
            [14, 12, 12, 14, 16, 32]
          ),
          new Paragraph({ spacing: { after: 140 } }),

          createSubheaderP('4.3 Exact 0-1 Knapsack Global Optimum Solution'),
          createBodyP('Evaluating all 2^10 = 1,024 combinatorial subsets under the 10.0 SP capacity constraint proves that the absolute maximum value achievable in this backlog is 22 Value Points. Among all combinations reaching this maximum, exactly ONE combination strictly minimizes engineering effort:'),

          createCallout(
            'OPTIMAL COMBINATION: A + B + D + F + G + H + I + J',
            'Selected Features: {A, B, D, F, G, H, I, J}\n' +
            'Total Business Value Achieved: 6 + 6 + 3 + 3 + 1 + 1 + 1 + 1 = 22 VALUE POINTS (Absolute Backlog Maximum)\n' +
            'Total Story Point Effort: 1.0 + 3.0 + 2.0 + 1.0 + 0.4 + 0.5 + 0.3 + 0.1 = 8.3 STORY POINTS\n' +
            'Sprint Capacity Utilization: 8.3 SP used / 10.0 SP available (83% commitment)\n' +
            'Remaining Sprint Risk Buffer: 1.7 STORY POINTS (17% safety margin)',
            ACCENT_TEAL,
            HIGHLIGHT_BG
          ),
          new Paragraph({ spacing: { after: 140 } }),

          createSubheaderP('4.4 Comparative Analysis of Candidate Sprint Bundles'),
          createBodyP('The table below benchmarks the top combinations against alternative strategic interpretations:'),

          createTable(
            ['Rank / Scenario', 'Feature Selection', 'Total Value', 'Total Effort', 'Capacity Buffer', 'Strategic Evaluation'],
            [
              [
                'Option 1 (RECOMMENDED)\nGlobal Optimum',
                'A, B, D, F, G, H, I, J',
                '22 pts',
                '8.3 SP',
                '1.7 SP (17%)',
                'STRICTLY OPTIMAL. Delivers theoretical maximum value (22 pts) while leaving a 1.7 SP buffer to absorb biocontainment compliance QA and clinical edge cases.'
              ],
              [
                'Option 2\nAlternative Maximum',
                'A, B, E, F, G, H, I, J',
                '22 pts',
                '9.3 SP',
                '0.7 SP (7%)',
                'Achieves 22 value points but uses Feature E (1.00 ROI) instead of D (1.50 ROI), consuming 1.0 SP more effort (9.3 vs 8.3 SP) for identical value.'
              ],
              [
                'Option 3\nHigh-Priority Purist',
                'A, B, C, F',
                '21 pts',
                '10.0 SP',
                '0.0 SP (0%)',
                'Forces all 3 High Priority features (A, B, C) + F. Yields 21 value points but requires 100% capacity (10.0 SP). Delivers LESS value for MORE effort.'
              ],
              [
                'Option 4\nHigh + Quick-Wins',
                'A, B, C, J, I',
                '19 pts',
                '9.4 SP',
                '0.6 SP (6%)',
                'Packages High features with top micro-wins. Yields 19 value points (3 points lower than Option 1) for 9.4 SP effort.'
              ],
              [
                'Option 5\nCore Features Only',
                'A, B, D, F',
                '18 pts',
                '7.0 SP',
                '3.0 SP (30%)',
                'Conservative bundle taking only High and Medium candidates. Leaves 4 value points on the table that could be captured with only 1.3 SP of Low features.'
              ]
            ],
            [20, 20, 12, 12, 14, 22]
          ),
          new Paragraph({ spacing: { after: 140 } }),

          createSubheaderP('4.5 Product Management Trade-Off Analysis & Sprint Recommendation'),
          createBulletP('Why Feature C is Deferred to the Next Sprint: ', 'Feature C (High Priority, 5.0 SP, Value = 6) has an ROI of 1.20. Taking Feature C consumes 50% of the entire available capacity. By swapping C for the package of {D, G, H, I, J} (Effort = 3.3 SP, Value = 7), the team achieves HIGHER value (+1 point) for 1.7 SP LESS effort! In agile terms, Feature C represents an epic that should be decomposed into smaller user stories prior to sprint ingestion.'),
          createBulletP('Why Feature E is Excluded: ', 'Feature E (Medium Priority, 3.0 SP, Value = 3) has an ROI of 1.00, making it the least efficient item in the entire backlog. Substituting D (2.0 SP) delivers identical value while conserving 1.0 SP.'),
          createBulletP('Strategic Value of the 1.7 SP Buffer: ', 'Committing to 8.3 SP leaves a 1.7 SP (17%) buffer. In high-consequence healthcare software (HIPAA, BSL-4 protocols), overcommitting to 10.0 SP creates sprint spillover when unexpected clinical bugs or regulatory edge cases arise. An 83% load factor ensures consistent team velocity and guaranteed sprint goal delivery.'),
          new Paragraph({ spacing: { after: 200 } }),

          // -------------------------------------------------------------
          // CONCLUSION
          // -------------------------------------------------------------
          createHeaderP('SUMMARY & SUBMISSION SIGNOFF'),
          createBodyP('This assessment demonstrates the end-to-end capabilities required of a Technical Product Manager: translating clinical workflows into robust software specifications, building and deploying functional prototypes with modern web frameworks, enforcing non-negotiable medical safety invariants, and applying rigorous quantitative optimization to sprint engineering delivery.'),
          new Paragraph({ spacing: { after: 100 } }),

          createTable(
            ['Deliverable Item', 'Assessment Question', 'Fulfillment Summary & Verification Link'],
            [
              ['User Roles & Access Matrix', 'Question 1', 'Defined 5 distinct personas and 17-feature permission matrix with server-side RBAC.'],
              ['Deployable Prototype', 'Question 2', 'Functional Next.js 16 prototype deployed on Vercel: https://quarantine-treatment-facility-manag.vercel.app with 384 passing tests.'],
              ['Developer Constraints', 'Question 3', 'Documented 12 critical clinical constraints including append-only vitals, atomic bed locks, and 2-stage discharges.'],
              ['Sprint Knapsack Optimization', 'Question 4', 'Formulated mathematical 0-1 knapsack proof recommending {A, B, D, F, G, H, I, J} (22 Value pts, 8.3 SP, 1.7 SP buffer).']
            ],
            [25, 20, 55]
          )
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.resolve('docs', 'TPM_Assessment_Siddharth_Kumar_Mishra.docx');
  fs.writeFileSync(outPath, buffer);
  console.log(`Successfully generated Word Document at: ${outPath} (${buffer.length} bytes)`);
}

buildDoc().catch(err => {
  console.error('Failed to generate Word document:', err);
  process.exit(1);
});
