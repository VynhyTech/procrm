/**
 * Data cleaning utilities for lead intake.
 * Normalizes email, phone, and name to enable reliable matching and dedup.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.toLowerCase().trim();
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 5) return null;
  // If starts with country code (10+ digits), keep as-is with +
  if (digits.length >= 10) {
    return "+" + digits;
  }
  return digits;
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
