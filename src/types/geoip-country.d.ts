// Minimal typing for geoip-country (ships without one) — only what src/lib/geo.ts uses.
declare module "geoip-country" {
  interface Lookup {
    country: string;
    range?: [number, number];
  }
  const geoip: { lookup(ip: string): Lookup | null };
  export default geoip;
}
