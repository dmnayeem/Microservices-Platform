-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'TUTOR', 'SUPER_ADMIN', 'FINANCE_ADMIN', 'CONTENT_ADMIN', 'SUPPORT_ADMIN', 'MARKETING_ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('VIDEO', 'ARTICLE', 'QUIZ', 'SURVEY', 'SOCIAL', 'PROXY', 'OFFERWALL', 'CUSTOM', 'APPINSTALL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED', 'PENDING_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED', 'REVISION_REQUESTED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EARNING', 'WITHDRAWAL', 'BONUS', 'REFERRAL', 'PURCHASE', 'REFUND', 'PENALTY', 'GIFT', 'LOTTERY_WIN', 'CHECKIN', 'COURSE_PURCHASE', 'COURSE_TUTOR_EARNING', 'COURSE_REFUND', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "ReferralSourceType" AS ENUM ('TASK', 'PURCHASE', 'SUBSCRIPTION', 'COURSE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BKASH', 'NAGAD', 'ROCKET', 'BINANCE', 'PAYPAL');

-- CreateEnum
CREATE TYPE "TaskDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BannerLocation" AS ENUM ('HOME', 'EARN_HUB', 'MARKETPLACE', 'DASHBOARD', 'ALL');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MarketplaceBidStatus" AS ENUM ('ACTIVE', 'OUTBID', 'WON', 'LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketplaceOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseSkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS');

-- CreateEnum
CREATE TYPE "CourseLessonType" AS ENUM ('VIDEO', 'ARTICLE', 'QUIZ', 'ASSIGNMENT', 'LIVE', 'RESOURCE');

-- CreateEnum
CREATE TYPE "QuizQuestionType" AS ENUM ('MCQ', 'TRUE_FALSE', 'MULTI_SELECT');

-- CreateEnum
CREATE TYPE "AssignmentSubmissionStatus" AS ENUM ('PENDING', 'GRADED', 'RESUBMIT');

