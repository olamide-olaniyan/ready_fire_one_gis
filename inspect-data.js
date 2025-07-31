import { inspectShapefile } from './process-gis.js';
import fs from 'fs';
import path from 'path';

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
