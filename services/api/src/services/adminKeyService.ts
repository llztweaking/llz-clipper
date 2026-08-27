import { prisma } from "@llz-clipper/database";
import { generateKeyCode } from "@llz-clipper/shared";

type Plan = "MONTHLY" | "QUARTERLY";

async function generateUniqueKeyCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateKeyCode();
    const existing = await prisma.licenseKey.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Não foi possível gerar um código de key único após várias tentativas");
}

export async function createKey(plan: Plan) {
  const code = await generateUniqueKeyCode();
  return prisma.licenseKey.create({ data: { code, plan } });
}

export async function createKeysBulk(plan: Plan, count: number) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push(await createKey(plan));
  }
  return keys;
}

interface ListKeysFilters {
  search?: string;
  status?: string;
  plan?: string;
  page: number;
  pageSize: number;
}

export async function listKeys(filters: ListKeysFilters) {
  const where: Record<string, unknown> = {};
  if (filters.status) where.status = filters.status;
  if (filters.plan) where.plan = filters.plan;
  if (filters.search) where.code = { contains: filters.search, mode: "insensitive" };

  const [items, total] = await Promise.all([
    prisma.licenseKey.findMany({
      where,
      include: { user: true },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.licenseKey.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

export async function revokeKey(id: string) {
  return prisma.licenseKey.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } });
}
