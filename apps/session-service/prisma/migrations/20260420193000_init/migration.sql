-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "AssistantState" AS ENUM ('idle', 'listening', 'thinking', 'speaking');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

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
CREATE INDEX "Session_userId_startedAt_idx" ON "Session"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "SessionTurn_sessionId_turnIndex_idx" ON "SessionTurn"("sessionId", "turnIndex");

-- CreateIndex
CREATE INDEX "SessionTurn_sessionId_createdAt_idx" ON "SessionTurn"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTurn_sessionId_turnIndex_key" ON "SessionTurn"("sessionId", "turnIndex");

-- AddForeignKey
ALTER TABLE "SessionTurn" ADD CONSTRAINT "SessionTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSummary" ADD CONSTRAINT "SessionSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

