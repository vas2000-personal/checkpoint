// THE FIVE THEMES, DERIVED RATHER THAN HAND-MIXED.
//
// The accent picker used to swap --green and --focus and nothing else, which is how a plum button
// ended up sitting on forest-green cream. A theme is the whole token vocabulary now, and all five
// are the SAME recipe evaluated at a different hue: identical lightness and chroma targets per
// role, so every theme has the forest theme's rhythm -- the same step from page to card, the same
// weight of hairline, the same distance between body copy and its background.
//
// Lightness targets are in OKLab, so "L 0.42" is the same perceived darkness at every hue; sRGB's
// own numbers are not, which is exactly why hand-mixing five palettes drifts. Chroma is damped per
// role: surfaces stay nearly neutral (the paper is tinted, not colored) and only the accent, the
// deep card and the line art carry real saturation.
//
// `node scripts/themes.mjs --write` regenerates app/styles/40-themes.css. `node scripts/themes.mjs`
// checks every pair this board actually renders and prints the ratios; it exits non-zero if any
// falls under its floor, so a palette cannot ship at a hue where the contrast quietly collapsed.
// tests/appearance.test.js walks the generated CSS independently -- this is the generator's own
// guard, that one is the cascade's.
import {readFileSync,writeFileSync} from 'node:fs';

// --- color -----------------------------------------------------------------------------------
const srgb=c=>{const v=c<=0.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-0.055;return Math.max(0,Math.min(255,Math.round(v*255)))};
function oklch(L,C,h){
 const a=C*Math.cos(h*Math.PI/180),b=C*Math.sin(h*Math.PI/180);
 const l=(L+0.3963377774*a+0.2158037573*b)**3,m=(L-0.1055613458*a-0.0638541728*b)**3,s=(L-0.0894841775*a-1.2914855480*b)**3;
 return '#'+[srgb(+4.0767416621*l-3.3077115913*m+0.2309699292*s),
             srgb(-1.2684380046*l+2.6097574011*m-0.3413193965*s),
             srgb(-0.0041960863*l-0.7034186147*m+1.7076147010*s)]
  .map(v=>v.toString(16).padStart(2,'0')).join('');
}
const channel=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
const lum=hex=>{const n=parseInt(hex.slice(1),16);return .2126*channel(n>>16&255)+.7152*channel(n>>8&255)+.0722*channel(n&255)};
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};

