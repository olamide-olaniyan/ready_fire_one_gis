import fetch from 'node-fetch';
import fs from 'graceful-fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { getProxyAgent } from "./proxies.js";
import AdmZip from 'adm-zip';

const sanitize = (text) =>
    text.toLowerCase().replace(/\s+/g, '_').replace(/[^\w\-]/g, '');

const downloadZip = async (url, filename) => {
    const res = await fetch(url, {
        agent: getProxyAgent(),
        headers: {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "pragma": "no-cache",
            "priority": "u=0, i",
            "sec-ch-ua": "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": "\"Android\"",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "cross-site",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "Referer": "https://osfm.fire.ca.gov/",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
        },
    });

    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);

    const buffer = await res.buffer();
    fs.writeFileSync(filename, buffer);
    console.log(`Downloaded: ${filename}`);
};

const unzipFile = (zipPath, extractTo = './unzipped') => {
    const zip = new AdmZip(zipPath);
    const outDir = path.join(extractTo, path.basename(zipPath, '.zip'));

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    zip.extractAllTo(outDir, true);
    console.log(`Unzipped to: ${outDir}`);
};

(async () => {
    const res = await fetch("https://osfm.fire.ca.gov/what-we-do/community-wildfire-preparedness-and-mitigation/fire-hazard-severity-zones/fire-hazard-severity-zones-maps");
    const body = await res.text();

    const $ = cheerio.load(body);
    const downloadDir = './downloads';
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

    $('.panel').each((_, panel) => {
        const cityRaw = $(panel).attr('id');
        if (!cityRaw) return;

        const city = sanitize(cityRaw);
        let currentLabel = "unlabeled";

        $(panel).find('p, em').each((_, el) => {
            const tag = $(el).get(0).tagName;
            const text = $(el).text().trim();

            if (tag === 'em' || (tag === 'p' && /recommended|draft/i.test(text))) {
                if (/recommended/i.test(text)) currentLabel = 'recommended';
                else if (/draft/i.test(text)) currentLabel = 'draft';
            }

            $(el).find('a[href$=".zip"]').each(async (_, a) => {
                const href = $(a).attr('href');
                if (!href) return;

                const ext = path.extname(href.split('?')[0]); // handles .zip?rev=xyz
                const filename = `${city}_gis_${currentLabel}${ext}`;
                const filepath = path.join(downloadDir, filename);

                try {
                    await downloadZip(href, filepath);
                    unzipFile(filepath);
                } catch (err) {
                    console.error(`Failed to download for ${city}: ${href}`, err.message);
                }
            });
        });
    });
})();
