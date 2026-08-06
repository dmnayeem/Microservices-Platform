"use client";

// Reusable country multi-select (chips). Empty selection = all countries.
// Country codes are ISO-2 and match `user.country`. Shared by the offerwall
// offer builder (and available to lift TaskForm's PROXY-only picker onto later).

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "BD", name: "Bangladesh" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "NG", name: "Nigeria" },
  { code: "EG", name: "Egypt" },
  { code: "ZA", name: "South Africa" },
];

export function CountryPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {value.length === 0 ? "All countries (no restriction)" : `${value.length} selected`}
        </span>
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs text-emerald-400 hover:text-emerald-300">
            Clear (all countries)
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COUNTRIES.map((c) => {
          const on = value.includes(c.code);
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => toggle(c.code)}
              title={c.name}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {c.code}
            </button>
          );
        })}
      </div>
    </div>
  );
}
