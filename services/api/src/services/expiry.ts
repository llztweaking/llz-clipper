export function calculateExpiryDate(plan: "MONTHLY" | "QUARTERLY", from: Date = new Date()): Date {
  const days = plan === "MONTHLY" ? 30 : 90;
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
