CREATE TABLE IF NOT EXISTS "MessageDeletion" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageDeletion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageDeletion_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageDeletion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MessageDeletion_messageId_userId_key"
  ON "MessageDeletion"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "MessageDeletion_userId_deletedAt_idx"
  ON "MessageDeletion"("userId", "deletedAt");

CREATE TABLE IF NOT EXISTS "BusinessNotification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entity" TEXT,
  "entityId" TEXT,
  "actionUrl" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessNotification_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BusinessNotification_recipientId_readAt_createdAt_idx"
  ON "BusinessNotification"("recipientId", "readAt", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BusinessNotification_entity_entityId_idx"
  ON "BusinessNotification"("entity", "entityId");
