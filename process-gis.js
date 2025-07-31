import { createClient } from '@supabase/supabase-js';
import shapefile from 'shapefile';
import fs from 'fs';
import path from 'path';
import proj4 from 'proj4';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Please add SUPABASE_URL and SUPABASE_KEY to your .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Define WGS84 projection (EPSG:4326) - This is what we want our output to be
const wgs84 = proj4.defs('EPSG:4326') || '+proj=longlat +datum=WGS84 +no_defs';

/**
 * Convert coordinates to WGS84 (latitude/longitude)
 */
function transformCoordinates(coordinates, fromProjection) {
    if (!fromProjection || fromProjection === 'EPSG:4326') {
        return coordinates; // Already in WGS84
    }

    try {
        const transform = proj4(fromProjection, wgs84);

        if (Array.isArray(coordinates[0])) {
            // Multiple coordinate pairs (polygon/line)
            return coordinates.map(coord => {
                if (Array.isArray(coord[0])) {
                    // Nested arrays (multipolygon)
                    return coord.map(innerCoord => transform.forward(innerCoord));
                } else {
                    // Single coordinate pair
                    return transform.forward(coord);
                }
            });
        } else {
            // Single coordinate pair (point)
            return transform.forward(coordinates);
        }
    } catch (error) {
        console.warn(`⚠️ Coordinate transformation failed: ${error.message}`);
        return coordinates; // Return original if transformation fails
    }
}

/**
 * Convert geometry to WKT format
 */
function geometryToWKT(geom, projection) {
    if (!geom) return null;

    const { type, coordinates } = geom;
    const transformedCoords = transformCoordinates(coordinates, projection);

    switch (type) {
        case 'Point':
            return `POINT(${transformedCoords[0]} ${transformedCoords[1]})`;

        case 'LineString':
            const lineCoords = transformedCoords.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
            return `LINESTRING(${lineCoords})`;

        case 'Polygon':
            const polygonRings = transformedCoords.map(ring => {
                const ringCoords = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
                return `(${ringCoords})`;
            }).join(', ');
            return `POLYGON(${polygonRings})`;

        case 'MultiPolygon':
            const multiPolygonParts = transformedCoords.map(polygon => {
                const polygonRings = polygon.map(ring => {
                    const ringCoords = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
                    return `(${ringCoords})`;
                }).join(', ');
                return `(${polygonRings})`;
            }).join(', ');
            return `MULTIPOLYGON(${multiPolygonParts})`;

        default:
            console.warn(`⚠️ Unsupported geometry type: ${type}`);
            return null;
    }
}

/**
 * Clean and normalize property names
 */
function cleanProperties(properties) {
    const cleaned = {};

    for (const [key, value] of Object.entries(properties || {})) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        cleaned[cleanKey] = value;
    }

    return cleaned;
}

/**
 * Process a single shapefile
 */
async function processShapefile(shpPath, folderName) {
    try {
        console.log(`🔄 Processing: ${shpPath}`);

        const features = [];
        let recordCount = 0;
        let projection = null;

        // Try to read projection file
        const prjPath = shpPath.replace('.shp', '.prj');
        if (fs.existsSync(prjPath)) {
            try {
                const prjContent = fs.readFileSync(prjPath, 'utf8');
                projection = prjContent.trim();
                console.log(`📍 Found projection: ${projection.substring(0, 50)}...`);
            } catch (error) {
                console.warn(`⚠️ Could not read projection file: ${error.message}`);
            }
        }

        // Read shapefile
        const source = await shapefile.open(shpPath);

        while (true) {
            const result = await source.read();
            if (result.done) break;

            const { geometry, properties } = result.value;
            recordCount++;

            if (!geometry) {
                console.warn(`⚠️ Record ${recordCount} has no geometry, skipping`);
                continue;
            }

            // Convert geometry to WKT
            const wktGeometry = geometryToWKT(geometry, projection);
            if (!wktGeometry) {
                console.warn(`⚠️ Could not convert geometry for record ${recordCount}, skipping`);
                continue;
            }

            // Clean properties
            const cleanProps = cleanProperties(properties);

            // Create record for database
            const record = {
                ...cleanProps,
                geometry: wktGeometry,
                source_folder: folderName,
                source_file: path.basename(shpPath)
            };

            features.push(record);
        }

        await source.close();

        console.log(`✅ Processed ${features.length} features from ${path.basename(shpPath)}`);
        return features;

    } catch (error) {
        console.error(`❌ Error processing ${shpPath}: ${error.message}`);
        return [];
    }
}

