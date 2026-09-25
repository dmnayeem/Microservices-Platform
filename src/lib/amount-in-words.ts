/**
 * An amount written out in words, the way a voucher prints it.
 *
 * Taka uses the South Asian grouping — thousand, lakh, crore — because that is
 * how every Bangladeshi office reads and signs a figure: ৳12,50,000 is "Twelve
 * Lakh Fifty Thousand", and printing "One Million Two Hundred Fifty Thousand"
 * on a salary sheet would be read wrong by the person signing it. Every other
 * currency uses thousand / million / billion.
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0–999 in words. */
function hundreds(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`);
  return parts.join(" ");
}

function southAsian(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  // Past 99 crore the crore count itself is written the same way ("One
  // Hundred Crore"), which is the conventional reading.
  if (crore) parts.push(`${crore >= 100 ? southAsian(crore) : hundreds(crore)} Crore`);
  if (lakh) parts.push(`${hundreds(lakh)} Lakh`);
  if (thousand) parts.push(`${hundreds(thousand)} Thousand`);
  if (rest) parts.push(hundreds(rest));
  return parts.join(" ");
}

function western(n: number): string {
  if (n === 0) return "Zero";
  const scales = ["", " Thousand", " Million", " Billion", " Trillion"];
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${hundreds(chunk)}${scales[i]}`);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" ");
}

const UNITS: Record<string, [string, string]> = {
  BDT: ["Taka", "Paisa"],
  USD: ["Dollars", "Cents"],
  INR: ["Rupees", "Paise"],
  PKR: ["Rupees", "Paisa"],
};

export function amountInWords(amount: number, currency = "BDT"): string {
  const safe = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const whole = Math.floor(safe);
  const fraction = Math.round((safe - whole) * 100);
  const [major, minor] = UNITS[currency.toUpperCase()] ?? [currency.toUpperCase(), "Cents"];
  const southAsianGrouping = ["BDT", "INR", "PKR"].includes(currency.toUpperCase());
  const words = southAsianGrouping ? southAsian(whole) : western(whole);
  const minorWords = fraction ? ` and ${hundreds(fraction)} ${minor}` : "";
  // Taka is written before the figure on Bangladeshi forms ("Taka Five Hundred
  // Only"); dollars after ("Five Hundred Dollars Only").
  return currency.toUpperCase() === "BDT"
    ? `Taka ${words}${minorWords} Only`
    : `${words} ${major}${minorWords} Only`;
}
