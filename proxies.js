import HttpsProxyAgent from "https-proxy-agent";
import dotenv from "dotenv";
dotenv.config();

export function getProxyAgent() {
    const proxyAgent = new HttpsProxyAgent({
        host: `${process.env.PROXY_DOMAIN}`,
        port: `${process.env.PROXY_PORT}`,
        auth: `${process.env.PROXY_USER}:${process.env.PROXY_PASS}`,
    });
    return proxyAgent;
}

export function getProxyUrl() {
    return `http://${process.env.PROXY_USER}:${process.env.PROXY_PASS}@${process.env.PROXY_DOMAIN}:${process.env.PROXY_PORT}`;
}

(async () => {
    // const fetchRes = await fetch("https://ipinfo.io/json", {
    //   agent: getProxyAgent(),
    // });
    // const fetchJson = await fetchRes.json();
    // console.log("fetchJson", fetchJson);

    // const gotScrapingRes = await gotScraping("https://ipinfo.io/json", {
    //   responseType: "json",
    //   proxyUrl: getProxyUrl(),
    // });
    // console.log("gotScrapingRes.body", gotScrapingRes.body);
})();
