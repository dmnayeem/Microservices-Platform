export interface CompletionItem {
  key: string;
  label: string;
  category: "basic" | "contact" | "address" | "verification" | "social";
  done: boolean;
  weight: number;
  href?: string;
}

export interface SocialAccount {
  id: string;
  platform:
    | "TWITTER"
    | "FACEBOOK"
    | "INSTAGRAM"
    | "YOUTUBE"
    | "TIKTOK"
    | "LINKEDIN"
    | "TELEGRAM"
    | "DISCORD";
  username: string;
  url: string | null;
  followers: number;
  following: number;
  postsCount: number;
  verified: boolean;
  connectedAt: string;
}

export interface ProfileResponse {
  profile: {
    id: string;
    name: string | null;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatar: string | null;
    coverPhoto: string | null;
    bio: string | null;
    phone: string | null;
    secondaryEmail: string | null;
    secondaryPhone: string | null;
    gender: string | null;
    dateOfBirth: string | null;
    nidNumber: string | null;
    profession: string | null;
    nationality: string | null;
    bloodGroup: string | null;
    country: string | null;
    language: string;
    timezone: string;
    tags: string[];
    createdAt: string;
  };
  address: {
    street: string | null;
    village: string | null;
    city: string | null;
    subDistrict: string | null;
    district: string | null;
    subDivision: string | null;
    division: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
  };
  stats: {
    level: number;
    xp: number;
    xpProgress: number;
    xpNeeded: number;
    xpPercentage: number;
    pointsBalance: number;
    cashBalance: number;
    totalEarnings: number;
    tasksCompleted: number;
    referralsCount: number;
    achievementsCount: number;
    socialAccountsCount: number;
    postsCount: number;
    followersCount: number;
    followingCount: number;
    coursesEnrolled: number;
    coursesCreated: number;
    marketplaceListings: number;
    marketplacePurchases: number;
    marketplaceSales: number;
    marketplaceSalesAmount: number;
    socialEarningsPoints: number;
    socialEarningsUsd: number;
    lifetime: {
      totalEarnedPoints: number | null;
      totalEarnedUsd: number | null;
      tasksCompleted: number;
      rank: number;
      totalXp: number;
      level: number;
      team: number;
    };
  };
  package: {
    tier: string;
    name: string;
  };
  referral: {
    code: string;
    link: string;
  };
  verification: {
    kycStatus: string;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    twoFactorEnabled: boolean;
    isFullyVerified: boolean;
  };
  preferences: {
    theme: string;
    themeAccent: string;
    notifications: { enabled: boolean; email: boolean; push: boolean };
    privacy: { avatar: string; bio: string; stats: string; earnings: string; location: string };
  };
  socialAccounts: SocialAccount[];
  completion: {
    percentage: number;
    items: CompletionItem[];
    missing: CompletionItem[];
  };
}

export interface ApiPost {
  id: string;
  content: string;
  images: string[];
  isPinned: boolean;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  createdAt: string;
  isLiked: boolean;
}

export interface UserListItem {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
  isBlueVerified: boolean;
  verifiedBadgeStyle: string | null;
  followersCount: number;
  isFollowing: boolean;
}

export type PrimaryTab = "profile" | "posts" | "followers" | "following" | "analytics";
export type EditTab = "personal" | "address" | "kyc" | "social" | "privacy" | "theme" | "security";
