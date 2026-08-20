import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Allow _-prefixed names as "intentionally unused" (typescript convention).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // Money must go through usd() from @/lib/utils. Hand-rolled
      // `$${x.toFixed(2)}` has no thousands separators, so the same value
      // rendered as "$1234.57" on one screen and "$1,234.57" on another —
      // and `Decimal.toFixed` silently uses a different rounding mode.
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "TemplateLiteral:has(TemplateElement[value.raw=/\\$$/]):has(CallExpression[callee.property.name='toFixed'])",
          message:
            "Format money with usd() from @/lib/utils instead of `$${x.toFixed(2)}`.",
        },
      ],
    },
  },
]);

export default eslintConfig;
