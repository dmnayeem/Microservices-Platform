/**
 * Social Media Task Taxonomy
 * --------------------------
 * Single source of truth for all platforms × actions × required fields.
 *
 * Each platform has its own set of actions. Each action defines:
 * - adminFields: fields the admin fills out when creating the task
 * - proofFields: fields the user submits as proof of completion
 * - supportsAiPrompt: whether the action can use an AI-generated prompt
 *   instead of static title/body content
 */

export type FieldType =
  | "text"
  | "url"
  | "textarea"
  | "number"
  | "screenshot"
  | "image-url"
  | "select";

export interface SocialField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  options?: string[];
}

export interface SocialAction {
  key: string;
  label: string;
  emoji: string;
  description: string;
  adminFields: SocialField[];
  proofFields: SocialField[];
  /**
   * If true, admin can replace static "content" admin fields with an AI prompt
   * that the user will use to generate their own post content via Gemini/etc.
   * Set to true for actions that involve creating new content.
   */
  supportsAiPrompt: boolean;
  /** Which adminField keys are AI-generatable (replaced by `aiPrompt` when toggle is on) */
  aiGeneratableFields?: string[];
  /** Suggested points reward range */
  suggestedReward?: { min: number; max: number };
}

export interface SocialPlatform {
  key: string;
  label: string;
  emoji: string;
  brandColor: string; // tailwind class fragment, e.g. "bg-[#1877f2]"
  websiteUrl: string;
  actions: SocialAction[];
}

// -----------------------------------------------------------------------------
// Reusable field templates (DRY)
// -----------------------------------------------------------------------------

const fieldUrl = (key: string, label: string, placeholder = "https://..."): SocialField => ({
  key,
  label,
  type: "url",
  required: true,
  placeholder,
});

const fieldHandle = (key: string, label: string): SocialField => ({
  key,
  label,
  type: "text",
  required: true,
  placeholder: "@username or full URL",
});

const fieldScreenshot: SocialField = {
  key: "screenshotUrl",
  label: "Screenshot (URL or upload)",
  type: "screenshot",
  required: true,
  helperText: "Upload a screenshot showing the completed action.",
};

const fieldProofUrl = (label = "Profile / Action URL"): SocialField => ({
  key: "proofUrl",
  label,
  type: "url",
  required: true,
  placeholder: "URL of your profile or the post you created",
});

const fieldProofUsername: SocialField = {
  key: "proofUsername",
  label: "Your username on this platform",
  type: "text",
  required: true,
  placeholder: "@yourhandle",
};

const fieldComment = (label = "Comment template"): SocialField => ({
  key: "commentTemplate",
  label,
  type: "textarea",
  required: true,
  placeholder: "Suggested comment text (users will copy and post this)",
  helperText: "Or toggle 'Use AI prompt' to let users generate the comment with AI.",
});

const fieldWatchSeconds: SocialField = {
  key: "minWatchSeconds",
  label: "Minimum watch time (seconds)",
  type: "number",
  required: true,
  placeholder: "30",
};

const fieldImageUrl: SocialField = {
  key: "imageUrl",
  label: "Image URL (optional)",
  type: "image-url",
  required: false,
  placeholder: "Image users should attach to their post",
};

