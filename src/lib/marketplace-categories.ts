/**
 * Marketplace asset taxonomy + per-category field schemas.
 *
 * Mirrors the pattern of `src/lib/custom-tasks.ts`: a single JSON `details`
 * blob on `MarketplaceListing` is driven by a typed config object so we don't
 * need a column per metric (50+ would be silly). The admin form reads
 * `getCategoryConfig(assetType, subType)` to know which fields to render;
 * the API uses `validateDetails(...)` to validate before persisting.
 */

export type AssetType =
  | "DOMAIN"
  | "WEBSITE"
  | "SOCIAL_ACCOUNT"
  | "POD_ACCOUNT"
  | "PLAYSTORE_ACCOUNT"
  | "APPLE_DEV_ACCOUNT"
  | "MOBILE_APP"
  | "MOBILE_GAME"
  | "SAAS_PRODUCT"
  | "PLATFORM"
  | "STOCK_PHOTO"
  | "STOCK_VIDEO"
  | "MUSIC"
  | "EBOOK"
  | "DIGITAL_PRODUCT"
  | "SERVICE"
  | "OTHER";

/**
 * The deliverable a listing hands over. For stock-media types this is the
 * actual sellable file, which the server analyses (EXIF/codec/hash/pHash) so an
 * admin can judge original vs downloaded/edited. `null` = no single file
 * deliverable (accounts, domains, websites, services…).
 */
export type DeliverableKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "file"
  | null;

export type FieldType =
  | "TEXT"
  | "MULTILINE"
  | "NUMBER"
  | "MONEY"
  | "PERCENT"
  | "DATE"
  | "URL"
  | "SELECT"
  | "BOOLEAN"
  | "SCREENSHOT" // single image (proof)
  | "SCREENSHOT_GROUP"; // multiple images

export interface CategoryField {
  /** Key in the `details` JSON. Stable; rename label freely. */
  key: string;
  type: FieldType;
  label: string;
  hint?: string;
  required?: boolean;
  options?: string[]; // for SELECT
  min?: number;
  max?: number;
  maxLength?: number;
  /** Optional group label that the form groups consecutive fields by. */
  group?: string;
}

export interface CategoryConfig {
  /** Asset type slug. */
  assetType: AssetType;
  /** Human label for the asset type. */
  label: string;
  /** Short admin-facing description. */
  description: string;
  /** Lucide icon name (resolved in components). */
  iconKey: string;
  /** Optional sub-types and their incremental field lists. */
  subTypes?: Array<{
    slug: string;
    label: string;
    description?: string;
    iconKey?: string;
    fields?: CategoryField[];
  }>;
  /** Fields specific to this asset type (added on top of COMMON_FIELDS). */
  fields: CategoryField[];
  /** Sellable deliverable file kind — drives the seller uploader + which
   *  metadata parser runs on submit. Omit/null for non-file assets. */
  deliverableKind?: DeliverableKind;
  /** When true, COMMON_FIELDS (financials/handover) are skipped — stock media
   *  and simple digital goods don't have monthly revenue etc. */
  skipCommonFields?: boolean;
}

// ─── Fields every monetizable asset gets ────────────────────────────────────

export const COMMON_FIELDS: CategoryField[] = [
  {
    key: "assetAgeMonths",
    type: "NUMBER",
    label: "Age (months)",
    hint: "How old is this asset?",
    group: "Basics",
    min: 0,
    max: 600,
  },
  {
    key: "niche",
    type: "TEXT",
    label: "Niche / industry",
    hint: "e.g. Personal finance, Pet care, B2B SaaS",
    group: "Basics",
    maxLength: 80,
  },
  {
    key: "monthlyRevenue",
    type: "MONEY",
    label: "Monthly revenue (USD)",
    group: "Financials",
    min: 0,
  },
  {
    key: "monthlyProfit",
    type: "MONEY",
    label: "Monthly profit (USD)",
    group: "Financials",
    min: 0,
  },
  {
    key: "monthlyExpenses",
    type: "MONEY",
    label: "Monthly expenses (USD)",
    group: "Financials",
    min: 0,
  },
  {
    key: "transferType",
    type: "SELECT",
    label: "Transfer method",
    hint: "How will the asset be handed over?",
    group: "Handover",
    options: [
      "Direct ownership transfer",
      "Account credentials swap",
      "Migration assisted by seller",
      "Buyer migrates with documentation",
      "Other",
    ],
  },
];

// ─── Per-asset-type configs ─────────────────────────────────────────────────