/**
 * Insert records into Supabase in chunks
 */
async function insertToSupabase(records, chunkSize = 1000) {
    console.log(`📤 Inserting ${records.length} records to Supabase...`);

    let totalInserted = 0;

    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);

        try {
            const { data, error } = await supabase
                .from('calfire_zone_risk_duplicate')
                .insert(chunk);

            if (error) {
                console.error(`❌ Error inserting chunk ${i}-${i + chunk.length - 1}:`, error);
            } else {
                totalInserted += chunk.length;
                console.log(`✅ Inserted chunk ${i}-${i + chunk.length - 1} (${totalInserted}/${records.length})`);
            }
        } catch (error) {
            console.error(`❌ Exception inserting chunk ${i}-${i + chunk.length - 1}:`, error.message);
        }
    }

    console.log(`🎉 Total inserted: ${totalInserted}/${records.length}`);
}

/**
 * Inspect a shapefile to understand its structure
 */
async function inspectShapefile(shpPath) {
    try {
        console.log(`🔍 Inspecting: ${shpPath}`);

        const source = await shapefile.open(shpPath);
        const result = await source.read();

        if (!result.done && result.value) {
            const { geometry, properties } = result.value;

            console.log(`📊 Geometry Type: ${geometry?.type || 'None'}`);
            console.log(`📋 Properties:`, Object.keys(properties || {}));
            console.log(`📋 Sample Properties:`, properties);

            if (geometry?.coordinates) {
                console.log(`📍 Sample Coordinates:`, geometry.coordinates[0]?.slice(0, 2));
            }
        }

        await source.close();
    } catch (error) {
        console.error(`❌ Error inspecting ${shpPath}: ${error.message}`);
    }
}

/**
 * Main processing function
 */
async function processAllShapefiles(unzippedPath = './unzipped', inspectOnly = false) {
    const folders = fs.readdirSync(unzippedPath).filter(folder => {
        const folderPath = path.join(unzippedPath, folder);
        return fs.statSync(folderPath).isDirectory();
    });

    console.log(`📁 Found ${folders.length} folders to process`);

    let allRecords = [];

    for (const folder of folders) {
        console.log(`\n📂 Processing folder: ${folder}`);

        const folderPath = path.join(unzippedPath, folder);
        const files = fs.readdirSync(folderPath);
        const shpFiles = files.filter(file => file.endsWith('.shp'));

        if (shpFiles.length === 0) {
            console.log(`⚠️ No shapefile found in ${folder}`);
            continue;
        }

        for (const shpFile of shpFiles) {
            const shpPath = path.join(folderPath, shpFile);

            if (inspectOnly) {
                await inspectShapefile(shpPath);
            } else {
                const features = await processShapefile(shpPath, folder);
                allRecords.push(...features);
            }
        }
    }

    if (!inspectOnly && allRecords.length > 0) {
        console.log(`\n📊 Total records to insert: ${allRecords.length}`);
        await insertToSupabase(allRecords);
    }

    console.log(`\n🎉 Processing complete!`);
}

// Export functions for use in other files
export { processAllShapefiles, inspectShapefile, processShapefile };

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const inspectOnly = args.includes('--inspect');

    processAllShapefiles('./unzipped', inspectOnly).catch(console.error);
}
