ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN' BEFORE 'ADMIN';

CREATE TYPE "EmergencySeverity" AS ENUM ('CRITICAL', 'HIGH');
CREATE TYPE "EmergencyAlertStatus" AS ENUM ('ACTIVE', 'RESOLVED');

CREATE TABLE "EmergencyAlert" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "location" TEXT,
    "severity" "EmergencySeverity" NOT NULL DEFAULT 'HIGH',
    "status" "EmergencyAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "targetRole" "Role",
    "createdById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "EmergencyAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmergencyAlert_status_createdAt_idx" ON "EmergencyAlert"("status", "createdAt");
CREATE INDEX "EmergencyAlert_targetRole_status_idx" ON "EmergencyAlert"("targetRole", "status");

ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
