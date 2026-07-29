import type { BannerSlide } from "@/components/user/primitives/banner-slider";
import type { WithdrawalTickerItem } from "@/components/user/primitives/withdrawal-ticker";
import type {
  RailEarner,
  RailFollowUser,
  RailPromo,
} from "@/components/user/feed/feed-right-rail";
import type { FeedWidgetConfig } from "@/lib/feed-widgets";
import type { QuickEarnTile } from "@/lib/feed-quick-earn";
import type { CustomWidget } from "@/lib/feed-custom-widgets";
import type { FeedAd } from "@/components/user/feed/feed-ad-card";

export interface SessionUser {
  id: string;
  name: string | null;
  avatar: string | null;
  /** Role of the viewer. Used to surface admin-only UI affordances
   *  (announcement toggle, promote/un-promote menu, force-delete). */
  role?: string | null;
}

export interface PollOption {
  id: string;
  label: string;
  voteCount: number;
}

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
}

export interface FeedPost {
  id: string;
  content: string;
  images: string[];
  backgroundStyle?: string | null;
  isPinned: boolean;
  isAnnouncement?: boolean;
  isPromoted?: boolean;
  promotedUntil?: string | null;
  promotedNote?: string | null;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount?: number;
  pollOptions?: PollOption[] | null;
  pollEndsAt?: string | null;
  donationGoal?: number | null;
  donationCollected?: number;
  linkPreview?: LinkPreviewData | null;
  groupId?: string | null;
  myVote?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    username?: string | null;
    avatar: string | null;
    level: number;
    packageTier: string;
    isBlueVerified?: boolean;
    role?: string | null;
  };
  isLiked: boolean;
  isOwner: boolean;
  isFollowingAuthor?: boolean;
}

export interface FeedComment {
  id: string;
  content: string;
  parentId?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    avatar: string | null;
    level: number;
  };
  isOwner: boolean;
}

export interface TickerConfig {
  showAmount: boolean;
  showMethod: boolean;
  showCountry: boolean;
  speedSec: number;
}

export interface Props {
  user: SessionUser;
  initialBanners: BannerSlide[];
  /** SSR-injected first in-feed native ad (unblockable first paint). */
  initialFeedAd?: FeedAd | null;
  initialTicker: WithdrawalTickerItem[];
  tickerConfig?: TickerConfig;
  bestEarners: RailEarner[];
  whoToFollow: RailFollowUser[];
  trendingHashtags: { tag: string; count: number }[];
  promo?: RailPromo | null;
  widgetConfig?: FeedWidgetConfig;
  quickEarn?: QuickEarnTile[];
  customWidgets?: CustomWidget[];
  canBoost?: boolean;
  canShareLinks?: boolean;
  canShareYouTube?: boolean;
}

export type ViewTab = "feed" | "groups";
export type Sort = "recent" | "trending";

export type ComposerMode = "text" | "poll" | "donation";

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  type: "PUBLIC" | "PRIVATE";
  avatarUrl: string | null;
  memberCount: number;
  role?: string;
  isOwner?: boolean;
  hasPendingRequest?: boolean;
}