export const CATEGORIES: CategoryConfig[] = [
  {
    assetType: "DOMAIN",
    label: "Domain name",
    description: "Premium domain names (with or without traffic)",
    iconKey: "Globe",
    fields: [
      { key: "domainName", type: "TEXT", label: "Domain name", required: true, group: "Domain" },
      { key: "tld", type: "TEXT", label: "TLD", hint: ".com / .io / .ai etc.", group: "Domain" },
      { key: "registrar", type: "TEXT", label: "Registrar", hint: "GoDaddy, Namecheap, Cloudflare…", group: "Domain" },
      { key: "expiryDate", type: "DATE", label: "Current expiry date", group: "Domain" },
      { key: "domainAuthority", type: "NUMBER", label: "Domain Authority (DA)", min: 0, max: 100, group: "SEO metrics" },
      { key: "domainRating", type: "NUMBER", label: "Domain Rating (Ahrefs DR)", min: 0, max: 100, group: "SEO metrics" },
      { key: "urlRating", type: "NUMBER", label: "URL Rating (Ahrefs UR)", min: 0, max: 100, group: "SEO metrics" },
      { key: "backlinkCount", type: "NUMBER", label: "Referring backlinks", min: 0, group: "SEO metrics" },
      { key: "trafficValue", type: "MONEY", label: "Estimated traffic value (USD/mo)", group: "SEO metrics" },
      { key: "brandabilityScore", type: "NUMBER", label: "Brandability score (1–10)", min: 1, max: 10, group: "Other" },
      { key: "comparableSalesUrl", type: "URL", label: "Comparable sales reference URL", group: "Other" },
    ],
  },
  {
    assetType: "WEBSITE",
    label: "Website",
    description: "Live websites — blogs, ecommerce, affiliate sites, SaaS",
    iconKey: "LayoutDashboard",
    subTypes: [
      {
        slug: "BLOG_ADSENSE",
        label: "Blog (Google AdSense)",
        iconKey: "Newspaper",
        fields: [
          { key: "adsenseRpm", type: "MONEY", label: "AdSense RPM (USD)", min: 0, group: "Monetization" },
          { key: "monthlyAdRevenue", type: "MONEY", label: "Monthly ad revenue (USD)", min: 0, group: "Monetization" },
          { key: "adsenseScreenshot", type: "SCREENSHOT", label: "AdSense payout screenshot", required: true, group: "Proof" },
        ],
      },
      {
        slug: "BLOG_OTHER_ADS",
        label: "Blog (other ad network)",
        iconKey: "Newspaper",
        fields: [
          { key: "adNetworks", type: "TEXT", label: "Ad networks", hint: "Mediavine, Ezoic, Raptive…", group: "Monetization" },
          { key: "monthlyAdRevenue", type: "MONEY", label: "Monthly ad revenue (USD)", min: 0, group: "Monetization" },
          { key: "adNetworkScreenshot", type: "SCREENSHOT", label: "Ad-network payout screenshot", required: true, group: "Proof" },
        ],
      },
      {
        slug: "AMAZON_AFFILIATE",
        label: "Amazon affiliate site",
        iconKey: "ShoppingCart",
        fields: [
          { key: "conversionRate", type: "PERCENT", label: "Avg conversion rate (%)", min: 0, max: 100, group: "Affiliate" },
          { key: "commissionRate", type: "PERCENT", label: "Commission rate (%)", min: 0, max: 100, group: "Affiliate" },
          { key: "monthlyAffiliateRevenue", type: "MONEY", label: "Monthly affiliate revenue (USD)", min: 0, group: "Affiliate" },
          { key: "amazonAssociatesScreenshot", type: "SCREENSHOT", label: "Amazon Associates earnings screenshot", required: true, group: "Proof" },
        ],
      },
      {
        slug: "OTHER_AFFILIATE",
        label: "Other affiliate site",
        iconKey: "Link",
        fields: [
          { key: "affiliateNetworks", type: "TEXT", label: "Affiliate networks", hint: "Impact, ShareASale, CJ…", group: "Affiliate" },
          { key: "topPrograms", type: "TEXT", label: "Top programs", group: "Affiliate" },
          { key: "monthlyAffiliateRevenue", type: "MONEY", label: "Monthly affiliate revenue (USD)", min: 0, group: "Affiliate" },
        ],
      },
      {
        slug: "AMAZON_FBA",
        label: "Amazon FBA store",
        iconKey: "Package",
        fields: [
          { key: "skuCount", type: "NUMBER", label: "Active SKU count", min: 0, group: "Inventory" },
          { key: "sellThroughRate", type: "PERCENT", label: "Sell-through rate (%)", min: 0, max: 100, group: "Inventory" },
          { key: "inventoryValue", type: "MONEY", label: "Current inventory value (USD)", min: 0, group: "Inventory" },
          { key: "supplierDetails", type: "MULTILINE", label: "Supplier details", group: "Inventory", maxLength: 500 },
          { key: "sellerCentralScreenshot", type: "SCREENSHOT", label: "Seller Central revenue screenshot", required: true, group: "Proof" },
        ],
      },
      {
        slug: "DROPSHIPPING",
        label: "Dropshipping store",
        iconKey: "Truck",
        fields: [
          { key: "suppliers", type: "TEXT", label: "Suppliers / sourcing", group: "Operations" },
          { key: "monthlyOrders", type: "NUMBER", label: "Monthly orders", min: 0, group: "Operations" },
          { key: "refundRate", type: "PERCENT", label: "Refund rate (%)", min: 0, max: 100, group: "Operations" },
          { key: "storeDashboardScreenshot", type: "SCREENSHOT", label: "Store dashboard screenshot", required: true, group: "Proof" },
        ],
      },
      {
        slug: "POD_STORE",
        label: "Print-on-demand store",
        iconKey: "Shirt",
        fields: [
          { key: "podPlatform", type: "TEXT", label: "Platform", hint: "Shopify+Printful, Etsy+Printify…", group: "POD" },
          { key: "heroProducts", type: "TEXT", label: "Hero products", group: "POD" },
          { key: "monthlyOrders", type: "NUMBER", label: "Monthly orders", min: 0, group: "POD" },
        ],
      },
      {
        slug: "SAAS",
        label: "SaaS website",
        iconKey: "Code",
        fields: [
          { key: "mrr", type: "MONEY", label: "MRR (USD)", required: true, min: 0, group: "SaaS metrics" },
          { key: "arr", type: "MONEY", label: "ARR (USD)", min: 0, group: "SaaS metrics" },
          { key: "churnPercent", type: "PERCENT", label: "Monthly churn (%)", min: 0, max: 100, group: "SaaS metrics" },
          { key: "payingCustomers", type: "NUMBER", label: "Paying customers", min: 0, group: "SaaS metrics" },
          { key: "freeUsers", type: "NUMBER", label: "Free users", min: 0, group: "SaaS metrics" },
          { key: "techStack", type: "TEXT", label: "Tech stack", hint: "Next.js, Postgres, Stripe…", group: "Tech" },
          { key: "codeHandoverPolicy", type: "MULTILINE", label: "Code-handover policy", maxLength: 500, group: "Handover" },
        ],
      },
      {
        slug: "ECOMMERCE",
        label: "Ecommerce store",
        iconKey: "ShoppingBag",
        fields: [
          { key: "platform", type: "TEXT", label: "Platform", hint: "Shopify, Woo, BigCommerce…", group: "Operations" },
          { key: "monthlyOrders", type: "NUMBER", label: "Monthly orders", min: 0, group: "Operations" },
          { key: "averageOrderValue", type: "MONEY", label: "Average order value", group: "Operations" },
        ],
      },
      {
        slug: "CONTENT",
        label: "Content site (no monetization yet)",
        iconKey: "FileText",
        fields: [],
      },
      { slug: "OTHER", label: "Other website type", iconKey: "Globe", fields: [] },
    ],
    fields: [
      { key: "primaryUrl", type: "URL", label: "Primary URL", required: true, group: "Site" },
      { key: "monetized", type: "BOOLEAN", label: "Currently monetized?", group: "Site" },
      { key: "platform", type: "TEXT", label: "Platform / CMS", hint: "WordPress, Shopify, Webflow, custom…", group: "Site" },
      { key: "monthlyVisitors", type: "NUMBER", label: "Monthly unique visitors", min: 0, group: "Traffic" },
      { key: "monthlyPageViews", type: "NUMBER", label: "Monthly page views", min: 0, group: "Traffic" },
      { key: "trafficOrganicPercent", type: "PERCENT", label: "Organic traffic share (%)", min: 0, max: 100, group: "Traffic" },
      { key: "trafficSocialPercent", type: "PERCENT", label: "Social traffic share (%)", min: 0, max: 100, group: "Traffic" },
      { key: "trafficDirectPercent", type: "PERCENT", label: "Direct traffic share (%)", min: 0, max: 100, group: "Traffic" },
      { key: "trafficReferralPercent", type: "PERCENT", label: "Referral traffic share (%)", min: 0, max: 100, group: "Traffic" },
      { key: "topTrafficSources", type: "TEXT", label: "Top 3 traffic sources", hint: "Google organic, Pinterest, …", group: "Traffic" },
      { key: "searchConsoleScreenshot", type: "SCREENSHOT", label: "Search Console screenshot", required: true, group: "Proof" },
      { key: "analyticsScreenshot", type: "SCREENSHOT", label: "Google Analytics screenshot", required: true, group: "Proof" },
      { key: "contentCount", type: "NUMBER", label: "Total content / posts", min: 0, group: "Content" },
      { key: "languages", type: "TEXT", label: "Languages", hint: "en, bn, multi…", group: "Content" },
    ],
  },
  {
    assetType: "SOCIAL_ACCOUNT",
    label: "Social media account",
    description: "Established accounts on any platform",
    iconKey: "Users",
    subTypes: [
      { slug: "INSTAGRAM", label: "Instagram", iconKey: "Instagram", fields: [] },
      { slug: "TIKTOK", label: "TikTok", iconKey: "Music2", fields: [] },
      { slug: "YOUTUBE", label: "YouTube", iconKey: "Youtube", fields: [
        { key: "monetizationEnabled", type: "BOOLEAN", label: "YouTube Partner Program?", group: "Monetization" },
        { key: "watchHours12mo", type: "NUMBER", label: "Watch hours (last 12 mo)", min: 0, group: "YouTube" },
      ] },
      { slug: "TWITTER", label: "Twitter / X", iconKey: "Twitter", fields: [] },
      { slug: "FACEBOOK", label: "Facebook page", iconKey: "Facebook", fields: [] },
      { slug: "LINKEDIN", label: "LinkedIn", iconKey: "Linkedin", fields: [] },
      { slug: "TELEGRAM", label: "Telegram", iconKey: "Send", fields: [] },
      { slug: "OTHER", label: "Other platform", iconKey: "Users", fields: [] },
    ],
    fields: [
      { key: "handle", type: "TEXT", label: "Account handle / URL", required: true, group: "Account" },
      { key: "followers", type: "NUMBER", label: "Followers", required: true, min: 0, group: "Stats" },
      { key: "following", type: "NUMBER", label: "Following", min: 0, group: "Stats" },
      { key: "engagementPercent", type: "PERCENT", label: "Avg engagement rate (%)", min: 0, max: 100, group: "Stats" },
      { key: "verifiedBadge", type: "BOOLEAN", label: "Verified badge?", group: "Account" },
      { key: "monetized", type: "BOOLEAN", label: "Currently monetized?", group: "Monetization" },
      {
        key: "revenueStreams",
        type: "TEXT",
        label: "Revenue streams (if monetized)",
        hint: "Brand deals, ad share, fan funding, affiliate…",
        group: "Monetization",
      },
      { key: "audienceTopCountry", type: "TEXT", label: "Top audience country", group: "Audience" },
      { key: "insightsScreenshot", type: "SCREENSHOT", label: "Insights dashboard screenshot", required: true, group: "Proof" },
    ],
  },
  {
    assetType: "POD_ACCOUNT",
    label: "POD seller account",
    description: "Print-on-demand platform seller account",
    iconKey: "Shirt",
    subTypes: [
      { slug: "PRINTFUL", label: "Printful", fields: [] },
      { slug: "PRINTIFY", label: "Printify", fields: [] },
      { slug: "REDBUBBLE", label: "Redbubble", fields: [] },
      { slug: "OTHER", label: "Other POD platform", fields: [] },
    ],
    fields: [
      { key: "platform", type: "TEXT", label: "Platform", group: "Account" },
      { key: "totalDesigns", type: "NUMBER", label: "Total uploaded designs", min: 0, group: "Account" },
      { key: "monthlyOrders", type: "NUMBER", label: "Monthly orders", min: 0, group: "Stats" },
      { key: "accountStanding", type: "TEXT", label: "Account standing", hint: "Good, restricted, etc.", group: "Account" },
      { key: "payoutHistoryScreenshot", type: "SCREENSHOT", label: "Payout history screenshot", required: true, group: "Proof" },
    ],
  },
  {
    assetType: "PLAYSTORE_ACCOUNT",
    label: "Google Play Console account",
    description: "Developer account with or without published apps",
    iconKey: "Smartphone",
    fields: [
      { key: "accountAgeMonths", type: "NUMBER", label: "Account age (months)", min: 0, group: "Account" },
      { key: "country", type: "TEXT", label: "Registered country", group: "Account" },
      { key: "publishedAppsCount", type: "NUMBER", label: "Published apps", min: 0, group: "Account" },
      { key: "accountStanding", type: "TEXT", label: "Account standing / violations", hint: "Clean, warning, etc.", group: "Account" },
      { key: "transferabilityProof", type: "SCREENSHOT", label: "Transferability proof", required: true, group: "Proof" },
    ],
  },
  {
    assetType: "APPLE_DEV_ACCOUNT",
    label: "Apple Developer account",
    description: "iOS developer account",
    iconKey: "Apple",
    fields: [
      { key: "accountAgeMonths", type: "NUMBER", label: "Account age (months)", min: 0, group: "Account" },
      { key: "country", type: "TEXT", label: "Registered country", group: "Account" },
      { key: "publishedAppsCount", type: "NUMBER", label: "Published apps", min: 0, group: "Account" },
      { key: "accountType", type: "SELECT", label: "Account type", options: ["Individual", "Organization"], group: "Account" },
      { key: "accountStanding", type: "TEXT", label: "Account standing / violations", group: "Account" },
      { key: "transferabilityProof", type: "SCREENSHOT", label: "Transferability proof", required: true, group: "Proof" },
    ],
  },
  {
    assetType: "MOBILE_APP",
    label: "Mobile app",
    description: "Published mobile app (utility / productivity / business)",
    iconKey: "Smartphone",
    subTypes: [
      { slug: "ANDROID", label: "Android", fields: [] },
      { slug: "IOS", label: "iOS", fields: [] },
      { slug: "CROSS_PLATFORM", label: "Cross-platform", fields: [] },
    ],
    fields: [
      { key: "appName", type: "TEXT", label: "App name", required: true, group: "App" },
      { key: "storeUrl", type: "URL", label: "Store listing URL", required: true, group: "App" },
      { key: "totalInstalls", type: "NUMBER", label: "Total installs", min: 0, group: "Reach" },
      { key: "monthlyActiveUsers", type: "NUMBER", label: "Monthly active users", min: 0, group: "Reach" },
      { key: "dailyActiveUsers", type: "NUMBER", label: "Daily active users", min: 0, group: "Reach" },
      {
        key: "primaryMonetization",
        type: "SELECT",
        label: "Primary monetization",
        options: ["In-app purchases", "Ads", "Subscription", "One-time paid", "Mixed", "None"],
        group: "Monetization",
      },
      { key: "topMarketCountries", type: "TEXT", label: "Top market countries", group: "Reach" },
      { key: "sourceCodeIncluded", type: "BOOLEAN", label: "Source code included in sale?", group: "Handover" },
      { key: "asoScreenshot", type: "SCREENSHOT", label: "ASO / keyword rank screenshot", group: "Proof" },
      { key: "revenueScreenshot", type: "SCREENSHOT", label: "Revenue / Play Console screenshot", required: true, group: "Proof" },
    ],
  },
  {
    assetType: "MOBILE_GAME",
    label: "Mobile game",
    description: "Published mobile game",
    iconKey: "Gamepad2",
    subTypes: [
      { slug: "ANDROID", label: "Android", fields: [] },
      { slug: "IOS", label: "iOS", fields: [] },
      { slug: "CROSS_PLATFORM", label: "Cross-platform", fields: [] },
    ],
    fields: [
      { key: "gameName", type: "TEXT", label: "Game name", required: true, group: "Game" },
      { key: "storeUrl", type: "URL", label: "Store listing URL", required: true, group: "Game" },
      { key: "totalInstalls", type: "NUMBER", label: "Total installs", min: 0, group: "Reach" },
      { key: "monthlyActiveUsers", type: "NUMBER", label: "MAU", min: 0, group: "Reach" },
      {
        key: "primaryMonetization",
        type: "SELECT",
        label: "Primary monetization",
        options: ["In-app purchases", "Rewarded ads", "Banner ads", "Subscription", "Mixed", "None"],
        group: "Monetization",
      },
      { key: "engineStack", type: "TEXT", label: "Engine / tech stack", hint: "Unity, Unreal, Godot…", group: "Tech" },
      { key: "sourceCodeIncluded", type: "BOOLEAN", label: "Source code included?", group: "Handover" },
      { key: "revenueScreenshot", type: "SCREENSHOT", label: "Revenue screenshot", required: true, group: "Proof" },
    ],
  },
  {
    assetType: "SAAS_PRODUCT",
    label: "SaaS product (standalone)",
    description: "SaaS product not tied to a public website domain",
    iconKey: "Code",
    fields: [
      { key: "productName", type: "TEXT", label: "Product name", required: true, group: "Product" },
      { key: "mrr", type: "MONEY", label: "MRR (USD)", required: true, min: 0, group: "SaaS metrics" },
      { key: "arr", type: "MONEY", label: "ARR (USD)", min: 0, group: "SaaS metrics" },
      { key: "churnPercent", type: "PERCENT", label: "Monthly churn (%)", min: 0, max: 100, group: "SaaS metrics" },
      { key: "payingCustomers", type: "NUMBER", label: "Paying customers", min: 0, group: "SaaS metrics" },
      { key: "techStack", type: "TEXT", label: "Tech stack", group: "Tech" },
      { key: "codeHandoverPolicy", type: "MULTILINE", label: "Code-handover policy", maxLength: 500, group: "Handover" },
    ],
  },
  {
    assetType: "PLATFORM",
    label: "Platform",
    description: "Online platform — marketplace, community, tool, or network",
    iconKey: "Boxes",
    fields: [
      { key: "platformUrl", type: "URL", label: "Platform URL", required: true, group: "Platform" },
      { key: "platformType", type: "TEXT", label: "Platform type", hint: "Marketplace, community, SaaS tool, network…", group: "Platform" },
      { key: "registeredUsers", type: "NUMBER", label: "Registered users", min: 0, group: "Reach" },
      { key: "activeUsers", type: "NUMBER", label: "Monthly active users", min: 0, group: "Reach" },
      { key: "mrr", type: "MONEY", label: "MRR (USD)", min: 0, group: "Financials" },
      { key: "techStack", type: "TEXT", label: "Tech stack", group: "Tech" },
      { key: "sourceCodeIncluded", type: "BOOLEAN", label: "Source code included?", group: "Handover" },
    ],
  },
  {
    assetType: "STOCK_PHOTO",
    label: "Stock photo",
    description: "Original photograph licensed for reuse",
    iconKey: "Image",
    deliverableKind: "image",
    skipCommonFields: true,
    fields: [
      { key: "resolution", type: "TEXT", label: "Resolution (px)", hint: "e.g. 6000×4000 — auto-detected from the file too", group: "File" },
      { key: "fileFormat", type: "SELECT", label: "Format", options: ["JPG", "PNG", "TIFF", "RAW", "WEBP"], group: "File" },
      { key: "orientation", type: "SELECT", label: "Orientation", options: ["Landscape", "Portrait", "Square"], group: "File" },
      { key: "license", type: "SELECT", label: "License", required: true, options: ["Standard (royalty-free)", "Extended", "Editorial only", "Exclusive"], group: "License" },
      { key: "modelReleased", type: "BOOLEAN", label: "Model release available?", hint: "Needed if recognizable people appear", group: "License" },
      { key: "propertyReleased", type: "BOOLEAN", label: "Property release available?", group: "License" },
      { key: "aiGenerated", type: "BOOLEAN", label: "AI-generated?", group: "Origin" },
      { key: "keywords", type: "TEXT", label: "Keywords / tags", hint: "Comma-separated, for search", group: "Discovery" },
      { key: "previewImage", type: "SCREENSHOT", label: "Watermarked preview", hint: "Public preview; the buyer gets the full file after purchase", required: true, group: "Preview" },
    ],
  },
  {
    assetType: "STOCK_VIDEO",
    label: "Stock video",
    description: "Original video clip / footage licensed for reuse",
    iconKey: "Video",
    deliverableKind: "video",
    skipCommonFields: true,
    fields: [
      { key: "resolution", type: "SELECT", label: "Resolution", options: ["720p", "1080p", "2K", "4K", "6K", "8K"], group: "File" },
      { key: "durationSec", type: "NUMBER", label: "Duration (seconds)", min: 0, group: "File" },
      { key: "fps", type: "NUMBER", label: "Frame rate (fps)", min: 0, group: "File" },
      { key: "fileFormat", type: "SELECT", label: "Format", options: ["MP4", "MOV", "WEBM", "ProRes"], group: "File" },
      { key: "hasAudio", type: "BOOLEAN", label: "Includes audio?", group: "File" },
      { key: "license", type: "SELECT", label: "License", required: true, options: ["Standard (royalty-free)", "Extended", "Editorial only", "Exclusive"], group: "License" },
      { key: "modelReleased", type: "BOOLEAN", label: "Model release available?", group: "License" },
      { key: "aiGenerated", type: "BOOLEAN", label: "AI-generated?", group: "Origin" },
      { key: "keywords", type: "TEXT", label: "Keywords / tags", group: "Discovery" },
      { key: "previewVideoUrl", type: "URL", label: "Watermarked preview URL", hint: "Public preview clip", group: "Preview" },
    ],
  },
  {
    assetType: "MUSIC",
    label: "Music / audio",
    description: "Original track, loop, or sound effect licensed for reuse",
    iconKey: "Music",
    deliverableKind: "audio",
    skipCommonFields: true,
    subTypes: [
      { slug: "TRACK", label: "Full track", fields: [] },
      { slug: "LOOP", label: "Loop", fields: [] },
      { slug: "SFX", label: "Sound effect", fields: [] },
      { slug: "BEAT", label: "Beat / instrumental", fields: [] },
    ],
    fields: [
      { key: "genre", type: "TEXT", label: "Genre", group: "Track" },
      { key: "durationSec", type: "NUMBER", label: "Duration (seconds)", min: 0, group: "Track" },
      { key: "bpm", type: "NUMBER", label: "BPM", min: 0, group: "Track" },
      { key: "fileFormat", type: "SELECT", label: "Format", options: ["WAV", "MP3", "FLAC", "AIFF", "OGG"], group: "File" },
      { key: "hasVocals", type: "BOOLEAN", label: "Has vocals?", group: "Track" },
      { key: "license", type: "SELECT", label: "License", required: true, options: ["Royalty-free", "Exclusive", "Creative Commons", "Sync license"], group: "License" },
      { key: "aiGenerated", type: "BOOLEAN", label: "AI-generated?", group: "Origin" },
      { key: "previewAudioUrl", type: "URL", label: "Watermarked preview URL", group: "Preview" },
    ],
  },
  {
    assetType: "EBOOK",
    label: "Ebook",
    description: "Ebook / PDF guide you hold the rights to sell",
    iconKey: "BookOpen",
    deliverableKind: "document",
    skipCommonFields: true,
    fields: [
      { key: "author", type: "TEXT", label: "Author", group: "Book" },
      { key: "format", type: "SELECT", label: "Format", required: true, options: ["PDF", "EPUB", "MOBI", "PDF + EPUB"], group: "Book" },
      { key: "pages", type: "NUMBER", label: "Pages", min: 0, group: "Book" },
      { key: "language", type: "TEXT", label: "Language", hint: "e.g. English, Bangla", group: "Book" },
      { key: "license", type: "SELECT", label: "License", required: true, options: ["Personal use", "Commercial use", "Resell rights", "Private label rights (PLR)"], group: "License" },
      { key: "drmFree", type: "BOOLEAN", label: "DRM-free?", group: "License" },
      { key: "isbn", type: "TEXT", label: "ISBN (optional)", group: "Book" },
      { key: "aiGenerated", type: "BOOLEAN", label: "AI-generated?", group: "Origin" },
      { key: "keywords", type: "TEXT", label: "Keywords / tags", hint: "Comma-separated, for search", group: "Discovery" },
      { key: "coverImage", type: "SCREENSHOT", label: "Cover image", hint: "Public cover; the buyer gets the file after purchase", required: true, group: "Preview" },
    ],
  },
  {
    assetType: "DIGITAL_PRODUCT",
    label: "Digital product",
    description: "Ebook, template, course, software, media — downloadable",
    iconKey: "FileText",
    subTypes: [
      { slug: "EBOOK", label: "Ebook", fields: [] },
      { slug: "TEMPLATE", label: "Template", fields: [] },
      { slug: "COURSE", label: "Course", fields: [] },
      { slug: "SOFTWARE", label: "Software", fields: [] },
      { slug: "MEDIA", label: "Media (audio/video)", fields: [] },
      { slug: "OTHER", label: "Other digital product", fields: [] },
    ],
    fields: [
      { key: "fileTypes", type: "TEXT", label: "File types", hint: "PDF, DOCX, MP4…", group: "Product" },
      {
        key: "licenseTerms",
        type: "SELECT",
        label: "License",
        options: ["Personal use", "Commercial use", "Resell rights", "Private label rights"],
        group: "Product",
      },
      {
        key: "deliveryMethod",
        type: "SELECT",
        label: "Delivery method",
        options: ["Instant download", "Email drip", "Manual delivery"],
        group: "Product",
      },
      { key: "refundPolicy", type: "MULTILINE", label: "Refund policy", maxLength: 300, group: "Product" },
    ],
  },
  {
    assetType: "SERVICE",
    label: "Service",
    description: "Done-for-you service offering",
    iconKey: "Briefcase",
    fields: [
      { key: "deliverable", type: "MULTILINE", label: "What's delivered?", required: true, maxLength: 500, group: "Service" },
      { key: "turnaroundDays", type: "NUMBER", label: "Turnaround (days)", min: 0, group: "Service" },
      { key: "revisions", type: "NUMBER", label: "Included revisions", min: 0, group: "Service" },
    ],
  },
  {
    assetType: "OTHER",
    label: "Other asset",
    description: "Anything not covered by the above categories",
    iconKey: "Box",
    fields: [],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getCategory(assetType: string): CategoryConfig | null {
  return CATEGORIES.find((c) => c.assetType === assetType) ?? null;
}

export function getSubType(
  assetType: string,
  subType: string | null | undefined
): { slug: string; label: string; fields?: CategoryField[] } | null {
  if (!subType) return null;
  const cat = getCategory(assetType);
  return cat?.subTypes?.find((s) => s.slug === subType) ?? null;
}

/** Resolved field list (common + type + subtype). Field order matters in the form. */
export function getFieldsFor(
  assetType: string,
  subType?: string | null
): CategoryField[] {
  const cat = getCategory(assetType);
  if (!cat) return [...COMMON_FIELDS];
  const sub = subType ? getSubType(assetType, subType) : null;
  const common = cat.skipCommonFields ? [] : COMMON_FIELDS;
  return [...common, ...cat.fields, ...(sub?.fields ?? [])];
}

/** Stock-media asset types — the deliverable file is analysed on submit so the
 *  admin can judge original vs downloaded/edited. */
export const STOCK_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "STOCK_PHOTO",
  "STOCK_VIDEO",
  "MUSIC",
]);

