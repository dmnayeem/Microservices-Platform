/**
 * Fill User.signupCountry / lastCountry (and UserDevice.country) from the IPs
 * already on record, with the offline lookup in src/lib/geo.ts. Only fills
 * empty fields — never overwrites. Safe to run again.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/backfill-ip-countries.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { countryOfIp } from "../src/lib/geo";

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ signupCountry: null, signupIp: { not: null } }, { lastCountry: null, lastIp: { not: null } }] },
    select: { id: true, signupIp: true, lastIp: true, signupCountry: true, lastCountry: true },
  });
  let filled = 0;
  for (const u of users) {
    const data: { signupCountry?: string; lastCountry?: string } = {};
    const sc = !u.signupCountry ? countryOfIp(u.signupIp) : null;
    const lc = !u.lastCountry ? countryOfIp(u.lastIp) ?? countryOfIp(u.signupIp) : null;
    if (sc) data.signupCountry = sc;
    if (lc) data.lastCountry = lc;
    if (Object.keys(data).length) {
      await prisma.user.update({ where: { id: u.id }, data });
      filled++;
    }
  }
  const devices = await prisma.userDevice.findMany({ where: { country: null, lastIp: { not: null } }, select: { id: true, lastIp: true } });
  let dev = 0;
  for (const d of devices) {
    const c = countryOfIp(d.lastIp);
    if (c) {
      await prisma.userDevice.update({ where: { id: d.id }, data: { country: c } });
      dev++;
    }
  }
  const byCountry = await prisma.user.groupBy({ by: ["lastCountry"], where: { role: "USER" }, _count: true, orderBy: { _count: { lastCountry: "desc" } } });
  console.log(`users filled: ${filled} of ${users.length} candidates; devices filled: ${dev}`);
  console.log("users by country:", JSON.stringify((byCountry as unknown as Array<{ lastCountry: string | null; _count: number }>).map((r) => [r.lastCountry ?? "unknown", r._count])));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
