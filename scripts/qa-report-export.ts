/**
 * Exports the QA review findings to a .docx Word document.
 * Run: npx dotenv -e .env -- tsx scripts/qa-report-export.ts
 */
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
  convertInchesToTwip,
  TableLayoutType,
} from "docx";
import { writeFileSync } from "fs";
import { join } from "path";

// ─── Colour palette ─────────────────────────────────────────────────────────
const BRAND_DARK  = "1E2A38";   // deep navy
const BRAND_MID   = "2C5282";   // mid blue
const BRAND_LIGHT = "EBF4FF";   // pale blue fill
const GREEN_BG    = "E6F4EA";
const RED_BG      = "FDECEA";
const AMBER_BG    = "FFF8E1";
const GREY_BG     = "F5F5F5";
const WHITE       = "FFFFFF";
const BLACK       = "000000";
const MID_GREY    = "6B7280";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function h1(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    thematicBreak: false,
    spacing: { before: 400, after: 160 },
    shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
    run: { color: WHITE, bold: true, size: 28, font: "Calibri" },
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    border: { bottom: { color: BRAND_MID, size: 6, style: BorderStyle.SINGLE } },
    run: { color: BRAND_DARK, bold: true, size: 24, font: "Calibri" },
  });
}

function h3(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    run: { color: BRAND_MID, bold: true, size: 22, font: "Calibri" },
  });
}

function para(text: string, opts?: { bold?: boolean; italic?: boolean; color?: string; size?: number }): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({
        text,
        bold:   opts?.bold   ?? false,
        italics: opts?.italic ?? false,
        color:  opts?.color  ?? BLACK,
        size:   opts?.size   ?? 20,
        font:   "Calibri",
      }),
    ],
  });
}

function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 20, font: "Calibri" })],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { before: 100, after: 100 }, children: [] });
}

function statusBadge(text: string, type: "green" | "red" | "amber" | "blue" | "grey"): TextRun {
  const bgMap = { green: "2E7D32", red: "C62828", amber: "E65100", blue: BRAND_MID, grey: MID_GREY };
  return new TextRun({
    text: `  ${text}  `,
    bold: true,
    color: WHITE,
    size: 18,
    font: "Calibri",
    highlight: undefined,
    shading: { type: ShadingType.SOLID, color: bgMap[type], fill: bgMap[type] },
  });
}

function kv(key: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ text: `${key}:  `, bold: true, size: 20, font: "Calibri", color: BRAND_DARK }),
      new TextRun({ text: value, size: 20, font: "Calibri", color: BLACK }),
    ],
  });
}

// ─── Table builders ──────────────────────────────────────────────────────────

function makeHeaderRow(headers: string[], colWidths: number[]): TableRow {
  return new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: { size: colWidths[i], type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: h, bold: true, color: WHITE, size: 18, font: "Calibri" })],
          }),
        ],
      })
    ),
  });
}

function makeRow(cells: string[], colWidths: number[], shade?: string): TableRow {
  return new TableRow({
    children: cells.map((c, i) =>
      new TableCell({
        width: { size: colWidths[i], type: WidthType.PERCENTAGE },
        shading: shade ? { type: ShadingType.SOLID, color: shade, fill: shade } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: c, size: 18, font: "Calibri", color: BLACK })],
          }),
        ],
      })
    ),
  });
}

function simpleTable(headers: string[], rows: string[][], colWidths: number[]): Table {
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      makeHeaderRow(headers, colWidths),
      ...rows.map((r, i) => makeRow(r, colWidths, i % 2 === 0 ? WHITE : GREY_BG)),
    ],
  });
}

// ─── Document build ──────────────────────────────────────────────────────────

