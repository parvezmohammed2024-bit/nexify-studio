import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const usd = (micros: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    micros / 1_000_000,
  );
export const myr = (micros: number, rate: number) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(
    (micros / 1_000_000) * rate,
  );
