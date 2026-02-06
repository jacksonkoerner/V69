-- Add inspector_name column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'reports' AND column_name = 'inspector_name'
    ) THEN
        ALTER TABLE reports ADD COLUMN inspector_name TEXT;
    END IF;
END $$;
