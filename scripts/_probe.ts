import { parseHex, contrast } from "./verify-light-theme";
const c = (a: string, b: string) => +contrast(parseHex(a)!, parseHex(b)!).toFixed(2);
console.log("CTA fill + ink (floor 4.5):");
console.log(`  dark  #0b0f17 on #10b981 : ${c("#0b0f17", "#10b981")}`);
console.log(`  light #ffffff on #047857 : ${c("#ffffff", "#047857")}`);
console.log("\naccent-coloured TEXT on the worst plane of each theme:");
for (const i of ["#34d399", "#10b981", "#6ee7b7"]) console.log(`  dark  ${i} on tile #1c273e : ${c(i, "#1c273e")}`);
for (const i of ["#047857", "#065f46", "#059669"]) console.log(`  light ${i} on card #ffffff : ${c(i, "#ffffff")}   on page #e2e8f0 : ${c(i, "#e2e8f0")}`);
