-- CreateEnum
CREATE TYPE "yarn_operation_status" AS ENUM ('pending', 'refund_pending', 'completed', 'refunded');

-- CreateTable
CREATE TABLE "yarn_tts_operation" (
    "id" TEXT NOT NULL,
    "status" "yarn_operation_status" NOT NULL DEFAULT 'pending',
    "userId" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "requestSource" "request_source" NOT NULL DEFAULT 'api',
    "model" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL,
    "providerJobId" TEXT,
    "historyRecorded" BOOLEAN NOT NULL DEFAULT false,
    "result" JSONB,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yarn_tts_operation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "yarn_tts_operation_status_leaseUntil_idx" ON "yarn_tts_operation"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "yarn_tts_operation_status_historyRecorded_created_at_idx" ON "yarn_tts_operation"("status", "historyRecorded", "created_at");

-- CreateIndex
CREATE INDEX "yarn_tts_operation_userId_apiKeyId_created_at_idx" ON "yarn_tts_operation"("userId", "apiKeyId", "created_at");

-- AddForeignKey
ALTER TABLE "yarn_tts_operation" ADD CONSTRAINT "yarn_tts_operation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yarn_tts_operation" ADD CONSTRAINT "yarn_tts_operation_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_key"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
