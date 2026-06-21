export function normalizePhoneNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("0044") && digits.length > 4) {
    return `0${digits.slice(4)}`;
  }

  if (digits.startsWith("44") && digits.length > 2) {
    return `0${digits.slice(2)}`;
  }

  return digits;
}