export function isStockMediaType(assetType: string): boolean {
  return STOCK_MEDIA_TYPES.has(assetType);
}

/** Sellable deliverable kind for an asset type (drives uploader + parser). */
export function getDeliverableKind(assetType: string): DeliverableKind {
  return getCategory(assetType)?.deliverableKind ?? null;
}

/** True when the asset type sells an uploaded file (stock media + ebooks) — the
 *  seller must upload it and the server analyses it for the admin. */
export function requiresDeliverable(assetType: string): boolean {
  return getDeliverableKind(assetType) != null;
}

export const ASSET_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.assetType, c.label])
);

/** Coerce a raw value to the expected type before validating. Lets the form
 *  store inputs as strings but the validator + DB get the right shape. */
function coerce(value: unknown, type: FieldType): unknown {
  if (value === "" || value === undefined) return null;
  if (value === null) return null;
  switch (type) {
    case "NUMBER":
    case "MONEY":
    case "PERCENT":
      return typeof value === "number" ? value : Number(value);
    case "BOOLEAN":
      return value === true || value === "true" || value === "yes" || value === 1;
    case "DATE":
      return typeof value === "string" ? value : String(value);
    default:
      return value;
  }
}

/** Validates a `details` blob against the configured fields for the given
 *  asset type + sub type. Returns null if OK, otherwise a friendly error. */
