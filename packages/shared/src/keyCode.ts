import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSegment(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function generateKeyCode(): string {
  return `LLZ-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

export function isValidKeyCodeFormat(code: string): boolean {
  const pattern = new RegExp(`^LLZ-[${ALPHABET}]{4}-[${ALPHABET}]{4}-[${ALPHABET}]{4}$`);
  return pattern.test(code);
}
