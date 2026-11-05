import type { z } from "zod";

/**
 * Zod issues → `{ "<field path>": "<plain message>" }` for the plan editor, so
 * the form can show each problem under the field that caused it instead of a
 * bare "Invalid input". Paths are dotted (`socialEarningConfig.likes`); a
 * problem with no field (an unknown key) lands under `_form`.
 */
export function fieldErrors(issues: z.core.$ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.length ? i.path.join(".") : "_form";
    if (out[key]) continue;
    out[key] = message(i, key);
  }
  return out;
}

function message(i: z.core.$ZodIssue, key: string): string {
  switch (i.code) {
    case "too_small": {
      const n = Number(i.minimum);
      if (i.origin === "string") return n <= 1 ? "This can't be empty" : `Use at least ${n} characters`;
      if (i.origin === "array") return `Add at least ${n}`;
      return i.inclusive === false ? `Must be more than ${n}` : `Must be ${n} or more`;
    }
    case "too_big": {
      const n = Number(i.maximum);
      if (i.origin === "string") return `Use at most ${n} characters`;
      if (i.origin === "array") return `At most ${n} items`;
      return i.inclusive === false ? `Must be less than ${n}` : `Must be ${n} or less`;
    }
    case "invalid_type":
      if (i.expected === "int") return "Use a whole number";
      if (i.expected === "number") return "Enter a number";
      return `Expected ${i.expected}`;
    case "invalid_format":
      if (key === "slug") return "Use lowercase letters, numbers and dashes only, starting with a letter or number";
      if (key === "badgeColor") return "Use a colour like #22c55e";
      return "This format isn't accepted";
    case "invalid_value":
      return "Pick one of the listed options";
    case "unrecognized_keys":
      return `Unknown field${i.keys.length === 1 ? "" : "s"}: ${i.keys.join(", ")}`;
    default:
      return i.message;
  }
}