export function validateDetails(
  assetType: string,
  subType: string | null | undefined,
  details: Record<string, unknown>
): string | null {
  const fields = getFieldsFor(assetType, subType);
  for (const f of fields) {
    const raw = details[f.key];
    const v = coerce(raw, f.type);
    const isEmpty = v === null || v === undefined || v === "";

    if (f.required && isEmpty) {
      return `"${f.label}" is required`;
    }
    if (isEmpty) continue;

    switch (f.type) {
      case "NUMBER":
      case "MONEY":
      case "PERCENT": {
        const n = v as number;
        if (!Number.isFinite(n)) return `"${f.label}" must be a number`;
        if (f.min !== undefined && n < f.min)
          return `"${f.label}" must be ≥ ${f.min}`;
        if (f.max !== undefined && n > f.max)
          return `"${f.label}" must be ≤ ${f.max}`;
        break;
      }
      case "TEXT":
      case "MULTILINE":
        if (typeof v !== "string") return `"${f.label}" must be text`;
        if (f.maxLength && v.length > f.maxLength)
          return `"${f.label}" exceeds ${f.maxLength} characters`;
        break;
      case "URL":
        if (typeof v !== "string" || !/^https?:\/\//i.test(v))
          return `"${f.label}" must be a valid http(s) URL`;
        break;
      case "SELECT":
        if (typeof v !== "string" || !(f.options ?? []).includes(v))
          return `"${f.label}" — invalid choice`;
        break;
      case "SCREENSHOT":
        if (typeof v !== "string" || !v.startsWith("http"))
          return `"${f.label}" must be an uploaded image URL`;
        break;
      case "SCREENSHOT_GROUP":
        if (!Array.isArray(v))
          return `"${f.label}" must be a list of uploaded screenshots`;
        for (const u of v as unknown[]) {
          if (typeof u !== "string" || !u.startsWith("http"))
            return `"${f.label}" — every entry must be an uploaded URL`;
        }
        break;
    }
  }
  return null;
}
