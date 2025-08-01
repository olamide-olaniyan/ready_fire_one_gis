import { createClient } from '@supabase/supabase-js';
import shapefile from 'shapefile';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Check for Supabase credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your_supabase_url_here')) {
    console.error('❌ Please update your .env file with real Supabase credentials');
    console.log('Add these lines to your .env file:');
    console.log('SUPABASE_URL=https://your-project-id.supabase.co');
    console.log('SUPABASE_KEY=your-anon-key-here');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Convert GeoJSON geometry to PostGIS-compatible WKT
 */
function geometryToWKT(geom) {
    if (!geom || !geom.coordinates) return null;

    const { type, coordinates } = geom;

    // Check for empty coordinates
    if (!coordinates || coordinates.length === 0) {
        return null;
    }

    switch (type) {
        case 'Point':
            if (coordinates.length !== 2) return null;
            return `POINT(${coordinates[0]} ${coordinates[1]})`;

        case 'Polygon':
            if (!coordinates[0] || coordinates[0].length < 4) return null;
            const rings = coordinates.map(ring => {
                if (!ring || ring.length < 4) return null;
                const coords = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
                return `(${coords})`;
            }).filter(ring => ring !== null);

            if (rings.length === 0) return null;
            return `POLYGON(${rings.join(', ')})`;

        case 'MultiPolygon':
            if (!coordinates[0] || coordinates[0].length === 0) return null;
            const polygons = coordinates.map(polygon => {
                if (!polygon || polygon.length === 0) return null;
                const rings = polygon.map(ring => {
                    if (!ring || ring.length < 4) return null;
                    const coords = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
                    return `(${coords})`;
                }).filter(ring => ring !== null);

                if (rings.length === 0) return null;
                return `(${rings.join(', ')})`;
            }).filter(polygon => polygon !== null);

            if (polygons.length === 0) return null;
            return `MULTIPOLYGON(${polygons.join(', ')})`;

        default:
            console.warn(`⚠️ Unsupported geometry type: ${type}`);
            return null;
    }
}

/**
 * Process a single shapefile
 */
async function processShapefile(shpPath, folderName) {
    console.log(`🔄 Processing: ${path.basename(shpPath)} from ${folderName}`);

    try {
        const features = [];
        const source = await shapefile.open(shpPath);
        let recordCount = 0;

        while (true) {
            const result = await source.read();
            if (result.done) break;

            const feature = result.value;
            recordCount++;

            if (!feature || !feature.geometry) {
                console.warn(`⚠️ Record ${recordCount} has no geometry, skipping`);
                continue;
            }

            const { geometry, properties } = feature;

            // Convert geometry to WKT and validate
            const wktGeometry = geometryToWKT(geometry);
            if (!wktGeometry || wktGeometry.includes('()')) {
                console.warn(`⚠️ Invalid or empty geometry for record ${recordCount}, skipping`);
                continue;
            }

            // Map properties to database columns (lowercase)
            const record = {
                sra: properties.SRA || null,
                incorp: properties.INCORP || null,
                geometry: wktGeometry,
                haz_code: properties.HAZ_CODE || null,
                haz_class: properties.HAZ_CLASS || null,
                shape_leng: properties.Shape_Leng || null,
                shape_area: properties.Shape_Area || null,
                vh_rec: properties.VH_REC || null,
                area: properties.AREA || null,
                perimeter: properties.PERIMETER || null,
                fid_c19fhs: properties.FID_C19FHS || null,
                objectid: properties.OBJECTID ? String(properties.OBJECTID) : null,
                source_folder: folderName,
                source_file: path.basename(shpPath)
            };

            features.push(record);
        }

        console.log(`✅ Processed ${features.length} features from ${path.basename(shpPath)}`);
        return features;

    } catch (error) {
        console.error(`❌ Error processing ${shpPath}: ${error.message}`);
        return [];
    }
}

/**
 * Insert records to Supabase in batches and populate geom column
 */
async function insertToSupabase(records, chunkSize = 500) {
    console.log(`📤 Inserting ${records.length} records to Supabase...`);

    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);

        try {
            const { data, error } = await supabase
                .from('calfire_zone_risk')
                .insert(chunk);

            if (error) {
                console.error(`❌ Error inserting chunk ${i + 1}-${i + chunk.length}:`, error.message);
                totalErrors += chunk.length;
            } else {
                totalInserted += chunk.length;
                console.log(`✅ Inserted chunk ${i + 1}-${i + chunk.length} (${totalInserted}/${records.length})`);

                // Update geom column after successful insert
                console.log(`🔄 Updating geom column for chunk ${i + 1}-${i + chunk.length}...`);
                await updateGeomForChunk();
            }
        } catch (error) {
            console.error(`❌ Exception inserting chunk ${i + 1}-${i + chunk.length}:`, error.message);
            totalErrors += chunk.length;
        }

        // Add a small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n📊 Results:`);
    console.log(`✅ Successfully inserted: ${totalInserted}`);
    console.log(`❌ Failed to insert: ${totalErrors}`);
    console.log(`📈 Success rate: ${((totalInserted / records.length) * 100).toFixed(1)}%`);
}

/**
 * Update geom column for records that have geometry but no geom
 */
async function updateGeomForChunk() {
    try {
        // Use a simple SQL update that only processes valid geometries
        const { data, error } = await supabase.rpc('update_geom_safe');

        if (error) {
            console.warn(`⚠️ Error updating geom column:`, error.message);
        } else {
            console.log(`✅ Geom column updated successfully`);
        }
    } catch (error) {
        console.warn(`⚠️ Exception updating geom column:`, error.message);
    }
}

/**
 * Main processing function
 */
async function processAllShapefiles() {
    const unzippedPath = './unzipped';

    if (!fs.existsSync(unzippedPath)) {
        console.error(`❌ Directory ${unzippedPath} not found`);
        return;
    }

    const folders = fs.readdirSync(unzippedPath).filter(folder => {
        const folderPath = path.join(unzippedPath, folder);
        return fs.statSync(folderPath).isDirectory();
    });

    console.log(`📁 Found ${folders.length} folders to process`);
    console.log(`📂 Folders: ${folders.slice(0, 5).join(', ')}${folders.length > 5 ? '...' : ''}`);

    let allRecords = [];
    let processedFolders = 0;

    for (const folder of folders) {
        console.log(`\n📂 Processing folder ${++processedFolders}/${folders.length}: ${folder}`);

        const folderPath = path.join(unzippedPath, folder);
        const files = fs.readdirSync(folderPath);
        const shpFiles = files.filter(file => file.endsWith('.shp'));

        if (shpFiles.length === 0) {
            console.log(`⚠️ No shapefile found in ${folder}`);
            continue;
        }

        for (const shpFile of shpFiles) {
            const shpPath = path.join(folderPath, shpFile);
            const features = await processShapefile(shpPath, folder);
            allRecords.push(...features);

            // Insert in batches of 5000 records to avoid memory issues
            if (allRecords.length >= 5000) {
                await insertToSupabase(allRecords);
                allRecords = []; // Clear the array
            }
        }
    }

    // Insert remaining records
    if (allRecords.length > 0) {
        await insertToSupabase(allRecords);
    }

    console.log(`\n🎉 Processing complete! All ${folders.length} folders processed.`);
}

// Always run when this file is executed directly
console.log('🚀 Starting GIS data processing...\n');
processAllShapefiles().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});

export { processAllShapefiles };
