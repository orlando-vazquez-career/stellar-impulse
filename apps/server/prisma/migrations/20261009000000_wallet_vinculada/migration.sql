-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "wallet_address" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "accounts_wallet_address_key" ON "accounts"("wallet_address");
