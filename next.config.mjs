const production = process.env.NODE_ENV === 'production';
// script-src keeps 'unsafe-inline' on purpose. The built HTML carries six inline <script> tags, only
// one of which is the theme script in app/layout.jsx; the rest are Next's own bootstrap and the RSC
// flight payload, whose contents change per render. A hash list cannot cover them, and a nonce needs
// per-request middleware that would make every route dynamic. Tighten the rest instead.
const csp = `default-src 'self'; script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; frame-src 'none'; media-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'${production ? '; upgrade-insecure-requests' : ''}`;
const securityHeaders = [
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
  {key:'X-DNS-Prefetch-Control',value:'off'},
  {key:'Permissions-Policy',value:'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()'},
  {key:'Content-Security-Policy',value:csp},
  // Production only: on http://localhost this would pin the dev origin to HTTPS in the browser.
  ...(production ? [{key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains'}] : []),
];
// /public is served with max-age=0, so every visit revalidates 587 KB of fonts plus 466 KB of mascot
// art. These filenames are not content-hashed, so the window stays short enough to pick up a replaced
// asset; make it immutable only once the names carry a hash.
const assetCache = [{key:'Cache-Control',value:'public, max-age=3600, stale-while-revalidate=604800'}];
export default {
  poweredByHeader:false,
  async headers(){return [{source:'/(.*)',headers:securityHeaders},{source:'/assets/:path*',headers:assetCache}]},
};
