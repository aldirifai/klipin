// Cloudflare Worker — reverse proxy ke api.anthropic.com.
// Workaround buat VPS di unsupported region Anthropic (HK/ID/CN/...).
// Egress dari edge Cloudflare (US/EU), origin gak liat IP VPS.
//
// Deploy:
//   1. cloudflare.com → Workers & Pages → Create → Hello World template
//   2. Replace worker code dengan file ini → Deploy
//   3. Catat URL: https://<name>.<account>.workers.dev
//   4. Set ANTHROPIC_BASE_URL=<URL> di .env produksi
//
// Optional hardening: set env var PROXY_SECRET di Worker dashboard, lalu
// tambahin header `x-proxy-secret: <value>` di app. Mencegah orang lain
// pakai Worker kamu sebagai open proxy (mereka tetep butuh Anthropic key,
// tapi kuota Worker bisa kepake).

const UPSTREAM = "https://api.anthropic.com";

// Headers yang harus di-strip sebelum forward — Cloudflare nambahin metadata
// yang bisa "bocor" identitas asal request ke origin.
const STRIP_HEADERS = [
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
];

export default {
  async fetch(request, env) {
    if (env.PROXY_SECRET) {
      const provided = request.headers.get("x-proxy-secret");
      if (provided !== env.PROXY_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const inUrl = new URL(request.url);
    const target = new URL(inUrl.pathname + inUrl.search, UPSTREAM);

    const headers = new Headers(request.headers);
    for (const h of STRIP_HEADERS) headers.delete(h);
    headers.delete("x-proxy-secret");

    const upstreamReq = new Request(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "follow",
    });

    const upstreamResp = await fetch(upstreamReq);

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: upstreamResp.headers,
    });
  },
};
