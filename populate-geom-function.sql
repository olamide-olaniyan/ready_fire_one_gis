-- Create a function to safely populate the geom column from WKT geometry data
-- Run this in your Supabase SQL Editor

-- First, alter the geom column to accept any geometry type
ALTER TABLE public.calfire_zone_risk
ALTER COLUMN geom TYPE GEOMETRY (GEOMETRY, 4326);

CREATE OR REPLACE FUNCTION update_geom_safe()
RETURNS void AS $$
BEGIN
    UPDATE public.calfire_zone_risk 
    SET geom = (
        CASE 
            WHEN geometry IS NOT NULL 
                AND geometry != '' 
                AND geometry NOT LIKE '%()%'
                AND ST_IsValid(ST_GeomFromText(geometry, 4326)) 
            THEN ST_GeomFromText(geometry, 4326)
            ELSE NULL
        END
    )
    WHERE geometry IS NOT NULL AND geom IS NULL;
    
    -- Log how many records were updated
    RAISE NOTICE 'Updated % records with valid geometries', ROW_COUNT();
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error updating geom column: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to the authenticated and anon roles
GRANT
EXECUTE ON FUNCTION populate_geom_from_wkt_batch () TO authenticated;

GRANT EXECUTE ON FUNCTION populate_geom_from_wkt_batch () TO anon;