import shapefile from 'shapefile';
import fs from 'fs';
import path from 'path';

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
    } catch (error) {
        console.error(`❌ Error inspecting ${shpPath}: ${error.message}`);
    }
}

// Inspect a few sample files to understand the data structure
async function inspectSampleFiles() {
    const unzippedPath = './unzipped';
    const folders = fs.readdirSync(unzippedPath).slice(0, 3); // Just first 3 folders

    for (const folder of folders) {
        console.log(`\n=== INSPECTING FOLDER: ${folder} ===`);

        const folderPath = path.join(unzippedPath, folder);
        const files = fs.readdirSync(folderPath);
        const shpFiles = files.filter(file => file.endsWith('.shp'));

        for (const shpFile of shpFiles) {
            const shpPath = path.join(folderPath, shpFile);
            await inspectShapefile(shpPath);
        }
    }
}

inspectSampleFiles().catch(console.error);
