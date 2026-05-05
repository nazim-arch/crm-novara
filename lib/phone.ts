// ── Phone number normalization & URL helpers ───────────────────────────────

/**
 * Normalises a raw phone string to digits-only with country code.
 * Rules:
 *  - Strip everything that isn't a digit or leading +
 *  - If result is 10 digits → assume India → prepend 91
 *  - Otherwise use as-is (already has country code or is invalid)
 * Returns null if the number is unusable.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Remove everything except digits
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // 10-digit number → assume India
  if (digits.length === 10) return `91${digits}`;

  // Already has country code (11-13 digits)
  if (digits.length >= 11 && digits.length <= 13) return digits;

  return null; // Too short or too long → invalid
}

/** Returns true if the phone can be normalised. */
export function isValidPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null;
}

/** tel: URI for click-to-call. */
export function telUrl(phone: string | null | undefined): string | null {
  const n = normalizePhone(phone);
  return n ? `tel:+${n}` : null;
}

/** Plain wa.me link (no pre-filled message). */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}` : null;
}

/** wa.me link with a pre-filled message. */
export function whatsappMessageUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}

interface WaMessageParams {
  leadName: string;
  agentName: string;
  propertyType?: string | null;
  location?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
}

/** Builds the pre-filled WhatsApp message template. */
export function buildWaMessage({
  leadName, agentName, propertyType, location, budgetMin, budgetMax,
}: WaMessageParams): string {
  const prop = propertyType ?? "property";
  const loc  = location ?? "your preferred location";

  let budget = "";
  if (budgetMin && budgetMax) {
    budget = ` with a budget of ₹${(budgetMin / 100000).toFixed(0)}L – ₹${(budgetMax / 100000).toFixed(0)}L`;
  } else if (budgetMin) {
    budget = ` with a budget of ₹${(budgetMin / 100000).toFixed(0)}L+`;
  } else if (budgetMax) {
    budget = ` with a budget of up to ₹${(budgetMax / 100000).toFixed(0)}L`;
  }

  return `Hi ${leadName}, this is ${agentName} from Novara Advisory.

We noticed your interest in ${prop} around ${loc}${budget}.

I can help you with the best options available.

Should I share details?`;
}
