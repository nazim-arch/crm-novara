import { prisma } from "@/lib/prisma";

type Entity = "LEAD" | "OPP" | "TASK";

const PREFIX: Record<Entity, string> = {
  LEAD: "NOV-LEAD",
  OPP: "NOV-OPP",
  TASK: "NOV-TASK",
};

export async function generateId(entity: Entity): Promise<string> {
  const result = await prisma.$queryRaw<[{ last_val: bigint }]>`
    INSERT INTO sequence_counters (entity, last_val)
    VALUES (${entity}, 1)
    ON CONFLICT (entity) DO UPDATE
      SET last_val = sequence_counters.last_val + 1
    RETURNING last_val
  `;
  const val = Number(result[0].last_val);
  return `${PREFIX[entity]}-${String(val).padStart(6, "0")}`;
}
