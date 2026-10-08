-- CreateEnum
CREATE TYPE "achievement_kind" AS ENUM ('challenge', 'merit');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "account_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "achievement_kind" NOT NULL,
    "match_id" TEXT,
    "achieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("account_id","key")
);

-- CreateTable
CREATE TABLE "challenge_bests" (
    "account_id" UUID NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "best" INTEGER NOT NULL,

    CONSTRAINT "challenge_bests_pkey" PRIMARY KEY ("account_id","challenge_id")
);

-- CreateTable
CREATE TABLE "match_awards" (
    "account_id" UUID NOT NULL,
    "match_id" TEXT NOT NULL,
    "xp_gained" INTEGER NOT NULL,
    "before_xp" INTEGER NOT NULL,
    "challenges" TEXT[],
    "merits" TEXT[],
    "unlocked" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_awards_pkey" PRIMARY KEY ("account_id","match_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE INDEX "match_awards_account_id_created_at_idx" ON "match_awards"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_bests" ADD CONSTRAINT "challenge_bests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_awards" ADD CONSTRAINT "match_awards_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
