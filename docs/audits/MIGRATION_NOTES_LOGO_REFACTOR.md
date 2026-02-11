# Database Migration Notes - Logo Refactor

## Migration Required

The logo handling has been refactored to use compressed thumbnails for local storage and full images in Supabase Storage. This requires the following database changes:

### New Columns to Add

Run this SQL migration in Supabase:

```sql
-- Add new logo columns to projects table
ALTER TABLE projects
ADD COLUMN logo_thumbnail TEXT,
ADD COLUMN logo_url TEXT;

-- Optional: Add comment explaining the fields
COMMENT ON COLUMN projects.logo_thumbnail IS 'Compressed base64 thumbnail (~50-100KB) for offline/local display';
COMMENT ON COLUMN projects.logo_url IS 'Supabase Storage public URL for full-quality logo';
```

### Supabase Storage Bucket

Create a new storage bucket called `project-logos`:

1. Go to Supabase Dashboard > Storage
2. Create new bucket: `project-logos`
3. Set to **Public** (for public URL access)
4. Configure policies as needed (e.g., allow authenticated users to upload)

Example RLS policy for uploads:
```sql
-- Allow authenticated users to upload logos
CREATE POLICY "Users can upload project logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-logos');

-- Allow authenticated users to update/replace logos
CREATE POLICY "Users can update project logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'project-logos');

-- Allow authenticated users to delete logos
CREATE POLICY "Users can delete project logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'project-logos');

-- Allow public read access for logos
CREATE POLICY "Public read access for project logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'project-logos');
```

### Legacy Data Migration (Optional)

If you want to migrate existing logos from the `logo` column to the new format:

```sql
-- This would require a script to:
-- 1. For each project with a logo (base64 data)
-- 2. Upload the image to Supabase Storage
-- 3. Update logo_url with the public URL
-- 4. Compress and store in logo_thumbnail
-- 5. Optionally clear the old logo column

-- After migration, you can drop the old column:
-- ALTER TABLE projects DROP COLUMN logo;
```

### Column Summary

| Column | Type | Description |
|--------|------|-------------|
| `logo_thumbnail` | TEXT | Compressed base64 string (~50-100KB) for offline/local preview |
| `logo_url` | TEXT | Public URL from Supabase Storage for full-quality image |
| `logo` | TEXT | **LEGACY** - Old full base64 field (keep for backwards compatibility) |

### Display Priority

The application uses this priority for displaying logos:
1. `logoUrl` - Full quality from Supabase Storage (preferred when online)
2. `logoThumbnail` - Compressed local version (offline fallback)
3. `logo` - Legacy field (backwards compatibility only)
