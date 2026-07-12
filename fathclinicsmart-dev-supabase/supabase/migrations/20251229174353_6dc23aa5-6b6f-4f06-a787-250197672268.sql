-- Add logo_url column to clinics table
ALTER TABLE public.clinics ADD COLUMN logo_url TEXT;

-- Create storage bucket for clinic logos
INSERT INTO storage.buckets (id, name, public) VALUES ('clinic-logos', 'clinic-logos', true);

-- Create storage policies for clinic logos
CREATE POLICY "Clinic logos are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'clinic-logos');

CREATE POLICY "Clinic owners can upload their logo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'clinic-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clinic owners can update their logo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'clinic-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clinic owners can delete their logo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'clinic-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);