async function buildDoc(): Promise<Document> {
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  return new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 20 } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: {
              top:    convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1),
              right:  convertInchesToTwip(1),
            },
          },
        },
        children: [

          // ── COVER ──────────────────────────────────────────────────────────
          new Paragraph({
            spacing: { before: 1200, after: 200 },
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
            children: [
              new TextRun({ text: "DealStackHQ CRM", bold: true, size: 48, color: WHITE, font: "Calibri", break: 0 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "Meta Lead Ads Integration", size: 36, color: "BDD7EE", font: "Calibri" }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
            spacing: { after: 400 },
            children: [
              new TextRun({ text: "QA & Data Integrity Review", bold: true, size: 32, color: WHITE, font: "Calibri" }),
            ],
          }),
          spacer(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: `Review Date: ${today}`, size: 22, color: MID_GREY, font: "Calibri" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: "Scope: Production database — read-only analysis", size: 22, color: MID_GREY, font: "Calibri" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: "Platform: dealstackhq.com  |  Database: Neon PostgreSQL", size: 22, color: MID_GREY, font: "Calibri" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: "Method: Read-only queries — no writes, no deletes, no triggers", size: 22, color: MID_GREY, italics: true, font: "Calibri" })],
          }),
          spacer(),
          spacer(),

          // ── PRE-REVIEW: WORKFLOW ALIGNMENT CHECK ──────────────────────────
          h1("Pre-Review: Workflow Alignment Check"),
          para("Before findings, confirming the implemented code matches the stated business rules:"),
          spacer(),
          simpleTable(
            ["Business Rule", "Implementation", "Status"],
            [
              ["New phone → new lead + lo.status=New", "autoImportToCRM creates lead with status=New; linkToOpportunity creates LO with schema default New", "✓ ALIGNED"],
              ["Existing phone + same opp → no overwrite", "linkToOpportunity has explicit findUnique guard; if already linked, returns early without touching any data", "✓ ALIGNED"],
              ["Existing phone + different opp → new LO row at New", "linkToOpportunity resolves opp by form_id (not phone); creates new LO only if that lead+opp pair doesn't exist", "✓ ALIGNED"],
              ["Historical user-updated statuses preserved", "Repair script ran 274 sequential individual updates (no transaction); all synced lo.status to lead.status", "✓ ALIGNED"],
              ["stage/route.ts syncs all LOs when no opportunity_link_id", "updateMany on all linked LOs added to the transaction; prevents drift on bulk/admin updates", "✓ ALIGNED"],
            ],
            [40, 45, 15]
          ),
          spacer(),
          new Paragraph({
            spacing: { before: 100, after: 100 },
            shading: { type: ShadingType.SOLID, color: GREEN_BG, fill: GREEN_BG },
            children: [
              new TextRun({ text: "  VERDICT: All five business rules are correctly implemented as of current code.  ", bold: true, size: 20, font: "Calibri", color: "1B5E20" }),
            ],
          }),
          spacer(),

          // ── SECTION 1: EXECUTIVE SUMMARY ──────────────────────────────────
          h1("1. Executive Summary"),
          h3("Database Overview"),
          simpleTable(
            ["Metric", "Count"],
            [
              ["Total active CRM leads", "968"],
              ["Total MetaLead records", "982"],
              ["Total LeadOpportunity rows", "943"],
              ["Total active Opportunities", "7"],
              ["Total Stage History entries", "2,353"],
              ["Total Lead Activities", "8,159"],
              ["Total Lead Notes", "2,889"],
              ["Total Lead Follow-Ups", "2,945"],
              ["Total Lead-linked Tasks", "1"],
            ],
            [60, 40]
          ),
          spacer(),
          h3("Key Outcomes"),
          new Paragraph({
            spacing: { before: 100, after: 100 },
            shading: { type: ShadingType.SOLID, color: GREEN_BG, fill: GREEN_BG },
            children: [
              new TextRun({ text: "  274/274 stale LeadOpportunity records successfully repaired. Zero status drift remains.  ", bold: true, size: 20, font: "Calibri", color: "1B5E20" }),
            ],
          }),
          spacer(),
          bullet("Zero LeadOpportunity records have any status drift vs their lead (in any direction)"),
          bullet("Zero records still have the stale lo.status=New while lead.status≠New pattern"),
          bullet("DS-LEAD-000811 confirmed clean: Prospect/NoResponse in both lead header and opportunity card"),
          bullet("The unique constraint is working correctly — no duplicate LO rows exist for any lead+opportunity pair"),
          bullet("The linkToOpportunity guard is active — Meta webhook will not create duplicate rows on repeat submissions"),
          spacer(),
          para("Three residual concerns remain — none caused by the Meta integration fix. Detailed in sections below.", { italic: true }),
          spacer(),

          // ── SECTION 2: LEAD STATUS INTEGRITY ─────────────────────────────
          h1("2. Lead Status Integrity Findings"),

          h2("2a. Repair Outcome — CONFIRMED CLEAN"),
          simpleTable(
            ["Check", "Result"],
            [
              ["Remaining lo.status=New while lead.status≠New", "0  (was 274 before repair)"],
              ["Any-direction lo ↔ lead status drift", "0"],
              ["lo.status MORE advanced than lead.status (unexpected)", "0"],
              ["Total LeadOpportunity records checked", "932"],
            ],
            [65, 35]
          ),
          spacer(),
          para("All 274 records were individually updated using sequential await calls (no Prisma transaction) to avoid the 5-second Neon serverless timeout. Every LeadOpportunity.status and LeadOpportunity.activity_stage now exactly matches its parent lead.status and lead.activity_stage."),
          spacer(),

          h2("2b. DS-LEAD-000811 Spot-Check — CONFIRMED CLEAN"),
          para("Confidence: HIGH", { bold: true, color: "2E7D32" }),
          simpleTable(
            ["Field", "Value"],
            [
              ["lead.status", "Prospect"],
              ["lead.activity_stage", "NoResponse"],
              ["lo.status (DS-OPP-000007)", "Prospect"],
              ["lo.activity_stage", "NoResponse"],
              ["lo ↔ lead in sync", "YES"],
            ],
            [50, 50]
          ),
          spacer(),
          para("Stage history (Revathi, Sales):"),
          bullet("2026-06-06 12:07 — null → New  (lead created)"),
          bullet("2026-06-06 12:07 — New → Contacted"),
          bullet("2026-06-07 11:14 — Contacted → Prospect"),
          spacer(),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: GREEN_BG, fill: GREEN_BG },
            children: [new TextRun({ text: "  The opportunity card for DS-LEAD-000811 now correctly shows Prospect / NoResponse as set by Revathi.  ", size: 20, font: "Calibri", color: "1B5E20", bold: true })],
          }),
          spacer(),

          h2("2c. Borderline Case — DS-LEAD-000862"),
          para("Confidence: MEDIUM — likely intentional", { bold: true, color: "E65100" }),
          simpleTable(
            ["Field", "Value"],
            [
              ["lead.status", "New"],
              ["lead.activity_stage", "NoResponse"],
              ["Source", "Meta Ads - Direct"],
              ["Issue", "Pipeline stage still New; user updated activity stage only"],
            ],
            [40, 60]
          ),
          spacer(),
          para("A user logged activity (NoResponse) without formally advancing the pipeline stage. This is valid CRM behaviour — activity stage and pipeline stage are independent fields. Not a data corruption issue."),
          para("No action required unless the business rule states that updating activity_stage must also auto-advance pipeline stage.", { italic: true }),
          spacer(),

          h2("2d. Six Leads with Stage History Reverted to New — NOT Meta-Related"),
          para("Confidence: HIGH — all Instagram source, unrelated to Meta webhook fix", { bold: true, color: BRAND_MID }),
          spacer(),
          simpleTable(
            ["Lead", "Source", "Last Stage Change", "Changed By", "Date", "LO Status"],
            [
              ["DS-LEAD-000177", "Instagram", "→ New (admin reset)", "Mohamed Nabil (Admin)", "2026-05-14", "New/Prospect"],
              ["DS-LEAD-000168", "Instagram", "→ New", "Melvin (TeamLead)", "2026-05-19", "New/NoResponse"],
              ["DS-LEAD-000161", "Instagram", "→ New", "Melvin (TeamLead)", "2026-05-19", "No opp link"],
              ["DS-LEAD-000399", "Instagram", "→ New", "Arpitha (Sales)", "2026-05-30", "New/NoResponse"],
              ["DS-LEAD-000740", "Instagram", "→ New", "Arpitha (Sales)", "2026-06-06", "New/NoResponse"],
              ["DS-LEAD-000730", "Instagram", "→ New", "Arpitha (Sales)", "2026-06-06", "New/NoResponse"],
            ],
            [16, 14, 18, 20, 14, 18]
          ),
          spacer(),
          para("All six are Instagram-source leads. Stage history confirms someone explicitly moved the pipeline stage back to New after previously advancing it. Their lo.status matches lead.status (no drift) — our repair correctly excluded them because lead.status IS New."),
          spacer(),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: AMBER_BG, fill: AMBER_BG },
            children: [new TextRun({ text: "  These require manual review with the sales team to confirm whether the New reversion was intentional.  ", size: 20, font: "Calibri", color: "E65100", bold: true })],
          }),
          spacer(),

          // ── SECTION 3: OPPORTUNITY-LINK INTEGRITY ─────────────────────────
          h1("3. Opportunity-Link Integrity Findings"),

          h2("3a. LeadOpportunity Source Breakdown"),
          simpleTable(
            ["Source (notes field)", "Count"],
            [
              ["Manual / null (user-tagged via CRM UI)", "401"],
              ["Auto-linked via Meta historical backfill (CSV import)", "480"],
              ["Auto-linked via Meta Lead Ads webhook", "62"],
              ["Total", "943"],
            ],
            [70, 30]
          ),
          spacer(),

          h2("3b. Opportunity Meta Form ID Configuration"),
          para("Only DS-OPP-000007 has Meta form IDs configured. All Meta leads funnel to a single opportunity."),
          spacer(),
          simpleTable(
            ["Opportunity", "Name", "Meta Form IDs"],
            [
              ["DS-OPP-000007", "Kalyan Nagar Apartments", "2702399033477395, 3452669468230021"],
              ["DS-OPP-000008", "Nandi Hill Ezzy Plots", "NONE"],
              ["DS-OPP-000009", "Elite / Sage", "NONE"],
              ["DS-OPP-000010", "Plotted development - Devanahalli", "NONE"],
              ["DS-OPP-000011", "Srikanth - Divyashree Plot", "NONE"],
              ["DS-OPP-000015", "Melvin - Hennur", "NONE"],
              ["DS-OPP-000016", "Melvin - RERA University", "NONE"],
            ],
            [18, 42, 40]
          ),
          spacer(),

          h2("3c. Backfill-OPP-000007 Endpoint — Never Executed"),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: AMBER_BG, fill: AMBER_BG },
            children: [new TextRun({ text: "  0 records found with the backfill-opp-000007 notes marker. This one-time endpoint was never run.  ", size: 20, font: "Calibri", color: "E65100", bold: true })],
          }),
          spacer(),
          para("The endpoint /api/admin/backfill-opp-000007 (designed to link pre-June-5 leads to DS-OPP-000007 with correct status inheritance) has zero records. The 480 historical backfill records all came from the meta-backfill CSV import route, not this endpoint."),
          para("If there are still pre-June-5 leads unlinked to DS-OPP-000007, this endpoint needs to be run. First call GET /api/admin/backfill-opp-000007 to see the dry-run count before executing.", { italic: true }),
          spacer(),

          h2("3d. Duplicate Meta Form Submissions — Handled Correctly"),
          simpleTable(
            ["Check", "Result"],
            [
              ["Phones with multiple Meta submissions (both form IDs)", "75"],
              ["Duplicate LeadOpportunity rows created", "0"],
              ["Unique constraint violations", "0"],
              ["Leads linked to multiple opportunities", "0"],
            ],
            [70, 30]
          ),
          spacer(),
          para("75 phone numbers submitted on both form IDs (3452669468230021 and 2702399033477395). Since both forms map to DS-OPP-000007, the system created only one LeadOpportunity row per lead. The unique constraint and explicit guard both worked correctly."),
          spacer(),

          h2("3e. Three MetaLead Records with No Opportunity Linked"),
          simpleTable(
            ["Condition", "Count"],
            [
              ["MetaLead with opportunity_id = null", "3"],
              ["Of which: no phone (cannot be imported to CRM)", "1"],
              ["Of which: has form_id but MetaLead.opportunity_id not set", "2"],
            ],
            [70, 30]
          ),
          spacer(),
          para("The 1 record without a phone (leadgen_id 1021563880288251, received 2026-06-06) cannot be auto-imported — expected behaviour. The 2 records with form_ids but null opportunity_id likely came through the historical backfill process which sets LeadOpportunity but does not backfill MetaLead.opportunity_id. The CRM lead IS linked via LeadOpportunity. Low severity."),
          spacer(),

          h2("3f. No Existing Opportunity Links Were Overwritten"),
          para("The repair script only updated lo.status and lo.activity_stage — it never created, deleted, or replaced LeadOpportunity rows. All backfill and repair routes use skipDuplicates: true and explicit dedup guards. No manual links were overwritten."),
          spacer(),

          // ── SECTION 4: META ADS STATISTICS ────────────────────────────────
          h1("4. Meta Ads Direct Source Lead Statistics"),
          para("Important distinction: 'Meta Ads - Direct' (webhook-created, 60 leads) vs 'Meta Ads - Direct (backfill)' (CSV import route, hundreds more). Statistics below cover webhook-created leads only.", { italic: true }),
          spacer(),
          simpleTable(
            ["Metric", "Count"],
            [
              ["Total Meta Ads Direct leads (webhook-created)", "60"],
              ["Still New/New with NO user action", "18"],
              ["Status=New but user updated activity stage only", "1  (DS-LEAD-000862)"],
              ["Progressed past New (actioned + moved)", "41"],
              ["Phones with multiple Meta submissions", "75"],
              ["Duplicate LeadOpportunity rows created", "0"],
              ["Leads linked to multiple opportunities", "0"],
              ["MetaLead records not imported to CRM (no phone)", "1"],
              ["MetaLead records linked to non-Meta-source leads (phone dedup)", "919"],
            ],
            [70, 30]
          ),
          spacer(),

          h3("Leads Still at New/New — No User Action (18 leads)"),
          para("Confirmed by checking stage history, activities, notes, follow-ups, and tasks — all empty beyond the system-generated creation entry. These are genuine cold inbound leads not yet worked by the sales team."),
          spacer(),
          para("Lead numbers: DS-LEAD-000849, DS-LEAD-000852, DS-LEAD-000855, DS-LEAD-000861, DS-LEAD-000868, DS-LEAD-000871, DS-LEAD-000876, DS-LEAD-000879, DS-LEAD-000960, DS-LEAD-001044, DS-LEAD-001047, DS-LEAD-001050, DS-LEAD-001053, DS-LEAD-001056, DS-LEAD-001059, DS-LEAD-001062, DS-LEAD-001065, DS-LEAD-001068"),
          spacer(),

          h3("Source Label Inconsistency"),
          para("Two labels exist for Meta-origin leads:"),
          bullet("\"Meta Ads - Direct\" — leads created by the live webhook (60 leads)"),
          bullet("\"Meta Ads - Direct (backfill)\" — leads created via CSV import route (hundreds more)"),
          para("If reporting needs to aggregate all Meta leads, queries must cover both source values.", { italic: true }),
          spacer(),

          h3("Recent Stage Activity (Last 7 Days)"),
          para("50 stage changes recorded in the last 7 days:"),
          simpleTable(
            ["User", "Role", "Stage Changes"],
            [
              ["Arpitha", "Sales", "28"],
              ["Revathi", "Sales", "17"],
              ["Melvin", "TeamLead", "5"],
            ],
            [40, 30, 30]
          ),
          spacer(),

          // ── SECTION 5: RECORDS NEEDING MANUAL REVIEW ──────────────────────
          h1("5. Records Requiring Manual Review"),
          simpleTable(
            ["Lead", "Issue", "Priority"],
            [
              ["DS-LEAD-000862", "Status=New, activity=NoResponse. User activity logged but pipeline not advanced. May be intentional.", "Low"],
              ["DS-LEAD-000177", "Pipeline stage reverted to New by Admin after being advanced. lo.activity=Prospect. Confirm if intentional.", "Medium"],
              ["DS-LEAD-000168", "Pipeline stage reverted to New by Melvin (TeamLead). Confirm if intentional.", "Medium"],
              ["DS-LEAD-000399", "Pipeline stage reverted to New by Arpitha (Sales). Confirm if intentional.", "Medium"],
              ["DS-LEAD-000740", "Pipeline reverted to New by Arpitha on 2026-06-06. Same day as fix deployment — confirm.", "Medium"],
              ["DS-LEAD-000730", "Pipeline reverted to New by Arpitha on 2026-06-06. Same day as fix deployment — confirm.", "Medium"],
              ["DS-LEAD-000161", "Stage reverted to New. No opportunity link at all.", "Low"],
              ["18 new leads (listed above)", "Cold inbound, no user action. Needs assignment and follow-up.", "Low"],
            ],
            [20, 62, 18]
          ),
          spacer(),

          // ── SECTION 6: CONFIRMED INCORRECT RECORDS ────────────────────────
          h1("6. Confirmed Incorrect Records"),
          new Paragraph({
            spacing: { before: 100, after: 100 },
            shading: { type: ShadingType.SOLID, color: GREEN_BG, fill: GREEN_BG },
            children: [new TextRun({ text: "  After the repair script: ZERO confirmed incorrect records remain.  ", bold: true, size: 22, font: "Calibri", color: "1B5E20" })],
          }),
          spacer(),
          para("The 274 records that were incorrect (lo.status=New while lead.status was advanced by users) have all been corrected. Every LeadOpportunity.status now matches lead.status."),
          para("The 6 leads with stage reverted to New are not data corruption — they reflect explicit user actions recorded in stage history. They are anomalies worth investigating with the team, not system errors."),
          spacer(),

          // ── SECTION 7: RECOMMENDED NEXT ACTIONS ───────────────────────────
          h1("7. Recommended Next Actions"),
          para("These are recommendations only. Nothing has been implemented.", { italic: true }),
          spacer(),

          h2("Priority 1 — Immediate"),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: "1. Confirm with Arpitha — DS-LEAD-000740 and DS-LEAD-000730", bold: true, size: 20, font: "Calibri" })],
          }),
          para("Both leads were reverted to New by Arpitha on 2026-06-06 (same day as the fix deployment). Verify whether these resets were intentional actions or accidental clicks during that day."),
          spacer(),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: "2. Investigate DS-LEAD-000177 — Admin-reset stage", bold: true, size: 20, font: "Calibri" })],
          }),
          para("Mohamed Nabil (Admin) reset this lead's pipeline stage to New while the opportunity link still shows activity=Prospect. Clarify whether this was deliberate or an error."),
          spacer(),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: "3. Run the backfill-opp-000007 endpoint (if still needed)", bold: true, size: 20, font: "Calibri" })],
          }),
          para("The /api/admin/backfill-opp-000007 endpoint was never executed. If pre-June-5 leads still need linking to DS-OPP-000007, first call GET /api/admin/backfill-opp-000007 to see the dry-run count, then POST to apply."),
          spacer(),

          h2("Priority 2 — Data Quality"),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: "4. Map form IDs to the other 6 opportunities", bold: true, size: 20, font: "Calibri" })],
          }),
          para("DS-OPP-000008 through DS-OPP-000016 have no meta_form_ids configured. If Meta ads ever run for those projects, leads will arrive but won't be auto-linked to the correct opportunity."),
          spacer(),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: "5. Action the 18 cold New/New leads", bold: true, size: 20, font: "Calibri" })],
          }),
          para("Assign these to the round-robin queue or a specific sales rep. They are genuine inbound leads sitting idle."),
          spacer(),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: "6. Standardise source labels", bold: true, size: 20, font: "Calibri" })],
          }),
          para("Two labels exist for Meta-origin leads: 'Meta Ads - Direct' (webhook) and 'Meta Ads - Direct (backfill)' (CSV). Reporting queries must cover both; consider normalising to a single label if reporting should aggregate them."),
          spacer(),

          h2("Priority 3 — Monitoring"),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: "7. Add a periodic drift check", bold: true, size: 20, font: "Calibri" })],
          }),
          para("Consider scheduling /api/admin/sync-lead-opp-statuses GET as a daily dry-run alert. If it ever returns would_fix > 0, drift is occurring again and the stage/route.ts sync has a gap."),
          spacer(),
          new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: "8. Investigate the 1 MetaLead with no phone", bold: true, size: 20, font: "Calibri" })],
          }),
          para("leadgen_id 1021563880288251 arrived 2026-06-06 with no phone number. If this is a real lead, the CRM has no record for them. Consider making phone mandatory on the Meta form configuration."),
          spacer(),

          // ── SECTION 8: VALIDATION QUERIES ────────────────────────────────
          h1("8. Read-Only Validation Queries"),
          para("Safe to re-run at any time. These are read-only."),
          spacer(),

          h3("Query 1 — Remaining stale LeadOpportunity records (should return 0 rows)"),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG },
            children: [
              new TextRun({
                text: "SELECT lo.id, l.lead_number, o.opp_number, lo.status, lo.activity_stage,\n" +
                      "       l.status AS lead_status, l.activity_stage AS lead_activity\n" +
                      "FROM lead_opportunities lo\n" +
                      "JOIN leads l ON lo.lead_id = l.id\n" +
                      "JOIN opportunities o ON lo.opportunity_id = o.id\n" +
                      "WHERE l.deleted_at IS NULL\n" +
                      "  AND lo.status = 'New' AND lo.activity_stage = 'New'\n" +
                      "  AND (l.status != 'New' OR l.activity_stage != 'New');",
                font: "Courier New", size: 18, color: "1A1A2E",
              }),
            ],
          }),
          spacer(),

          h3("Query 2 — Any-direction drift (lo.status ≠ lead.status)"),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG },
            children: [
              new TextRun({
                text: "SELECT lo.id, l.lead_number, lo.status AS lo_status,\n" +
                      "       lo.activity_stage AS lo_activity, l.status AS lead_status,\n" +
                      "       l.activity_stage AS lead_activity, lo.notes\n" +
                      "FROM lead_opportunities lo\n" +
                      "JOIN leads l ON lo.lead_id = l.id\n" +
                      "WHERE l.deleted_at IS NULL\n" +
                      "  AND (lo.status != l.status OR lo.activity_stage != l.activity_stage);",
                font: "Courier New", size: 18, color: "1A1A2E",
              }),
            ],
          }),
          spacer(),

          h3("Query 3 — Meta Ads Direct status breakdown"),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG },
            children: [
              new TextRun({
                text: "SELECT status, activity_stage, COUNT(*) as count\n" +
                      "FROM leads\n" +
                      "WHERE lead_source = 'Meta Ads - Direct' AND deleted_at IS NULL\n" +
                      "GROUP BY status, activity_stage ORDER BY count DESC;",
                font: "Courier New", size: 18, color: "1A1A2E",
              }),
            ],
          }),
          spacer(),

          h3("Query 4 — Duplicate LeadOpportunity rows (should return 0)"),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG },
            children: [
              new TextRun({
                text: "SELECT lead_id, opportunity_id, COUNT(*) as cnt\n" +
                      "FROM lead_opportunities\n" +
                      "GROUP BY lead_id, opportunity_id HAVING COUNT(*) > 1;",
                font: "Courier New", size: 18, color: "1A1A2E",
              }),
            ],
          }),
          spacer(),

          h3("Query 5 — Leads with stage reverted to New"),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG },
            children: [
              new TextRun({
                text: "SELECT l.lead_number, l.lead_source, l.status,\n" +
                      "       h.to_stage, h.changed_at, u.name, u.role\n" +
                      "FROM leads l\n" +
                      "JOIN lead_stage_history h ON h.lead_id = l.id\n" +
                      "JOIN users u ON h.changed_by_id = u.id\n" +
                      "WHERE l.deleted_at IS NULL AND l.status = 'New'\n" +
                      "  AND EXISTS (\n" +
                      "    SELECT 1 FROM lead_stage_history h2\n" +
                      "    WHERE h2.lead_id = l.id AND h2.to_stage != 'New'\n" +
                      "  )\n" +
                      "ORDER BY l.lead_number, h.changed_at DESC;",
                font: "Courier New", size: 18, color: "1A1A2E",
              }),
            ],
          }),
          spacer(),

          h3("Query 6 — LeadOpportunity source distribution"),
          new Paragraph({
            spacing: { before: 80, after: 80 },
            shading: { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG },
            children: [
              new TextRun({
                text: "SELECT COALESCE(notes, 'manual') AS source, COUNT(*) AS count\n" +
                      "FROM lead_opportunities GROUP BY notes ORDER BY count DESC;",
                font: "Courier New", size: 18, color: "1A1A2E",
              }),
            ],
          }),
          spacer(),

          // ── SECTION 9: CONFIDENCE LEVELS ──────────────────────────────────
          h1("9. Confidence Levels"),
          simpleTable(
            ["Finding", "Confidence", "Basis"],
            [
              ["274/274 repair records applied", "HIGH", "Direct count query returns 0"],
              ["DS-LEAD-000811 shows Prospect/NoResponse", "HIGH", "Direct spot-check + stage history"],
              ["Zero duplicate LeadOpportunity rows", "HIGH", "Unique constraint + pair-count query"],
              ["18 New/New leads have no user action", "HIGH", "Checked history, activities, notes, tasks — all empty"],
              ["6 stage-reverted leads not from Meta fix", "HIGH", "All Instagram source, all predating webhook; explicit user reversion in history"],
              ["DS-LEAD-000862 borderline issue is intentional", "MEDIUM", "Valid behaviour pattern, but needs team confirmation"],
              ["backfill-opp-000007 never executed", "HIGH", "Zero records with that notes marker"],
              ["75 duplicate phones handled correctly", "HIGH", "Zero duplicate LO rows confirmed"],
              ["3 MetaLead null opportunity_id are low severity", "MEDIUM", "LO links exist; only MetaLead.opportunity_id column is empty"],
            ],
            [40, 15, 45]
          ),
          spacer(),
          spacer(),

          // ── FOOTER ────────────────────────────────────────────────────────
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
            shading: { type: ShadingType.SOLID, color: BRAND_DARK, fill: BRAND_DARK },
            children: [
              new TextRun({ text: `  DealStackHQ CRM  ·  QA Review  ·  ${today}  ·  Read-Only Analysis  `, size: 18, color: WHITE, font: "Calibri" }),
            ],
          }),
        ],
      },
    ],
  });
}

async function main() {
  console.log("Building Word document...");
  const doc = await buildDoc();
  const buffer = await Packer.toBuffer(doc);
  const outputPath = join(process.cwd(), "QA-Review-Meta-Leads.docx");
  writeFileSync(outputPath, buffer);
  console.log(`\nDocument saved to: ${outputPath}`);
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
