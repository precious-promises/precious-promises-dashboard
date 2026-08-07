import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose class names, letting later Tailwind utilities win over earlier ones.
 *
 * Without the merge step, `cn("p-2", "p-4")` would emit both and leave the
 * outcome to stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
