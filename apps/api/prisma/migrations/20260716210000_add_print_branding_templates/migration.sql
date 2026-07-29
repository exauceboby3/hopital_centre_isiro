-- AlterTable
ALTER TABLE "HospitalProfile" ADD COLUMN     "documentAccentColor" TEXT NOT NULL DEFAULT '#167757',
ADD COLUMN     "documentHeader" TEXT,
ADD COLUMN     "documentMarginMm" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "documentOrientation" TEXT NOT NULL DEFAULT 'PORTRAIT',
ADD COLUMN     "documentPaperSize" TEXT NOT NULL DEFAULT 'A4',
ADD COLUMN     "logoDataUrl" TEXT;

-- CreateTable
CREATE TABLE "PrintTemplate" (
    "id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "title" TEXT,
    "headerText" TEXT,
    "footerText" TEXT,
    "paperSize" TEXT NOT NULL DEFAULT 'A4',
    "orientation" TEXT NOT NULL DEFAULT 'PORTRAIT',
    "marginMm" INTEGER NOT NULL DEFAULT 12,
    "accentColor" TEXT,
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintTemplate_department_isActive_idx" ON "PrintTemplate"("department", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PrintTemplate_department_documentType_key" ON "PrintTemplate"("department", "documentType");

-- AddForeignKey
ALTER TABLE "PrintTemplate" ADD CONSTRAINT "PrintTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintTemplate" ADD CONSTRAINT "PrintTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
