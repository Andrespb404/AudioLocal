import { conversionPath, conversions } from '../data/conversions.js';

const staticPaths = ['/', '/about.html', '/privacy.html', '/terms.html', '/en.html', '/en/about.html', '/en/privacy.html', '/en/terms.html'];

export function GET({ site }) {
  const paths = [...staticPaths, ...conversions.flatMap((conversion) => [conversionPath(conversion, 'es'), conversionPath(conversion, 'en')])];
  const urls = paths.map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
