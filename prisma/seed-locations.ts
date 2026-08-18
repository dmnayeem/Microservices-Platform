/**
 * Seed Country + Location reference data.
 *
 * Idempotent — safe to run multiple times. Uses upsert keyed on
 * `iso2` (Country) and `(countryId, parentId, name, type)` (Location).
 *
 * Run:  npx tsx prisma/seed-locations.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { BD_UPAZILAS } from "./bd-upazilas";

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
});

// ───────────────────────────────────────────────────────────────────────────
// 195 countries (ISO 3166-1). enabledLevels populated only for known
// well-structured countries; others left empty so the UI falls back to text
// inputs until admin curates them.
// ───────────────────────────────────────────────────────────────────────────

interface CountrySeed {
  iso2: string;
  iso3: string;
  name: string;
  phoneCode: string;
  flag: string;
  enabledLevels?: string[];
}

const COUNTRIES: CountrySeed[] = [
  { iso2: "AF", iso3: "AFG", name: "Afghanistan", phoneCode: "+93", flag: "🇦🇫" },
  { iso2: "AL", iso3: "ALB", name: "Albania", phoneCode: "+355", flag: "🇦🇱" },
  { iso2: "DZ", iso3: "DZA", name: "Algeria", phoneCode: "+213", flag: "🇩🇿" },
  { iso2: "AD", iso3: "AND", name: "Andorra", phoneCode: "+376", flag: "🇦🇩" },
  { iso2: "AO", iso3: "AGO", name: "Angola", phoneCode: "+244", flag: "🇦🇴" },
  { iso2: "AG", iso3: "ATG", name: "Antigua and Barbuda", phoneCode: "+1-268", flag: "🇦🇬" },
  { iso2: "AR", iso3: "ARG", name: "Argentina", phoneCode: "+54", flag: "🇦🇷" },
  { iso2: "AM", iso3: "ARM", name: "Armenia", phoneCode: "+374", flag: "🇦🇲" },
  { iso2: "AU", iso3: "AUS", name: "Australia", phoneCode: "+61", flag: "🇦🇺", enabledLevels: ["STATE", "CITY"] },
  { iso2: "AT", iso3: "AUT", name: "Austria", phoneCode: "+43", flag: "🇦🇹" },
  { iso2: "AZ", iso3: "AZE", name: "Azerbaijan", phoneCode: "+994", flag: "🇦🇿" },
  { iso2: "BS", iso3: "BHS", name: "Bahamas", phoneCode: "+1-242", flag: "🇧🇸" },
  { iso2: "BH", iso3: "BHR", name: "Bahrain", phoneCode: "+973", flag: "🇧🇭" },
  { iso2: "BD", iso3: "BGD", name: "Bangladesh", phoneCode: "+880", flag: "🇧🇩", enabledLevels: ["DIVISION", "DISTRICT", "SUB_DISTRICT", "CITY"] },
  { iso2: "BB", iso3: "BRB", name: "Barbados", phoneCode: "+1-246", flag: "🇧🇧" },
  { iso2: "BY", iso3: "BLR", name: "Belarus", phoneCode: "+375", flag: "🇧🇾" },
  { iso2: "BE", iso3: "BEL", name: "Belgium", phoneCode: "+32", flag: "🇧🇪" },
  { iso2: "BZ", iso3: "BLZ", name: "Belize", phoneCode: "+501", flag: "🇧🇿" },
  { iso2: "BJ", iso3: "BEN", name: "Benin", phoneCode: "+229", flag: "🇧🇯" },
  { iso2: "BT", iso3: "BTN", name: "Bhutan", phoneCode: "+975", flag: "🇧🇹" },
  { iso2: "BO", iso3: "BOL", name: "Bolivia", phoneCode: "+591", flag: "🇧🇴" },
  { iso2: "BA", iso3: "BIH", name: "Bosnia and Herzegovina", phoneCode: "+387", flag: "🇧🇦" },
  { iso2: "BW", iso3: "BWA", name: "Botswana", phoneCode: "+267", flag: "🇧🇼" },
  { iso2: "BR", iso3: "BRA", name: "Brazil", phoneCode: "+55", flag: "🇧🇷", enabledLevels: ["STATE", "CITY"] },
  { iso2: "BN", iso3: "BRN", name: "Brunei", phoneCode: "+673", flag: "🇧🇳" },
  { iso2: "BG", iso3: "BGR", name: "Bulgaria", phoneCode: "+359", flag: "🇧🇬" },
  { iso2: "BF", iso3: "BFA", name: "Burkina Faso", phoneCode: "+226", flag: "🇧🇫" },
  { iso2: "BI", iso3: "BDI", name: "Burundi", phoneCode: "+257", flag: "🇧🇮" },
  { iso2: "CV", iso3: "CPV", name: "Cabo Verde", phoneCode: "+238", flag: "🇨🇻" },
  { iso2: "KH", iso3: "KHM", name: "Cambodia", phoneCode: "+855", flag: "🇰🇭" },
  { iso2: "CM", iso3: "CMR", name: "Cameroon", phoneCode: "+237", flag: "🇨🇲" },
  { iso2: "CA", iso3: "CAN", name: "Canada", phoneCode: "+1", flag: "🇨🇦", enabledLevels: ["STATE", "CITY"] },
  { iso2: "CF", iso3: "CAF", name: "Central African Republic", phoneCode: "+236", flag: "🇨🇫" },
  { iso2: "TD", iso3: "TCD", name: "Chad", phoneCode: "+235", flag: "🇹🇩" },
  { iso2: "CL", iso3: "CHL", name: "Chile", phoneCode: "+56", flag: "🇨🇱" },
  { iso2: "CN", iso3: "CHN", name: "China", phoneCode: "+86", flag: "🇨🇳" },
  { iso2: "CO", iso3: "COL", name: "Colombia", phoneCode: "+57", flag: "🇨🇴" },
  { iso2: "KM", iso3: "COM", name: "Comoros", phoneCode: "+269", flag: "🇰🇲" },
  { iso2: "CG", iso3: "COG", name: "Congo", phoneCode: "+242", flag: "🇨🇬" },
  { iso2: "CD", iso3: "COD", name: "Congo (DRC)", phoneCode: "+243", flag: "🇨🇩" },
  { iso2: "CR", iso3: "CRI", name: "Costa Rica", phoneCode: "+506", flag: "🇨🇷" },
  { iso2: "CI", iso3: "CIV", name: "Côte d'Ivoire", phoneCode: "+225", flag: "🇨🇮" },
  { iso2: "HR", iso3: "HRV", name: "Croatia", phoneCode: "+385", flag: "🇭🇷" },
  { iso2: "CU", iso3: "CUB", name: "Cuba", phoneCode: "+53", flag: "🇨🇺" },
  { iso2: "CY", iso3: "CYP", name: "Cyprus", phoneCode: "+357", flag: "🇨🇾" },
  { iso2: "CZ", iso3: "CZE", name: "Czech Republic", phoneCode: "+420", flag: "🇨🇿" },
  { iso2: "DK", iso3: "DNK", name: "Denmark", phoneCode: "+45", flag: "🇩🇰" },
  { iso2: "DJ", iso3: "DJI", name: "Djibouti", phoneCode: "+253", flag: "🇩🇯" },
  { iso2: "DM", iso3: "DMA", name: "Dominica", phoneCode: "+1-767", flag: "🇩🇲" },
  { iso2: "DO", iso3: "DOM", name: "Dominican Republic", phoneCode: "+1-809", flag: "🇩🇴" },
  { iso2: "EC", iso3: "ECU", name: "Ecuador", phoneCode: "+593", flag: "🇪🇨" },
  { iso2: "EG", iso3: "EGY", name: "Egypt", phoneCode: "+20", flag: "🇪🇬" },
  { iso2: "SV", iso3: "SLV", name: "El Salvador", phoneCode: "+503", flag: "🇸🇻" },
  { iso2: "GQ", iso3: "GNQ", name: "Equatorial Guinea", phoneCode: "+240", flag: "🇬🇶" },
  { iso2: "ER", iso3: "ERI", name: "Eritrea", phoneCode: "+291", flag: "🇪🇷" },
  { iso2: "EE", iso3: "EST", name: "Estonia", phoneCode: "+372", flag: "🇪🇪" },
  { iso2: "SZ", iso3: "SWZ", name: "Eswatini", phoneCode: "+268", flag: "🇸🇿" },
  { iso2: "ET", iso3: "ETH", name: "Ethiopia", phoneCode: "+251", flag: "🇪🇹" },
  { iso2: "FJ", iso3: "FJI", name: "Fiji", phoneCode: "+679", flag: "🇫🇯" },
  { iso2: "FI", iso3: "FIN", name: "Finland", phoneCode: "+358", flag: "🇫🇮" },
  { iso2: "FR", iso3: "FRA", name: "France", phoneCode: "+33", flag: "🇫🇷", enabledLevels: ["REGION", "CITY"] },
  { iso2: "GA", iso3: "GAB", name: "Gabon", phoneCode: "+241", flag: "🇬🇦" },
  { iso2: "GM", iso3: "GMB", name: "Gambia", phoneCode: "+220", flag: "🇬🇲" },
  { iso2: "GE", iso3: "GEO", name: "Georgia", phoneCode: "+995", flag: "🇬🇪" },
  { iso2: "DE", iso3: "DEU", name: "Germany", phoneCode: "+49", flag: "🇩🇪", enabledLevels: ["STATE", "CITY"] },
  { iso2: "GH", iso3: "GHA", name: "Ghana", phoneCode: "+233", flag: "🇬🇭" },
  { iso2: "GR", iso3: "GRC", name: "Greece", phoneCode: "+30", flag: "🇬🇷" },
  { iso2: "GD", iso3: "GRD", name: "Grenada", phoneCode: "+1-473", flag: "🇬🇩" },
  { iso2: "GT", iso3: "GTM", name: "Guatemala", phoneCode: "+502", flag: "🇬🇹" },
  { iso2: "GN", iso3: "GIN", name: "Guinea", phoneCode: "+224", flag: "🇬🇳" },
  { iso2: "GW", iso3: "GNB", name: "Guinea-Bissau", phoneCode: "+245", flag: "🇬🇼" },
  { iso2: "GY", iso3: "GUY", name: "Guyana", phoneCode: "+592", flag: "🇬🇾" },
  { iso2: "HT", iso3: "HTI", name: "Haiti", phoneCode: "+509", flag: "🇭🇹" },
  { iso2: "HN", iso3: "HND", name: "Honduras", phoneCode: "+504", flag: "🇭🇳" },
  { iso2: "HU", iso3: "HUN", name: "Hungary", phoneCode: "+36", flag: "🇭🇺" },
  { iso2: "IS", iso3: "ISL", name: "Iceland", phoneCode: "+354", flag: "🇮🇸" },
  { iso2: "IN", iso3: "IND", name: "India", phoneCode: "+91", flag: "🇮🇳", enabledLevels: ["STATE", "DISTRICT", "CITY"] },
  { iso2: "ID", iso3: "IDN", name: "Indonesia", phoneCode: "+62", flag: "🇮🇩" },
  { iso2: "IR", iso3: "IRN", name: "Iran", phoneCode: "+98", flag: "🇮🇷" },
  { iso2: "IQ", iso3: "IRQ", name: "Iraq", phoneCode: "+964", flag: "🇮🇶" },
  { iso2: "IE", iso3: "IRL", name: "Ireland", phoneCode: "+353", flag: "🇮🇪" },
  { iso2: "IL", iso3: "ISR", name: "Israel", phoneCode: "+972", flag: "🇮🇱" },
  { iso2: "IT", iso3: "ITA", name: "Italy", phoneCode: "+39", flag: "🇮🇹" },
  { iso2: "JM", iso3: "JAM", name: "Jamaica", phoneCode: "+1-876", flag: "🇯🇲" },
  { iso2: "JP", iso3: "JPN", name: "Japan", phoneCode: "+81", flag: "🇯🇵" },
  { iso2: "JO", iso3: "JOR", name: "Jordan", phoneCode: "+962", flag: "🇯🇴" },
  { iso2: "KZ", iso3: "KAZ", name: "Kazakhstan", phoneCode: "+7", flag: "🇰🇿" },
  { iso2: "KE", iso3: "KEN", name: "Kenya", phoneCode: "+254", flag: "🇰🇪" },
  { iso2: "KI", iso3: "KIR", name: "Kiribati", phoneCode: "+686", flag: "🇰🇮" },
  { iso2: "KP", iso3: "PRK", name: "Korea (North)", phoneCode: "+850", flag: "🇰🇵" },
  { iso2: "KR", iso3: "KOR", name: "Korea (South)", phoneCode: "+82", flag: "🇰🇷" },
  { iso2: "KW", iso3: "KWT", name: "Kuwait", phoneCode: "+965", flag: "🇰🇼" },
  { iso2: "KG", iso3: "KGZ", name: "Kyrgyzstan", phoneCode: "+996", flag: "🇰🇬" },
  { iso2: "LA", iso3: "LAO", name: "Laos", phoneCode: "+856", flag: "🇱🇦" },
  { iso2: "LV", iso3: "LVA", name: "Latvia", phoneCode: "+371", flag: "🇱🇻" },
  { iso2: "LB", iso3: "LBN", name: "Lebanon", phoneCode: "+961", flag: "🇱🇧" },
  { iso2: "LS", iso3: "LSO", name: "Lesotho", phoneCode: "+266", flag: "🇱🇸" },
  { iso2: "LR", iso3: "LBR", name: "Liberia", phoneCode: "+231", flag: "🇱🇷" },
  { iso2: "LY", iso3: "LBY", name: "Libya", phoneCode: "+218", flag: "🇱🇾" },
  { iso2: "LI", iso3: "LIE", name: "Liechtenstein", phoneCode: "+423", flag: "🇱🇮" },
  { iso2: "LT", iso3: "LTU", name: "Lithuania", phoneCode: "+370", flag: "🇱🇹" },
  { iso2: "LU", iso3: "LUX", name: "Luxembourg", phoneCode: "+352", flag: "🇱🇺" },
  { iso2: "MG", iso3: "MDG", name: "Madagascar", phoneCode: "+261", flag: "🇲🇬" },
  { iso2: "MW", iso3: "MWI", name: "Malawi", phoneCode: "+265", flag: "🇲🇼" },
  { iso2: "MY", iso3: "MYS", name: "Malaysia", phoneCode: "+60", flag: "🇲🇾", enabledLevels: ["STATE", "CITY"] },
  { iso2: "MV", iso3: "MDV", name: "Maldives", phoneCode: "+960", flag: "🇲🇻" },
  { iso2: "ML", iso3: "MLI", name: "Mali", phoneCode: "+223", flag: "🇲🇱" },
  { iso2: "MT", iso3: "MLT", name: "Malta", phoneCode: "+356", flag: "🇲🇹" },
  { iso2: "MH", iso3: "MHL", name: "Marshall Islands", phoneCode: "+692", flag: "🇲🇭" },
  { iso2: "MR", iso3: "MRT", name: "Mauritania", phoneCode: "+222", flag: "🇲🇷" },
  { iso2: "MU", iso3: "MUS", name: "Mauritius", phoneCode: "+230", flag: "🇲🇺" },
  { iso2: "MX", iso3: "MEX", name: "Mexico", phoneCode: "+52", flag: "🇲🇽", enabledLevels: ["STATE", "CITY"] },
  { iso2: "FM", iso3: "FSM", name: "Micronesia", phoneCode: "+691", flag: "🇫🇲" },
  { iso2: "MD", iso3: "MDA", name: "Moldova", phoneCode: "+373", flag: "🇲🇩" },
  { iso2: "MC", iso3: "MCO", name: "Monaco", phoneCode: "+377", flag: "🇲🇨" },
  { iso2: "MN", iso3: "MNG", name: "Mongolia", phoneCode: "+976", flag: "🇲🇳" },
  { iso2: "ME", iso3: "MNE", name: "Montenegro", phoneCode: "+382", flag: "🇲🇪" },
  { iso2: "MA", iso3: "MAR", name: "Morocco", phoneCode: "+212", flag: "🇲🇦" },
  { iso2: "MZ", iso3: "MOZ", name: "Mozambique", phoneCode: "+258", flag: "🇲🇿" },
  { iso2: "MM", iso3: "MMR", name: "Myanmar", phoneCode: "+95", flag: "🇲🇲" },
  { iso2: "NA", iso3: "NAM", name: "Namibia", phoneCode: "+264", flag: "🇳🇦" },
  { iso2: "NR", iso3: "NRU", name: "Nauru", phoneCode: "+674", flag: "🇳🇷" },
  { iso2: "NP", iso3: "NPL", name: "Nepal", phoneCode: "+977", flag: "🇳🇵" },
  { iso2: "NL", iso3: "NLD", name: "Netherlands", phoneCode: "+31", flag: "🇳🇱" },
  { iso2: "NZ", iso3: "NZL", name: "New Zealand", phoneCode: "+64", flag: "🇳🇿" },
  { iso2: "NI", iso3: "NIC", name: "Nicaragua", phoneCode: "+505", flag: "🇳🇮" },
  { iso2: "NE", iso3: "NER", name: "Niger", phoneCode: "+227", flag: "🇳🇪" },
  { iso2: "NG", iso3: "NGA", name: "Nigeria", phoneCode: "+234", flag: "🇳🇬" },
  { iso2: "MK", iso3: "MKD", name: "North Macedonia", phoneCode: "+389", flag: "🇲🇰" },
  { iso2: "NO", iso3: "NOR", name: "Norway", phoneCode: "+47", flag: "🇳🇴" },
  { iso2: "OM", iso3: "OMN", name: "Oman", phoneCode: "+968", flag: "🇴🇲" },
  { iso2: "PK", iso3: "PAK", name: "Pakistan", phoneCode: "+92", flag: "🇵🇰", enabledLevels: ["STATE", "CITY"] },
  { iso2: "PW", iso3: "PLW", name: "Palau", phoneCode: "+680", flag: "🇵🇼" },
  { iso2: "PS", iso3: "PSE", name: "Palestine", phoneCode: "+970", flag: "🇵🇸" },
  { iso2: "PA", iso3: "PAN", name: "Panama", phoneCode: "+507", flag: "🇵🇦" },
  { iso2: "PG", iso3: "PNG", name: "Papua New Guinea", phoneCode: "+675", flag: "🇵🇬" },
  { iso2: "PY", iso3: "PRY", name: "Paraguay", phoneCode: "+595", flag: "🇵🇾" },
  { iso2: "PE", iso3: "PER", name: "Peru", phoneCode: "+51", flag: "🇵🇪" },
  { iso2: "PH", iso3: "PHL", name: "Philippines", phoneCode: "+63", flag: "🇵🇭" },
  { iso2: "PL", iso3: "POL", name: "Poland", phoneCode: "+48", flag: "🇵🇱" },
  { iso2: "PT", iso3: "PRT", name: "Portugal", phoneCode: "+351", flag: "🇵🇹" },
  { iso2: "QA", iso3: "QAT", name: "Qatar", phoneCode: "+974", flag: "🇶🇦" },
  { iso2: "RO", iso3: "ROU", name: "Romania", phoneCode: "+40", flag: "🇷🇴" },
  { iso2: "RU", iso3: "RUS", name: "Russia", phoneCode: "+7", flag: "🇷🇺" },
  { iso2: "RW", iso3: "RWA", name: "Rwanda", phoneCode: "+250", flag: "🇷🇼" },
  { iso2: "KN", iso3: "KNA", name: "Saint Kitts and Nevis", phoneCode: "+1-869", flag: "🇰🇳" },
  { iso2: "LC", iso3: "LCA", name: "Saint Lucia", phoneCode: "+1-758", flag: "🇱🇨" },
  { iso2: "VC", iso3: "VCT", name: "Saint Vincent and the Grenadines", phoneCode: "+1-784", flag: "🇻🇨" },
  { iso2: "WS", iso3: "WSM", name: "Samoa", phoneCode: "+685", flag: "🇼🇸" },
  { iso2: "SM", iso3: "SMR", name: "San Marino", phoneCode: "+378", flag: "🇸🇲" },
  { iso2: "ST", iso3: "STP", name: "São Tomé and Príncipe", phoneCode: "+239", flag: "🇸🇹" },
  { iso2: "SA", iso3: "SAU", name: "Saudi Arabia", phoneCode: "+966", flag: "🇸🇦" },
  { iso2: "SN", iso3: "SEN", name: "Senegal", phoneCode: "+221", flag: "🇸🇳" },
  { iso2: "RS", iso3: "SRB", name: "Serbia", phoneCode: "+381", flag: "🇷🇸" },
  { iso2: "SC", iso3: "SYC", name: "Seychelles", phoneCode: "+248", flag: "🇸🇨" },
  { iso2: "SL", iso3: "SLE", name: "Sierra Leone", phoneCode: "+232", flag: "🇸🇱" },
  { iso2: "SG", iso3: "SGP", name: "Singapore", phoneCode: "+65", flag: "🇸🇬" },
  { iso2: "SK", iso3: "SVK", name: "Slovakia", phoneCode: "+421", flag: "🇸🇰" },
  { iso2: "SI", iso3: "SVN", name: "Slovenia", phoneCode: "+386", flag: "🇸🇮" },
  { iso2: "SB", iso3: "SLB", name: "Solomon Islands", phoneCode: "+677", flag: "🇸🇧" },
  { iso2: "SO", iso3: "SOM", name: "Somalia", phoneCode: "+252", flag: "🇸🇴" },
  { iso2: "ZA", iso3: "ZAF", name: "South Africa", phoneCode: "+27", flag: "🇿🇦" },
  { iso2: "SS", iso3: "SSD", name: "South Sudan", phoneCode: "+211", flag: "🇸🇸" },
  { iso2: "ES", iso3: "ESP", name: "Spain", phoneCode: "+34", flag: "🇪🇸" },
  { iso2: "LK", iso3: "LKA", name: "Sri Lanka", phoneCode: "+94", flag: "🇱🇰" },
  { iso2: "SD", iso3: "SDN", name: "Sudan", phoneCode: "+249", flag: "🇸🇩" },
  { iso2: "SR", iso3: "SUR", name: "Suriname", phoneCode: "+597", flag: "🇸🇷" },
  { iso2: "SE", iso3: "SWE", name: "Sweden", phoneCode: "+46", flag: "🇸🇪" },
  { iso2: "CH", iso3: "CHE", name: "Switzerland", phoneCode: "+41", flag: "🇨🇭" },
  { iso2: "SY", iso3: "SYR", name: "Syria", phoneCode: "+963", flag: "🇸🇾" },
  { iso2: "TW", iso3: "TWN", name: "Taiwan", phoneCode: "+886", flag: "🇹🇼" },
  { iso2: "TJ", iso3: "TJK", name: "Tajikistan", phoneCode: "+992", flag: "🇹🇯" },
  { iso2: "TZ", iso3: "TZA", name: "Tanzania", phoneCode: "+255", flag: "🇹🇿" },
  { iso2: "TH", iso3: "THA", name: "Thailand", phoneCode: "+66", flag: "🇹🇭" },
  { iso2: "TL", iso3: "TLS", name: "Timor-Leste", phoneCode: "+670", flag: "🇹🇱" },
  { iso2: "TG", iso3: "TGO", name: "Togo", phoneCode: "+228", flag: "🇹🇬" },
  { iso2: "TO", iso3: "TON", name: "Tonga", phoneCode: "+676", flag: "🇹🇴" },
  { iso2: "TT", iso3: "TTO", name: "Trinidad and Tobago", phoneCode: "+1-868", flag: "🇹🇹" },
  { iso2: "TN", iso3: "TUN", name: "Tunisia", phoneCode: "+216", flag: "🇹🇳" },
  { iso2: "TR", iso3: "TUR", name: "Turkey", phoneCode: "+90", flag: "🇹🇷" },
  { iso2: "TM", iso3: "TKM", name: "Turkmenistan", phoneCode: "+993", flag: "🇹🇲" },
  { iso2: "TV", iso3: "TUV", name: "Tuvalu", phoneCode: "+688", flag: "🇹🇻" },
  { iso2: "UG", iso3: "UGA", name: "Uganda", phoneCode: "+256", flag: "🇺🇬" },
  { iso2: "UA", iso3: "UKR", name: "Ukraine", phoneCode: "+380", flag: "🇺🇦" },
  { iso2: "AE", iso3: "ARE", name: "United Arab Emirates", phoneCode: "+971", flag: "🇦🇪" },
  { iso2: "GB", iso3: "GBR", name: "United Kingdom", phoneCode: "+44", flag: "🇬🇧", enabledLevels: ["REGION", "CITY"] },
  { iso2: "US", iso3: "USA", name: "United States", phoneCode: "+1", flag: "🇺🇸", enabledLevels: ["STATE", "CITY"] },
  { iso2: "UY", iso3: "URY", name: "Uruguay", phoneCode: "+598", flag: "🇺🇾" },
  { iso2: "UZ", iso3: "UZB", name: "Uzbekistan", phoneCode: "+998", flag: "🇺🇿" },
  { iso2: "VU", iso3: "VUT", name: "Vanuatu", phoneCode: "+678", flag: "🇻🇺" },
  { iso2: "VA", iso3: "VAT", name: "Vatican City", phoneCode: "+379", flag: "🇻🇦" },
  { iso2: "VE", iso3: "VEN", name: "Venezuela", phoneCode: "+58", flag: "🇻🇪" },
  { iso2: "VN", iso3: "VNM", name: "Vietnam", phoneCode: "+84", flag: "🇻🇳" },
  { iso2: "YE", iso3: "YEM", name: "Yemen", phoneCode: "+967", flag: "🇾🇪" },
  { iso2: "ZM", iso3: "ZMB", name: "Zambia", phoneCode: "+260", flag: "🇿🇲" },
  { iso2: "ZW", iso3: "ZWE", name: "Zimbabwe", phoneCode: "+263", flag: "🇿🇼" },
];

// ───────────────────────────────────────────────────────────────────────────
// Bangladesh administrative hierarchy
// 8 Divisions → 64 Districts → notable Sub-Districts (Upazilas) and Cities
// with postal codes for major locations.
// ───────────────────────────────────────────────────────────────────────────

interface CityNode {
  name: string;
  postalCode?: string;
}
interface SubDistrictNode {
  name: string;
  postalCode?: string;
  cities?: CityNode[];
}
interface DistrictNode {
  name: string;
  postalCode?: string;
  subDistricts?: SubDistrictNode[];
  cities?: CityNode[];
}
interface DivisionNode {
  name: string;
  districts: DistrictNode[];
}

const BD_HIERARCHY: DivisionNode[] = [
  {
    name: "Dhaka",
    districts: [
      { name: "Dhaka", postalCode: "1000", subDistricts: [
        { name: "Dhanmondi", postalCode: "1209" },
        { name: "Gulshan", postalCode: "1212" },
        { name: "Mirpur", postalCode: "1216" },
        { name: "Mohammadpur", postalCode: "1207" },
        { name: "Motijheel", postalCode: "1000" },
        { name: "Ramna", postalCode: "1000" },
        { name: "Tejgaon", postalCode: "1215" },
        { name: "Uttara", postalCode: "1230" },
        { name: "Badda", postalCode: "1212" },
        { name: "Khilgaon", postalCode: "1219" },
      ]},
      { name: "Faridpur", postalCode: "7800" },
      { name: "Gazipur", postalCode: "1700", subDistricts: [
        { name: "Tongi", postalCode: "1710" },
        { name: "Kaliakair", postalCode: "1750" },
      ]},
      { name: "Gopalganj", postalCode: "8100" },
      { name: "Kishoreganj", postalCode: "2300" },
      { name: "Madaripur", postalCode: "7900" },
      { name: "Manikganj", postalCode: "1800" },
      { name: "Munshiganj", postalCode: "1500" },
      { name: "Narayanganj", postalCode: "1400", subDistricts: [
        { name: "Narayanganj Sadar", postalCode: "1400" },
        { name: "Sonargaon", postalCode: "1440" },
        { name: "Rupganj", postalCode: "1462" },
      ]},
      { name: "Narsingdi", postalCode: "1600" },
      { name: "Rajbari", postalCode: "7700" },
      { name: "Shariatpur", postalCode: "8000" },
      { name: "Tangail", postalCode: "1900" },
    ],
  },
  {
    name: "Chittagong",
    districts: [
      { name: "Bandarban", postalCode: "4600" },
      { name: "Brahmanbaria", postalCode: "3400" },
      { name: "Chandpur", postalCode: "3600" },
      { name: "Chittagong", postalCode: "4000", subDistricts: [
        { name: "Pahartali", postalCode: "4202" },
        { name: "Halishahar", postalCode: "4216" },
        { name: "Patenga", postalCode: "4204" },
        { name: "Anwara", postalCode: "4376" },
        { name: "Sitakunda", postalCode: "4310" },
      ]},
      { name: "Comilla", postalCode: "3500" },
      { name: "Cox's Bazar", postalCode: "4700" },
      { name: "Feni", postalCode: "3900" },
      { name: "Khagrachhari", postalCode: "4400" },
      { name: "Lakshmipur", postalCode: "3700" },
      { name: "Noakhali", postalCode: "3800" },
      { name: "Rangamati", postalCode: "4500" },
    ],
  },
  {
    name: "Rajshahi",
    districts: [
      { name: "Bogra", postalCode: "5800" },
      { name: "Joypurhat", postalCode: "5900" },
      { name: "Naogaon", postalCode: "6500" },
      { name: "Natore", postalCode: "6400" },
      { name: "Chapai Nawabganj", postalCode: "6300" },
      { name: "Pabna", postalCode: "6600" },
      { name: "Rajshahi", postalCode: "6000", subDistricts: [
        { name: "Boalia", postalCode: "6000" },
        { name: "Motihar", postalCode: "6204" },
        { name: "Paba", postalCode: "6210" },
      ]},
      { name: "Sirajganj", postalCode: "6700" },
    ],
  },
  {
    name: "Khulna",
    districts: [
      { name: "Bagerhat", postalCode: "9300" },
      { name: "Chuadanga", postalCode: "7200" },
      { name: "Jessore", postalCode: "7400" },
      { name: "Jhenaidah", postalCode: "7300" },
      { name: "Khulna", postalCode: "9000", subDistricts: [
        { name: "Khulna Sadar", postalCode: "9100" },
        { name: "Sonadanga", postalCode: "9000" },
        { name: "Daulatpur", postalCode: "9202" },
      ]},
      { name: "Kushtia", postalCode: "7000" },
      { name: "Magura", postalCode: "7600" },
      { name: "Meherpur", postalCode: "7100" },
      { name: "Narail", postalCode: "7500" },
      { name: "Satkhira", postalCode: "9400" },
    ],
  },
  {
    name: "Barishal",
    districts: [
      { name: "Barguna", postalCode: "8700" },
      { name: "Barishal", postalCode: "8200" },
      { name: "Bhola", postalCode: "8300" },
      { name: "Jhalokati", postalCode: "8400" },
      { name: "Patuakhali", postalCode: "8600" },
      { name: "Pirojpur", postalCode: "8500" },
    ],
  },
  {
    name: "Sylhet",
    districts: [
      { name: "Habiganj", postalCode: "3300" },
      { name: "Moulvibazar", postalCode: "3200" },
      { name: "Sunamganj", postalCode: "3000" },
      { name: "Sylhet", postalCode: "3100", subDistricts: [
        { name: "Sylhet Sadar", postalCode: "3100" },
        { name: "Beanibazar", postalCode: "3170" },
        { name: "Bishwanath", postalCode: "3130" },
      ]},
    ],
  },
  {
    name: "Rangpur",
    districts: [
      { name: "Dinajpur", postalCode: "5200" },
      { name: "Gaibandha", postalCode: "5700" },
      { name: "Kurigram", postalCode: "5600" },
      { name: "Lalmonirhat", postalCode: "5500" },
      { name: "Nilphamari", postalCode: "5300" },
      { name: "Panchagarh", postalCode: "5000" },
      { name: "Rangpur", postalCode: "5400" },
      { name: "Thakurgaon", postalCode: "5100" },
    ],
  },
  {
    name: "Mymensingh",
    districts: [
      { name: "Jamalpur", postalCode: "2000" },
      { name: "Mymensingh", postalCode: "2200", subDistricts: [
        { name: "Mymensingh Sadar", postalCode: "2200" },
        { name: "Trishal", postalCode: "2220" },
        { name: "Muktagachha", postalCode: "2210" },
      ]},
      { name: "Netrokona", postalCode: "2400" },
      { name: "Sherpur", postalCode: "2100" },
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Seed runner
// ───────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding countries…");

  // 1. Upsert all 195 countries
  for (const c of COUNTRIES) {
    await prisma.country.upsert({
      where: { iso2: c.iso2 },
      create: {
        iso2: c.iso2,
        iso3: c.iso3,
        name: c.name,
        phoneCode: c.phoneCode,
        flag: c.flag,
        enabledLevels: c.enabledLevels ?? [],
      },
      update: {
        iso3: c.iso3,
        name: c.name,
        phoneCode: c.phoneCode,
        flag: c.flag,
        enabledLevels: c.enabledLevels ?? [],
      },
    });
  }
  console.log(`  ✓ ${COUNTRIES.length} countries upserted`);

  // 2. Seed Bangladesh hierarchy
  console.log("Seeding Bangladesh hierarchy…");
  const bd = await prisma.country.findUnique({ where: { iso2: "BD" } });
  if (!bd) throw new Error("Bangladesh country row missing — seed step 1 failed");

  let divisionCount = 0;
  let districtCount = 0;
  let subDistrictCount = 0;
  let cityCount = 0;

  for (const div of BD_HIERARCHY) {
    const division = await upsertLocation(bd.id, null, div.name, "DIVISION");
    divisionCount++;

    for (const dist of div.districts) {
      const district = await upsertLocation(
        bd.id,
        division.id,
        dist.name,
        "DISTRICT",
        dist.postalCode
      );
      districtCount++;

      // Merge the complete upazila list (BD_UPAZILAS) with any inline
      // sub-districts (which may carry postal codes), deduped by name.
      const inline = dist.subDistricts ?? [];
      const inlineByName = new Map(inline.map((s) => [s.name, s]));
      const allSubs: SubDistrictNode[] = [...inline];
      for (const name of BD_UPAZILAS[dist.name] ?? []) {
        if (!inlineByName.has(name)) allSubs.push({ name });
      }

      for (const sd of allSubs) {
        const subDistrict = await upsertLocation(
          bd.id,
          district.id,
          sd.name,
          "SUB_DISTRICT",
          sd.postalCode
        );
        subDistrictCount++;

        for (const city of sd.cities ?? []) {
          await upsertLocation(
            bd.id,
            subDistrict.id,
            city.name,
            "CITY",
            city.postalCode
          );
          cityCount++;
        }
      }

      for (const city of dist.cities ?? []) {
        await upsertLocation(
          bd.id,
          district.id,
          city.name,
          "CITY",
          city.postalCode
        );
        cityCount++;
      }
    }
  }

  console.log(
    `  ✓ ${divisionCount} divisions, ${districtCount} districts, ${subDistrictCount} sub-districts, ${cityCount} cities`
  );

  console.log("\nDone. ✅");
}

async function upsertLocation(
  countryId: string,
  parentId: string | null,
  name: string,
  type: string,
  postalCode?: string
) {
  // Prisma's compound unique key needs both parentId values to be the same
  // in find/update (it has a special handling for null in unique keys).
  const existing = await prisma.location.findFirst({
    where: { countryId, parentId, name, type },
  });
  if (existing) {
    if (postalCode && existing.postalCode !== postalCode) {
      return prisma.location.update({
        where: { id: existing.id },
        data: { postalCode },
      });
    }
    return existing;
  }
  return prisma.location.create({
    data: {
      countryId,
      parentId,
      name,
      type,
      postalCode: postalCode ?? null,
    },
  });
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
