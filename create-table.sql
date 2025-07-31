-- Create the calfire_zone_risk_duplicate table in Supabase
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.calfire_zone_risk_duplicate (
    id BIGSERIAL PRIMARY KEY,

-- Original shapefile properties
sra TEXT,
incorp TEXT,
haz_code BIGINT,
haz_class TEXT,
shape_leng NUMERIC,
shape_area NUMERIC,
vh_rec TEXT,
area TEXT,
perimeter TEXT,
fid_c19fhs TEXT,
objectid TEXT,

-- Geometry column (stored as WKT text)
geometry TEXT,

-- PostGIS geometry column (optional, for spatial queries)
geom GEOMETRY (POLYGON, 4326),

-- Metadata
source_folder TEXT,
    source_file TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable Row Level Security for bulk inserts
ALTER TABLE public.calfire_zone_risk_duplicate DISABLE ROW LEVEL SECURITY;

-- Create indices for better performance
CREATE INDEX IF NOT EXISTS idx_calfire_haz_class ON public.calfire_zone_risk_duplicate (haz_class);

CREATE INDEX IF NOT EXISTS idx_calfire_haz_code ON public.calfire_zone_risk_duplicate (haz_code);

CREATE INDEX IF NOT EXISTS idx_calfire_sra ON public.calfire_zone_risk_duplicate (sra);

CREATE INDEX IF NOT EXISTS idx_calfire_source_folder ON public.calfire_zone_risk_duplicate (source_folder);

-- If you plan to use PostGIS spatial queries, create a spatial index
-- CREATE INDEX IF NOT EXISTS idx_calfire_geom ON public.calfire_zone_risk_duplicate USING GIST(geom);

-- Function to convert WKT geometry to PostGIS geometry (optional)
-- Uncomment if you want to populate the geom column
/*
CREATE OR REPLACE FUNCTION populate_geom_from_wkt()
RETURNS void AS $$
BEGIN
UPDATE public.calfire_zone_risk_duplicate 
SET geom = ST_GeomFromText(geometry, 4326)
WHERE geometry IS NOT NULL AND geom IS NULL;
END;
$$ LANGUAGE plpgsql;
*/