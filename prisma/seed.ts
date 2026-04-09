import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Initialize sequence counters
  await prisma.sequenceCounter.createMany({
    data: [
      { entity: "LEAD", last_val: 0 },
      { entity: "OPP", last_val: 0 },
      { entity: "TASK", last_val: 0 },
    ],
    skipDuplicates: true,
  });

  // Create admin user
  const adminHash = await bcrypt.hash("Admin@123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@novara.in" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@novara.in",
      password_hash: adminHash,
      role: "Admin",
    },
  });

  // Create a manager
  const managerHash = await bcrypt.hash("Manager@123", 12);
  await prisma.user.upsert({
    where: { email: "manager@novara.in" },
    update: {},
    create: {
      name: "Sales Manager",
      email: "manager@novara.in",
      password_hash: managerHash,
      role: "Manager",
    },
  });

  // Create a sales user
  const salesHash = await bcrypt.hash("Sales@123", 12);
  const salesUser = await prisma.user.upsert({
    where: { email: "sales@novara.in" },
    update: {},
    create: {
      name: "Sales Executive",
      email: "sales@novara.in",
      password_hash: salesHash,
      role: "Sales",
    },
  });

  console.log("✅ Users created");

  // Create a sample opportunity
  const opp = await prisma.opportunity.upsert({
    where: { opp_number: "NOV-OPP-000001" },
    update: {},
    create: {
      opp_number: "NOV-OPP-000001",
      name: "Skyline Heights - Phase 1",
      project: "Skyline Heights",
      sector: "Residential",
      developer: "Novara Developers",
      property_type: "Apartment",
      unit_types: ["1BHK", "2BHK", "3BHK"],
      location: "Wakad, Pune",
      price_min: 6500000,
      price_max: 12000000,
      commission_type: "Percentage",
      commission_value: 2.5,
      status: "Active",
      notes: "Premium project with amenities. RERA approved.",
      created_by_id: admin.id,
    },
  });

  // Increment OPP counter
  await prisma.sequenceCounter.upsert({
    where: { entity: "OPP" },
    update: { last_val: 1 },
    create: { entity: "OPP", last_val: 1 },
  });

  console.log("✅ Sample opportunity created");

  // Create a sample lead
  const lead = await prisma.lead.upsert({
    where: { lead_number: "NOV-LEAD-000001" },
    update: {},
    create: {
      lead_number: "NOV-LEAD-000001",
      full_name: "Rahul Sharma",
      phone: "9876543210",
      email: "rahul.sharma@example.com",
      whatsapp: "9876543210",
      lead_source: "Website",
      temperature: "Hot",
      status: "Contacted",
      budget_min: 7000000,
      budget_max: 10000000,
      property_type: "Apartment",
      location_preference: "Wakad",
      purpose: "EndUse",
      timeline_to_buy: "3 months",
      next_followup_date: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
      followup_type: "Call",
      lead_owner_id: admin.id,
      assigned_to_id: salesUser.id,
      created_by_id: admin.id,
    },
  });

  await prisma.sequenceCounter.upsert({
    where: { entity: "LEAD" },
    update: { last_val: 1 },
    create: { entity: "LEAD", last_val: 1 },
  });

  // Tag opportunity to lead
  await prisma.leadOpportunity.upsert({
    where: {
      lead_id_opportunity_id: {
        lead_id: lead.id,
        opportunity_id: opp.id,
      },
    },
    update: {},
    create: {
      lead_id: lead.id,
      opportunity_id: opp.id,
      tagged_by_id: admin.id,
    },
  });

  // Create stage history
  await prisma.leadStageHistory.create({
    data: {
      lead_id: lead.id,
      from_stage: "New",
      to_stage: "Contacted",
      changed_by_id: admin.id,
      notes: "Initial contact made via phone",
    },
  });

  // Create activity
  await prisma.activity.create({
    data: {
      entity_type: "Lead",
      entity_id: lead.id,
      action: "stage_changed",
      actor_id: admin.id,
      metadata: { from: "New", to: "Contacted", notes: "Initial contact made via phone" },
    },
  });

  console.log("✅ Sample lead created");

  // Create a sample task
  await prisma.task.create({
    data: {
      task_number: "NOV-TASK-000001",
      title: "Follow up with Rahul Sharma",
      description: "Call Rahul about Skyline Heights 2BHK unit",
      priority: "High",
      status: "Todo",
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      assigned_to_id: salesUser.id,
      created_by_id: admin.id,
      lead_id: lead.id,
      opportunity_id: opp.id,
    },
  });

  await prisma.sequenceCounter.upsert({
    where: { entity: "TASK" },
    update: { last_val: 1 },
    create: { entity: "TASK", last_val: 1 },
  });

  console.log("✅ Sample task created");

  console.log("\n✨ Seed complete!");
  console.log("\n📋 Login credentials:");
  console.log("  Admin:   admin@novara.in   / Admin@123");
  console.log("  Manager: manager@novara.in / Manager@123");
  console.log("  Sales:   sales@novara.in   / Sales@123");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
