// EarnGPT Configuration Constants

export const APP_NAME = "EarnGPT";
export const APP_TAGLINE = "Unlock Your Earning Potential";
export const APP_DESCRIPTION = "Complete tasks, earn rewards, and grow your income with EarnGPT";

// Economy
export const DEFAULT_POINTS_TO_USD_RATE = 1000; // 1000 points = $1
export const MINIMUM_WITHDRAWAL_USD = 50;
// Minimum points a user must accumulate before the "convert points → cash"
// option unlocks (whole-balance conversion). Admin-configurable via the
// `points_convert_threshold` SystemSetting.
export const DEFAULT_POINTS_CONVERT_THRESHOLD = 10000; // 10,000 pts = $10 at default rate

// MLM Levels (10 levels)
export const DEFAULT_REFERRAL_LEVELS = 10;

// Package Tiers (5-tier system per admin_oo.md / USER_MANAGEMENT_PACKAGE_TIERS_UPDATE.md)
export const PACKAGE_TIERS = {
  FREE: {
    name: "Free",
    dailyTaskLimit: 10,
    withdrawalFee: 5, // percentage
    minWithdrawal: 50,
    features: ["10 tasks per day", "Basic support", "Standard rewards"],
  },
  STARTER: {
    name: "Starter",
    dailyTaskLimit: 15,
    withdrawalFee: 3,
    minWithdrawal: 30,
    features: ["15 tasks per day", "Email support", "1.1x earning bonus", "Reduced withdrawal fee"],
  },
  PRO: {
    name: "Pro",
    dailyTaskLimit: 25,
    withdrawalFee: 2,
    minWithdrawal: 20,
    features: ["25 tasks per day", "Priority support", "1.25x earning bonus", "Lower withdrawal fee", "Exclusive tasks"],
  },
  ELITE: {
    name: "Elite",
    dailyTaskLimit: 50,
    withdrawalFee: 1,
    minWithdrawal: 10,
    features: ["50 tasks per day", "Priority 24/7 support", "1.5x earning bonus", "Faster payouts", "All exclusive tasks"],
  },
  VIP: {
    name: "VIP",
    dailyTaskLimit: -1, // unlimited
    withdrawalFee: 0,
    minWithdrawal: 5,
    features: ["Unlimited tasks", "Dedicated account manager", "2x earning bonus", "Zero withdrawal fees", "Instant payouts", "VIP-only events"],
  },
} as const;

// Gamification
export const XP_PER_LEVEL_MULTIPLIER = 100; // Level^2 * 100 XP needed
export const STREAK_BONUS_XP = 50;
export const DAILY_CHECKIN_POINTS = 100;

// Social
export const MAX_POST_LENGTH = 2000;
export const MAX_COMMENT_LENGTH = 500;
export const MAX_IMAGES_PER_POST = 5;

// Lottery
export const DEFAULT_MAX_TICKETS_PER_USER = 10;

// File Upload
export const MAX_FILE_SIZE_MB = 10;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Cache TTL (in seconds)
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

// Task Types Labels
export const TASK_TYPE_LABELS = {
  VIDEO: "Watch Video",
  ARTICLE: "Read Article",
  QUIZ: "Complete Quiz",
  SURVEY: "Fill Survey",
  SOCIAL: "Social Task",
  PROXY: "Proxy Task",
  OFFERWALL: "Offer Wall",
  CUSTOM: "Custom Task",
} as const;

// Payment Method Labels
export const PAYMENT_METHOD_LABELS = {
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  BINANCE: "Binance",
  PAYPAL: "PayPal",
} as const;

// Routes
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  DASHBOARD: "/dashboard",
  PROFILE: "/profile",
  EARN: "/earn",
  TASKS: "/tasks",
  WALLET: "/wallet",
  WITHDRAW: "/wallet/withdraw",
  SUBSCRIPTIONS: "/subscriptions",
  REFERRALS: "/referrals",
  MARKETPLACE: "/marketplace",
  SOCIAL: "/social",
  COURSES: "/courses",
  LOTTERY: "/lottery",
  LEADERBOARD: "/leaderboard",
  NOTIFICATIONS: "/notifications",
  SETTINGS: "/settings",
  
  // Admin routes
  ADMIN: "/admin",
  ADMIN_USERS: "/admin/users",
  ADMIN_TASKS: "/admin/tasks",
  ADMIN_WITHDRAWALS: "/admin/withdrawals",
  ADMIN_PACKAGES: "/admin/packages",
  ADMIN_SETTINGS: "/admin/settings",
} as const;

// API Endpoints
export const API = {
  AUTH: {
    LOGIN: "/api/auth/login",
    REGISTER: "/api/auth/register",
    LOGOUT: "/api/auth/logout",
    VERIFY_EMAIL: "/api/auth/verify-email",
    FORGOT_PASSWORD: "/api/auth/forgot-password",
    RESET_PASSWORD: "/api/auth/reset-password",
  },
  USERS: {
    PROFILE: "/api/users/profile",
    KYC: "/api/users/kyc",
  },
  TASKS: {
    LIST: "/api/tasks",
    SUBMIT: "/api/tasks/submit",
  },
  WALLET: {
    BALANCE: "/api/wallet",
    WITHDRAW: "/api/wallet/withdraw",
    TRANSACTIONS: "/api/wallet/transactions",
  },
} as const;
