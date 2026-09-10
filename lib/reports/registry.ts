import type { FilterOp, ReportEntity } from "@/lib/reports/definition";

// The field registry is the single security boundary for the report builder:
// the compiler ONLY ever reads prismaPath / ops / enumValues from here, so a
// field/op/enum value not present in the registry can never reach Prisma.
// Pure data (no Prisma import) → safe to import from client builder UI too.

export type FieldType = "string" | "number" | "enum" | "date" | "boolean" | "relation";

export interface FieldDef {
  key: string;          // public id used in the definition + UI
  label: string;
  type: FieldType;
  prismaPath: string;   // dot path for select/where/orderBy (relation dot paths allowed for to-one)
  ops: FilterOp[];
  enumValues?: string[];
  filterable: boolean;
  groupable: boolean;
  aggregatable: boolean; // numeric fields that support sum/avg/min/max
}

export interface EntityRegistry {
  entity: ReportEntity;
  label: string;
  model: "lead" | "opportunity" | "task" | "followUp" | "activity" | "dealClosure";
  baseWhere: Record<string, unknown>;
  fields: Record<string, FieldDef>;
}

const OPS: Record<FieldType, FilterOp[]> = {
  string: ["eq", "neq", "contains", "in", "isNull", "isNotNull"],
  enum: ["eq", "neq", "in", "isNull", "isNotNull"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "isNull", "isNotNull"],
  date: ["gt", "gte", "lt", "lte", "between", "isNull", "isNotNull"],
  boolean: ["eq", "neq"],
  relation: ["eq", "neq", "contains", "in"],
};

function f(
  key: string,
  label: string,
  type: FieldType,
  prismaPath: string,
  opts: { enumValues?: string[]; groupable?: boolean } = {},
): FieldDef {
  return {
    key,
    label,
    type,
    prismaPath,
    ops: OPS[type],
    enumValues: opts.enumValues,
    filterable: true,
    groupable: opts.groupable ?? (type === "enum" || type === "relation" || type === "boolean" || type === "string"),
    aggregatable: type === "number",
  };
}

const LEAD_STATUS = ["New", "Contacted", "Prospect", "SiteVisitCompleted", "Negotiation", "Booked", "Won", "Lost", "InvalidLead", "OnHold", "Recycle"];
const TEMPERATURE = ["Hot", "Warm", "Cold", "FollowUpLater"];
const ACTIVITY_STAGE = ["New", "NoResponse", "Busy", "Unreachable", "Prospect", "CallBack", "FollowUp", "SiteVisitScheduled", "LongRNR", "NotInterested", "Junk"];
const PROPERTY_TYPE = ["Residential", "Commercial", "Plot", "Villa", "Apartment", "Office", "Land"];
const OPP_STATUS = ["Active", "Inactive", "Sold"];
const OPP_BY = ["Developer", "Seller", "Buyer"];
const TASK_STATUS = ["Todo", "InProgress", "Done", "Cancelled"];
const TASK_PRIORITY = ["Low", "Medium", "High", "Critical"];
const FU_TYPE = ["Call", "Email", "WhatsApp", "Visit", "Meeting", "Activity", "Internal"];
const FU_STATUS = ["Active", "Completed", "Cancelled", "Superseded"];
const ENTITY_TYPE = ["Lead", "Opportunity", "Task", "User", "DealClosure", "Client"];
const DC_STATUS = ["Pending", "Reconciled", "Cancelled"];

function fieldMap(defs: FieldDef[]): Record<string, FieldDef> {
  return Object.fromEntries(defs.map((d) => [d.key, d]));
}

