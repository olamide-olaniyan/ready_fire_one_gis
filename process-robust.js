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

    switch (type) {
        case 'Point':
            return `POINT(${coordinates[0]} ${coordinates[1]})`;

        case 'Polygon':
            const rings = coordinates.map(ring => {
                const coords = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
                return `(${coords})`;
            }).join(', ');
            return `POLYGON(${rings})`;

        case 'MultiPolygon':
            const polygons = coordinates.map(polygon => {
                const rings = polygon.map(ring => {
                    const coords = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
                    return `(${coords})`;
                }).join(', ');
                return `(${rings})`;
            }).join(', ');
            return `MULTIPOLYGON(${polygons})`;

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

            // Convert geometry to WKT
            const wktGeometry = geometryToWKT(geometry);
            if (!wktGeometry) {
                console.warn(`⚠️ Could not convert geometry for record ${recordCount}, skipping`);
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
 * Insert records to Supabase in batches with better error handling
 */
async function insertToSupabase(records, chunkSize = 100) {
    console.log(`📤 Inserting ${records.length} records to Supabase...`);

    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const chunkStart = i + 1;
        const chunkEnd = i + chunk.length;

        try {
            console.log(`🔄 Inserting chunk ${chunkStart}-${chunkEnd}...`);

            const { data, error } = await supabase
                .from('calfire_zone_risk_duplicate')
                .insert(chunk);

            if (error) {
                console.error(`❌ Error inserting chunk ${chunkStart}-${chunkEnd}:`, error.message);
                console.error(`❌ Error details:`, error);
                totalErrors += chunk.length;
            } else {
                totalInserted += chunk.length;
                console.log(`✅ Inserted chunk ${chunkStart}-${chunkEnd} (${totalInserted}/${records.length} total)`);
            }
        } catch (error) {
            console.error(`❌ Exception inserting chunk ${chunkStart}-${chunkEnd}:`, error.message);
            totalErrors += chunk.length;
        }

        // Add a longer delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n📊 Batch Results:`);
    console.log(`✅ Successfully inserted: ${totalInserted}`);
    console.log(`❌ Failed to insert: ${totalErrors}`);
    console.log(`📈 Success rate: ${((totalInserted / records.length) * 100).toFixed(1)}%`);

    return totalInserted;
}

/**
 * Main processing function with resume capability
 */
async function processAllShapefiles(startFromFolder = 0) {
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
    console.log(`📂 Starting from folder ${startFromFolder + 1}: ${folders[startFromFolder] || 'None'}`);

    let allRecords = [];
    let processedFolders = 0;
    let totalInserted = 0;

    for (let folderIndex = startFromFolder; folderIndex < folders.length; folderIndex++) {
        const folder = folders[folderIndex];
        console.log(`\n📂 Processing folder ${folderIndex + 1}/${folders.length}: ${folder}`);

        const folderPath = path.join(unzippedPath, folder);
        const files = fs.readdirSync(folderPath);
        const shpFiles = files.filter(file => file.endsWith('.shp'));

        if (shpFiles.length === 0) {
            console.log(`⚠️ No shapefile found in ${folder}`);
            continue;
        }

        for (const shpFile of shpFiles) {
            const shpPath = path.join(folderPath, shpFile);

            try {
                const features = await processShapefile(shpPath, folder);
                allRecords.push(...features);

                // Insert in smaller batches more frequently
                if (allRecords.length >= 1000) {
                    const inserted = await insertToSupabase(allRecords);
                    totalInserted += inserted;
                    allRecords = []; // Clear the array

                    console.log(`\n🎯 Progress: Folder ${folderIndex + 1}/${folders.length} | Total inserted: ${totalInserted}`);
                }
            } catch (error) {
                console.error(`❌ Failed to process ${shpFile} in ${folder}:`, error.message);
            }
        }

        processedFolders++;
    }

    // Insert remaining records
    if (allRecords.length > 0) {
        const inserted = await insertToSupabase(allRecords);
        totalInserted += inserted;
    }

    console.log(`\n🎉 Processing complete!`);
    console.log(`📊 Final Results:`);
    console.log(`📁 Folders processed: ${processedFolders}`);
    console.log(`📈 Total records inserted: ${totalInserted}`);
}

// Process command line arguments
const args = process.argv.slice(2);
const startFrom = args.includes('--start-from') ?
    parseInt(args[args.indexOf('--start-from') + 1]) || 0 : 0;

// Always run when this file is executed directly
console.log('🚀 Starting GIS data processing...\n');
console.log(`⚙️ Configuration:`);
console.log(`   - Chunk size: 100 records`);
console.log(`   - Batch size: 1000 records`);
console.log(`   - API delay: 500ms`);
console.log(`   - Starting from folder: ${startFrom + 1}\n`);

processAllShapefiles(startFrom).catch(error => {
    console.error('💥 Fatal error:', error);
    console.log('\n🔄 To resume from where you left off, run:');
    console.log(`node process-robust.js --start-from ${startFrom + 5}`);
    process.exit(1);
});

export { processAllShapefiles };
