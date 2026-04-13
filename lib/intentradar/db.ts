// lib/intentradar/db.ts
// Database utilities for IntentRadar module
// Uses your existing Prisma client - just imports it

import { prisma as sharedPrisma } from '@/lib/prisma';
export const prisma = sharedPrisma;

// ─── Settings helpers ───
export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.ir_settings.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export async function setSetting(key: string, value: string, category: string = 'general', encrypted: boolean = false) {
  return prisma.ir_settings.upsert({
    where: { key },
    update: { value, category, encrypted, updatedAt: new Date() },
    create: { key, value, category, encrypted },
  });
}

export async function getSettingsByCategory(category: string) {
  return prisma.ir_settings.findMany({ where: { category } });
}

// ─── API Key helpers ───
export async function getApiKey(provider: string): Promise<string | null> {
  return getSetting(`api_key_${provider}`);
}

export async function setApiKey(provider: string, value: string) {
  return setSetting(`api_key_${provider}`, value, 'api_keys', true);
}

// ─── Campaign helpers ───
export async function createCampaign(data: {
  name: string;
  city: string;
  microMarkets: string[];
  budgetMin: number;
  budgetMax: number;
  propertyType: string;
  bhkConfig?: string;
  buyerPersonas: string[];
  urgency: string;
  sources: string[];
  keywords: string[];
}) {
  return prisma.ir_campaign.create({ data: { ...data, status: 'draft' } });
}

export async function updateCampaignStatus(id: string, status: string, extras?: Record<string, any>) {
  return prisma.ir_campaign.update({
    where: { id },
    data: { status, ...extras, updatedAt: new Date() },
  });
}

// ─── Lead helpers ───
export async function createLead(data: any) {
  return prisma.ir_lead.create({ data });
}

export async function getLeadsByCampaign(campaignId: string, tier?: string) {
  return prisma.ir_lead.findMany({
    where: { campaignId, ...(tier ? { tier } : {}) },
    orderBy: { totalScore: 'desc' },
  });
}

export async function updateLeadAIInsights(leadId: string, insights: {
  aiInsightClaude?: string;
  aiInsightGPT?: string;
  aiRecommendedAction?: string;
  aiResponseDraft?: string;
  aiWhyStrong?: string;
}) {
  return prisma.ir_lead.update({
    where: { id: leadId },
    data: { ...insights, updatedAt: new Date() },
  });
}

export async function updateLeadStatus(leadId: string, status: string, notes?: string) {
  return prisma.ir_lead.update({
    where: { id: leadId },
    data: { engagementStatus: status, ...(notes ? { notes } : {}), updatedAt: new Date() },
  });
}

// ─── Signal log helpers ───
export async function logSignal(data: {
  campaignId: string;
  platform: string;
  authorHandle?: string;
  authorName?: string;
  content: string;
  sourceUrl?: string;
  rawData?: any;
}) {
  return prisma.ir_signal_log.create({ data });
}

export default prisma;
