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

