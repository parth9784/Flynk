-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('pending', 'active', 'completed', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "share_sessions" (
    "id" TEXT NOT NULL,
    "share_code" TEXT NOT NULL,
    "total_size_bytes" BIGINT NOT NULL,
    "requires_auth" BOOLEAN NOT NULL,
    "status" "ShareStatus" NOT NULL DEFAULT 'pending',
    "join_attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sender_id" TEXT,
    "sender_session_id" TEXT,
    "receiver_id" TEXT,
    "receiver_session_id" TEXT,

    CONSTRAINT "share_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "share_session_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "sha256" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_sessions_share_code_key" ON "share_sessions"("share_code");

-- CreateIndex
CREATE INDEX "share_sessions_sender_id_idx" ON "share_sessions"("sender_id");

-- CreateIndex
CREATE INDEX "files_share_session_id_idx" ON "files"("share_session_id");

-- AddForeignKey
ALTER TABLE "share_sessions" ADD CONSTRAINT "share_sessions_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_sessions" ADD CONSTRAINT "share_sessions_sender_session_id_fkey" FOREIGN KEY ("sender_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_sessions" ADD CONSTRAINT "share_sessions_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_sessions" ADD CONSTRAINT "share_sessions_receiver_session_id_fkey" FOREIGN KEY ("receiver_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_share_session_id_fkey" FOREIGN KEY ("share_session_id") REFERENCES "share_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
