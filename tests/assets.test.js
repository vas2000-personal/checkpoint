import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import config from '../next.config.mjs';
const css=readFileSync(new URL('../public/assets/fonts.css',import.meta.url),'utf8');
const faces=[...css.matchAll(/src:\s*url\(([^)]+)\)\s*format\('([^']+)'\)/g)].map(m=>({url:m[1],hint:m[2]}));
// A container's real format, from its first four bytes, not from what the file is named.
const container=bytes=>bytes.toString('ascii',0,4)==='wOF2'?'woff2':bytes.toString('ascii',0,4)==='wOFF'?'woff':bytes.readUInt32BE(0)===0x00010000?'truetype':bytes.toString('ascii',0,4)==='OTTO'?'opentype':'unknown';

test('every @font-face declares a format() hint that matches the file it points at',()=>{
  assert.equal(faces.length,6);
  for(const face of faces){
    const bytes=readFileSync(new URL('../public'+face.url,import.meta.url));
    assert.equal(face.hint,container(bytes),`${face.url} is a ${container(bytes)} container but is declared format('${face.hint}')`);
  }
});

test('every weight fonts.css declares is actually asked for by globals.css',()=>{
  const globals=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  const declared=[...css.matchAll(/font-weight:\s*(\d+)/g)].map(m=>m[1]);
  // Weights reach the cascade either as `font-weight:N` or inside the `font:` shorthand.
  const used=new Set([...globals.matchAll(/font-weight:\s*(\d+)|font:\s*(?:italic\s+)?(\d{3})\s/g)].map(m=>m[1]||m[2]));
  used.add('400'); // the body rule uses the `font:` shorthand with no weight, which resolves to normal
  for(const weight of new Set(declared))assert.ok(used.has(weight),`fonts.css ships weight ${weight} that no rule in globals.css selects`);
});

test('security headers cover every route and assets get a cache window',async()=>{
  const rules=await config.headers();
  const all=rules.find(rule=>rule.source==='/(.*)');
  const value=key=>all.headers.find(header=>header.key===key)?.value;
  assert.equal(value('X-Content-Type-Options'),'nosniff');
  assert.equal(value('X-Frame-Options'),'DENY');
  assert.equal(value('Cross-Origin-Opener-Policy'),'same-origin');
  assert.ok(value('Permissions-Policy').includes('geolocation=()'));
  const csp=value('Content-Security-Policy');
  for(const directive of ["default-src 'self'","object-src 'none'","frame-ancestors 'none'","base-uri 'self'","form-action 'self'","connect-src 'self'"])assert.ok(csp.includes(directive),`CSP is missing ${directive}`);
  // The theme script in app/layout.jsx is inline and Next inlines its own, so this stays until a nonce exists.
  assert.ok(csp.includes("script-src 'self' 'unsafe-inline'"));
  const assets=rules.find(rule=>rule.source==='/assets/:path*');
  assert.match(assets.headers[0].value,/max-age=\d+/);
});