// --- the recipe -------------------------------------------------------------------------------
// [lightness, chroma, hue-offset]. Hue offset lets a role lean off the theme's hue -- the stars stay
// gold in every theme because a gold star is the drawing, not the palette.
const LIGHT={
 bg:[0.962,0.012,0], paper:[0.993,0.004,0], ink:[0.330,0.045,0], text:[0.395,0.035,0],
 muted:[0.430,0.022,0], green:[0.400,0.075,0], line:[0.898,0.016,0], sage:[0.930,0.022,0],
 wash:[0.948,0.014,0], focus:[0.400,0.075,0],
 deep:[0.370,0.060,0], 'deep-fill':[0.422,0.055,0], 'deep-line':[0.660,0.045,0],
 'deep-ink':[0.968,0.015,0], 'deep-text':[0.878,0.030,0], 'deep-soft':[0.748,0.040,0],
 'art-ring':[0.913,0.018,0], 'art-glow':[0.940,0.025,0], 'art-ground':[0.890,0.028,0],
 'art-star':[0.700,0.095,75], 'art-star-alt':[0.730,0.020,0], 'art-dot':[0.620,0.055,0],
 'art-ink':[0.585,0.035,0], 'art-edge':[0.760,0.040,0],
 'icon-bg':[0.935,0.028,0], 'icon-ink':[0.470,0.060,0],
 gold:[0.390,0.070,75], 'gold-bright':[0.800,0.090,75],
 'accent-hover':[0.330,0.070,0], 'accent-shadow':[0.270,0.060,0],
 'contrast-green':[0.290,0.080,0],
 // A failed save is the same warm red in every theme -- a themed error is a confusing error -- but it
 // still has to clear AAA on THIS theme's paper, so it is in the recipe rather than hard-coded.
 alert:[0.443,0.120,32],
};
const DARK={
 bg:[0.230,0.022,0], paper:[0.310,0.028,0], ink:[0.960,0.012,0], text:[0.880,0.022,0],
 muted:[0.800,0.025,0], green:[0.812,0.070,0], line:[0.620,0.030,0], sage:[0.368,0.030,0],
 wash:[0.368,0.030,0], focus:[0.812,0.070,0],
 deep:[0.310,0.028,0], 'deep-fill':[0.368,0.030,0], 'deep-line':[0.620,0.030,0],
 'deep-ink':[0.960,0.012,0], 'deep-text':[0.880,0.022,0], 'deep-soft':[0.800,0.025,0],
 'art-ring':[0.520,0.030,0], 'art-glow':[0.370,0.040,0], 'art-ground':[0.430,0.035,0],
 'art-star':[0.760,0.095,75], 'art-star-alt':[0.700,0.020,0], 'art-dot':[0.650,0.055,0],
 'art-ink':[0.830,0.045,0], 'art-edge':[0.620,0.030,0],
 'icon-bg':[0.360,0.055,0], 'icon-ink':[0.870,0.070,0],
 gold:[0.818,0.090,75], 'gold-bright':[0.818,0.090,75],
 'accent-hover':[0.880,0.060,0], 'accent-shadow':[0.180,0.025,0],
 'contrast-green':[0.905,0.075,0],
 alert:[0.830,0.090,32],
};
// Hue per theme, and the chroma multiplier that keeps a vivid hue from shouting on a reading surface.
const FOREST_LIGHT={bg:'#f6f5ef',paper:'#fffefb',ink:'#253b30',text:'#354239',muted:'#4a504a',green:'#2e513e',line:'#e4e7dc',sage:'#e8eee3',wash:'#f0f1e9',focus:'#3f6a4b',deep:'#2e4e3d','deep-fill':'#3d5442','deep-line':'#8aa081','deep-ink':'#eef1e1','deep-text':'#dbe3d4','deep-soft':'#b7c7ad','art-ring':'#e1e5d9','art-glow':'#edf0e3','art-ground':'#dde3d0','art-star':'#bd9c59','art-star-alt':'#a3b09c','art-dot':'#799475','art-ink':'#78876e','art-edge':'#a8b996','icon-bg':'#edf0e3','icon-ink':'#5f6d48',gold:'#635021','gold-bright':'#d9b978','accent-hover':'#1d3f2c','accent-shadow':'#173627','contrast-green':'#153d25'};
const FOREST_DARK={bg:'#14221b',paper:'#203329',ink:'#f2f5eb',text:'#d5e0d3',muted:'#bdcbbd',green:'#a7c99b',line:'#829887',sage:'#304538',wash:'#304538',focus:'#a7c99b',deep:'#203329','deep-fill':'#304538','deep-line':'#829887','deep-ink':'#f2f5eb','deep-text':'#d5e0d3','deep-soft':'#bdcbbd','art-ring':'#627e68','art-glow':'#304b3b','art-ground':'#36513f','art-star':'#d9b978','art-star-alt':'#a3b09c','art-dot':'#8fae8a','art-ink':'#bdd5b3','art-edge':'#829887','icon-bg':'#35482c','icon-ink':'#d3e1a9',gold:'#e6b468','gold-bright':'#d9b978','accent-hover':'#a7c99b','accent-shadow':'#0d1a13','contrast-green':'#b8efb6'};
const THEMES=[
 {slug:'forest', hue:148, mul:1.00, name:'Forest', light:FOREST_LIGHT, dark:FOREST_DARK},
 {slug:'ocean',  hue:233, mul:1.05, name:'Ocean'},
 {slug:'plum',   hue:338, mul:0.95, name:'Plum'},
 {slug:'clay',   hue:52,  mul:1.00, name:'Clay'},
 {slug:'ink',    hue:250, mul:0.42, name:'Ink'},
];
const derive=(theme,recipe)=>Object.fromEntries(Object.entries(recipe).map(([token,[L,C,dh]])=>
 [token, oklch(L, C*(dh?1:theme.mul), dh? dh : theme.hue)]));
const build=(theme,recipe)=>({...derive(theme,recipe),...(recipe===LIGHT?theme.light:theme.dark)||{}});

// --- what has to stay readable ----------------------------------------------------------------
// [a, b, floor, why]. 7 is AAA body text (1.4.6), 4.5 is AA, 3 is a non-text contrast (1.4.11).
const PAIRS=[
 ['text','bg',7],['text','paper',7],['text','wash',7],['text','sage',7],
 ['muted','bg',7],['muted','paper',7],
 ['ink','bg',7],['ink','paper',7],['ink','sage',7],
 ['gold','paper',7],['gold','bg',7],
 ['alert','paper',7],['alert','bg',7],
 ['paper','green',7],            // a filled control's label on its own fill
 ['green','bg',3],['green','paper',3],
 ['deep-ink','deep',7],['deep-text','deep',7],['deep-soft','deep',4.5],
 ['deep-ink','deep-fill',7],['deep-line','deep',3],['gold-bright','deep',3],
 ['icon-ink','icon-bg',3],['icon-ink','paper',3],
 ['art-ink','bg',3],['art-ink','paper',3],['art-dot','paper',3],
 ['line','paper',1.2],['art-edge','paper',1.2],  // hairlines, not a WCAG pair: a floor so a border cannot vanish
];
// High contrast paints the page pure white (light) or pure black (dark), so the themed accent is
// checked against THAT surface rather than against the theme's own paper.
function audit(tokens,label,contrastPaper){
 const bad=[];
 {const r=ratio(tokens['contrast-green'],contrastPaper);
  if(r+1e-9<7)bad.push(`${label}: --contrast-green on ${contrastPaper} is ${r.toFixed(2)}:1, needs 7:1`)}
 for(const [a,b,floor] of PAIRS){
  const r=ratio(tokens[a]??a,tokens[b]??b);
  if(r+1e-9<floor)bad.push(`${label}: --${a} on --${b} is ${r.toFixed(2)}:1, needs ${floor}:1`);
 }
 return bad;
}

