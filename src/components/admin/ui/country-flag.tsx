import { countryName, flagUrl } from "@/lib/country";

/** A country's flag (image, so it renders on Windows too) with an optional name. */
export function CountryFlag({
  code,
  showName = false,
  className = "",
}: {
  code: string | null | undefined;
  showName?: boolean;
  className?: string;
}) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) {
    return showName ? <span className={`text-slate-500 ${className}`}>Unknown</span> : null;
  }
  const name = countryName(code);
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={flagUrl(code, 20)}
        srcSet={`${flagUrl(code, 40)} 2x`}
        alt={code.toUpperCase()}
        width={20}
        height={15}
        loading="lazy"
        className="h-[15px] w-5 shrink-0 rounded-[2px] object-cover shadow-sm ring-1 ring-black/20"
      />
      {showName && <span className="truncate">{name}</span>}
    </span>
  );
}
