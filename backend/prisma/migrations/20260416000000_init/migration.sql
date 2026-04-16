-- CreateEnum
CREATE TYPE "AuthKind" AS ENUM ('apple', 'guest');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "AssistantState" AS ENUM ('idle', 'listening', 'thinking', 'speaking');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authKind" "AuthKind" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ageRange" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "occupationCategory" TEXT NOT NULL,
    "hobbyTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredLanguage" TEXT NOT NULL,
    "conversationStyle" TEXT NOT NULL,
    "responseLength" TEXT NOT NULL,
    "proactiveTopicPushing" BOOLEAN NOT NULL,
    "avoidTopicTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "latestAssistantState" "AssistantState" NOT NULL DEFAULT 'idle',
    "turnCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "role" "MessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSummary" (
    "sessionId" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memoryCandidates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSummary_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authKind_providerUserId_key" ON "User"("authKind", "providerUserId");

-- CreateIndex
CREATE INDEX "Session_userId_startedAt_idx" ON "Session"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "SessionTurn_sessionId_turnIndex_idx" ON "SessionTurn"("sessionId", "turnIndex");

-- CreateIndex
CREATE INDEX "SessionTurn_sessionId_createdAt_idx" ON "SessionTurn"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTurn_sessionId_turnIndex_key" ON "SessionTurn"("sessionId", "turnIndex");

-- Add database-level constraints that Prisma schema cannot express directly.
ALTER TABLE "UserProfile"
  ALTER COLUMN "interests" SET NOT NULL,
  ALTER COLUMN "hobbyTags" SET NOT NULL,
  ALTER COLUMN "avoidTopicTags" SET NOT NULL;

ALTER TABLE "SessionSummary"
  ALTER COLUMN "topics" SET NOT NULL,
  ALTER COLUMN "memoryCandidates" SET NOT NULL;

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_ageRange_check"
  CHECK ("ageRange" IN ('under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'));

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_gender_check"
  CHECK ("gender" IN ('female', 'male', 'nonbinary', 'prefer_not_to_say'));

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_occupationCategory_check"
  CHECK ("occupationCategory" IN ('student', 'tech', 'finance', 'healthcare', 'education', 'creative', 'business', 'service', 'logistics', 'other'));

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_conversationStyle_check"
  CHECK ("conversationStyle" IN ('relaxed', 'curious', 'analytical'));

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_responseLength_check"
  CHECK ("responseLength" IN ('short', 'medium'));

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_interests_check"
  CHECK ("interests" <@ ARRAY['history', 'international_news', 'sports', 'travel', 'gaming', 'technology', 'finance', 'movies', 'music']::TEXT[]);

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_hobbyTags_check"
  CHECK ("hobbyTags" <@ ARRAY['reading', 'fitness', 'cooking', 'photography', 'music', 'movies', 'hiking', 'cars', 'podcasts', 'design']::TEXT[]);

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_avoidTopicTags_check"
  CHECK ("avoidTopicTags" <@ ARRAY['politics', 'religion', 'graphic_violence', 'personal_finance', 'dating']::TEXT[]);

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_status_endedAt_check"
  CHECK (
    ("status" = 'active' AND "endedAt" IS NULL)
    OR
    ("status" = 'ended' AND "endedAt" IS NOT NULL)
  );

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_turnCount_check"
  CHECK ("turnCount" >= 0);

ALTER TABLE "SessionTurn"
  ADD CONSTRAINT "SessionTurn_turnIndex_check"
  CHECK ("turnIndex" >= 0);

ALTER TABLE "SessionSummary"
  ADD CONSTRAINT "SessionSummary_durationSeconds_check"
  CHECK ("durationSeconds" >= 0);

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTurn" ADD CONSTRAINT "SessionTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
