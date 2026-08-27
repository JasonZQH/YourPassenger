-- CreateEnum
CREATE TYPE "AuthKind" AS ENUM ('apple', 'guest');

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "authKind" "AuthKind" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_authKind_providerUserId_key" ON "AuthIdentity"("authKind", "providerUserId");