-- CreateEnum
CREATE TYPE "LiveClassStatus" AS ENUM ('UPCOMING', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CourseRefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('ALL', 'CATEGORY', 'SPECIFIC_COURSES');

-- CreateEnum
CREATE TYPE "TutorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LotteryStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'TASK', 'WALLET', 'REFERRAL', 'PROMOTION', 'ACHIEVEMENT', 'LOTTERY', 'SOCIAL', 'COURSE');

-- CreateEnum
CREATE TYPE "KYCAppealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FLAT_RATE');

-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('ITEM_NOT_RECEIVED', 'ITEM_NOT_AS_DESCRIBED', 'PAYMENT_ISSUE', 'SELLER_UNRESPONSIVE', 'BUYER_UNRESPONSIVE', 'QUALITY_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaFileType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'OTHER');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "iconUrl" TEXT NOT NULL,
    "embedUrl" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "playsCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "iconEmoji" TEXT,
    "bgGradient" TEXT,
    "linkUrl" TEXT,
    "location" "BannerLocation" NOT NULL DEFAULT 'HOME',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "bgGradient" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'ALL',
    "targetValue" TEXT,
    "budget" DECIMAL(18,6),
    "bannerImage" TEXT,
    "termsAndConditions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "rewardsDistributed" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "pointsReward" INTEGER NOT NULL DEFAULT 0,
    "cashReward" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "duration" TEXT NOT NULL DEFAULT 'DAILY',
    "autoRefresh" BOOLEAN NOT NULL DEFAULT true,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMissionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiredAccessLevel" INTEGER NOT NULL DEFAULT 0,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "completionXpReward" INTEGER NOT NULL DEFAULT 0,
    "completionPointsReward" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoRefresh" BOOLEAN NOT NULL DEFAULT true,
    "linkReferralBonus" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyMissionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMissionItem" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "description" TEXT,
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "xpPerComplete" INTEGER NOT NULL DEFAULT 0,
    "pointsPerComplete" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,
    "requiredLevel" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyMissionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMissionClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 1,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyMissionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReferralClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "points" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReferralClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "budget" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPlacement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdNetwork" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "initScript" TEXT,
    "isEnabledWeb" BOOLEAN NOT NULL DEFAULT true,
    "isEnabledMobile" BOOLEAN NOT NULL DEFAULT true,
    "globalWeight" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LOCAL',
    "format" TEXT NOT NULL DEFAULT 'BANNER',
    "contentUrl" TEXT,
    "videoUrl" TEXT,
    "targetUrl" TEXT,
    "htmlContent" TEXT,
    "size" TEXT DEFAULT 'responsive',
    "width" INTEGER,
    "height" INTEGER,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "submittedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "headline" TEXT,
    "brandName" TEXT,
    "brandLogo" TEXT,
    "ctaLabel" TEXT,
    "promotedPostId" TEXT,
    "targeting" JSONB,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "rewardCooldownSec" INTEGER NOT NULL DEFAULT 3600,
    "watchSeconds" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdDailyStat" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spendUsd" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "AdDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "rewardedPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gatewayRef" TEXT,
    "txnId" TEXT,
    "proofUrl" TEXT,
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" "FraudSeverity" NOT NULL DEFAULT 'MEDIUM',
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolverNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProxyServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'HTTPS',
    "country" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "loadPercent" INTEGER NOT NULL DEFAULT 0,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 50,
    "bandwidthMbUser" INTEGER NOT NULL DEFAULT 100,
    "responseTimeMs" INTEGER,
    "lastHealthCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferwallCallback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerwallId" TEXT NOT NULL,
    "offerId" TEXT,
    "offerName" TEXT,
    "transactionId" TEXT NOT NULL,
    "payoutAmount" DECIMAL(18,6) NOT NULL,
    "userPayout" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fraudScore" INTEGER NOT NULL DEFAULT 0,
    "fraudReasons" TEXT[],
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "countryCode" TEXT,
    "deviceType" TEXT,
    "rawPayload" JSONB,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "rejectionReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferwallCallback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskBoard" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "iconEmoji" TEXT,
    "imageUrl" TEXT,
    "category" TEXT,
    "expiresAt" TIMESTAMP(3),
    "pointsReward" INTEGER NOT NULL DEFAULT 0,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "unlockBoardId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "taskCount" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionId" TEXT,

    CONSTRAINT "BoardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialReport" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "resolverNote" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "difficulty" "TaskDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
    "timeLimitSec" INTEGER NOT NULL DEFAULT 180,
    "passingScore" INTEGER NOT NULL DEFAULT 60,
    "pointsReward" INTEGER NOT NULL DEFAULT 50,
    "xpReward" INTEGER NOT NULL DEFAULT 25,
    "cashReward" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "cooldownHours" INTEGER NOT NULL DEFAULT 24,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "requiredAccessLevel" INTEGER,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiPrompt" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "question" TEXT NOT NULL,
    "questionImageUrl" TEXT,
    "options" TEXT[],
    "optionImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "pointsValue" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "answers" JSONB NOT NULL,
    "timeTakenSec" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "phone" TEXT,
    "phoneVerified" TIMESTAMP(3),
    "password" TEXT,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "avatar" TEXT,
    "coverPhoto" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "timezone" TEXT DEFAULT 'UTC',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "cashBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalEarnings" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalWithdrawals" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastCheckIn" TIMESTAMP(3),
    "packageId" TEXT,
    "packageExpiresAt" TIMESTAMP(3),
    "kycStatus" "KYCStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "kycSubmittedAt" TIMESTAMP(3),
    "kycApprovedAt" TIMESTAMP(3),
    "kycPromptedAt" TIMESTAMP(3),
    "featureOverrides" JSONB,
    "isBlueVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBadgeStyle" TEXT DEFAULT 'BLUE',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "referralCode" TEXT NOT NULL,
    "referredById" TEXT,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nidNumber" TEXT,
    "profession" TEXT,
    "maritalStatus" TEXT,
    "studyLevel" TEXT,
    "nationality" TEXT,
    "bloodGroup" TEXT,
    "secondaryEmail" TEXT,
    "secondaryPhone" TEXT,
    "street" TEXT,
    "village" TEXT,
    "city" TEXT,
    "subDistrict" TEXT,
    "district" TEXT,
    "subDivision" TEXT,
    "division" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "themeAccent" TEXT DEFAULT 'indigo',
    "language" TEXT NOT NULL DEFAULT 'en',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "privacyAvatar" TEXT NOT NULL DEFAULT 'PUBLIC',
    "privacyBio" TEXT NOT NULL DEFAULT 'PUBLIC',
    "privacyStats" TEXT NOT NULL DEFAULT 'PUBLIC',
    "privacyEarnings" TEXT NOT NULL DEFAULT 'PRIVATE',
    "privacyLocation" TEXT NOT NULL DEFAULT 'FRIENDS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "followingCount" INTEGER NOT NULL DEFAULT 0,
    "displayFollowersBoost" INTEGER NOT NULL DEFAULT 0,
    "displayFollowingBoost" INTEGER NOT NULL DEFAULT 0,
    "displayPostsBoost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "url" TEXT,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "postsCount" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EMAIL'
);

-- CreateTable
CREATE TABLE "KYCDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "status" "KYCStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "extracted" JSONB,
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KYCDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KYCAppeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kycDocumentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT[],
    "status" "KYCAppealStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KYCAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT,
    "instructionVideoUrl" TEXT,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "difficulty" "TaskDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "pointsReward" INTEGER NOT NULL,
    "cashReward" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "isBoardOnly" BOOLEAN NOT NULL DEFAULT false,
    "boardId" TEXT,
    "dailyLimit" INTEGER,
    "totalLimit" INTEGER,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "minLevel" INTEGER NOT NULL DEFAULT 1,
    "requiredAccessLevel" INTEGER NOT NULL DEFAULT 0,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentUrl" TEXT,
    "thumbnailUrl" TEXT,
    "duration" INTEGER,
    "questions" JSONB,
    "socialPlatform" TEXT,
    "socialAction" TEXT,
    "socialUrl" TEXT,
    "socialConfig" JSONB,
    "articleConfig" JSONB,
    "videoConfig" JSONB,
    "surveyConfig" JSONB,
    "customConfig" JSONB,
    "appInstallConfig" JSONB,
    "proxyInstructions" TEXT,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 0,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "fundedByUserId" TEXT,
    "budgetPoints" INTEGER NOT NULL DEFAULT 0,
    "remainingBudget" INTEGER NOT NULL DEFAULT 0,
    "rejectionReason" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "proof" TEXT,
    "proofImages" TEXT[],
    "answers" JSONB,
    "score" INTEGER,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "pointsEarned" INTEGER,
    "xpEarned" INTEGER,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastBeatAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTaskKey" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "keyValue" TEXT NOT NULL,
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "submissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleTaskKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTaskPageProgress" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "popupsCompleted" INTEGER NOT NULL DEFAULT 0,
    "pageCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleTaskPageProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "points" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "description" TEXT,
    "reference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "fee" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,6) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "accountDetails" JSONB NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "accessLevel" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "priceMonthly" DECIMAL(18,6) NOT NULL,
    "priceYearly" DECIMAL(18,6),
    "validityDays" INTEGER,
    "tasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "socialFeedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "referralsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "withdrawalsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "marketplaceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "boostEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyMissionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lotteryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "coursesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "advertiserEnabled" BOOLEAN NOT NULL DEFAULT true,
    "gamesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adFree" BOOLEAN NOT NULL DEFAULT false,
    "createTasksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sellCoursesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sellMarketplaceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "agencyModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "socialTasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "proxyTasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "articleTasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "videoTasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quizTasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "surveyTasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "offerwallTasksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "appInstallEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyTaskLimit" INTEGER NOT NULL DEFAULT -1,
    "dailyPostLimit" INTEGER NOT NULL DEFAULT -1,
    "withdrawalFeeDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minWithdrawal" DECIMAL(18,6) NOT NULL,
    "socialEarningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "socialEarningConfig" JSONB,
    "xpMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "taskRewardMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "socialEarningMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "dailyReferralPoints" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "referralCommissionLevels" INTEGER NOT NULL DEFAULT 0,
    "features" TEXT[],
    "badgeColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "transactionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralLevel" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "commissionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionRate" DOUBLE PRECISION,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEarning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "sourceType" "ReferralSourceType" NOT NULL,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'DIGITAL_PRODUCT',
    "subType" TEXT,
    "details" JSONB,
    "price" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "images" TEXT[],
    "screenshots" TEXT[],
    "attachments" TEXT[],
    "files" TEXT[],
    "richDescription" TEXT,
    "monthlyRevenue" DECIMAL(18,6),
    "monthlyProfit" DECIMAL(18,6),
    "monthlyExpenses" DECIMAL(18,6),
    "monthlyTraffic" INTEGER,
    "assetAgeMonths" INTEGER,
    "niche" TEXT,
    "reasonsForSelling" TEXT,
    "whatsIncluded" TEXT,
    "whatsNotIncluded" TEXT,
    "verifiedMetrics" BOOLEAN NOT NULL DEFAULT false,
    "nsfw" BOOLEAN NOT NULL DEFAULT false,
    "ndaGated" BOOLEAN NOT NULL DEFAULT false,
    "auctionMode" BOOLEAN NOT NULL DEFAULT false,
    "startingBid" DECIMAL(18,6),
    "reservePrice" DECIMAL(18,6),
    "buyNowPrice" DECIMAL(18,6),
    "auctionEndsAt" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMP(3),
    "isPromoted" BOOLEAN NOT NULL DEFAULT false,
    "promotedUntil" TIMESTAMP(3),
    "commissionRateBps" INTEGER,
    "bidsCount" INTEGER NOT NULL DEFAULT 0,
    "bidderCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueViewers" INTEGER NOT NULL DEFAULT 0,
    "directPurchasesCount" INTEGER NOT NULL DEFAULT 0,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePurchase" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "fee" DECIMAL(18,6) NOT NULL,
    "sellerAmount" DECIMAL(18,6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplacePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingView" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionHash" TEXT NOT NULL,
    "source" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceListingView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceBid" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "status" "MarketplaceBidStatus" NOT NULL DEFAULT 'ACTIVE',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOffer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "message" TEXT,
    "status" "MarketplaceOfferStatus" NOT NULL DEFAULT 'PENDING',
    "counterAmount" DECIMAL(18,6),
    "counterMessage" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "subtitle" TEXT,
    "description" TEXT NOT NULL,
    "thumbnail" TEXT,
    "bannerUrl" TEXT,
    "promoVideoUrl" TEXT,
    "category" TEXT NOT NULL,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'BEGINNER',
    "skillLevel" "CourseSkillLevel" NOT NULL DEFAULT 'BEGINNER',
    "language" TEXT NOT NULL DEFAULT 'en',
    "price" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "originalPrice" DECIMAL(18,6),
    "discountPrice" DECIMAL(18,6),
    "discountEndsAt" TIMESTAMP(3),
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "totalLessons" INTEGER NOT NULL DEFAULT 0,
    "totalDuration" INTEGER NOT NULL DEFAULT 0,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "enrollmentCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRatings" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "totalRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "uniqueViewers" INTEGER NOT NULL DEFAULT 0,
    "learningOutcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whatsIncluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "faqs" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tutorId" TEXT,
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
    "commissionRateBps" INTEGER,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMP(3),
    "isPromoted" BOOLEAN NOT NULL DEFAULT false,
    "promotedUntil" TIMESTAMP(3),
    "nsfw" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "lastContentUpdate" TIMESTAMP(3),

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSubcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseLesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "videoUrl" TEXT,
    "subtitlesUrl" TEXT,
    "transcript" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "lessonType" "CourseLessonType" NOT NULL DEFAULT 'VIDEO',
    "resources" JSONB,
    "quizId" TEXT,
    "assignmentId" TEXT,
    "liveClassId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEnrollment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedLessons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedAt" TIMESTAMP(3),
    "pricePaid" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseLessonProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "lastPosition" INTEGER NOT NULL DEFAULT 0,
    "notes" JSONB,
    "bookmarks" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseLessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseReview" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "reportedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseQuestion" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lessonId" TEXT,
    "askerId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAnnouncement" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseQuiz" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "passMarkPercent" INTEGER NOT NULL DEFAULT 60,
    "timeLimitMinutes" INTEGER,
    "maxAttempts" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseQuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "type" "QuizQuestionType" NOT NULL DEFAULT 'MCQ',
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswers" JSONB NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseQuizAttempt" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "CourseQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAssignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueDays" INTEGER,
    "maxMarks" INTEGER NOT NULL DEFAULT 100,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAssignmentSubmission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "fileUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AssignmentSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "marks" INTEGER,
    "feedback" TEXT,
    "gradedById" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "CourseAssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseLiveClass" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "meetingUrl" TEXT NOT NULL,
    "meetingPassword" TEXT,
    "status" "LiveClassStatus" NOT NULL DEFAULT 'UPCOMING',
    "recordingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseLiveClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCertificate" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "sharedUrl" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL DEFAULT 'PERCENT',
    "value" DOUBLE PRECISION NOT NULL,
    "scope" "CouponScope" NOT NULL DEFAULT 'ALL',
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "courseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minPurchase" DECIMAL(18,6),
    "maxRedemptions" INTEGER,
    "redemptionsCount" INTEGER NOT NULL DEFAULT 0,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRefundRequest" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CourseRefundStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "refundedAmount" DECIMAL(18,6),
    "processedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "CourseRefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseListingView" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionHash" TEXT NOT NULL,
    "source" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseListingView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sampleOutline" TEXT,
    "portfolioUrl" TEXT,
    "idDocumentUrl" TEXT,
    "status" "TutorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "TutorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT NOT NULL,
    "expertise" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatarUrl" TEXT,
    "websiteUrl" TEXT,
    "twitterUrl" TEXT,
    "linkedinUrl" TEXT,
    "youtubeUrl" TEXT,
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "totalCourses" INTEGER NOT NULL DEFAULT 0,
    "totalRatings" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEarningsCents" INTEGER NOT NULL DEFAULT 0,
    "payoutMethod" TEXT,
    "payoutDetails" JSONB,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lottery" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "drawDate" TIMESTAMP(3) NOT NULL,
    "ticketPrice" INTEGER NOT NULL,
    "maxTickets" INTEGER,
    "ticketsSold" INTEGER NOT NULL DEFAULT 0,
    "maxTicketsPerUser" INTEGER NOT NULL DEFAULT 10,
    "prizes" JSONB NOT NULL,
    "status" "LotteryStatus" NOT NULL DEFAULT 'UPCOMING',
    "winningNumbers" TEXT,
    "winners" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lottery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryTicket" (
    "id" TEXT NOT NULL,
    "lotteryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "numbers" TEXT,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "prizeAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotteryTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[],
    "backgroundStyle" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "isAnnouncement" BOOLEAN NOT NULL DEFAULT false,
    "isPromoted" BOOLEAN NOT NULL DEFAULT false,
    "promotedUntil" TIMESTAMP(3),
    "promotedNote" VARCHAR(120),
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "sharesCount" INTEGER NOT NULL DEFAULT 0,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "socialEarnings" INTEGER NOT NULL DEFAULT 0,
    "pollOptions" JSONB,
    "pollEndsAt" TIMESTAMP(3),
    "donationGoal" INTEGER,
    "donationCollected" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boostBatchId" TEXT,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowerBoostBatch" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "mode" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "sourceUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyTarget" BOOLEAN NOT NULL DEFAULT false,
    "performedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "revertedAt" TIMESTAMP(3),
    "revertedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowerBoostBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostView" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "mentionedUserId" TEXT NOT NULL,
    "mentionedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostShare" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "postId" TEXT,
    "dateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageDaily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "GroupType" NOT NULL DEFAULT 'PUBLIC',
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "ownerId" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupJoinRequest" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "GroupJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "requirement" TEXT NOT NULL,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "type" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "pointsReward" INTEGER NOT NULL DEFAULT 0,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointGift" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointGift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadByUser1" INTEGER NOT NULL DEFAULT 0,
    "unreadByUser2" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "iso3" TEXT,
    "name" TEXT NOT NULL,
    "phoneCode" TEXT,
    "flag" TEXT,
    "currency" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabledLevels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "postalCode" TEXT,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferwallConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT,
    "secretKey" TEXT,
    "callbackUrl" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferwallConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAdConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "appId" TEXT,
    "adUnitId" TEXT,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAdConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceDispute" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "initiatorType" TEXT NOT NULL DEFAULT 'BUYER',
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT[],
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAmount" DECIMAL(18,6),
    "assignedAdminId" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeMessage" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL DEFAULT 'USER',
    "message" TEXT NOT NULL,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "fileType" "MediaFileType" NOT NULL DEFAULT 'IMAGE',
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "cloudFrontUrl" TEXT,
    "altText" TEXT,
    "caption" TEXT,
    "description" TEXT,
    "folder" TEXT NOT NULL DEFAULT '',
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TaskToTaskCategory" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskToTaskCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Game_isActive_idx" ON "Game"("isActive");

-- CreateIndex
CREATE INDEX "Game_order_idx" ON "Game"("order");

-- CreateIndex
CREATE INDEX "Banner_location_idx" ON "Banner"("location");

-- CreateIndex
CREATE INDEX "Banner_isActive_idx" ON "Banner"("isActive");

-- CreateIndex
CREATE INDEX "Banner_order_idx" ON "Banner"("order");

-- CreateIndex
CREATE INDEX "Banner_isActive_location_idx" ON "Banner"("isActive", "location");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_slug_key" ON "Offer"("slug");

-- CreateIndex
CREATE INDEX "Offer_slug_idx" ON "Offer"("slug");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_startDate_endDate_idx" ON "Campaign"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Mission_isActive_idx" ON "Mission"("isActive");

-- CreateIndex
CREATE INDEX "Mission_duration_idx" ON "Mission"("duration");

-- CreateIndex
CREATE INDEX "DailyMissionTemplate_requiredAccessLevel_idx" ON "DailyMissionTemplate"("requiredAccessLevel");

-- CreateIndex
CREATE INDEX "DailyMissionTemplate_isActive_idx" ON "DailyMissionTemplate"("isActive");

-- CreateIndex
CREATE INDEX "DailyMissionItem_missionId_idx" ON "DailyMissionItem"("missionId");

-- CreateIndex
CREATE INDEX "DailyMissionClaim_userId_date_idx" ON "DailyMissionClaim"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyMissionClaim_missionId_idx" ON "DailyMissionClaim"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMissionClaim_userId_missionId_date_key" ON "DailyMissionClaim"("userId", "missionId", "date");

-- CreateIndex
CREATE INDEX "DailyReferralClaim_userId_idx" ON "DailyReferralClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReferralClaim_userId_date_key" ON "DailyReferralClaim"("userId", "date");

-- CreateIndex
CREATE INDEX "AdCampaign_advertiserId_idx" ON "AdCampaign"("advertiserId");

-- CreateIndex
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");

-- CreateIndex
CREATE INDEX "AdCampaign_status_startAt_endAt_idx" ON "AdCampaign"("status", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdPlacement_name_key" ON "AdPlacement"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AdNetwork_providerKey_key" ON "AdNetwork"("providerKey");

-- CreateIndex
CREATE INDEX "Ad_campaignId_idx" ON "Ad"("campaignId");

-- CreateIndex
CREATE INDEX "Ad_placementId_idx" ON "Ad"("placementId");

-- CreateIndex
CREATE INDEX "Ad_status_idx" ON "Ad"("status");

-- CreateIndex
CREATE INDEX "Ad_promotedPostId_idx" ON "Ad"("promotedPostId");

-- CreateIndex
CREATE INDEX "Ad_placementId_status_idx" ON "Ad"("placementId", "status");

-- CreateIndex
CREATE INDEX "AdDailyStat_adId_date_idx" ON "AdDailyStat"("adId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdDailyStat_adId_date_key" ON "AdDailyStat"("adId", "date");

-- CreateIndex
CREATE INDEX "AdView_userId_adId_idx" ON "AdView"("userId", "adId");

-- CreateIndex
CREATE INDEX "AdView_userId_createdAt_idx" ON "AdView"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_txnId_key" ON "Deposit"("txnId");

-- CreateIndex
CREATE INDEX "Deposit_userId_idx" ON "Deposit"("userId");

-- CreateIndex
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

-- CreateIndex
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FraudEvent_userId_idx" ON "FraudEvent"("userId");

-- CreateIndex
CREATE INDEX "FraudEvent_eventType_idx" ON "FraudEvent"("eventType");

-- CreateIndex
CREATE INDEX "FraudEvent_severity_idx" ON "FraudEvent"("severity");

-- CreateIndex
CREATE INDEX "FraudEvent_status_idx" ON "FraudEvent"("status");

-- CreateIndex
CREATE INDEX "FraudEvent_createdAt_idx" ON "FraudEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ProxyServer_status_idx" ON "ProxyServer"("status");

-- CreateIndex
CREATE INDEX "ProxyServer_country_idx" ON "ProxyServer"("country");

-- CreateIndex
CREATE UNIQUE INDEX "OfferwallCallback_transactionId_key" ON "OfferwallCallback"("transactionId");

-- CreateIndex
CREATE INDEX "OfferwallCallback_status_idx" ON "OfferwallCallback"("status");

-- CreateIndex
CREATE INDEX "OfferwallCallback_offerwallId_idx" ON "OfferwallCallback"("offerwallId");

-- CreateIndex
CREATE INDEX "OfferwallCallback_userId_idx" ON "OfferwallCallback"("userId");

-- CreateIndex
CREATE INDEX "OfferwallCallback_createdAt_idx" ON "OfferwallCallback"("createdAt");

-- CreateIndex
CREATE INDEX "TaskBoard_isActive_idx" ON "TaskBoard"("isActive");

-- CreateIndex
CREATE INDEX "TaskBoard_order_idx" ON "TaskBoard"("order");

-- CreateIndex
CREATE INDEX "TaskBoard_category_idx" ON "TaskBoard"("category");

-- CreateIndex
CREATE INDEX "TaskBoard_unlockBoardId_idx" ON "TaskBoard"("unlockBoardId");

-- CreateIndex
CREATE INDEX "BoardClaim_boardId_claimedAt_idx" ON "BoardClaim"("boardId", "claimedAt");

-- CreateIndex
CREATE INDEX "BoardClaim_userId_idx" ON "BoardClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardClaim_userId_boardId_key" ON "BoardClaim"("userId", "boardId");

-- CreateIndex
CREATE INDEX "SocialReport_status_idx" ON "SocialReport"("status");

-- CreateIndex
CREATE INDEX "SocialReport_contentType_idx" ON "SocialReport"("contentType");

-- CreateIndex
CREATE INDEX "SocialReport_reporterId_idx" ON "SocialReport"("reporterId");

-- CreateIndex
CREATE INDEX "SocialReport_createdAt_idx" ON "SocialReport"("createdAt");

-- CreateIndex
CREATE INDEX "SocialReport_status_contentType_idx" ON "SocialReport"("status", "contentType");

-- CreateIndex
CREATE INDEX "SocialReport_contentType_contentId_idx" ON "SocialReport"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "Quiz_status_idx" ON "Quiz"("status");

-- CreateIndex
CREATE INDEX "Quiz_category_idx" ON "Quiz"("category");

-- CreateIndex
CREATE INDEX "Quiz_difficulty_idx" ON "Quiz"("difficulty");

-- CreateIndex
CREATE INDEX "QuizQuestion_quizId_idx" ON "QuizQuestion"("quizId");

-- CreateIndex
CREATE INDEX "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_idx" ON "QuizAttempt"("userId");

-- CreateIndex
CREATE INDEX "QuizAttempt_completedAt_idx" ON "QuizAttempt"("completedAt");

-- CreateIndex
CREATE INDEX "QuizAttempt_quizId_userId_idx" ON "QuizAttempt"("quizId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_totalEarnings_idx" ON "User"("totalEarnings");

-- CreateIndex
CREATE INDEX "User_referredById_createdAt_idx" ON "User"("referredById", "createdAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_userId_platform_key" ON "SocialAccount"("userId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "KYCDocument_userId_idx" ON "KYCDocument"("userId");

-- CreateIndex
CREATE INDEX "KYCDocument_status_idx" ON "KYCDocument"("status");

-- CreateIndex
CREATE INDEX "KYCAppeal_userId_idx" ON "KYCAppeal"("userId");

-- CreateIndex
CREATE INDEX "KYCAppeal_kycDocumentId_idx" ON "KYCAppeal"("kycDocumentId");

-- CreateIndex
CREATE INDEX "KYCAppeal_status_idx" ON "KYCAppeal"("status");

-- CreateIndex
CREATE INDEX "KYCAppeal_createdAt_idx" ON "KYCAppeal"("createdAt");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_type_idx" ON "Task"("type");

-- CreateIndex
CREATE INDEX "Task_requiredAccessLevel_idx" ON "Task"("requiredAccessLevel");

-- CreateIndex
CREATE INDEX "Task_status_createdAt_idx" ON "Task"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

-- CreateIndex
CREATE INDEX "Task_fundedByUserId_idx" ON "Task"("fundedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCategory_name_key" ON "TaskCategory"("name");

-- CreateIndex
CREATE INDEX "TaskSubmission_userId_idx" ON "TaskSubmission"("userId");

-- CreateIndex
CREATE INDEX "TaskSubmission_taskId_idx" ON "TaskSubmission"("taskId");

-- CreateIndex
CREATE INDEX "TaskSubmission_status_idx" ON "TaskSubmission"("status");

-- CreateIndex
CREATE INDEX "TaskSubmission_userId_status_idx" ON "TaskSubmission"("userId", "status");

-- CreateIndex
CREATE INDEX "TaskSubmission_userId_createdAt_idx" ON "TaskSubmission"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSubmission_taskId_userId_createdAt_key" ON "TaskSubmission"("taskId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTaskKey_submissionId_key" ON "ArticleTaskKey"("submissionId");

-- CreateIndex
CREATE INDEX "ArticleTaskKey_taskId_claimedByUserId_idx" ON "ArticleTaskKey"("taskId", "claimedByUserId");

-- CreateIndex
CREATE INDEX "ArticleTaskKey_claimedByUserId_idx" ON "ArticleTaskKey"("claimedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTaskKey_taskId_keyValue_key" ON "ArticleTaskKey"("taskId", "keyValue");

-- CreateIndex
CREATE INDEX "ArticleTaskPageProgress_submissionId_idx" ON "ArticleTaskPageProgress"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTaskPageProgress_submissionId_pageIndex_key" ON "ArticleTaskPageProgress"("submissionId", "pageIndex");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_reference_idx" ON "Transaction"("reference");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_idx" ON "Withdrawal"("userId");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE INDEX "Withdrawal_createdAt_idx" ON "Withdrawal"("createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_status_idx" ON "Withdrawal"("userId", "status");

-- CreateIndex
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserPaymentMethod_userId_idx" ON "UserPaymentMethod"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Package_slug_key" ON "Package"("slug");

-- CreateIndex
CREATE INDEX "Package_accessLevel_idx" ON "Package"("accessLevel");

-- CreateIndex
CREATE INDEX "Package_isDefault_idx" ON "Package"("isDefault");

-- CreateIndex
CREATE INDEX "Package_isActive_idx" ON "Package"("isActive");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_isActive_idx" ON "Subscription"("isActive");

-- CreateIndex
CREATE INDEX "Subscription_packageId_idx" ON "Subscription"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralLevel_level_key" ON "ReferralLevel"("level");

-- CreateIndex
CREATE INDEX "ReferralEarning_userId_idx" ON "ReferralEarning"("userId");

-- CreateIndex
CREATE INDEX "ReferralEarning_createdAt_idx" ON "ReferralEarning"("createdAt");

-- CreateIndex
CREATE INDEX "ReferralEarning_userId_createdAt_idx" ON "ReferralEarning"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralEarning_referredUserId_idx" ON "ReferralEarning"("referredUserId");

-- CreateIndex
CREATE INDEX "ReferralEarning_userId_level_idx" ON "ReferralEarning"("userId", "level");

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerId_idx" ON "MarketplaceListing"("sellerId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_idx" ON "MarketplaceListing"("status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_category_idx" ON "MarketplaceListing"("category");

-- CreateIndex
CREATE INDEX "MarketplaceListing_assetType_idx" ON "MarketplaceListing"("assetType");

-- CreateIndex
CREATE INDEX "MarketplaceListing_isFeatured_idx" ON "MarketplaceListing"("isFeatured");

-- CreateIndex
CREATE INDEX "MarketplacePurchase_listingId_idx" ON "MarketplacePurchase"("listingId");

-- CreateIndex
CREATE INDEX "MarketplacePurchase_buyerId_idx" ON "MarketplacePurchase"("buyerId");

-- CreateIndex
CREATE INDEX "CartItem_userId_idx" ON "CartItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_userId_listingId_key" ON "CartItem"("userId", "listingId");

-- CreateIndex
CREATE INDEX "MarketplaceWatch_listingId_idx" ON "MarketplaceWatch"("listingId");

-- CreateIndex
CREATE INDEX "MarketplaceWatch_userId_idx" ON "MarketplaceWatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceWatch_userId_listingId_key" ON "MarketplaceWatch"("userId", "listingId");

-- CreateIndex
CREATE INDEX "MarketplaceListingView_listingId_idx" ON "MarketplaceListingView"("listingId");

-- CreateIndex
CREATE INDEX "MarketplaceListingView_viewedAt_idx" ON "MarketplaceListingView"("viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListingView_listingId_sessionHash_key" ON "MarketplaceListingView"("listingId", "sessionHash");

-- CreateIndex
CREATE INDEX "MarketplaceBid_listingId_idx" ON "MarketplaceBid"("listingId");

-- CreateIndex
CREATE INDEX "MarketplaceBid_bidderId_idx" ON "MarketplaceBid"("bidderId");

-- CreateIndex
CREATE INDEX "MarketplaceBid_listingId_status_idx" ON "MarketplaceBid"("listingId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceOffer_listingId_idx" ON "MarketplaceOffer"("listingId");

-- CreateIndex
CREATE INDEX "MarketplaceOffer_buyerId_idx" ON "MarketplaceOffer"("buyerId");

-- CreateIndex
CREATE INDEX "MarketplaceOffer_listingId_status_idx" ON "MarketplaceOffer"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_category_idx" ON "Course"("category");

-- CreateIndex
CREATE INDEX "Course_categoryId_idx" ON "Course"("categoryId");

-- CreateIndex
CREATE INDEX "Course_tutorId_idx" ON "Course"("tutorId");

-- CreateIndex
CREATE INDEX "Course_isFeatured_idx" ON "Course"("isFeatured");

-- CreateIndex
CREATE INDEX "Course_slug_idx" ON "Course"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCategory_slug_key" ON "CourseCategory"("slug");

-- CreateIndex
CREATE INDEX "CourseCategory_isActive_idx" ON "CourseCategory"("isActive");

-- CreateIndex
CREATE INDEX "CourseCategory_order_idx" ON "CourseCategory"("order");

-- CreateIndex
CREATE INDEX "CourseSubcategory_categoryId_idx" ON "CourseSubcategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSubcategory_categoryId_slug_key" ON "CourseSubcategory"("categoryId", "slug");

-- CreateIndex
CREATE INDEX "CourseModule_courseId_idx" ON "CourseModule"("courseId");

-- CreateIndex
CREATE INDEX "CourseLesson_courseId_idx" ON "CourseLesson"("courseId");

-- CreateIndex
CREATE INDEX "CourseLesson_moduleId_idx" ON "CourseLesson"("moduleId");

-- CreateIndex
CREATE INDEX "CourseEnrollment_userId_idx" ON "CourseEnrollment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollment_courseId_userId_key" ON "CourseEnrollment"("courseId", "userId");

-- CreateIndex
CREATE INDEX "CourseLessonProgress_enrollmentId_idx" ON "CourseLessonProgress"("enrollmentId");

-- CreateIndex
CREATE INDEX "CourseLessonProgress_lessonId_idx" ON "CourseLessonProgress"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseLessonProgress_enrollmentId_lessonId_key" ON "CourseLessonProgress"("enrollmentId", "lessonId");

-- CreateIndex
CREATE INDEX "CourseReview_courseId_idx" ON "CourseReview"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseReview_courseId_userId_key" ON "CourseReview"("courseId", "userId");

-- CreateIndex
CREATE INDEX "CourseQuestion_courseId_idx" ON "CourseQuestion"("courseId");

-- CreateIndex
CREATE INDEX "CourseQuestion_askerId_idx" ON "CourseQuestion"("askerId");

-- CreateIndex
CREATE INDEX "CourseBookmark_userId_idx" ON "CourseBookmark"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseBookmark_userId_courseId_key" ON "CourseBookmark"("userId", "courseId");

-- CreateIndex
CREATE INDEX "CourseAnnouncement_courseId_idx" ON "CourseAnnouncement"("courseId");

-- CreateIndex
CREATE INDEX "CourseQuiz_courseId_idx" ON "CourseQuiz"("courseId");

-- CreateIndex
CREATE INDEX "CourseQuizQuestion_quizId_idx" ON "CourseQuizQuestion"("quizId");

-- CreateIndex
CREATE INDEX "CourseQuizAttempt_quizId_idx" ON "CourseQuizAttempt"("quizId");

-- CreateIndex
CREATE INDEX "CourseQuizAttempt_userId_idx" ON "CourseQuizAttempt"("userId");

-- CreateIndex
CREATE INDEX "CourseAssignment_courseId_idx" ON "CourseAssignment"("courseId");

-- CreateIndex
CREATE INDEX "CourseAssignmentSubmission_assignmentId_idx" ON "CourseAssignmentSubmission"("assignmentId");

-- CreateIndex
CREATE INDEX "CourseAssignmentSubmission_userId_idx" ON "CourseAssignmentSubmission"("userId");

-- CreateIndex
CREATE INDEX "CourseLiveClass_courseId_idx" ON "CourseLiveClass"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCertificate_serial_key" ON "CourseCertificate"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCertificate_sharedUrl_key" ON "CourseCertificate"("sharedUrl");

-- CreateIndex
CREATE INDEX "CourseCertificate_userId_idx" ON "CourseCertificate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCertificate_courseId_userId_key" ON "CourseCertificate"("courseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCoupon_code_key" ON "CourseCoupon"("code");

-- CreateIndex
CREATE INDEX "CourseCoupon_isActive_idx" ON "CourseCoupon"("isActive");

-- CreateIndex
CREATE INDEX "CourseRefundRequest_status_idx" ON "CourseRefundRequest"("status");

-- CreateIndex
CREATE INDEX "CourseRefundRequest_userId_idx" ON "CourseRefundRequest"("userId");

-- CreateIndex
CREATE INDEX "CourseListingView_courseId_idx" ON "CourseListingView"("courseId");

-- CreateIndex
CREATE INDEX "CourseListingView_viewedAt_idx" ON "CourseListingView"("viewedAt");

-- CreateIndex
CREATE INDEX "CourseListingView_courseId_sessionHash_idx" ON "CourseListingView"("courseId", "sessionHash");

-- CreateIndex
CREATE INDEX "TutorApplication_userId_idx" ON "TutorApplication"("userId");

-- CreateIndex
CREATE INDEX "TutorApplication_status_idx" ON "TutorApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TutorProfile_userId_key" ON "TutorProfile"("userId");

-- CreateIndex
CREATE INDEX "TutorProfile_isSuspended_idx" ON "TutorProfile"("isSuspended");

-- CreateIndex
CREATE INDEX "Lottery_status_idx" ON "Lottery"("status");

-- CreateIndex
CREATE INDEX "Lottery_drawDate_idx" ON "Lottery"("drawDate");

-- CreateIndex
CREATE INDEX "LotteryTicket_lotteryId_idx" ON "LotteryTicket"("lotteryId");

-- CreateIndex
CREATE INDEX "LotteryTicket_userId_idx" ON "LotteryTicket"("userId");

-- CreateIndex
CREATE INDEX "LotteryTicket_lotteryId_userId_idx" ON "LotteryTicket"("lotteryId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryTicket_lotteryId_ticketNumber_key" ON "LotteryTicket"("lotteryId", "ticketNumber");

-- CreateIndex
CREATE INDEX "Post_userId_idx" ON "Post"("userId");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "Post_groupId_idx" ON "Post"("groupId");

-- CreateIndex
CREATE INDEX "Post_isAnnouncement_idx" ON "Post"("isAnnouncement");

-- CreateIndex
CREATE INDEX "Post_isPromoted_promotedUntil_idx" ON "Post"("isPromoted", "promotedUntil");

-- CreateIndex
CREATE INDEX "Post_isPublic_createdAt_idx" ON "Post"("isPublic", "createdAt");

-- CreateIndex
CREATE INDEX "Post_isPublic_isHidden_isPinned_createdAt_idx" ON "Post"("isPublic", "isHidden", "isPinned", "createdAt");

-- CreateIndex
CREATE INDEX "Follow_followerId_idx" ON "Follow"("followerId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE INDEX "Follow_boostBatchId_idx" ON "Follow"("boostBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "FollowerBoostBatch_targetUserId_createdAt_idx" ON "FollowerBoostBatch"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowerBoostBatch_status_idx" ON "FollowerBoostBatch"("status");

-- CreateIndex
CREATE INDEX "PostView_postId_idx" ON "PostView"("postId");

-- CreateIndex
CREATE INDEX "PostView_userId_idx" ON "PostView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PostView_postId_userId_key" ON "PostView"("postId", "userId");

-- CreateIndex
CREATE INDEX "Mention_mentionedUserId_idx" ON "Mention"("mentionedUserId");

-- CreateIndex
CREATE INDEX "Mention_postId_idx" ON "Mention"("postId");

-- CreateIndex
CREATE INDEX "Mention_commentId_idx" ON "Mention"("commentId");

-- CreateIndex
CREATE INDEX "Vote_postId_idx" ON "Vote"("postId");

-- CreateIndex
CREATE INDEX "Vote_userId_postId_idx" ON "Vote"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_postId_userId_key" ON "Vote"("postId", "userId");

-- CreateIndex
CREATE INDEX "Donation_postId_idx" ON "Donation"("postId");

-- CreateIndex
CREATE INDEX "Donation_donorId_idx" ON "Donation"("donorId");

-- CreateIndex
CREATE INDEX "PostShare_userId_createdAt_idx" ON "PostShare"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PostShare_postId_idx" ON "PostShare"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostShare_postId_userId_key" ON "PostShare"("postId", "userId");

-- CreateIndex
CREATE INDEX "SocialActionLog_userId_dateKey_action_idx" ON "SocialActionLog"("userId", "dateKey", "action");

-- CreateIndex
CREATE INDEX "SocialActionLog_postId_idx" ON "SocialActionLog"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageDaily_userId_dateKey_key" ON "AiUsageDaily"("userId", "dateKey");

-- CreateIndex
CREATE INDEX "Group_ownerId_idx" ON "Group"("ownerId");

-- CreateIndex
CREATE INDEX "Group_type_idx" ON "Group"("type");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "GroupJoinRequest_groupId_idx" ON "GroupJoinRequest"("groupId");

-- CreateIndex
CREATE INDEX "GroupJoinRequest_userId_idx" ON "GroupJoinRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupJoinRequest_groupId_userId_key" ON "GroupJoinRequest"("groupId", "userId");

-- CreateIndex
CREATE INDEX "Comment_postId_idx" ON "Comment"("postId");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Like_postId_idx" ON "Like"("postId");

-- CreateIndex
CREATE INDEX "Like_userId_postId_idx" ON "Like"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_postId_userId_key" ON "Like"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_name_key" ON "Achievement"("name");

-- CreateIndex
CREATE INDEX "UserAchievement_userId_idx" ON "UserAchievement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "PointGift_senderId_idx" ON "PointGift"("senderId");

-- CreateIndex
CREATE INDEX "PointGift_receiverId_idx" ON "PointGift"("receiverId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_user1Id_idx" ON "Conversation"("user1Id");

-- CreateIndex
CREATE INDEX "Conversation_user2Id_idx" ON "Conversation"("user2Id");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_user1Id_user2Id_key" ON "Conversation"("user1Id", "user2Id");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso2_key" ON "Country"("iso2");

-- CreateIndex
CREATE UNIQUE INDEX "Country_iso3_key" ON "Country"("iso3");

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE INDEX "Country_isActive_name_idx" ON "Country"("isActive", "name");

-- CreateIndex
CREATE INDEX "Location_countryId_type_isActive_idx" ON "Location"("countryId", "type", "isActive");

-- CreateIndex
CREATE INDEX "Location_parentId_type_isActive_idx" ON "Location"("parentId", "type", "isActive");

-- CreateIndex
CREATE INDEX "Location_name_idx" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_countryId_parentId_name_type_key" ON "Location"("countryId", "parentId", "name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_category_idx" ON "SystemSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "OfferwallConfig_provider_key" ON "OfferwallConfig"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "VideoAdConfig_provider_key" ON "VideoAdConfig"("provider");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "MarketplaceDispute_purchaseId_idx" ON "MarketplaceDispute"("purchaseId");

-- CreateIndex
CREATE INDEX "MarketplaceDispute_initiatorId_idx" ON "MarketplaceDispute"("initiatorId");

-- CreateIndex
CREATE INDEX "MarketplaceDispute_status_idx" ON "MarketplaceDispute"("status");

-- CreateIndex
CREATE INDEX "MarketplaceDispute_createdAt_idx" ON "MarketplaceDispute"("createdAt");

-- CreateIndex
CREATE INDEX "DisputeMessage_disputeId_idx" ON "DisputeMessage"("disputeId");

-- CreateIndex
CREATE INDEX "DisputeMessage_senderId_idx" ON "DisputeMessage"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "Media_s3Key_key" ON "Media"("s3Key");

-- CreateIndex
CREATE INDEX "Media_uploadedById_idx" ON "Media"("uploadedById");

-- CreateIndex
CREATE INDEX "Media_fileType_idx" ON "Media"("fileType");

-- CreateIndex
CREATE INDEX "Media_folder_idx" ON "Media"("folder");

-- CreateIndex
CREATE INDEX "Media_createdAt_idx" ON "Media"("createdAt");

-- CreateIndex
CREATE INDEX "Media_s3Key_idx" ON "Media"("s3Key");

-- CreateIndex
CREATE INDEX "_TaskToTaskCategory_B_index" ON "_TaskToTaskCategory"("B");

-- AddForeignKey
ALTER TABLE "DailyMissionItem" ADD CONSTRAINT "DailyMissionItem_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DailyMissionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMissionClaim" ADD CONSTRAINT "DailyMissionClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMissionClaim" ADD CONSTRAINT "DailyMissionClaim_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "DailyMissionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReferralClaim" ADD CONSTRAINT "DailyReferralClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_promotedPostId_fkey" FOREIGN KEY ("promotedPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDailyStat" ADD CONSTRAINT "AdDailyStat_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdView" ADD CONSTRAINT "AdView_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBoard" ADD CONSTRAINT "TaskBoard_unlockBoardId_fkey" FOREIGN KEY ("unlockBoardId") REFERENCES "TaskBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardClaim" ADD CONSTRAINT "BoardClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardClaim" ADD CONSTRAINT "BoardClaim_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYCDocument" ADD CONSTRAINT "KYCDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYCAppeal" ADD CONSTRAINT "KYCAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KYCAppeal" ADD CONSTRAINT "KYCAppeal_kycDocumentId_fkey" FOREIGN KEY ("kycDocumentId") REFERENCES "KYCDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "TaskBoard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTaskKey" ADD CONSTRAINT "ArticleTaskKey_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTaskKey" ADD CONSTRAINT "ArticleTaskKey_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTaskKey" ADD CONSTRAINT "ArticleTaskKey_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TaskSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTaskPageProgress" ADD CONSTRAINT "ArticleTaskPageProgress_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TaskSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPaymentMethod" ADD CONSTRAINT "UserPaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEarning" ADD CONSTRAINT "ReferralEarning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePurchase" ADD CONSTRAINT "MarketplacePurchase_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePurchase" ADD CONSTRAINT "MarketplacePurchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceWatch" ADD CONSTRAINT "MarketplaceWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceWatch" ADD CONSTRAINT "MarketplaceWatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingView" ADD CONSTRAINT "MarketplaceListingView_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingView" ADD CONSTRAINT "MarketplaceListingView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceBid" ADD CONSTRAINT "MarketplaceBid_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceBid" ADD CONSTRAINT "MarketplaceBid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOffer" ADD CONSTRAINT "MarketplaceOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOffer" ADD CONSTRAINT "MarketplaceOffer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CourseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "CourseSubcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSubcategory" ADD CONSTRAINT "CourseSubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CourseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "CourseQuiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CourseAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "CourseLiveClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLessonProgress" ADD CONSTRAINT "CourseLessonProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLessonProgress" ADD CONSTRAINT "CourseLessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "CourseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuestion" ADD CONSTRAINT "CourseQuestion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuestion" ADD CONSTRAINT "CourseQuestion_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuestion" ADD CONSTRAINT "CourseQuestion_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBookmark" ADD CONSTRAINT "CourseBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseBookmark" ADD CONSTRAINT "CourseBookmark_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAnnouncement" ADD CONSTRAINT "CourseAnnouncement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAnnouncement" ADD CONSTRAINT "CourseAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuiz" ADD CONSTRAINT "CourseQuiz_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuizQuestion" ADD CONSTRAINT "CourseQuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "CourseQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuizAttempt" ADD CONSTRAINT "CourseQuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "CourseQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuizAttempt" ADD CONSTRAINT "CourseQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignmentSubmission" ADD CONSTRAINT "CourseAssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "CourseAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignmentSubmission" ADD CONSTRAINT "CourseAssignmentSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignmentSubmission" ADD CONSTRAINT "CourseAssignmentSubmission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLiveClass" ADD CONSTRAINT "CourseLiveClass_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCertificate" ADD CONSTRAINT "CourseCertificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCertificate" ADD CONSTRAINT "CourseCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCoupon" ADD CONSTRAINT "CourseCoupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRefundRequest" ADD CONSTRAINT "CourseRefundRequest_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRefundRequest" ADD CONSTRAINT "CourseRefundRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRefundRequest" ADD CONSTRAINT "CourseRefundRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRefundRequest" ADD CONSTRAINT "CourseRefundRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseListingView" ADD CONSTRAINT "CourseListingView_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseListingView" ADD CONSTRAINT "CourseListingView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorApplication" ADD CONSTRAINT "TutorApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorApplication" ADD CONSTRAINT "TutorApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorProfile" ADD CONSTRAINT "TutorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryTicket" ADD CONSTRAINT "LotteryTicket_lotteryId_fkey" FOREIGN KEY ("lotteryId") REFERENCES "Lottery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryTicket" ADD CONSTRAINT "LotteryTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_boostBatchId_fkey" FOREIGN KEY ("boostBatchId") REFERENCES "FollowerBoostBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowerBoostBatch" ADD CONSTRAINT "FollowerBoostBatch_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_mentionedById_fkey" FOREIGN KEY ("mentionedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostShare" ADD CONSTRAINT "PostShare_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostShare" ADD CONSTRAINT "PostShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialActionLog" ADD CONSTRAINT "SocialActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointGift" ADD CONSTRAINT "PointGift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointGift" ADD CONSTRAINT "PointGift_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceDispute" ADD CONSTRAINT "MarketplaceDispute_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "MarketplacePurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "MarketplaceDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskToTaskCategory" ADD CONSTRAINT "_TaskToTaskCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskToTaskCategory" ADD CONSTRAINT "_TaskToTaskCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

