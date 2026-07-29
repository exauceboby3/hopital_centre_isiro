CREATE OR REPLACE FUNCTION "enforce_bed_cleaning_before_availability"()
RETURNS TRIGGER AS $$
DECLARE latest_turnover_status TEXT;
BEGIN
  IF NEW."status" = 'AVAILABLE' AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    SELECT bt."status" INTO latest_turnover_status
    FROM "BedTurnover" bt
    WHERE bt."bedId" = NEW."id"
    ORDER BY bt."requestedAt" DESC
    LIMIT 1;

    IF latest_turnover_status IN ('PENDING_CLEANING', 'CLEANING') THEN
      NEW."status" := 'MAINTENANCE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Bed_require_cleaning_before_available"
BEFORE UPDATE OF "status" ON "Bed"
FOR EACH ROW EXECUTE FUNCTION "enforce_bed_cleaning_before_availability"();
