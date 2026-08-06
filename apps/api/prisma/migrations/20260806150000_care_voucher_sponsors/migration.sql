CREATE TYPE "CareVoucherSponsorType" AS ENUM ('COMPANY', 'INDIVIDUAL');

ALTER TABLE "CareVoucher"
  ADD COLUMN "sponsorType" "CareVoucherSponsorType" NOT NULL DEFAULT 'COMPANY',
  ALTER COLUMN "patientId" DROP NOT NULL;
