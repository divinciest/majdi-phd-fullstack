import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize run name to display (Retry N) format instead of repeated (Retry).
 * 
 * Handles both wrong and correct formats for preview:
 * - "Run Name (Retry) (Retry) (Retry)" -> "Run Name (Retry 3)"
 * - "Run Name (Retry 5)" -> "Run Name (Retry 5)" (already correct)
 * - "Run Name" -> "Run Name" (no change)
 */
export function normalizeRetryName(name: string): string {
  if (!name) return name;
  
  // Pattern 1: Count repeated (Retry) at the end
  const repeatedPattern = /^(.+?)((?:\s*\(Retry\))+)\s*$/;
  const repeatedMatch = name.match(repeatedPattern);
  if (repeatedMatch) {
    const baseName = repeatedMatch[1].trim();
    const retryCount = (repeatedMatch[2].match(/\(Retry\)/g) || []).length;
    return `${baseName} (Retry ${retryCount})`;
  }
  
  // Pattern 2: Already has (Retry N) format - return as-is
  const numberedPattern = /^(.+?)\s*\(Retry\s+(\d+)\)\s*$/;
  if (numberedPattern.test(name)) {
    return name;
  }
  
  // No retry suffix - return as-is
  return name;
}