// -----------------------------------------------------------------------------
// Platform definitions
// -----------------------------------------------------------------------------

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  // ── Facebook ─────────────────────────────────────────────────────────────
  {
    key: "FACEBOOK",
    label: "Facebook",
    emoji: "📘",
    brandColor: "bg-[#1877f2] text-white",
    websiteUrl: "https://www.facebook.com",
    actions: [
      {
        key: "FOLLOW_PAGE",
        label: "Follow Page",
        emoji: "👥",
        description: "Follow a Facebook page",
        adminFields: [fieldUrl("targetUrl", "Page URL")],
        proofFields: [fieldProofUrl("Your profile URL"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 25 },
      },
      {
        key: "LIKE_PAGE",
        label: "Like Page",
        emoji: "👍",
        description: "Like a Facebook page",
        adminFields: [fieldUrl("targetUrl", "Page URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_POST",
        label: "Like Post",
        emoji: "❤️",
        description: "Like a specific Facebook post",
        adminFields: [fieldUrl("targetUrl", "Post URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "COMMENT_POST",
        label: "Comment on Post",
        emoji: "💬",
        description: "Leave a comment on a specific post",
        adminFields: [fieldUrl("targetUrl", "Post URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldUrl("proofUrl", "URL of your comment"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "SHARE_POST",
        label: "Share Post",
        emoji: "🔁",
        description: "Share a post publicly",
        adminFields: [fieldUrl("targetUrl", "Post URL")],
        proofFields: [fieldUrl("proofUrl", "URL of your share"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "CREATE_POST",
        label: "Create Post",
        emoji: "✍️",
        description: "Create and publish a new Facebook post",
        adminFields: [
          {
            key: "postContent",
            label: "Post content (template)",
            type: "textarea",
            required: true,
            placeholder: "Suggested post text with hashtags",
            helperText: "Or toggle AI prompt to let users generate.",
          },
          fieldImageUrl,
        ],
        aiGeneratableFields: ["postContent"],
        proofFields: [fieldUrl("proofUrl", "URL of your post"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 25, max: 80 },
      },
    ],
  },

  // ── Facebook Group ───────────────────────────────────────────────────────
  {
    key: "FB_GROUP",
    label: "FB Group",
    emoji: "👥",
    brandColor: "bg-[#1877f2]/80 text-white",
    websiteUrl: "https://www.facebook.com/groups",
    actions: [
      {
        key: "JOIN_GROUP",
        label: "Join Group",
        emoji: "✅",
        description: "Request to join a Facebook group",
        adminFields: [fieldUrl("targetUrl", "Group URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 40 },
      },
      {
        key: "POST_IN_GROUP",
        label: "Post in Group",
        emoji: "📝",
        description: "Create a post inside the group",
        adminFields: [
          fieldUrl("targetUrl", "Group URL"),
          {
            key: "postContent",
            label: "Post content (template)",
            type: "textarea",
            required: true,
            placeholder: "Post text users should publish",
          },
          fieldImageUrl,
        ],
        aiGeneratableFields: ["postContent"],
        proofFields: [fieldUrl("proofUrl", "URL of your post"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 30, max: 100 },
      },
      {
        key: "COMMENT_IN_GROUP",
        label: "Comment in Group",
        emoji: "💬",
        description: "Comment on a post inside the group",
        adminFields: [fieldUrl("targetUrl", "Post URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
    ],
  },

  // ── Twitter/X ────────────────────────────────────────────────────────────
  {
    key: "TWITTER",
    label: "X (Twitter)",
    emoji: "𝕏",
    brandColor: "bg-black text-white",
    websiteUrl: "https://x.com",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow",
        emoji: "👥",
        description: "Follow an account on X",
        adminFields: [fieldHandle("targetHandle", "Account handle")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_TWEET",
        label: "Like Tweet",
        emoji: "❤️",
        description: "Like a specific tweet",
        adminFields: [fieldUrl("targetUrl", "Tweet URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "RETWEET",
        label: "Retweet",
        emoji: "🔁",
        description: "Retweet a tweet to your followers",
        adminFields: [fieldUrl("targetUrl", "Tweet URL")],
        proofFields: [fieldUrl("proofUrl", "Your retweet URL"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "REPLY",
        label: "Reply to Tweet",
        emoji: "💬",
        description: "Reply to a specific tweet",
        adminFields: [fieldUrl("targetUrl", "Tweet URL"), fieldComment("Reply text (template)")],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldUrl("proofUrl", "Your reply URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "QUOTE_TWEET",
        label: "Quote Tweet",
        emoji: "💭",
        description: "Quote a tweet with your own commentary",
        adminFields: [
          fieldUrl("targetUrl", "Tweet URL to quote"),
          {
            key: "quoteText",
            label: "Quote text (template)",
            type: "textarea",
            required: true,
            placeholder: "Your quote tweet content",
          },
        ],
        aiGeneratableFields: ["quoteText"],
        proofFields: [fieldUrl("proofUrl", "Your quote tweet URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
      {
        key: "POST_TWEET",
        label: "Post Tweet",
        emoji: "✍️",
        description: "Create and publish a new tweet",
        adminFields: [
          {
            key: "tweetContent",
            label: "Tweet content (template)",
            type: "textarea",
            required: true,
            placeholder: "Tweet text with hashtags (max 280 chars)",
            helperText: "Or use AI prompt to let users generate the tweet.",
          },
          {
            key: "hashtags",
            label: "Required hashtags",
            type: "text",
            required: false,
            placeholder: "#example #required",
          },
        ],
        aiGeneratableFields: ["tweetContent"],
        proofFields: [fieldUrl("proofUrl", "Your tweet URL")],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 60 },
      },
    ],
  },

  // ── YouTube ───────────────────────────────────────────────────────────────
  {
    key: "YOUTUBE",
    label: "YouTube",
    emoji: "▶️",
    brandColor: "bg-[#ff0000] text-white",
    websiteUrl: "https://www.youtube.com",
    actions: [
      {
        key: "SUBSCRIBE",
        label: "Subscribe to Channel",
        emoji: "🔔",
        description: "Subscribe to a YouTube channel",
        adminFields: [fieldUrl("targetUrl", "Channel URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "LIKE_VIDEO",
        label: "Like Video",
        emoji: "👍",
        description: "Like a specific video",
        adminFields: [fieldUrl("targetUrl", "Video URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "COMMENT_VIDEO",
        label: "Comment on Video",
        emoji: "💬",
        description: "Leave a comment on a video",
        adminFields: [fieldUrl("targetUrl", "Video URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldUrl("proofUrl", "URL of your comment"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WATCH_VIDEO",
        label: "Watch Video",
        emoji: "👁️",
        description: "Watch a video for a minimum duration",
        adminFields: [fieldUrl("targetUrl", "Video URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 50 },
      },
      {
        key: "SHARE_VIDEO",
        label: "Share Video",
        emoji: "🔁",
        description: "Share a video link publicly",
        adminFields: [fieldUrl("targetUrl", "Video URL")],
        proofFields: [fieldUrl("proofUrl", "Where you shared it"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
    ],
  },

  // ── Instagram ─────────────────────────────────────────────────────────────
  {
    key: "INSTAGRAM",
    label: "Instagram",
    emoji: "📷",
    brandColor:
      "bg-linear-to-br from-purple-500 via-pink-500 to-orange-400 text-white",
    websiteUrl: "https://www.instagram.com",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow Profile",
        emoji: "👥",
        description: "Follow an Instagram account",
        adminFields: [fieldHandle("targetHandle", "Profile handle")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 25 },
      },
      {
        key: "LIKE_POST",
        label: "Like Post",
        emoji: "❤️",
        description: "Like a specific post or reel",
        adminFields: [fieldUrl("targetUrl", "Post / Reel URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "COMMENT_POST",
        label: "Comment on Post",
        emoji: "💬",
        description: "Comment on a specific post or reel",
        adminFields: [fieldUrl("targetUrl", "Post / Reel URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "SHARE_TO_STORY",
        label: "Share to Story",
        emoji: "📲",
        description: "Repost a post to your story",
        adminFields: [fieldUrl("targetUrl", "Post / Reel URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "POST_PHOTO",
        label: "Post Photo",
        emoji: "📸",
        description: "Create a feed photo post",
        adminFields: [
          {
            key: "caption",
            label: "Caption (template)",
            type: "textarea",
            required: true,
            placeholder: "Caption text with hashtags",
          },
          fieldImageUrl,
        ],
        aiGeneratableFields: ["caption"],
        proofFields: [fieldUrl("proofUrl", "Your post URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 30, max: 100 },
      },
      {
        key: "POST_REEL",
        label: "Post Reel",
        emoji: "🎬",
        description: "Create and post a Reel",
        adminFields: [
          {
            key: "caption",
            label: "Caption (template)",
            type: "textarea",
            required: true,
          },
        ],
        aiGeneratableFields: ["caption"],
        proofFields: [fieldUrl("proofUrl", "Your Reel URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 50, max: 150 },
      },
      {
        key: "POST_STORY",
        label: "Post Story",
        emoji: "📲",
        description: "Post to your Instagram story",
        adminFields: [
          {
            key: "storyText",
            label: "Story text / instructions",
            type: "textarea",
            required: false,
          },
          fieldImageUrl,
        ],
        aiGeneratableFields: ["storyText"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
    ],
  },

  // ── TikTok ────────────────────────────────────────────────────────────────
  {
    key: "TIKTOK",
    label: "TikTok",
    emoji: "🎵",
    brandColor: "bg-black text-white",
    websiteUrl: "https://www.tiktok.com",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow",
        emoji: "👥",
        description: "Follow a TikTok creator",
        adminFields: [fieldHandle("targetHandle", "Creator handle")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_VIDEO",
        label: "Like Video",
        emoji: "❤️",
        description: "Like a TikTok video",
        adminFields: [fieldUrl("targetUrl", "Video URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "COMMENT_VIDEO",
        label: "Comment on Video",
        emoji: "💬",
        description: "Leave a comment on a video",
        adminFields: [fieldUrl("targetUrl", "Video URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WATCH_VIDEO",
        label: "Watch Video",
        emoji: "👁️",
        description: "Watch a video to completion",
        adminFields: [fieldUrl("targetUrl", "Video URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 25 },
      },
      {
        key: "POST_VIDEO",
        label: "Post Video",
        emoji: "🎬",
        description: "Post a TikTok video",
        adminFields: [
          {
            key: "caption",
            label: "Caption (template)",
            type: "textarea",
            required: true,
          },
        ],
        aiGeneratableFields: ["caption"],
        proofFields: [fieldUrl("proofUrl", "Your TikTok URL")],
        supportsAiPrompt: true,
        suggestedReward: { min: 50, max: 150 },
      },
      {
        key: "DUET_OR_STITCH",
        label: "Duet / Stitch Video",
        emoji: "🎭",
        description: "Create a duet or stitch with the original",
        adminFields: [
          fieldUrl("targetUrl", "Original video URL"),
          {
            key: "instructions",
            label: "Instructions (template)",
            type: "textarea",
            required: false,
          },
        ],
        aiGeneratableFields: ["instructions"],
        proofFields: [fieldUrl("proofUrl", "Your duet/stitch URL")],
        supportsAiPrompt: true,
        suggestedReward: { min: 40, max: 120 },
      },
    ],
  },

  // ── Pinterest ─────────────────────────────────────────────────────────────
  {
    key: "PINTEREST",
    label: "Pinterest",
    emoji: "📌",
    brandColor: "bg-[#e60023] text-white",
    websiteUrl: "https://www.pinterest.com",
    actions: [
      {
        key: "FOLLOW_PROFILE",
        label: "Follow Profile",
        emoji: "👥",
        description: "Follow a Pinterest profile",
        adminFields: [fieldUrl("targetUrl", "Profile URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "FOLLOW_BOARD",
        label: "Follow Board",
        emoji: "📋",
        description: "Follow a specific board",
        adminFields: [fieldUrl("targetUrl", "Board URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_PIN",
        label: "Like Pin",
        emoji: "❤️",
        description: "Like (react to) a pin",
        adminFields: [fieldUrl("targetUrl", "Pin URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "SAVE_PIN",
        label: "Save Pin",
        emoji: "💾",
        description: "Save a pin to one of your boards",
        adminFields: [
          fieldUrl("targetUrl", "Pin URL"),
          {
            key: "boardName",
            label: "Suggested board name",
            type: "text",
            required: false,
            placeholder: "e.g. 'Home decor'",
          },
        ],
        proofFields: [
          {
            key: "savedToBoard",
            label: "Board you saved to",
            type: "text",
            required: true,
          },
          fieldScreenshot,
        ],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "COMMENT_PIN",
        label: "Comment on Pin",
        emoji: "💬",
        description: "Leave a comment on a pin",
        adminFields: [fieldUrl("targetUrl", "Pin URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "CREATE_PIN",
        label: "Create Pin",
        emoji: "✨",
        description: "Create and publish a brand-new pin",
        adminFields: [
          {
            key: "pinTitle",
            label: "Pin title (template)",
            type: "text",
            required: true,
            placeholder: "Eye-catching pin title",
          },
          {
            key: "pinDescription",
            label: "Pin description (template)",
            type: "textarea",
            required: true,
            placeholder: "Detailed description with keywords",
          },
          fieldUrl("destinationUrl", "Destination URL the pin should link to"),
          {
            key: "boardName",
            label: "Suggested board name",
            type: "text",
            required: false,
          },
          fieldImageUrl,
        ],
        aiGeneratableFields: ["pinTitle", "pinDescription"],
        proofFields: [fieldUrl("proofUrl", "Your pin URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 40, max: 120 },
      },
      {
        key: "REPIN",
        label: "Repin",
        emoji: "🔁",
        description: "Repin an existing pin to a board",
        adminFields: [fieldUrl("targetUrl", "Pin URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  {
    key: "LINKEDIN",
    label: "LinkedIn",
    emoji: "💼",
    brandColor: "bg-[#0a66c2] text-white",
    websiteUrl: "https://www.linkedin.com",
    actions: [
      {
        key: "FOLLOW_PROFILE",
        label: "Follow Profile",
        emoji: "👥",
        description: "Follow a LinkedIn member",
        adminFields: [fieldUrl("targetUrl", "Profile URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "FOLLOW_COMPANY",
        label: "Follow Company",
        emoji: "🏢",
        description: "Follow a LinkedIn company page",
        adminFields: [fieldUrl("targetUrl", "Company URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "LIKE_POST",
        label: "Like Post",
        emoji: "👍",
        description: "React to a post",
        adminFields: [fieldUrl("targetUrl", "Post URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "COMMENT_POST",
        label: "Comment on Post",
        emoji: "💬",
        description: "Leave a thoughtful comment",
        adminFields: [fieldUrl("targetUrl", "Post URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
      {
        key: "SHARE_POST",
        label: "Share Post",
        emoji: "🔁",
        description: "Repost / share a post",
        adminFields: [
          fieldUrl("targetUrl", "Post URL"),
          {
            key: "shareCaption",
            label: "Caption template (optional)",
            type: "textarea",
            required: false,
          },
        ],
        aiGeneratableFields: ["shareCaption"],
        proofFields: [fieldUrl("proofUrl", "Your share URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
      {
        key: "CONNECT",
        label: "Send Connection",
        emoji: "🤝",
        description: "Send a connection request",
        adminFields: [fieldUrl("targetUrl", "Profile URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "POST_ARTICLE",
        label: "Post / Article",
        emoji: "✍️",
        description: "Publish a post or article",
        adminFields: [
          {
            key: "title",
            label: "Title (template)",
            type: "text",
            required: false,
          },
          {
            key: "body",
            label: "Body (template)",
            type: "textarea",
            required: true,
          },
        ],
        aiGeneratableFields: ["title", "body"],
        proofFields: [fieldUrl("proofUrl", "Your post URL")],
        supportsAiPrompt: true,
        suggestedReward: { min: 50, max: 150 },
      },
    ],
  },

  // ── Threads ───────────────────────────────────────────────────────────────
  {
    key: "THREADS",
    label: "Threads",
    emoji: "🧵",
    brandColor: "bg-black text-white border border-gray-700",
    websiteUrl: "https://www.threads.net",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow",
        emoji: "👥",
        description: "Follow a Threads account",
        adminFields: [fieldHandle("targetHandle", "Account handle")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_POST",
        label: "Like Post",
        emoji: "❤️",
        description: "Like a thread",
        adminFields: [fieldUrl("targetUrl", "Thread URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "REPLY",
        label: "Reply to Thread",
        emoji: "💬",
        description: "Reply to a thread",
        adminFields: [fieldUrl("targetUrl", "Thread URL"), fieldComment("Reply (template)")],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldUrl("proofUrl", "Your reply URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "REPOST",
        label: "Repost",
        emoji: "🔁",
        description: "Repost a thread",
        adminFields: [fieldUrl("targetUrl", "Thread URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "POST_THREAD",
        label: "Post Thread",
        emoji: "✍️",
        description: "Create a new thread",
        adminFields: [
          {
            key: "threadContent",
            label: "Thread content (template)",
            type: "textarea",
            required: true,
          },
        ],
        aiGeneratableFields: ["threadContent"],
        proofFields: [fieldUrl("proofUrl", "Your thread URL")],
        supportsAiPrompt: true,
        suggestedReward: { min: 25, max: 80 },
      },
    ],
  },

  // ── Discord ───────────────────────────────────────────────────────────────
  {
    key: "DISCORD",
    label: "Discord",
    emoji: "💬",
    brandColor: "bg-[#5865f2] text-white",
    websiteUrl: "https://discord.com",
    actions: [
      {
        key: "JOIN_SERVER",
        label: "Join Server",
        emoji: "✅",
        description: "Accept a Discord server invite",
        adminFields: [fieldUrl("targetUrl", "Invite URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "POST_IN_CHANNEL",
        label: "Post in Channel",
        emoji: "📝",
        description: "Send a message in a channel",
        adminFields: [
          fieldUrl("targetUrl", "Server invite or channel URL"),
          {
            key: "channelName",
            label: "Channel name",
            type: "text",
            required: true,
            placeholder: "#general",
          },
          {
            key: "messageContent",
            label: "Message content (template)",
            type: "textarea",
            required: true,
          },
        ],
        aiGeneratableFields: ["messageContent"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
      {
        key: "REACT_TO_MESSAGE",
        label: "React to Message",
        emoji: "🎉",
        description: "Add an emoji reaction to a message",
        adminFields: [
          fieldUrl("targetUrl", "Message URL"),
          {
            key: "emoji",
            label: "Emoji to react with",
            type: "text",
            required: true,
            placeholder: "🎉",
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── Telegram ──────────────────────────────────────────────────────────────
  {
    key: "TELEGRAM",
    label: "Telegram",
    emoji: "✈️",
    brandColor: "bg-[#0088cc] text-white",
    websiteUrl: "https://telegram.org",
    actions: [
      {
        key: "JOIN_CHANNEL",
        label: "Join Channel",
        emoji: "📢",
        description: "Join a Telegram channel",
        adminFields: [fieldUrl("targetUrl", "Channel URL (t.me/...)")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "JOIN_GROUP",
        label: "Join Group",
        emoji: "👥",
        description: "Join a Telegram group",
        adminFields: [fieldUrl("targetUrl", "Group URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "VOTE_IN_POLL",
        label: "Vote in Poll",
        emoji: "🗳️",
        description: "Vote in a Telegram poll",
        adminFields: [
          fieldUrl("targetUrl", "Poll / message URL"),
          {
            key: "voteOption",
            label: "Option to vote for",
            type: "text",
            required: false,
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "FORWARD_MESSAGE",
        label: "Forward Message",
        emoji: "🔁",
        description: "Forward a message to your contacts",
        adminFields: [fieldUrl("targetUrl", "Message URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "POST_IN_GROUP",
        label: "Post in Group",
        emoji: "📝",
        description: "Send a message in a Telegram group",
        adminFields: [
          fieldUrl("targetUrl", "Group URL"),
          {
            key: "messageContent",
            label: "Message content (template)",
            type: "textarea",
            required: true,
          },
        ],
        aiGeneratableFields: ["messageContent"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
    ],
  },

  // ── Reddit ────────────────────────────────────────────────────────────────
  {
    key: "REDDIT",
    label: "Reddit",
    emoji: "🤖",
    brandColor: "bg-[#ff4500] text-white",
    websiteUrl: "https://www.reddit.com",
    actions: [
      {
        key: "JOIN_SUBREDDIT",
        label: "Join Subreddit",
        emoji: "✅",
        description: "Subscribe to a subreddit",
        adminFields: [fieldUrl("targetUrl", "Subreddit URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "UPVOTE_POST",
        label: "Upvote Post",
        emoji: "⬆️",
        description: "Upvote a post or comment",
        adminFields: [fieldUrl("targetUrl", "Post URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "COMMENT_POST",
        label: "Comment on Post",
        emoji: "💬",
        description: "Leave a comment on a Reddit post",
        adminFields: [fieldUrl("targetUrl", "Post URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldUrl("proofUrl", "Your comment URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
      {
        key: "SUBMIT_POST",
        label: "Submit Post",
        emoji: "📝",
        description: "Submit a new post to a subreddit",
        adminFields: [
          {
            key: "subreddit",
            label: "Subreddit (e.g. r/example)",
            type: "text",
            required: true,
            placeholder: "r/example",
          },
          {
            key: "postTitle",
            label: "Post title (template)",
            type: "text",
            required: true,
          },
          {
            key: "postBody",
            label: "Post body (template)",
            type: "textarea",
            required: true,
          },
        ],
        aiGeneratableFields: ["postTitle", "postBody"],
        proofFields: [fieldUrl("proofUrl", "Your post URL"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 40, max: 120 },
      },
    ],
  },

  // ── Spotify ───────────────────────────────────────────────────────────────
  {
    key: "SPOTIFY",
    label: "Spotify",
    emoji: "🎧",
    brandColor: "bg-[#1db954] text-white",
    websiteUrl: "https://open.spotify.com",
    actions: [
      {
        key: "FOLLOW_ARTIST",
        label: "Follow Artist",
        emoji: "🎤",
        description: "Follow a Spotify artist",
        adminFields: [fieldUrl("targetUrl", "Artist URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "FOLLOW_PLAYLIST",
        label: "Follow Playlist",
        emoji: "📂",
        description: "Follow a public playlist",
        adminFields: [fieldUrl("targetUrl", "Playlist URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "LIKE_TRACK",
        label: "Like Track",
        emoji: "❤️",
        description: "Add a track to liked songs",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "ADD_TO_PLAYLIST",
        label: "Add to Playlist",
        emoji: "📌",
        description: "Add a track to one of your playlists",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [
          {
            key: "playlistName",
            label: "Playlist name",
            type: "text",
            required: true,
          },
          fieldScreenshot,
        ],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "LISTEN_FULL",
        label: "Listen Full Track",
        emoji: "🎶",
        description: "Listen to a track in full",
        adminFields: [fieldUrl("targetUrl", "Track URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
    ],
  },

  // ── SoundCloud ────────────────────────────────────────────────────────────
  {
    key: "SOUNDCLOUD",
    label: "SoundCloud",
    emoji: "☁️",
    brandColor: "bg-[#ff5500] text-white",
    websiteUrl: "https://soundcloud.com",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow",
        emoji: "👥",
        description: "Follow a SoundCloud profile",
        adminFields: [fieldUrl("targetUrl", "Profile URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "LIKE_TRACK",
        label: "Like Track",
        emoji: "❤️",
        description: "Like a track",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "REPOST",
        label: "Repost",
        emoji: "🔁",
        description: "Repost a track to your followers",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "COMMENT",
        label: "Comment",
        emoji: "💬",
        description: "Comment on a track",
        adminFields: [fieldUrl("targetUrl", "Track URL"), fieldComment()],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "LISTEN_FULL",
        label: "Listen Full Track",
        emoji: "🎶",
        description: "Listen to a track in full",
        adminFields: [fieldUrl("targetUrl", "Track URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
    ],
  },

  // ── Apple Music ───────────────────────────────────────────────────────────
  {
    key: "APPLE_MUSIC",
    label: "Apple Music",
    emoji: "🎵",
    brandColor: "bg-[#fa243c] text-white",
    websiteUrl: "https://music.apple.com",
    actions: [
      {
        key: "FOLLOW_ARTIST",
        label: "Follow Artist",
        emoji: "🎤",
        description: "Follow an artist on Apple Music",
        adminFields: [fieldUrl("targetUrl", "Artist URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "LIKE_TRACK",
        label: "Love Song",
        emoji: "❤️",
        description: "Love a song / add to your library",
        adminFields: [fieldUrl("targetUrl", "Song URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "ADD_TO_PLAYLIST",
        label: "Add to Playlist",
        emoji: "📌",
        description: "Add a song to one of your playlists",
        adminFields: [fieldUrl("targetUrl", "Song URL")],
        proofFields: [
          {
            key: "playlistName",
            label: "Playlist name",
            type: "text",
            required: true,
          },
          fieldScreenshot,
        ],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "LISTEN_FULL",
        label: "Listen Full Song",
        emoji: "🎶",
        description: "Listen to a song in full",
        adminFields: [fieldUrl("targetUrl", "Song URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
    ],
  },

  // ── Amazon Music ──────────────────────────────────────────────────────────
  {
    key: "AMAZON_MUSIC",
    label: "Amazon Music",
    emoji: "🎧",
    brandColor: "bg-[#232f3e] text-white",
    websiteUrl: "https://music.amazon.com",
    actions: [
      {
        key: "FOLLOW_ARTIST",
        label: "Follow Artist",
        emoji: "🎤",
        description: "Follow an artist on Amazon Music",
        adminFields: [fieldUrl("targetUrl", "Artist URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "LIKE_TRACK",
        label: "Like Song",
        emoji: "❤️",
        description: "Like / thumbs-up a song",
        adminFields: [fieldUrl("targetUrl", "Song URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "ADD_TO_PLAYLIST",
        label: "Add to Playlist",
        emoji: "📌",
        description: "Add a song to one of your playlists",
        adminFields: [fieldUrl("targetUrl", "Song URL")],
        proofFields: [
          {
            key: "playlistName",
            label: "Playlist name",
            type: "text",
            required: true,
          },
          fieldScreenshot,
        ],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "LISTEN_FULL",
        label: "Listen Full Song",
        emoji: "🎶",
        description: "Listen to a song in full",
        adminFields: [fieldUrl("targetUrl", "Song URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
    ],
  },

  // ── Google Reviews ────────────────────────────────────────────────────────
  {
    key: "GOOGLE_REVIEWS",
    label: "Google Reviews",
    emoji: "⭐",
    brandColor: "bg-[#4285f4] text-white",
    websiteUrl: "https://maps.google.com",
    actions: [
      {
        key: "RATE",
        label: "Leave a Rating",
        emoji: "⭐",
        description: "Leave a star rating on a Google business listing",
        adminFields: [
          fieldUrl("targetUrl", "Business / Maps URL"),
          {
            key: "requestedRating",
            label: "Requested rating",
            type: "select",
            required: false,
            options: ["5 stars", "4 stars", "Any"],
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a text review for a Google business listing",
        adminFields: [
          fieldUrl("targetUrl", "Business / Maps URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldProofUrl("Link to your review"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
      {
        key: "MARK_HELPFUL",
        label: "Mark Review Helpful",
        emoji: "👍",
        description: "Mark an existing review as helpful",
        adminFields: [fieldUrl("targetUrl", "Review URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── Trustpilot ────────────────────────────────────────────────────────────
  {
    key: "TRUSTPILOT",
    label: "Trustpilot",
    emoji: "🌟",
    brandColor: "bg-[#00b67a] text-white",
    websiteUrl: "https://www.trustpilot.com",
    actions: [
      {
        key: "RATE",
        label: "Leave a Rating",
        emoji: "⭐",
        description: "Leave a star rating for a company on Trustpilot",
        adminFields: [
          fieldUrl("targetUrl", "Company URL"),
          {
            key: "requestedRating",
            label: "Requested rating",
            type: "select",
            required: false,
            options: ["5 stars", "4 stars", "Any"],
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a text review for a company on Trustpilot",
        adminFields: [
          fieldUrl("targetUrl", "Company URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldProofUrl("Link to your review"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
    ],
  },

  // ── App Store ─────────────────────────────────────────────────────────────
  {
    key: "APP_STORE",
    label: "App Store",
    emoji: "🍏",
    brandColor: "bg-[#0d96f6] text-white",
    websiteUrl: "https://apps.apple.com",
    actions: [
      {
        key: "RATE",
        label: "Rate the App",
        emoji: "⭐",
        description: "Leave a star rating on the App Store",
        adminFields: [
          fieldUrl("targetUrl", "App Store URL"),
          {
            key: "requestedRating",
            label: "Requested rating",
            type: "select",
            required: false,
            options: ["5 stars", "4 stars", "Any"],
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a text review on the App Store",
        adminFields: [
          fieldUrl("targetUrl", "App Store URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
    ],
  },

  // ── Play Store ────────────────────────────────────────────────────────────
  {
    key: "PLAY_STORE",
    label: "Play Store",
    emoji: "▶️",
    brandColor: "bg-[#01875f] text-white",
    websiteUrl: "https://play.google.com",
    actions: [
      {
        key: "RATE",
        label: "Rate the App",
        emoji: "⭐",
        description: "Leave a star rating on Google Play",
        adminFields: [
          fieldUrl("targetUrl", "Play Store URL"),
          {
            key: "requestedRating",
            label: "Requested rating",
            type: "select",
            required: false,
            options: ["5 stars", "4 stars", "Any"],
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a text review on Google Play",
        adminFields: [
          fieldUrl("targetUrl", "Play Store URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
      {
        key: "MARK_HELPFUL",
        label: "Mark Review Helpful",
        emoji: "👍",
        description: "Mark an existing review as helpful",
        adminFields: [fieldUrl("targetUrl", "Review URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── TIDAL ─────────────────────────────────────────────────────────────────
  {
    key: "TIDAL",
    label: "TIDAL",
    emoji: "🎵",
    brandColor: "bg-black text-white",
    websiteUrl: "https://tidal.com",
    actions: [
      {
        key: "LISTEN_FULL",
        label: "HiFi Stream",
        emoji: "🎶",
        description: "Stream a track in full (HiFi)",
        adminFields: [fieldUrl("targetUrl", "Track URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_TRACK",
        label: "Like Track",
        emoji: "❤️",
        description: "Like a track",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "ADD_TO_PLAYLIST",
        label: "Add to Playlist",
        emoji: "📌",
        description: "Add a track to your playlist",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "FOLLOW_ARTIST",
        label: "Follow Artist",
        emoji: "🎤",
        description: "Follow an artist on TIDAL",
        adminFields: [fieldUrl("targetUrl", "Artist URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
    ],
  },

  // ── Deezer ────────────────────────────────────────────────────────────────
  {
    key: "DEEZER",
    label: "Deezer",
    emoji: "🎧",
    brandColor: "bg-[#a238ff] text-white",
    websiteUrl: "https://www.deezer.com",
    actions: [
      {
        key: "LISTEN_FULL",
        label: "Stream Track",
        emoji: "🎶",
        description: "Stream a track in full",
        adminFields: [fieldUrl("targetUrl", "Track URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_TRACK",
        label: "Add to Favorites",
        emoji: "❤️",
        description: "Add a track to favorites",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "ADD_TO_PLAYLIST",
        label: "Add to Playlist",
        emoji: "📌",
        description: "Add a track to your playlist",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "FOLLOW_ARTIST",
        label: "Follow Artist",
        emoji: "🎤",
        description: "Follow an artist on Deezer",
        adminFields: [fieldUrl("targetUrl", "Artist URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
    ],
  },

  // ── Bandcamp ──────────────────────────────────────────────────────────────
  {
    key: "BANDCAMP",
    label: "Bandcamp",
    emoji: "💿",
    brandColor: "bg-[#629aa9] text-white",
    websiteUrl: "https://bandcamp.com",
    actions: [
      {
        key: "LISTEN_FULL",
        label: "Stream Full Track",
        emoji: "🎶",
        description: "Stream a track in full",
        adminFields: [fieldUrl("targetUrl", "Track URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_TRACK",
        label: "Add to Wishlist",
        emoji: "⭐",
        description: "Add a track to your wishlist",
        adminFields: [fieldUrl("targetUrl", "Track URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "FOLLOW_ARTIST",
        label: "Follow Artist",
        emoji: "🎤",
        description: "Follow an artist on Bandcamp",
        adminFields: [fieldUrl("targetUrl", "Artist URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "BUY_TRACK",
        label: "Buy Track",
        emoji: "🛒",
        description: "Buy a track (pay-what-you-want)",
        adminFields: [
          fieldUrl("targetUrl", "Track URL"),
          {
            key: "suggestedAmount",
            label: "Suggested amount",
            type: "text",
            required: false,
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 20, max: 60 },
      },
      {
        key: "COMMENT",
        label: "Leave Comment",
        emoji: "💬",
        description: "Leave a public comment on a track",
        adminFields: [
          fieldUrl("targetUrl", "Track URL"),
          fieldComment("Comment (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 5, max: 20 },
      },
    ],
  },

  // ── Yelp ──────────────────────────────────────────────────────────────────
  {
    key: "YELP",
    label: "Yelp",
    emoji: "⭐",
    brandColor: "bg-[#ff1a1a] text-white",
    websiteUrl: "https://www.yelp.com",
    actions: [
      {
        key: "RATE",
        label: "Leave a Rating",
        emoji: "⭐",
        description: "Leave a star rating for a business",
        adminFields: [
          fieldUrl("targetUrl", "Business URL"),
          {
            key: "requestedRating",
            label: "Requested rating",
            type: "select",
            required: false,
            options: ["5 stars", "4 stars", "Any"],
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a text review for a business",
        adminFields: [
          fieldUrl("targetUrl", "Business URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldProofUrl("Link to your review"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
      {
        key: "UPLOAD_PHOTO",
        label: "Add Photo",
        emoji: "📷",
        description: "Add a photo to a business listing",
        adminFields: [
          fieldUrl("targetUrl", "Business URL"),
          {
            key: "photoUrl",
            label: "Reference photo (admin upload)",
            type: "image-url",
            required: false,
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "CHECK_IN",
        label: "Check-In",
        emoji: "📍",
        description: "Check in at the location",
        adminFields: [fieldUrl("targetUrl", "Location URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "MARK_HELPFUL",
        label: "Mark Reviews Useful",
        emoji: "👍",
        description: "Mark existing reviews as useful",
        adminFields: [fieldUrl("targetUrl", "Business URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── Tripadvisor ───────────────────────────────────────────────────────────
  {
    key: "TRIPADVISOR",
    label: "Tripadvisor",
    emoji: "🧭",
    brandColor: "bg-[#34e0a1] text-black",
    websiteUrl: "https://www.tripadvisor.com",
    actions: [
      {
        key: "RATE",
        label: "Leave a Rating",
        emoji: "⭐",
        description: "Leave a star rating for a listing",
        adminFields: [
          fieldUrl("targetUrl", "Listing URL"),
          {
            key: "requestedRating",
            label: "Requested rating",
            type: "select",
            required: false,
            options: ["5 stars", "4 stars", "Any"],
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a travel review",
        adminFields: [
          fieldUrl("targetUrl", "Listing URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldProofUrl("Link to your review"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
      {
        key: "UPLOAD_PHOTO",
        label: "Upload Travel Photo",
        emoji: "📷",
        description: "Upload a photo to a listing",
        adminFields: [
          fieldUrl("targetUrl", "Listing URL"),
          {
            key: "photoUrl",
            label: "Reference photo (admin upload)",
            type: "image-url",
            required: false,
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "SAVE_ITEM",
        label: "Save to Trip",
        emoji: "🔖",
        description: "Save the listing to a trip",
        adminFields: [fieldUrl("targetUrl", "Listing URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "MARK_HELPFUL",
        label: "Mark Reviews Helpful",
        emoji: "👍",
        description: "Mark existing reviews as helpful",
        adminFields: [fieldUrl("targetUrl", "Listing URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── BBB ───────────────────────────────────────────────────────────────────
  {
    key: "BBB",
    label: "BBB",
    emoji: "🏛️",
    brandColor: "bg-[#003595] text-white",
    websiteUrl: "https://www.bbb.org",
    actions: [
      {
        key: "RATE",
        label: "Submit a Rating",
        emoji: "⭐",
        description: "Submit a high rating for a business",
        adminFields: [fieldUrl("targetUrl", "Business URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a detailed review",
        adminFields: [
          fieldUrl("targetUrl", "Business URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
      {
        key: "VERIFY",
        label: "Verify Account",
        emoji: "✅",
        description: "Verify your account",
        adminFields: [fieldUrl("targetUrl", "Business URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── G2 ────────────────────────────────────────────────────────────────────
  {
    key: "G2",
    label: "G2",
    emoji: "🏆",
    brandColor: "bg-[#ff492c] text-white",
    websiteUrl: "https://www.g2.com",
    actions: [
      {
        key: "RATE",
        label: "Leave a Rating",
        emoji: "⭐",
        description: "Leave a star rating for a product",
        adminFields: [fieldUrl("targetUrl", "Product URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "PROS_REVIEW",
        label: "Pros Review",
        emoji: "👍",
        description: "Write the pros of the product",
        adminFields: [
          fieldUrl("targetUrl", "Product URL"),
          fieldComment("Pros (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
      {
        key: "CONS_REVIEW",
        label: "Cons Review",
        emoji: "👎",
        description: "Write the cons of the product",
        adminFields: [
          fieldUrl("targetUrl", "Product URL"),
          fieldComment("Cons (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "RECOMMEND",
        label: "Recommend Product",
        emoji: "💯",
        description: "Mark the product as recommended",
        adminFields: [fieldUrl("targetUrl", "Product URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── Capterra ──────────────────────────────────────────────────────────────
  {
    key: "CAPTERRA",
    label: "Capterra",
    emoji: "🔎",
    brandColor: "bg-[#ff9d28] text-black",
    websiteUrl: "https://www.capterra.com",
    actions: [
      {
        key: "RATE",
        label: "Leave a Rating",
        emoji: "⭐",
        description: "Leave a star rating for a product",
        adminFields: [fieldUrl("targetUrl", "Product URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a detailed review",
        adminFields: [
          fieldUrl("targetUrl", "Product URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
      {
        key: "RECOMMEND",
        label: "Would Recommend",
        emoji: "💯",
        description: "Mark that you would recommend it",
        adminFields: [fieldUrl("targetUrl", "Product URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── Sitejabber ────────────────────────────────────────────────────────────
  {
    key: "SITEJABBER",
    label: "Sitejabber",
    emoji: "👍",
    brandColor: "bg-[#23a455] text-white",
    websiteUrl: "https://www.sitejabber.com",
    actions: [
      {
        key: "RATE",
        label: "Leave a Rating",
        emoji: "⭐",
        description: "Leave a star rating for a business",
        adminFields: [fieldUrl("targetUrl", "Business URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a text review",
        adminFields: [
          fieldUrl("targetUrl", "Business URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
      {
        key: "UPLOAD_PHOTO",
        label: "Add Product Photo",
        emoji: "📷",
        description: "Add a product photo",
        adminFields: [
          fieldUrl("targetUrl", "Business URL"),
          {
            key: "photoUrl",
            label: "Reference photo (admin upload)",
            type: "image-url",
            required: false,
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
    ],
  },

  // ── Glassdoor ─────────────────────────────────────────────────────────────
  {
    key: "GLASSDOOR",
    label: "Glassdoor",
    emoji: "💼",
    brandColor: "bg-[#0caa41] text-white",
    websiteUrl: "https://www.glassdoor.com",
    actions: [
      {
        key: "RATE",
        label: "Rate the Company",
        emoji: "⭐",
        description: "Leave a company rating",
        adminFields: [fieldUrl("targetUrl", "Company URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "PROS_REVIEW",
        label: "Pros Section",
        emoji: "👍",
        description: "Write the pros of working there",
        adminFields: [
          fieldUrl("targetUrl", "Company URL"),
          fieldComment("Pros (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 15, max: 40 },
      },
      {
        key: "CONS_REVIEW",
        label: "Cons Section",
        emoji: "👎",
        description: "Write the cons of working there",
        adminFields: [
          fieldUrl("targetUrl", "Company URL"),
          fieldComment("Cons (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "RECOMMEND",
        label: "Recommend to a Friend",
        emoji: "💯",
        description: "Mark that you'd recommend the company",
        adminFields: [fieldUrl("targetUrl", "Company URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "APPROVE_CEO",
        label: "Approve of CEO",
        emoji: "✅",
        description: "Mark approval of the CEO",
        adminFields: [fieldUrl("targetUrl", "Company URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── Facebook Reviews ──────────────────────────────────────────────────────
  {
    key: "FACEBOOK_REVIEWS",
    label: "Facebook Reviews",
    emoji: "⭐",
    brandColor: "bg-[#1877f2] text-white",
    websiteUrl: "https://www.facebook.com",
    actions: [
      {
        key: "RECOMMEND",
        label: "Recommend Page",
        emoji: "💯",
        description: "Mark 'Yes, recommend' on a page",
        adminFields: [fieldUrl("targetUrl", "Page URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Review Text",
        emoji: "📝",
        description: "Write a recommendation review",
        adminFields: [
          fieldUrl("targetUrl", "Page URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 45 },
      },
      {
        key: "UPLOAD_PHOTO",
        label: "Add Photo",
        emoji: "📷",
        description: "Add a photo to your recommendation",
        adminFields: [
          fieldUrl("targetUrl", "Page URL"),
          {
            key: "photoUrl",
            label: "Reference photo (admin upload)",
            type: "image-url",
            required: false,
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "FOLLOW_PAGE",
        label: "Follow the Page",
        emoji: "👥",
        description: "Follow the Facebook page",
        adminFields: [fieldUrl("targetUrl", "Page URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
    ],
  },

  // ── Quora ─────────────────────────────────────────────────────────────────
  {
    key: "QUORA",
    label: "Quora",
    emoji: "❓",
    brandColor: "bg-[#b92b27] text-white",
    websiteUrl: "https://www.quora.com",
    actions: [
      {
        key: "UPVOTE_POST",
        label: "Upvote Answer",
        emoji: "⬆️",
        description: "Upvote an answer",
        adminFields: [fieldUrl("targetUrl", "Answer URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "COMMENT",
        label: "Comment on Answer",
        emoji: "💬",
        description: "Comment on an answer",
        adminFields: [
          fieldUrl("targetUrl", "Answer URL"),
          fieldComment("Comment (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "FOLLOW_USER",
        label: "Follow User",
        emoji: "👥",
        description: "Follow a Quora user",
        adminFields: [fieldUrl("targetUrl", "Profile URL")],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "WRITE_ANSWER",
        label: "Write Answer",
        emoji: "📝",
        description: "Write an answer to a question",
        adminFields: [
          fieldUrl("targetUrl", "Question URL"),
          fieldComment("Answer (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldProofUrl("Link to your answer"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 25, max: 60 },
      },
    ],
  },

  // ── Google Maps ───────────────────────────────────────────────────────────
  {
    key: "GOOGLE_MAPS",
    label: "Google Maps",
    emoji: "📍",
    brandColor: "bg-[#34a853] text-white",
    websiteUrl: "https://maps.google.com",
    actions: [
      {
        key: "RATE",
        label: "Leave a Rating",
        emoji: "⭐",
        description: "Leave a star rating for a place",
        adminFields: [
          fieldUrl("targetUrl", "Location URL"),
          {
            key: "requestedRating",
            label: "Requested rating",
            type: "select",
            required: false,
            options: ["5 stars", "4 stars", "Any"],
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "WRITE_REVIEW",
        label: "Write a Review",
        emoji: "📝",
        description: "Write a review for a place",
        adminFields: [
          fieldUrl("targetUrl", "Location URL"),
          fieldComment("Review text (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldProofUrl("Link to your review"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 20, max: 50 },
      },
      {
        key: "UPLOAD_PHOTO",
        label: "Add Photo of Place",
        emoji: "📷",
        description: "Add a photo of the place",
        adminFields: [
          fieldUrl("targetUrl", "Location URL"),
          {
            key: "photoUrl",
            label: "Reference photo (admin upload)",
            type: "image-url",
            required: false,
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "SAVE_ITEM",
        label: "Save the Place",
        emoji: "🔖",
        description: "Save the place to a list",
        adminFields: [fieldUrl("targetUrl", "Location URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "ANSWER_QA",
        label: "Answer Q&A",
        emoji: "❓",
        description: "Answer a question about the place",
        adminFields: [
          fieldUrl("targetUrl", "Location URL"),
          fieldComment("Suggested answer (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 25 },
      },
    ],
  },

  // ── Website ───────────────────────────────────────────────────────────────
  {
    key: "WEBSITE",
    label: "Website",
    emoji: "🌐",
    brandColor: "bg-[#6366f1] text-white",
    websiteUrl: "https://",
    actions: [
      {
        key: "VISIT_PAGE",
        label: "Visit Page",
        emoji: "🖥️",
        description: "Visit a page and stay for the required time",
        adminFields: [fieldUrl("targetUrl", "Page URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 12 },
      },
      {
        key: "SCROLL_END",
        label: "Scroll to End",
        emoji: "⬇️",
        description: "Scroll to the bottom of the page",
        adminFields: [fieldUrl("targetUrl", "Page URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "COMMENT",
        label: "Leave a Comment",
        emoji: "💬",
        description: "Leave a comment on the page",
        adminFields: [
          fieldUrl("targetUrl", "Page URL"),
          fieldComment("Comment (template)"),
        ],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 8, max: 20 },
      },
      {
        key: "SUBSCRIBE_NEWSLETTER",
        label: "Subscribe to Newsletter",
        emoji: "📧",
        description: "Sign up for the newsletter",
        adminFields: [fieldUrl("targetUrl", "Signup URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 8, max: 20 },
      },
      {
        key: "SHARE_LINK",
        label: "Share Link",
        emoji: "🔗",
        description: "Share the link externally",
        adminFields: [
          fieldUrl("targetUrl", "Page URL"),
          {
            key: "shareDestination",
            label: "Where to share",
            type: "text",
            required: false,
          },
        ],
        proofFields: [fieldProofUrl("Link to your share")],
        supportsAiPrompt: false,
        suggestedReward: { min: 8, max: 20 },
      },
    ],
  },

  // ── Snapchat ──────────────────────────────────────────────────────────────
  {
    key: "SNAPCHAT",
    label: "Snapchat",
    emoji: "👻",
    brandColor: "bg-[#fffc00] text-black",
    websiteUrl: "https://www.snapchat.com",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow",
        emoji: "👥",
        description: "Follow a Snapchat user",
        adminFields: [
          {
            key: "targetHandle",
            label: "Username or snapcode URL",
            type: "text",
            required: true,
            placeholder: "@username",
          },
        ],
        proofFields: [fieldProofUsername, fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "ADD_FRIEND",
        label: "Add Friend",
        emoji: "🤝",
        description: "Add as friend",
        adminFields: [
          {
            key: "targetHandle",
            label: "Username",
            type: "text",
            required: true,
          },
        ],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
      {
        key: "VIEW_STORY",
        label: "View Story",
        emoji: "👁️",
        description: "View a public story",
        adminFields: [fieldUrl("targetUrl", "Story URL or snapcode")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 15 },
      },
      {
        key: "SUBSCRIBE_PUBLIC",
        label: "Subscribe (Public)",
        emoji: "🔔",
        description: "Subscribe to a public profile",
        adminFields: [fieldUrl("targetUrl", "Public profile URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 25 },
      },
    ],
  },

  // ── WhatsApp ─────────────────────────────────────────────────────────────
  {
    key: "WHATSAPP",
    label: "WhatsApp",
    emoji: "📱",
    brandColor: "bg-[#25d366] text-white",
    websiteUrl: "https://www.whatsapp.com",
    actions: [
      {
        key: "FOLLOW_CHANNEL",
        label: "Follow Channel",
        emoji: "📢",
        description: "Follow a WhatsApp Channel",
        adminFields: [fieldUrl("targetUrl", "Channel invite link")],
        proofFields: [fieldScreenshot, fieldProofUsername],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 25 },
      },
      {
        key: "JOIN_GROUP",
        label: "Join Group",
        emoji: "👥",
        description: "Join a WhatsApp group via invite link",
        adminFields: [fieldUrl("targetUrl", "Group invite link")],
        proofFields: [fieldScreenshot, fieldProofUsername],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 25 },
      },
      {
        key: "REACT_TO_STATUS",
        label: "React to Status",
        emoji: "❤️",
        description: "React to a status/channel update",
        adminFields: [fieldUrl("targetUrl", "Channel / status link")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 12 },
      },
    ],
  },

  // ── Twitch ───────────────────────────────────────────────────────────────
  {
    key: "TWITCH",
    label: "Twitch",
    emoji: "🎮",
    brandColor: "bg-[#9146ff] text-white",
    websiteUrl: "https://www.twitch.tv",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow Channel",
        emoji: "➕",
        description: "Follow a Twitch channel",
        adminFields: [fieldUrl("targetUrl", "Channel URL")],
        proofFields: [fieldProofUrl("Your profile URL"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 25 },
      },
      {
        key: "SUBSCRIBE",
        label: "Subscribe",
        emoji: "⭐",
        description: "Subscribe to a Twitch channel",
        adminFields: [fieldUrl("targetUrl", "Channel URL")],
        proofFields: [fieldScreenshot, fieldProofUsername],
        supportsAiPrompt: false,
        suggestedReward: { min: 20, max: 80 },
      },
      {
        key: "WATCH_STREAM",
        label: "Watch Stream",
        emoji: "👁️",
        description: "Watch a stream/VOD for a minimum duration",
        adminFields: [fieldUrl("targetUrl", "Stream / VOD URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 50 },
      },
    ],
  },

  // ── Kick ─────────────────────────────────────────────────────────────────
  {
    key: "KICK",
    label: "Kick",
    emoji: "🥊",
    brandColor: "bg-[#53fc18] text-black",
    websiteUrl: "https://kick.com",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow Channel",
        emoji: "➕",
        description: "Follow a Kick channel",
        adminFields: [fieldUrl("targetUrl", "Channel URL")],
        proofFields: [fieldProofUrl("Your profile URL"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 25 },
      },
      {
        key: "WATCH_STREAM",
        label: "Watch Stream",
        emoji: "👁️",
        description: "Watch a stream/VOD for a minimum duration",
        adminFields: [fieldUrl("targetUrl", "Stream / VOD URL"), fieldWatchSeconds],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 50 },
      },
    ],
  },

  // ── Bluesky ──────────────────────────────────────────────────────────────
  {
    key: "BLUESKY",
    label: "Bluesky",
    emoji: "🦋",
    brandColor: "bg-[#0085ff] text-white",
    websiteUrl: "https://bsky.app",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow",
        emoji: "➕",
        description: "Follow a Bluesky profile",
        adminFields: [fieldUrl("targetUrl", "Profile URL")],
        proofFields: [fieldProofUrl("Your profile URL"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "LIKE_POST",
        label: "Like Post",
        emoji: "❤️",
        description: "Like a specific post",
        adminFields: [fieldUrl("targetUrl", "Post URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "REPOST",
        label: "Repost",
        emoji: "🔁",
        description: "Repost a post",
        adminFields: [fieldUrl("targetUrl", "Post URL")],
        proofFields: [fieldUrl("proofUrl", "URL of your repost"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "REPLY",
        label: "Reply",
        emoji: "💬",
        description: "Reply to a post",
        adminFields: [fieldUrl("targetUrl", "Post URL"), fieldComment("Reply template")],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldUrl("proofUrl", "URL of your reply"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
    ],
  },

  // ── Mastodon ─────────────────────────────────────────────────────────────
  {
    key: "MASTODON",
    label: "Mastodon",
    emoji: "🐘",
    brandColor: "bg-[#6364ff] text-white",
    websiteUrl: "https://joinmastodon.org",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow",
        emoji: "➕",
        description: "Follow a Mastodon account",
        adminFields: [fieldUrl("targetUrl", "Profile URL")],
        proofFields: [fieldProofUrl("Your profile URL"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "FAVOURITE",
        label: "Favourite Post",
        emoji: "⭐",
        description: "Favourite a specific post",
        adminFields: [fieldUrl("targetUrl", "Post URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 10 },
      },
      {
        key: "BOOST",
        label: "Boost",
        emoji: "🔁",
        description: "Boost (reblog) a post",
        adminFields: [fieldUrl("targetUrl", "Post URL")],
        proofFields: [fieldUrl("proofUrl", "URL of your boost"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 10, max: 30 },
      },
      {
        key: "REPLY",
        label: "Reply",
        emoji: "💬",
        description: "Reply to a post",
        adminFields: [fieldUrl("targetUrl", "Post URL"), fieldComment("Reply template")],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldUrl("proofUrl", "URL of your reply"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 10, max: 30 },
      },
    ],
  },

  // ── Medium ───────────────────────────────────────────────────────────────
  {
    key: "MEDIUM",
    label: "Medium",
    emoji: "✍️",
    brandColor: "bg-black text-white",
    websiteUrl: "https://medium.com",
    actions: [
      {
        key: "FOLLOW",
        label: "Follow",
        emoji: "➕",
        description: "Follow a Medium writer or publication",
        adminFields: [fieldUrl("targetUrl", "Profile / publication URL")],
        proofFields: [fieldProofUrl("Your profile URL"), fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 5, max: 20 },
      },
      {
        key: "CLAP",
        label: "Clap",
        emoji: "👏",
        description: "Clap for a story",
        adminFields: [fieldUrl("targetUrl", "Story URL")],
        proofFields: [fieldScreenshot],
        supportsAiPrompt: false,
        suggestedReward: { min: 3, max: 12 },
      },
      {
        key: "RESPOND",
        label: "Respond",
        emoji: "💬",
        description: "Write a response to a story",
        adminFields: [fieldUrl("targetUrl", "Story URL"), fieldComment("Response template")],
        aiGeneratableFields: ["commentTemplate"],
        proofFields: [fieldUrl("proofUrl", "URL of your response"), fieldScreenshot],
        supportsAiPrompt: true,
        suggestedReward: { min: 12, max: 35 },
      },
    ],
  },
];

// -----------------------------------------------------------------------------
// Catalog enrichment (additive) — extra actions merged into the platforms above.
// Kept here (rather than inline) so the merge is easy to audit. Every new action
// key also has an ACTION_TIER entry so ordering + validation keep working.
// -----------------------------------------------------------------------------

const fieldDurationDays: SocialField = {
  key: "durationDays",
  label: "Keep live (days)",
  type: "number",
  required: false,
  placeholder: "7",
};

const ta = (key: string, label: string, required = false, placeholder?: string): SocialField => ({
  key,
  label,
  type: "textarea",
  required,
  placeholder,
});

const txt = (key: string, label: string, required = false, placeholder?: string): SocialField => ({
  key,
  label,
  type: "text",
  required,
  placeholder,
});

const EXTRA_ACTIONS: Record<string, SocialAction[]> = {
  FACEBOOK: [
    {
      key: "SAVE_POST",
      label: "Save Post",
      emoji: "🔖",
      description: "Save a post to your collection",
      adminFields: [fieldUrl("targetUrl", "Post URL")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 2, max: 10 },
    },
    {
      key: "WATCH_REEL",
      label: "Watch Reel",
      emoji: "🎬",
      description: "Watch a reel for a minimum duration",
      adminFields: [fieldUrl("targetUrl", "Reel URL"), fieldWatchSeconds],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 3, max: 15 },
    },
    {
      key: "CREATE_STORY",
      label: "Create Story",
      emoji: "🌟",
      description: "Post a 24-hour story",
      adminFields: [fieldImageUrl, ta("storyText", "Story text", false, "Text overlay")],
      aiGeneratableFields: ["storyText"],
      proofFields: [fieldProofUrl("Story link"), fieldScreenshot],
      supportsAiPrompt: true,
      suggestedReward: { min: 4, max: 20 },
    },
    {
      key: "CROSS_POST_PAGES",
      label: "Cross-Post to Pages",
      emoji: "📣",
      description: "Share a post across multiple pages",
      adminFields: [ta("pageList", "Page list", true, "One page URL per line"), txt("shareCaption", "Share caption")],
      proofFields: [fieldProofUrl("Link to one share"), fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 10, max: 30 },
    },
    {
      key: "KEEP_POST_LIVE",
      label: "Keep Post Live",
      emoji: "⏳",
      description: "Keep a post public for N+ days",
      adminFields: [fieldUrl("targetUrl", "Post URL"), fieldDurationDays],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 5, max: 15 },
    },
  ],
  INSTAGRAM: [
    {
      key: "SAVE_POST",
      label: "Save Post",
      emoji: "🔖",
      description: "Save a post",
      adminFields: [fieldUrl("targetUrl", "Post URL")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 2, max: 8 },
    },
    {
      key: "CREATE_STORY",
      label: "Create Story",
      emoji: "🌟",
      description: "Post a 24-hour story",
      adminFields: [fieldImageUrl, ta("storyText", "Story text", false, "Text overlay"), txt("tagHandle", "Tag handle")],
      aiGeneratableFields: ["storyText"],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: true,
      suggestedReward: { min: 6, max: 20 },
    },
    {
      key: "KEEP_POST_LIVE",
      label: "Keep Post Live",
      emoji: "⏳",
      description: "Keep a post public for N+ days",
      adminFields: [fieldUrl("targetUrl", "Post URL"), fieldDurationDays],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 5, max: 15 },
    },
  ],
  YOUTUBE: [
    {
      key: "TURN_ON_BELL",
      label: "Turn On Notifications",
      emoji: "🔔",
      description: "Enable the notification bell on a channel",
      adminFields: [fieldUrl("targetUrl", "Channel URL")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 2, max: 8 },
    },
    {
      key: "CREATE_SHORT",
      label: "Create Short",
      emoji: "📱",
      description: "Create a YouTube Short",
      adminFields: [txt("title", "Title", true), ta("description", "Description", true), txt("hashtags", "Hashtags")],
      aiGeneratableFields: ["description"],
      proofFields: [fieldProofUrl("Short URL"), fieldScreenshot],
      supportsAiPrompt: true,
      suggestedReward: { min: 20, max: 60 },
    },
    {
      key: "CREATE_COMMUNITY_POST",
      label: "Create Community Post",
      emoji: "📝",
      description: "Post to the channel community tab",
      adminFields: [ta("postText", "Post text", true), fieldImageUrl],
      aiGeneratableFields: ["postText"],
      proofFields: [fieldProofUrl("Post URL"), fieldScreenshot],
      supportsAiPrompt: true,
      suggestedReward: { min: 6, max: 20 },
    },
  ],
  TWITTER: [
    {
      key: "BOOKMARK_TWEET",
      label: "Bookmark Tweet",
      emoji: "🔖",
      description: "Bookmark a tweet",
      adminFields: [fieldUrl("targetUrl", "Tweet URL")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 2, max: 8 },
    },
    {
      key: "CREATE_THREAD",
      label: "Create Thread",
      emoji: "🧵",
      description: "Post a thread of 3+ tweets",
      adminFields: [ta("threadText", "Thread content", true, "One tweet per line"), txt("hashtags", "Hashtags")],
      aiGeneratableFields: ["threadText"],
      proofFields: [fieldProofUrl("Thread URL"), fieldScreenshot],
      supportsAiPrompt: true,
      suggestedReward: { min: 15, max: 40 },
    },
  ],
  PINTEREST: [
    {
      key: "CREATE_BOARD",
      label: "Create Themed Board",
      emoji: "🗂️",
      description: "Create a new themed board",
      adminFields: [txt("boardName", "Board name", true), ta("boardDescription", "Board description")],
      proofFields: [fieldProofUrl("Board URL"), fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 5, max: 15 },
    },
    {
      key: "PIN_TO_MULTI",
      label: "Pin to 2+ Boards",
      emoji: "📌",
      description: "Pin to multiple boards",
      adminFields: [fieldUrl("targetUrl", "Pin URL"), ta("boardNames", "Board names", true, "One board per line")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 5, max: 15 },
    },
  ],
  LINKEDIN: [
    {
      key: "REPOST_TO_FEED",
      label: "Repost to Feed",
      emoji: "🔁",
      description: "Repost content to your feed",
      adminFields: [fieldUrl("targetUrl", "Post URL")],
      proofFields: [fieldProofUrl("Your repost URL"), fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 5, max: 15 },
    },
  ],
  TIKTOK: [
    {
      key: "SAVE_TO_FAVORITES",
      label: "Save to Favorites",
      emoji: "🔖",
      description: "Save a video to favorites",
      adminFields: [fieldUrl("targetUrl", "Video URL")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 2, max: 8 },
    },
    {
      key: "KEEP_VIDEO_LIVE",
      label: "Keep Video Live",
      emoji: "⏳",
      description: "Keep a video public for N+ days",
      adminFields: [fieldUrl("targetUrl", "Video URL"), fieldDurationDays],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 8, max: 20 },
    },
  ],
  REDDIT: [
    {
      key: "SAVE_POST",
      label: "Save Post",
      emoji: "🔖",
      description: "Save a post",
      adminFields: [fieldUrl("targetUrl", "Post URL")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 2, max: 8 },
    },
    {
      key: "FOLLOW_USER",
      label: "Follow Redditor",
      emoji: "👤",
      description: "Follow a Reddit user",
      adminFields: [fieldUrl("targetUrl", "Profile URL")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 4, max: 10 },
    },
    {
      key: "GIVE_AWARD",
      label: "Give Award",
      emoji: "🏅",
      description: "Give an award to a post",
      adminFields: [fieldUrl("targetUrl", "Post URL"), txt("awardType", "Award type")],
      proofFields: [fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 6, max: 15 },
    },
    {
      key: "CROSS_POST",
      label: "Cross-Post",
      emoji: "📣",
      description: "Cross-post to 2+ subreddits",
      adminFields: [fieldUrl("targetUrl", "Original post URL"), ta("subredditList", "Subreddit list", true, "One subreddit per line")],
      proofFields: [fieldProofUrl("Link to one cross-post"), fieldScreenshot],
      supportsAiPrompt: false,
      suggestedReward: { min: 10, max: 25 },
    },
  ],
};

// Merge the extra actions into the platform definitions (runs once at load).
for (const _platform of SOCIAL_PLATFORMS) {
  const extra = EXTRA_ACTIONS[_platform.key];
  if (extra) _platform.actions.push(...extra);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function getPlatform(key: string | null | undefined): SocialPlatform | undefined {
  return SOCIAL_PLATFORMS.find((p) => p.key === key);
}

// -----------------------------------------------------------------------------
// Platform categories — group the flat platform list for the picker UI.
// -----------------------------------------------------------------------------

export interface PlatformGroup {
  key: string;
  label: string;
  platforms: SocialPlatform[];
}

const PLATFORM_CATEGORY_MAP: { key: string; label: string; keys: string[] }[] = [
  {
    key: "social",
    label: "Social Media",
    keys: [
      "FACEBOOK", "FB_GROUP", "TWITTER", "YOUTUBE", "INSTAGRAM", "TIKTOK",
      "PINTEREST", "LINKEDIN", "THREADS", "DISCORD", "TELEGRAM", "REDDIT",
      "QUORA", "SNAPCHAT", "WHATSAPP", "TWITCH", "KICK", "BLUESKY",
      "MASTODON", "MEDIUM",
    ],
  },
  {
    key: "music",
    label: "Music",
    keys: [
      "SPOTIFY", "SOUNDCLOUD", "APPLE_MUSIC", "AMAZON_MUSIC", "TIDAL",
      "DEEZER", "BANDCAMP",
    ],
  },
  {
    key: "reviews",
    label: "Reviews",
    keys: [
      "GOOGLE_REVIEWS", "TRUSTPILOT", "GOOGLE_MAPS", "YELP", "TRIPADVISOR",
      "BBB", "G2", "CAPTERRA", "SITEJABBER", "GLASSDOOR", "FACEBOOK_REVIEWS",
      "APP_STORE", "PLAY_STORE",
    ],
  },
  { key: "other", label: "Other", keys: ["WEBSITE"] },
];

/**
 * Platforms grouped into Social Media / Music / Reviews / Other for the picker.
 * Any platform not explicitly categorised is appended to "Other" so nothing
 * silently disappears when a new platform is added to the taxonomy.
 */
export function getPlatformGroups(): PlatformGroup[] {
  const assigned = new Set<string>();
  const groups: PlatformGroup[] = PLATFORM_CATEGORY_MAP.map((c) => {
    const platforms = c.keys
      .map((k) => SOCIAL_PLATFORMS.find((p) => p.key === k))
      .filter((p): p is SocialPlatform => !!p);
    platforms.forEach((p) => assigned.add(p.key));
    return { key: c.key, label: c.label, platforms };
  });
  const leftovers = SOCIAL_PLATFORMS.filter((p) => !assigned.has(p.key));
  if (leftovers.length) {
    const other = groups.find((g) => g.key === "other");
    if (other) other.platforms.push(...leftovers);
    else groups.push({ key: "other", label: "Other", platforms: leftovers });
  }
  return groups.filter((g) => g.platforms.length > 0);
}

export function getAction(
  platformKey: string | null | undefined,
  actionKey: string | null | undefined
): SocialAction | undefined {
  const platform = getPlatform(platformKey);
  if (!platform) return undefined;
  return platform.actions.find((a) => a.key === actionKey);
}

/** Get a fresh empty SocialConfig for a new task */
export function emptySocialConfig(): SocialConfig {
  return {
    platform: null,
    action: null,
    fields: {},
    aiPromptEnabled: false,
    aiPrompt: null,
    proofRequirements: { url: true, screenshot: true, username: false },
  };
}

/**
 * Persisted shape stored in Task.socialConfig (JSON).
 * Keep this stable — read from user-side and admin-side.
 */
export interface SocialConfig {
  platform: string | null;
  action: string | null;
  /** Values for adminFields, keyed by field.key */
  fields: Record<string, string>;
  /** When true, AI-generatable admin fields are replaced by `aiPrompt` */
  aiPromptEnabled: boolean;
  aiPrompt: string | null;
  /** Computed/overridden proof requirements (from action def or admin override) */
  proofRequirements: {
    url: boolean;
    screenshot: boolean;
    username: boolean;
  };
}

/** Common proof-type label used across the user-side UI */
export type ProofType = "URL" | "SCREENSHOT" | "BOTH" | "USERNAME";

export function deriveProofType(cfg: SocialConfig): ProofType {
  const { url, screenshot, username } = cfg.proofRequirements;
  if (username) return "USERNAME";
  if (url && screenshot) return "BOTH";
  if (url) return "URL";
  if (screenshot) return "SCREENSHOT";
  return "BOTH";
}

// =============================================================================
// BUNDLE MODEL (v2) — one task = one platform + an ordered bundle of actions
// -----------------------------------------------------------------------------
// The persisted shape moved from a single-action `SocialConfig` to
// `SocialBundleConfig`. Old single-action tasks are read lazily via
// `normalizeSocialConfig` (wrapped as a 1-item bundle) so nothing needs a
// backfill. `Task.pointsReward` stays the authoritative total (= Σ item points).
// =============================================================================

export interface ProofRequirements {
  url: boolean;
  screenshot: boolean;
  username: boolean;
}

/** One chosen action inside a bundle, with its own points + proof + fields. */
export interface BundleItem {
  action: string;
  /** Admin-filled values for the action's adminFields, keyed by field.key */
  fields: Record<string, string>;
  /** Per-item points (display / breakdown). Task total = Σ of these. */
  points: number;
  proofRequirements: ProofRequirements;
  aiPromptEnabled: boolean;
  aiPrompt: string | null;
  /** Minimum watch seconds for a watch/stream action. Drives BOTH the client
   *  watch-lock player AND the server watch target (see socialWatchTargetSeconds
   *  + the /heartbeat and submit routes) — a submission can't pass without the
   *  server accruing this much real foreground playback. 0/undefined = no gate. */
  watchSeconds?: number;
  /** Server-side auto-verification method for this action (anti-fake proof):
   *  - "CODE": user must include their unique code in the published content; the
   *    server fetches the proof URL and confirms it.
   *  - "TELEGRAM_MEMBER" / "DISCORD_MEMBER": a bot confirms the user joined.
   *  undefined = no auto-verify (manual proof review, the default). */
  verify?: "CODE" | "TELEGRAM_MEMBER" | "DISCORD_MEMBER";
}

/** Auto-verification methods a bundle item can use. */
export type VerifyMethod = "CODE" | "TELEGRAM_MEMBER" | "DISCORD_MEMBER";
const VERIFY_METHODS: VerifyMethod[] = [
  "CODE",
  "TELEGRAM_MEMBER",
  "DISCORD_MEMBER",
];

/** Persisted shape stored in Task.socialConfig (JSON), v2. */
export interface SocialBundleConfig {
  platform: string | null;
  items: BundleItem[];
  version: 2;
  /** When true the user must complete each action before the next unlocks. */
  sequential?: boolean;
}

const DEFAULT_PROOF: ProofRequirements = {
  url: true,
  screenshot: true,
  username: false,
};

function coerceProofRequirements(raw: unknown): ProofRequirements {
  const r = (raw ?? {}) as Partial<ProofRequirements>;
  return {
    url: !!r.url,
    screenshot: !!r.screenshot,
    username: !!r.username,
  };
}

function coerceBundleItem(raw: unknown): BundleItem | null {
  const r = (raw ?? {}) as Partial<BundleItem>;
  if (!r.action || typeof r.action !== "string") return null;
  const pts = Number(r.points);
  return {
    action: r.action,
    fields:
      r.fields && typeof r.fields === "object"
        ? (r.fields as Record<string, string>)
        : {},
    points: Number.isFinite(pts) && pts > 0 ? pts : 0,
    proofRequirements: r.proofRequirements
      ? coerceProofRequirements(r.proofRequirements)
      : { ...DEFAULT_PROOF },
    aiPromptEnabled: !!r.aiPromptEnabled,
    aiPrompt: typeof r.aiPrompt === "string" ? r.aiPrompt : null,
    watchSeconds:
      typeof r.watchSeconds === "number" && Number.isFinite(r.watchSeconds)
        ? r.watchSeconds
        : undefined,
    verify:
      typeof r.verify === "string" &&
      VERIFY_METHODS.includes(r.verify as VerifyMethod)
        ? (r.verify as VerifyMethod)
        : undefined,
  };
}

/**
 * Read ANY stored socialConfig (null / legacy v1 single-action / v2 bundle /
 * garbage) into a normalized bundle. Never throws. Used by every read path so
 * legacy tasks and in-flight submissions keep working.
 */
export function normalizeSocialConfig(
  raw: unknown
): { platform: string | null; items: BundleItem[]; sequential: boolean } {
  if (!raw || typeof raw !== "object")
    return { platform: null, items: [], sequential: false };
  const cfg = raw as Record<string, unknown>;
  const sequential = cfg.sequential === true;

  // v2 bundle
  if (Array.isArray(cfg.items)) {
    const items = cfg.items
      .map(coerceBundleItem)
      .filter((i): i is BundleItem => i !== null);
    return {
      platform: typeof cfg.platform === "string" ? cfg.platform : null,
      items,
      sequential,
    };
  }

  // legacy v1 single-action → wrap as a 1-item bundle
  if (typeof cfg.action === "string" && cfg.action) {
    return {
      platform: typeof cfg.platform === "string" ? cfg.platform : null,
      items: [
        {
          action: cfg.action,
          fields:
            cfg.fields && typeof cfg.fields === "object"
              ? (cfg.fields as Record<string, string>)
              : {},
          // v1 points lived on Task.pointsReward, not in the config.
          points: 0,
          proofRequirements: coerceProofRequirements(cfg.proofRequirements),
          aiPromptEnabled: !!cfg.aiPromptEnabled,
          aiPrompt: typeof cfg.aiPrompt === "string" ? cfg.aiPrompt : null,
        },
      ],
      sequential,
    };
  }

  return {
    platform: typeof cfg.platform === "string" ? cfg.platform : null,
    items: [],
    sequential,
  };
}

/** A fresh empty bundle config for a new task. */
export function emptyBundleConfig(): SocialBundleConfig {
  return { platform: null, items: [], version: 2, sequential: false };
}

// -----------------------------------------------------------------------------
// Task row → normalized view shape (shared by the list API + the run page).
// -----------------------------------------------------------------------------

export interface SocialTaskItemView {
  action: string;
  fields: Record<string, string>;
  points: number;
  proofRequirements: ProofRequirements;
  aiPromptEnabled: boolean;
  aiPrompt: string | null;
  watchSeconds: number | null;
  targetUrl: string;
  verify?: VerifyMethod;
}

export interface SocialTaskView {
  id: string;
  title: string;
  description: string;
  pointsReward: number;
  difficulty: string;
  platform: string;
  action: string;
  targetUrl: string;
  items: SocialTaskItemView[];
  /** When true actions unlock one-by-one (each done before the next). */
  sequential: boolean;
  instructions: string | null;
  instructionVideoUrl: string | null;
}

export interface SocialTaskRow {
  id: string;
  title: string;
  description: string | null;
  pointsReward: number;
  difficulty: string | null;
  socialPlatform: string | null;
  socialAction: string | null;
  socialUrl: string | null;
  socialConfig: unknown;
  instructions: string | null;
  instructionVideoUrl: string | null;
}

/**
 * Normalize a raw Task row (any stored socialConfig) into the ordered-bundle
 * view the UI renders. Used by both the social list endpoint and the single
 * task run page so they stay in sync.
 */
export function mapSocialTaskRow(t: SocialTaskRow): SocialTaskView {
  const norm = normalizeSocialConfig(t.socialConfig);
  const platform = (norm.platform ?? t.socialPlatform ?? "FACEBOOK").toUpperCase();
  const items: SocialTaskItemView[] = norm.items.map((it) => ({
    action: (it.action ?? "FOLLOW").toUpperCase(),
    fields: it.fields ?? {},
    points: it.points ?? 0,
    proofRequirements: it.proofRequirements ?? {
      url: true,
      screenshot: true,
      username: false,
    },
    aiPromptEnabled: it.aiPromptEnabled ?? false,
    aiPrompt: it.aiPrompt ?? null,
    watchSeconds: it.watchSeconds ?? null,
    targetUrl: it.fields?.targetUrl ?? it.fields?.targetHandle ?? "",
    verify: it.verify,
  }));
  const first = items[0];
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    pointsReward: t.pointsReward,
    difficulty: t.difficulty ?? "",
    platform,
    action: first?.action ?? (t.socialAction ?? "FOLLOW").toUpperCase(),
    targetUrl: first?.targetUrl ?? t.socialUrl ?? "",
    items,
    sequential: norm.sequential,
    instructions: t.instructions,
    instructionVideoUrl: t.instructionVideoUrl,
  };
}

// -----------------------------------------------------------------------------
// Natural-flow ordering: watch → like → save → comment → share → follow → create
// -----------------------------------------------------------------------------

const ACTION_TIER: Record<string, number> = {
  // 10 — passive consume (must be first)
  WATCH_VIDEO: 10,
  VIEW_STORY: 10,
  LISTEN_FULL: 10,
  VISIT_PAGE: 10,
  SCROLL_END: 10,
  // 20 — quick reactions
  LIKE_PAGE: 20,
  LIKE_POST: 20,
  LIKE_TWEET: 20,
  LIKE_VIDEO: 20,
  LIKE_PIN: 20,
  LIKE_TRACK: 20,
  UPVOTE_POST: 20,
  REACT_TO_MESSAGE: 20,
  VOTE_IN_POLL: 20,
  RATE: 20,
  MARK_HELPFUL: 20,
  // 30 — save / add / collect
  SAVE_PIN: 30,
  ADD_TO_PLAYLIST: 30,
  FOLLOW_PLAYLIST: 30,
  FOLLOW_BOARD: 30,
  SAVE_ITEM: 30,
  // 40 — text engagement
  COMMENT_POST: 40,
  COMMENT_VIDEO: 40,
  COMMENT_PIN: 40,
  COMMENT_IN_GROUP: 40,
  COMMENT: 40,
  REPLY: 40,
  // 50 — sharing
  SHARE_POST: 50,
  SHARE_VIDEO: 50,
  SHARE_TO_STORY: 50,
  RETWEET: 50,
  QUOTE_TWEET: 50,
  REPOST: 50,
  REPIN: 50,
  FORWARD_MESSAGE: 50,
  SHARE_LINK: 50,
  // 60 — follow / join / connect
  FOLLOW: 60,
  FOLLOW_PAGE: 60,
  FOLLOW_PROFILE: 60,
  FOLLOW_COMPANY: 60,
  FOLLOW_ARTIST: 60,
  SUBSCRIBE: 60,
  SUBSCRIBE_PUBLIC: 60,
  CONNECT: 60,
  ADD_FRIEND: 60,
  JOIN_GROUP: 60,
  JOIN_SERVER: 60,
  JOIN_CHANNEL: 60,
  JOIN_SUBREDDIT: 60,
  SUBSCRIBE_NEWSLETTER: 60,
  CHECK_IN: 60,
  // 75 — review-flow enrichment (rating → written review → photo/verify/recommend)
  UPLOAD_PHOTO: 75,
  ANSWER_QA: 75,
  VERIFY: 75,
  RECOMMEND: 75,
  APPROVE_CEO: 75,
  // 80 — heavy creation (last)
  CREATE_POST: 80,
  POST_PHOTO: 80,
  POST_REEL: 80,
  POST_STORY: 80,
  POST_TWEET: 80,
  POST_VIDEO: 80,
  POST_THREAD: 80,
  POST_ARTICLE: 80,
  POST_IN_GROUP: 80,
  POST_IN_CHANNEL: 80,
  SUBMIT_POST: 80,
  CREATE_PIN: 80,
  DUET_OR_STITCH: 80,
  WRITE_REVIEW: 80,
  PROS_REVIEW: 80,
  CONS_REVIEW: 80,
  WRITE_ANSWER: 80,
  BUY_TRACK: 80,
  // 95 — keep-alive commitments (always last)
  KEEP_POST_LIVE: 95,
  KEEP_VIDEO_LIVE: 95,
  // catalog-enrichment additions
  WATCH_REEL: 10,
  SAVE_POST: 30,
  SAVE_TO_FAVORITES: 30,
  BOOKMARK_TWEET: 30,
  CROSS_POST_PAGES: 50,
  CROSS_POST: 50,
  REPOST_TO_FEED: 50,
  TURN_ON_BELL: 60,
  FOLLOW_USER: 60,
  CREATE_STORY: 80,
  CREATE_SHORT: 80,
  CREATE_COMMUNITY_POST: 80,
  CREATE_THREAD: 80,
  CREATE_BOARD: 80,
  PIN_TO_MULTI: 80,
  GIVE_AWARD: 80,
  // new-platform additions (WhatsApp, Twitch, Kick, Bluesky, Mastodon, Medium)
  WATCH_STREAM: 10,
  REACT_TO_STATUS: 20,
  FAVOURITE: 20,
  CLAP: 20,
  BOOST: 50,
  FOLLOW_CHANNEL: 60,
  RESPOND: 40,
};

/** Natural-flow tier for an action key (lower = earlier). Unknown → 90. */
export function actionPriority(actionKey: string): number {
  return ACTION_TIER[actionKey] ?? 90;
}

/** Watch/stream actions that can use a timed-lock player (see SocialWatchModal). */
const WATCH_ACTIONS = new Set([
  "WATCH_VIDEO",
  "LISTEN_FULL",
  "WATCH_REEL",
  "WATCH_STREAM",
]);

/** True if the action is a passive watch/stream type (eligible for a watch timer). */
export function isWatchAction(actionKey: string | null | undefined): boolean {
  return !!actionKey && WATCH_ACTIONS.has(actionKey);
}

/**
 * Total server-enforced watch seconds for a SOCIAL task = Σ of the watchSeconds
 * on every locked watch item (watchSeconds > 0). This is the target the server
 * heartbeat accrues toward and the submit route gates on, so the client's
 * `watched: true` flag can't be forged. 0 → the task has no watch gate.
 */
export function socialWatchTargetSeconds(rawSocialConfig: unknown): number {
  const { items } = normalizeSocialConfig(rawSocialConfig);
  return items.reduce((sum, it) => {
    const s = it.watchSeconds ?? 0;
    return isWatchAction(it.action) && s > 0 ? sum + s : sum;
  }, 0);
}

/** Actions whose target is a specific VIDEO (playable in-app), not a channel. */
const VIDEO_URL_ACTIONS = new Set([
  ...WATCH_ACTIONS,
  "LIKE_VIDEO",
  "COMMENT_VIDEO",
  "SHARE_VIDEO",
]);

/**
 * The single video to play "first" for a YouTube/video SOCIAL task: prefer an
 * enforced watch action (watchSeconds > 0), then any watch action, then a
 * like/comment/share-video action's URL (optional watch, watchSeconds 0).
 * Returns null when the task has no playable video (e.g. subscribe-only).
 */
export function primarySocialVideo(
  items: SocialTaskItemView[]
): { url: string; watchSeconds: number; itemIndex: number } | null {
  let idx = items.findIndex(
    (it) => isWatchAction(it.action) && (it.watchSeconds ?? 0) > 0 && it.targetUrl
  );
  if (idx < 0) idx = items.findIndex((it) => isWatchAction(it.action) && it.targetUrl);
  if (idx < 0)
    idx = items.findIndex((it) => VIDEO_URL_ACTIONS.has(it.action) && it.targetUrl);
  if (idx < 0) return null;
  const it = items[idx];
  return {
    url: it.targetUrl,
    watchSeconds: isWatchAction(it.action) ? it.watchSeconds ?? 0 : 0,
    itemIndex: idx,
  };
}

/** Sort bundle items into the natural worker flow (stable within a tier). */
export function sortBundleItems(items: BundleItem[]): BundleItem[] {
  return [...items].sort(
    (a, b) => actionPriority(a.action) - actionPriority(b.action)
  );
}

/** Task-total points = Σ item points, floored at 0. */
export function bundleTotalPoints(items: BundleItem[]): number {
  const sum = items.reduce((acc, i) => acc + (Number(i.points) || 0), 0);
  return sum > 0 ? Math.round(sum) : 0;
}

export interface BundleValidationResult {
  ok: boolean;
  error?: string;
  /** Per-item errors keyed by item index. */
  itemErrors?: Record<number, string>;
}

/**
 * Validate a bundle: platform set, ≥1 item, each action resolves, required
 * adminFields filled (skipping AI-generatable ones when AI mode is on for the
 * item), points ≥ 0. Proof requirements are optional (may be none).
 */
export function validateSocialBundle(cfg: {
  platform: string | null;
  items: BundleItem[];
  sequential?: boolean;
}): BundleValidationResult {
  if (!cfg.platform) return { ok: false, error: "Pick a platform." };
  if (!getPlatform(cfg.platform)) {
    return { ok: false, error: "Unknown platform." };
  }
  if (!cfg.items.length) {
    return { ok: false, error: "Add at least one action to the bundle." };
  }
  const itemErrors: Record<number, string> = {};
  cfg.items.forEach((item, idx) => {
    const def = getAction(cfg.platform, item.action);
    if (!def) {
      itemErrors[idx] = `Unknown action "${item.action}".`;
      return;
    }
    if (!(item.points >= 0) || !Number.isFinite(item.points)) {
      itemErrors[idx] = "Points must be 0 or more.";
      return;
    }
    // Proof is optional — an action may require none (e.g. WATCH actions are
    // verified by the locked player, not by uploaded proof).
    // When "users AI-generate their own" is on, the content field becomes an
    // optional reference (users can generate purely from the task), so don't
    // require it — regardless of whether the admin added extra AI guidance.
    const aiOn = item.aiPromptEnabled;
    const missing = def.adminFields.find((f) => {
      if (!f.required) return false;
      if (aiOn && def.aiGeneratableFields?.includes(f.key)) return false;
      return !(item.fields[f.key] ?? "").trim();
    });
    if (missing) {
      itemErrors[idx] = `Fill "${missing.label}" for ${def.label}.`;
    }
  });
  if (Object.keys(itemErrors).length) {
    const first = itemErrors[Number(Object.keys(itemErrors)[0])];
    return { ok: false, error: first, itemErrors };
  }
  return { ok: true };
}
