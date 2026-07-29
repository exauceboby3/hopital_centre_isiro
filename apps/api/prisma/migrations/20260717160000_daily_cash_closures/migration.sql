CREATE TABLE "CashClosure" (
  "id" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "closedById" TEXT NOT NULL,
  "invoiceCount" INTEGER NOT NULL,
  "paymentCount" INTEGER NOT NULL,
  "totalBilled" DECIMAL(14, 2) NOT NULL,
  "totalCollected" DECIMAL(14, 2) NOT NULL,
  "cashTotal" DECIMAL(14, 2) NOT NULL,
  "mobileTotal" DECIMAL(14, 2) NOT NULL,
  "bankTotal" DECIMAL(14, 2) NOT NULL,
  "cardTotal" DECIMAL(14, 2) NOT NULL,
  "patientTotal" DECIMAL(14, 2) NOT NULL,
  "insurerTotal" DECIMAL(14, 2) NOT NULL,
  "sponsorTotal" DECIMAL(14, 2) NOT NULL,
  "notes" TEXT,
  "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashClosure_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashClosure_businessDate_key" ON "CashClosure"("businessDate");
CREATE INDEX "CashClosure_closedAt_idx" ON "CashClosure"("closedAt");

ALTER TABLE "CashClosure"
  ADD CONSTRAINT "CashClosure_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