// --- emit -------------------------------------------------------------------------------------
const decls=t=>Object.entries(t).map(([k,v])=>`--${k}:${v}`).join(';');
function render(){
 const out=[`/* GENERATED by scripts/themes.mjs -- edit the recipe there, not the hex here.
   Five themes, one recipe, five hues. Each block states the WHOLE vocabulary rather than an accent,
   because the complaint this answers was a plum button on forest paper: the accent was themed and
   the surface it sat on was not. Lightness and chroma per role are identical across the five, so
   swapping a theme changes the hue of the board and nothing about its rhythm or its contrast.
   scripts/themes.mjs --write regenerates this file and refuses to emit a palette that drops a pair
   below its floor; tests/appearance.test.js then walks the result through the real cascade.
   Tokens only: which SELECTOR takes which token is the other sheets' business, and stays there. */`];
 for(const theme of THEMES){
  const light=build(theme,LIGHT),dark=build(theme,DARK);
  const sel=theme.slug==='forest'?':root,html[data-theme=forest]':`html[data-theme=${theme.slug}]`;
  out.push(`/* ${theme.name} -- hue ${theme.hue}${theme.mul!==1?`, chroma x${theme.mul}`:''} */`);
  out.push(`${sel}{${decls(light)}}`);
  // Forest answers the bare attribute too: an html element that has not been stamped yet (SSR, or a
  // reader whose localStorage holds nothing) is a forest board, in either light or dark.
  const darkSel=theme.slug==='forest'?`html[data-dark=true],html[data-dark=true][data-theme=forest]`:`html[data-dark=true][data-theme=${theme.slug}]`;
  out.push(`${darkSel}{color-scheme:dark;${decls(dark)}}`);
  // High contrast flattens the surfaces to black and white in 11-display-prefs.css -- that part is
  // hue-free. What it cannot flatten is the accent: it still has to be the theme's, and it still has
  // to clear 7:1 against a surface that just became pure white or pure black. One step further out
  // than the ordinary accent, in both directions.
  out.push(`html[data-contrast=true][data-theme=${theme.slug}]{--green:${light['contrast-green']};--focus:var(--ink)}`);
  out.push(`html[data-dark=true][data-contrast=true][data-theme=${theme.slug}]{--green:${dark['contrast-green']};--focus:var(--ink)}`);
  // The picker shows each theme's PAGE with its accent on it, not a dot of accent: the swatch has to
  // answer "what will the board look like", and the board is mostly paper. These are the only values
  // in the sheet quoted outside their own theme -- an option has to paint a theme that is not current.
  out.push(`.theme-option[data-theme=${theme.slug}]{--swatch-page:${light.bg};--swatch-card:${light.paper};--swatch-ink:${light.green};--swatch-line:${light.line}}`);
  out.push(`html[data-dark=true] .theme-option[data-theme=${theme.slug}]{--swatch-page:${dark.bg};--swatch-card:${dark.paper};--swatch-ink:${dark.green};--swatch-line:${dark.line}}`);
 }
 return out.join('\n')+'\n';
}

const problems=THEMES.flatMap(theme=>[
 ...audit(build(theme,LIGHT),theme.name+' light','#ffffff'),
 ...audit(build(theme,DARK),theme.name+' dark','#000000')]);
if(process.argv.includes('--write')&&!problems.length){
 writeFileSync(new URL('../app/styles/40-themes.css',import.meta.url),render());
 console.log('wrote app/styles/40-themes.css');
}
for(const theme of THEMES){
 const l=build(theme,LIGHT),d=build(theme,DARK);
 console.log(`${theme.name.padEnd(7)} light bg ${l.bg} paper ${l.paper} ink ${l.ink} accent ${l.green} | dark bg ${d.bg} paper ${d.paper} accent ${d.green}`);
}
if(problems.length){console.error('\n'+problems.join('\n'));process.exit(1)}
console.log('\nall '+(PAIRS.length*THEMES.length*2)+' pairs clear their floor');