export const REGISTRY: Record<ReportEntity, EntityRegistry> = {
  lead: {
    entity: "lead",
    label: "Leads",
    model: "lead",
    baseWhere: { deleted_at: null },
    fields: fieldMap([
      f("lead_number", "Lead ID", "string", "lead_number"),
      f("full_name", "Full Name", "string", "full_name"),
      f("phone", "Phone", "string", "phone"),
      f("email", "Email", "string", "email"),
      f("status", "Status", "enum", "status", { enumValues: LEAD_STATUS }),
      f("temperature", "Temperature", "enum", "temperature", { enumValues: TEMPERATURE }),
      f("activity_stage", "Activity Stage", "enum", "activity_stage", { enumValues: ACTIVITY_STAGE }),
      f("property_type", "Property Type", "enum", "property_type", { enumValues: PROPERTY_TYPE }),
      f("lead_source", "Lead Source", "string", "lead_source"),
      f("lead_type", "Lead Type", "string", "lead_type"),
      f("city", "City", "string", "city"),
      f("potential_lead_value", "Potential Value", "number", "potential_lead_value"),
      f("settlement_value", "Settlement Value", "number", "settlement_value"),
      f("closing_probability", "Closing %", "number", "closing_probability"),
      f("next_followup_date", "Next Follow-up", "date", "next_followup_date"),
      f("last_contact_date", "Last Contact", "date", "last_contact_date"),
      f("created_at", "Created At", "date", "created_at"),
      f("updated_at", "Updated At", "date", "updated_at"),
      f("assigned_to", "Assigned To", "relation", "assigned_to.name"),
      f("lead_owner", "Lead Owner", "relation", "lead_owner.name"),
      f("created_by", "Created By", "relation", "created_by.name"),
    ]),
  },
  opportunity: {
    entity: "opportunity",
    label: "Opportunities",
    model: "opportunity",
    baseWhere: { deleted_at: null },
    fields: fieldMap([
      f("opp_number", "Opp ID", "string", "opp_number"),
      f("name", "Name", "string", "name"),
      f("project", "Project", "string", "project"),
      f("property_type", "Property Type", "enum", "property_type", { enumValues: PROPERTY_TYPE }),
      f("location", "Location", "string", "location"),
      f("opportunity_by", "Opportunity By", "enum", "opportunity_by", { enumValues: OPP_BY }),
      f("status", "Status", "enum", "status", { enumValues: OPP_STATUS }),
      f("commission_percent", "Commission %", "number", "commission_percent"),
      f("total_sales_value", "Total Sales Value", "number", "total_sales_value"),
      f("possible_revenue", "Possible Revenue", "number", "possible_revenue"),
      f("closed_revenue", "Closed Revenue", "number", "closed_revenue"),
      f("created_at", "Created At", "date", "created_at"),
      f("updated_at", "Updated At", "date", "updated_at"),
      f("created_by", "Created By", "relation", "created_by.name"),
    ]),
  },
  task: {
    entity: "task",
    label: "Tasks",
    model: "task",
    baseWhere: { deleted_at: null },
    fields: fieldMap([
      f("task_number", "Task ID", "string", "task_number"),
      f("title", "Title", "string", "title"),
      f("status", "Status", "enum", "status", { enumValues: TASK_STATUS }),
      f("priority", "Priority", "enum", "priority", { enumValues: TASK_PRIORITY }),
      f("due_date", "Due Date", "date", "due_date"),
      f("start_date", "Start Date", "date", "start_date"),
      f("completion_date", "Completed At", "date", "completion_date"),
      f("sector", "Sector", "string", "sector"),
      f("revenue_amount", "Revenue Amount", "number", "revenue_amount"),
      f("created_at", "Created At", "date", "created_at"),
      f("assigned_to", "Assigned To", "relation", "assigned_to.name"),
      f("created_by", "Created By", "relation", "created_by.name"),
    ]),
  },
  followup: {
    entity: "followup",
    label: "Follow-ups",
    model: "followUp",
    baseWhere: {},
    fields: fieldMap([
      f("type", "Type", "enum", "type", { enumValues: FU_TYPE }),
      f("status", "Status", "enum", "status", { enumValues: FU_STATUS }),
      f("scheduled_at", "Scheduled At", "date", "scheduled_at"),
      f("completed_at", "Completed At", "date", "completed_at"),
      f("created_at", "Created At", "date", "created_at"),
      f("assigned_to", "Assigned To", "relation", "assigned_to.name"),
      f("lead_name", "Lead", "relation", "lead.full_name"),
      f("lead_number", "Lead ID", "relation", "lead.lead_number"),
    ]),
  },
  activity: {
    entity: "activity",
    label: "Activity Log",
    model: "activity",
    baseWhere: {},
    fields: fieldMap([
      f("entity_type", "Entity Type", "enum", "entity_type", { enumValues: ENTITY_TYPE }),
      f("action", "Action", "string", "action"),
      f("created_at", "Created At", "date", "created_at"),
      f("actor", "Actor", "relation", "actor.name"),
    ]),
  },
  dealclosure: {
    entity: "dealclosure",
    label: "Deal Closures",
    model: "dealClosure",
    baseWhere: {},
    fields: fieldMap([
      f("status", "Status", "enum", "status", { enumValues: DC_STATUS }),
      f("planned_settlement_value", "Planned Settlement", "number", "planned_settlement_value"),
      f("planned_commission_percent", "Planned Commission %", "number", "planned_commission_percent"),
      f("actual_settlement_value", "Actual Settlement", "number", "actual_settlement_value"),
      f("won_year", "Won Year", "number", "won_year"),
      f("won_month", "Won Month", "number", "won_month"),
      f("created_at", "Created At", "date", "created_at"),
    ]),
  },
};

export function getRegistry(entity: ReportEntity): EntityRegistry {
  return REGISTRY[entity];
}

/** Client-safe field metadata (label/type/ops/enum/capabilities) for the builder UI. */
export function entityFieldList(entity: ReportEntity) {
  return Object.values(REGISTRY[entity].fields).map((d) => ({
    key: d.key, label: d.label, type: d.type, ops: d.ops,
    enumValues: d.enumValues, filterable: d.filterable, groupable: d.groupable, aggregatable: d.aggregatable,
  }));
}
