import {
  Twitter,
  Facebook,
  Instagram,
  Youtube,
  Linkedin,
  Send,
  MessageCircle,
  Music2,
} from "lucide-react";
import type { SocialAccount } from "./profile-view.types";

export const COUNTRIES = [
  { code: "BD", name: "Bangladesh" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "US", name: "United States" },
  { code: "UK", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "AE", name: "UAE" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "NG", name: "Nigeria" },
  { code: "EG", name: "Egypt" },
];

export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "bn", name: "Bengali" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "zh", name: "Chinese" },
];

export const TAG_OPTIONS: { id: string; label: string; emoji: string }[] = [
  { id: "EARLY_ADOPTER", label: "Early Adopter", emoji: "🚀" },
  { id: "VERIFIED", label: "Verified", emoji: "✓" },
  { id: "CRYPTO", label: "Crypto", emoji: "₿" },
  { id: "TRADER", label: "Trader", emoji: "📈" },
  { id: "GAMER", label: "Gamer", emoji: "🎮" },
  { id: "INFLUENCER", label: "Influencer", emoji: "📣" },
  { id: "WHALE", label: "Whale", emoji: "🐋" },
  { id: "PRO", label: "Pro", emoji: "🏆" },
  { id: "ELITE", label: "Elite", emoji: "💎" },
  { id: "CREATOR", label: "Creator", emoji: "🎨" },
];

export const PLATFORM_META: Record<
  SocialAccount["platform"],
  { label: string; icon: typeof Twitter; gradient: string; countLabel: string }
> = {
  TWITTER: { label: "Twitter / X", icon: Twitter, gradient: "from-sky-500 to-blue-600", countLabel: "Followers" },
  FACEBOOK: { label: "Facebook", icon: Facebook, gradient: "from-blue-500 to-indigo-600", countLabel: "Followers" },
  INSTAGRAM: { label: "Instagram", icon: Instagram, gradient: "from-pink-500 to-purple-600", countLabel: "Followers" },
  YOUTUBE: { label: "YouTube", icon: Youtube, gradient: "from-red-500 to-rose-600", countLabel: "Subscribers" },
  TIKTOK: { label: "TikTok", icon: Music2, gradient: "from-fuchsia-500 to-rose-500", countLabel: "Followers" },
  LINKEDIN: { label: "LinkedIn", icon: Linkedin, gradient: "from-cyan-600 to-blue-700", countLabel: "Connections" },
  TELEGRAM: { label: "Telegram", icon: Send, gradient: "from-sky-400 to-blue-500", countLabel: "Subscribers" },
  DISCORD: { label: "Discord", icon: MessageCircle, gradient: "from-indigo-500 to-violet-600", countLabel: "Server members" },
};

export const inp =
  "w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500";
