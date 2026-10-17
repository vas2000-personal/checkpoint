import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {cascade,source} from '../scripts/css-cascade.mjs';
const sheet=source(new URL('../app/globals.css',import.meta.url));
const layout=readFileSync(new URL('../app/layout.jsx',import.meta.url),'utf8');
const {map}=cascade();
const at=(ctx,sel,prop)=>map[ctx+'||'+sel+'||'+prop];
const channel=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4};
const expand6=hex=>hex.length===4?'#'+[...hex.slice(1)].map(c=>c+c).join(''):hex;
const luminance=hex=>{const n=parseInt(expand6(hex).slice(1),16);return .2126*channel(n>>16&255)+.7152*channel(n>>8&255)+.0722*channel(n&255)};
const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};

// ---------------------------------------------------------------------------
// A small cascade of our own. The css-cascade fixture keys by (media, selector,
// property), so it can prove a value did not move but never which SELECTOR wins
// for a given element, and never that the winner changes per theme. Both of the
// serious regressions on this branch hid in exactly that blind spot.
// ---------------------------------------------------------------------------
const matchBrace=(css,open)=>{let i=open+1,d=1;while(i<css.length){const c=css[i];if(c==='/'&&css[i+1]==='*'){const e=css.indexOf('*/',i+2);i=e<0?css.length:e+2;continue}if(c==='"'||c==="'"){i++;while(i<css.length&&css[i]!==c){if(css[i]==='\\')i++;i++}i++;continue}if(c==='{')d++;else if(c==='}'&&!--d)return i;i++}return css.length};
// Top-level rules only, in source order: every theme override in this sheet lives outside @media.
function topRules(css) {
 const out=[];let i=0,from=0;
 while(i<css.length){
  const c=css[i];
  if(c==='/'&&css[i+1]==='*'){const e=css.indexOf('*/',i+2);i=e<0?css.length:e+2;from=i;continue}
  if(c==='"'||c==="'"){i++;while(i<css.length&&css[i]!==c){if(css[i]==='\\')i++;i++}i++;continue}
  if(c==='{'){const prelude=css.slice(from,i).trim(),close=matchBrace(css,i);
   if(prelude[0]!=='@')out.push([prelude,css.slice(i+1,close)]);
   i=close+1;from=i;continue}
  if(c===';'){from=i+1}
  i++;
 }
 return out;
}
const splitTop=(text,sep)=>{const parts=[];let depth=0,from=0;for(let i=0;i<text.length;i++){const c=text[i];if(c==='(')depth++;else if(c===')')depth--;else if(c===sep&&!depth){parts.push(text.slice(from,i));from=i+1}}parts.push(text.slice(from));return parts.map(p=>p.trim()).filter(Boolean)};
function decls(body) {
 const out={};
 for(const part of splitTop(body,';')){
  let depth=0,cut=-1;
  for(let i=0;i<part.length;i++){const c=part[i];if(c==='(')depth++;else if(c===')')depth--;else if(c===':'&&!depth){cut=i;break}}
  if(cut>0)out[part.slice(0,cut).trim().toLowerCase()]=part.slice(cut+1).trim();
 }
 return out;
}
// :is() contributes the specificity of its most specific branch, but matching has to
// consider every branch, so the two are tracked separately.
const branches=sel=>{const m=/^(.*?):is\(([^)]*)\)(.*)$/.exec(sel);return m?splitTop(m[2],',').map(b=>(m[1]+b+m[3]).trim()):[sel.trim()]};
function spec(sel) {
 let a=0,b=0,c=0,s=sel;
 s=s.replace(/::[\w-]+/g,()=>{c++;return ' '});
 s=s.replace(/#[\w-]+/g,()=>{a++;return ' '});
 s=s.replace(/\[[^\]]*\]/g,()=>{b++;return ' '});
 s=s.replace(/:[\w-]+(\([^)]*\))?/g,()=>{b++;return ' '});
 s=s.replace(/\.[\w-]+/g,()=>{b++;return ' '});
 s=s.replace(/[a-z][\w-]*/gi,()=>{c++;return ' '});
 return a*1e6+b*1e3+c;
}
const compounds=sel=>sel.split(/\s*[>\s]\s*/).filter(Boolean);
const tokens=part=>part.match(/^[a-z][\w-]*|[#.][\w-]+|\[[^\]]*\]|::?[\w-]+/gi)||[];
const pseudoEl=sel=>(sel.match(/::[\w-]+/)||[''])[0];
// Tail-aligned compound-subset match: enough for the probes below and never over-matches.
function matches(probe,target) {
 if(pseudoEl(probe)!==pseudoEl(target))return false;
 const S=compounds(probe),T=compounds(target);
 if(T.length>S.length)return false;
 for(let i=0;i<T.length;i++){
  const have=new Set(tokens(S[S.length-T.length+i]));
  if(!tokens(T[i]).every(t=>have.has(t)))return false;
 }
 return true;
}
const RULES=topRules(sheet).flatMap(([prelude,body],order)=>splitTop(prelude,',').map(sel=>{
 const dark=/\[data-dark=true\]/.test(sel),contrast=/\[data-contrast=true\]/.test(sel);
 // The theme multiplies dark and contrast: a theme block restates the whole token vocabulary, so a
 // rule scoped to one theme must be read only while that theme is the one selected.
 const theme=(sel.match(/\[data-theme=([\w-]+)\]/)||[])[1]||null;
 const prefix=(sel.match(/^html(\[data-[\w-]+=[^\]]*\])*/)||[''])[0];
 let rest=sel.slice(prefix.length).trim();
 if(rest===''||rest===':root')rest='html';
 return {order,dark,contrast,theme,scoped:/data-(focus|scale)/.test(sel),
  targets:branches(rest),specificity:spec(prefix)+Math.max(...branches(rest).map(spec)),decls:decls(body)};
}));
const BASE_THEMES=[{name:'light',dark:false,contrast:false},{name:'dark',dark:true,contrast:false},
 {name:'high contrast',dark:false,contrast:true},{name:'dark + high contrast',dark:true,contrast:true}];
// lib/prefs.js THEMES, the five palettes the picker offers. Every contrast guard below walks theme
// x dark x contrast — twenty combinations, not four — because a palette that only passed at forest's
// would be a readable default shipped with four unreadable alternatives. Forest is first, so the
// THEMES[0] probes and the failure messages still read as the shipped look.
const THEME_SLUGS=['forest','ocean','plum','clay','ink'];
const THEMES=BASE_THEMES.flatMap(base=>THEME_SLUGS.map(theme=>({...base,theme,name:base.name+' / '+theme})));
const applies=(rule,theme)=>!rule.scoped&&(!rule.dark||theme.dark)&&(!rule.contrast||theme.contrast)&&(!rule.theme||rule.theme===theme.theme);
function winner(probe,prop,theme) {
 let best=null;
 for(const rule of RULES){
  if(!applies(rule,theme)||rule.decls[prop]===undefined)continue;
  if(!rule.targets.some(t=>matches(probe,t)))continue;
  if(!best||rule.specificity>best.specificity||(rule.specificity===best.specificity&&rule.order>=best.order))best=rule;
 }
 return best&&best.decls[prop];
}
const TOKENS=theme=>{const out={};
 for(const rule of RULES){if(!applies(rule,theme)||!rule.targets.includes('html'))continue;
  for(const [k,v] of Object.entries(rule.decls))if(k.startsWith('--'))out[k]=v}
 return out};
const NAMED={white:'#ffffff',black:'#000000'};
const hex=(value,theme,what)=>{
 let v=value;
 for(let i=0;i<4&&/^var\(/.test(v);i++)v=TOKENS(theme)[/^var\(\s*(--[\w-]+)/.exec(v)[1]]??v;
 v=NAMED[v]??v;
 assert.match(v||'',/^#[0-9a-f]{3,8}$/i,what+' did not resolve to a literal color in '+theme.name+' (got '+value+')');
 return v;
};
// First surface in the chain that actually paints; otherwise the page background.
function surface(chain,theme) {
 for(const sel of chain){
  const v=winner(sel,'background',theme)??winner(sel,'background-color',theme);
  if(v&&!/^(none|transparent|inherit|0)$/.test(v)&&!/gradient/.test(v))return hex(v.split(/\s+/)[0],theme,sel+' background');
 }
 return hex('var(--bg)',theme,'page background');
}

// ---------------------------------------------------------------------------
// Root font size. Never assume 1rem is 16px: the display scale moves the root.
//
// WHAT THE 16px RULE BELOW IS AND IS NOT. It is input/textarea/select ONLY, and deliberately so: its
// purpose is iOS Safari, which zooms the page when a control under 16px takes focus and never zooms
// back out. It is not a legibility floor for the sheet. At the Small scale a control LABEL is 11-15px
// and a 2.75rem target measures 38.5px, which is inherent to writing sizes in rem -- the Small scale
// moves the root, so it moves every rem with it -- and applies equally to controls that predate this
// phase. Every real form field passes at all three scales. Shrinking the scale is the point of the
// scale; do not read this test as a claim that nothing on the page is under 16px.
// ---------------------------------------------------------------------------
const SCALES={small:at('','html[data-scale=small]','font-size'),normal:at('','html','font-size'),large:at('','html[data-scale=large]','font-size')};
const VIEWPORTS=[320,390,768];
function clampPx(value,vw) {
 const m=/^clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)$/.exec(value);
 assert.ok(m,'unsupported root font-size '+value);
 return Math.min(Math.max(+m[1],+m[2]*vw/100),+m[3]);
}
// Resolve a font-size value to px for a given root size: rem, px and max()/min() of both.
function sizePx(value,root) {
 const v=value.trim();
 const fn=/^(max|min)\((.*)\)$/.exec(v);
 if(fn)return Math[fn[1]](...splitTop(fn[2],',').map(part=>sizePx(part,root)));
 // clamp(floor,preferred,ceiling): the floor is the smallest it can ever render, which is the only
 // bound that matters when the question is "is this still large text at the Small scale".
 const cl=/^clamp\((.*)\)$/.exec(v);
 if(cl)return sizePx(splitTop(cl[1],',')[0],root);
 if(v.endsWith('rem'))return parseFloat(v)*root;
 if(v.endsWith('px'))return parseFloat(v);
 if(parseFloat(v)===0)return 0;
 assert.fail('unsupported control font-size '+value);
}
const mediaApplies=(ctx,vw)=>ctx.split('&&').every(part=>{
 const max=/max-width:\s*(\d+)px/.exec(part),min=/min-width:\s*(\d+)px/.exec(part);
 return (!max||vw<=+max[1])&&(!min||vw>=+min[1]);
});
const LARGE_PX=24,LARGE_BOLD_PX=18.66;
// the base rules use the font shorthand, so pull the size out of whichever form each context used.
const fontSize=(ctx,sel)=>at(ctx,sel,'font-size')??/(^|[\s/])([\d.]+rem)([\s/]|$)/.exec(at(ctx,sel,'font')||'')?.[2];
// Weight, from font-weight or from the leading 3-digit number of a `font` shorthand.
const fontWeight=(ctx,sel)=>at(ctx,sel,'font-weight')??/(^|[\s])([1-9]00)(?=[\s])/.exec(at(ctx,sel,'font')||'')?.[2];
// ---------------------------------------------------------------------------
// THE AAA BAR, SC 1.4.6: 7:1 for normal text, 4.5:1 only for LARGE text, where
// large is >=24px, or >=18.66px at weight >=700. Both thresholds are CSS pixels,
// so the bar is not a property of a selector -- it is a property of a selector AT
// A DISPLAY SCALE. The Small scale pins the root at 14px, so a 1.25rem/800 wordmark
// is 20px (large, 4.5:1) at Normal and 17.5px (NOT large, 7:1) at Small, and the
// bar that has to hold is the strictest of the three.
//
// Resolution is conservative on purpose, in both directions that matter:
//  - size: the SMALLEST size any context states for the selector, measured at the
//    Small scale and at 320px (the narrowest viewport, so the root clamp is at its
//    floor). A selector that states no size of its own inherits the 1rem body and
//    is treated as normal text -- which is the right answer, never a loophole.
//  - weight: the heaviest weight stated for the selector, defaulting to the 400 the
//    body carries. Heavier only ever makes `large` easier to reach, so pairing it
//    with the smallest size is the combination that could wrongly claim 4.5:1; if a
//    selector passes under THAT pairing it passes under every real one.
// ---------------------------------------------------------------------------
const LARGE_BOLD_WEIGHT=700;
// Every value any context in the sheet states for one of `props` on this exact selector. `font` is a
// shorthand, so the size and the weight have to be picked back out of it.
const stated=(sel,prop)=>Object.keys(map).filter(k=>{const [,t,p]=k.split('||');return t===sel&&(p===prop||p==='font')})
 .map(k=>{const [,,p]=k.split('||');if(p!=='font')return map[k];
  return prop==='font-size'?/(^|[\s/])((?:clamp|max|min)\([^)]*\)|[\d.]+(?:rem|px))([\s/]|$)/.exec(map[k])?.[2]
                          :/(^|[\s])([1-9]00)(?=[\s])/.exec(map[k])?.[2]}).filter(Boolean);
// Font size and weight INHERIT, so a probe that states neither takes them from the nearest ancestor
// selector that does: `h1 em` is 40-64px because `h1` is, and calling it 14px body text would have
// demanded 7:1 of a hero heading that the large-text exemption plainly covers.
const inherited=(sel,prop)=>{
 for(let probe=sel;probe;probe=probe.replace(/[\s>]*[^\s>]+$/,'').trim()){
  const own=stated(probe,prop);
  if(own.length)return own;
 }
 return [];
};
function aaaBar(sel) {
 // Small scale at 320px: the root clamp is at its floor, so this is the smallest any rem can render.
 const root=clampPx(SCALES.small,320);
 const sizes=inherited(sel,'font-size').map(v=>{try{return sizePx(v,root)}catch{return null}}).filter(v=>v!==null);
 const px=sizes.length?Math.min(...sizes):sizePx(at('','body','font-size')??'1rem',root);
 const weight=Math.max(400,...inherited(sel,'font-weight').map(Number).filter(Number.isFinite));
 const large=px>=LARGE_PX||(weight>=LARGE_BOLD_WEIGHT&&px>=LARGE_BOLD_PX);
 return {need:large?4.5:7,px,weight,large};
}
// Every muted class the parents read, paired with the stack of surfaces it can sit on.
const TEXT=[
 ['footer',['body']],['footer p',['body']],['.post-day-label',['body']],['.today-tag',['body']],
 ['.mascot-note',['body']],['.art-label',['body']],['.today-status',['body']],['h1 em',['body']],
 ['.hero-copy>p',['body']],['.empty',['.empty','body']],['.feed-heading h2 span',['body']],
 ['.header-note',['.site-header','body']],
 ['.day',['.day','.card','body']],['.week .eyebrow',['.card','body']],['.family-note h3',['.card','body']],
 ['.stat small',['.stat','body']],['.stat em',['.stat','body']],['.compose-footer>span',['.card','body']],
 ['.writing-prompts>span',['.card','body']],['.writing-prompts button',['.writing-prompts button','.card','body']],
 ['#entry-dialog .eyebrow',['dialog','body']],['small.privacy',['dialog','body']],['label',['dialog','body']],
 ['.eyebrow',['.card','body']],['.profile-settings small',['.card','body']],['.break-controls p',['.card','body']],
 ['.day.today',['.day.today','.day','.card','body']],['p',['.card','body']],
 ['.filter-tabs button',['.filter-tabs','.card','body']],['button.load-more',['button.load-more','.card','body']],
 ['.post-status',['.post-status','.post','body']],['.day b',['.day b','.day','.card','body']],
 ['.day.checked b',['.day.checked b','.day','.card','body']],['.post-avatar',['.post-avatar','.post','body']],
 ['input::placeholder',['input','dialog','body']],['textarea::placeholder',['textarea','.card','body']],
 // Both of these used to ride the WCAG large-text exemption and lost it at the Small scale; they are plain 4.5:1 text now.
 ['.footer-brand',['body']],['.brand-dot',['.site-header','body']],['.weekly-totals strong',['.card','body']],
 // /settings: every panel is .card .profile-settings, so these ride the same surfaces the pace card does.
 ['.settings-hint',['.card','body']],['.settings-status',['.card','body']],['.settings-reveal ol',['.card','body']],
 ['.settings-nav a',['.settings-nav a','body']],['.settings-bottom-nav a',['body']],
 // THE PHONE'S PRIMARY NAVIGATION, which this registry claimed to cover and did not. Both bars paint
 // --bg, the color the header already paints, so the page is their surface. .header-settings sets
 // background:none deliberately, which is why its chain falls through to the header and then the page.
 ['.board-tab',['body']],['.header-settings',['.site-header','body']],
 // .text-button is a link and takes var(--green) now rather than a hard-coded forest, so the accents
 // reach it; that makes it accent x theme text and it belongs in the walk.
 ['.text-button',['.card','body']],
 ['.settings-meta dt',['.settings-meta>div','.card','body']],['.settings-meta dd',['.settings-meta>div','.card','body']],
];
test('muted body text clears WCAG AAA 1.4.6 in every theme the board can render in',()=>{
 const failing=[];
 for(const theme of THEMES)for(const [sel,chain] of TEXT){
  const raw=winner(sel,'color',theme);
  assert.ok(raw,sel+' has no resolved color in '+theme.name);
  const {need,px,large}=aaaBar(sel);
  const fg=hex(raw,theme,sel),bg=surface(chain,theme),r=ratio(fg,bg);
  if(r<need)failing.push(theme.name+': '+sel+' is '+px.toFixed(1)+'px at the Small scale ('+(large?'large':'normal')+', needs '+need+':1) but '+fg+' on '+bg+' = '+r.toFixed(2)+':1');
 }
 assert.deepEqual(failing,[],'these need 7:1 against their own background, or 4.5:1 if they are large at EVERY scale');
});

// ---------------------------------------------------------------------------
// A filled control carries its own background, so the themed :is() TEXT lists can
// recolor its label without touching its fill. :is() takes the specificity of its
// MOST specific branch, which is how a plain `.chart-toggle button` entry came to
// out-specify `.chart-toggle button.active` and strand #111 on a #314f42 pill.
// ---------------------------------------------------------------------------
const PRESSED=[
 ['.filter-tabs button.active',['.filter-tabs button.active','.filter-tabs','.card','body']],
 ['.chart-toggle button.active',['.chart-toggle button.active','.chart-toggle','.card','body']],
 ['.display-button[aria-pressed=true]',['.display-button[aria-pressed=true]','.site-header','body']],
 ['.scale-options button[aria-pressed=true]',['.scale-options button[aria-pressed=true]','.scale-options','body']],
 ['.primary',['.primary','.card','body']],['.header-action',['.header-action','.site-header','body']],
 ['.settings-save',['.settings-save','.profile-settings','body']],
 ['.studying-badge',['.studying-badge','.card','body']],['#toast',['#toast','body']],
 ['.brand-icon',['.brand-icon','.site-header','body']],['.pill',['.pill','.adventure','body']],
 // /settings: the accent-filled controls, which is where a bad accent would actually hurt.
 ['.settings-choice[aria-pressed=true]',['.settings-choice[aria-pressed=true]','.card','body']],
 ['.settings-nav a[aria-current=page]',['.settings-nav a[aria-current=page]','body']],
 ['.settings-switch-state',['.settings-switch-state','.settings-switch','.card','body']],
 ['.settings-switch[aria-pressed=true] .settings-switch-state',['.settings-switch[aria-pressed=true] .settings-switch-state','.settings-switch','.card','body']],
 ['.settings-bottom-nav a[aria-current=page]',['.settings-bottom-nav a[aria-current=page]','body']],
];
test('a filled control keeps its label readable on its own fill in every theme',()=>{
 const failing=[];
 for(const theme of THEMES)for(const [sel,chain] of PRESSED){
  const raw=winner(sel,'color',theme);
  assert.ok(raw,sel+' has no resolved color in '+theme.name);
  const {need,px,large}=aaaBar(sel);
  const fg=hex(raw,theme,sel),bg=surface(chain,theme),r=ratio(fg,bg);
  if(r<need)failing.push(theme.name+': '+sel+' is '+px.toFixed(1)+'px at the Small scale ('+(large?'large':'normal')+', needs '+need+':1) but '+fg+' on its own '+bg+' = '+r.toFixed(2)+':1');
 }
 assert.deepEqual(failing,[],'a themed text list recolored these labels without restating their fill');
});
// Every themed :is() TEXT list entry that names a control which also has a filled .active/pressed
// state must be paired with a rule restating that state, or the fill and the label drift apart.
test('every themed text list that recolors a control also restates its filled state',()=>{
 const missing=[];
 for(const rule of RULES){
  if(rule.decls['color']===undefined||rule.decls['background']!==undefined)continue;
  if(!rule.dark&&!rule.contrast)continue;
  for(const target of rule.targets){
   for(const filled of PRESSED.map(([sel])=>sel)){
    if(!filled.startsWith(target+'.')&&!filled.startsWith(target+'['))continue;
    // The text list matches the filled control too; something later must restate its background.
    const theme=THEMES.find(t=>(!rule.dark||t.dark)&&(!rule.contrast||t.contrast)&&(rule.dark||!t.dark)&&(rule.contrast||!t.contrast)&&t.theme===(rule.theme||'forest'));
    if(!theme)continue;
    const owner=RULES.filter(r=>applies(r,theme)&&r.decls['background']!==undefined&&r.targets.some(t=>t===filled))
     .sort((a,b)=>a.specificity-b.specificity||a.order-b.order).at(-1);
    const colorWinner=winner(filled,'color',theme);
    // If the theme has already flattened the fill to the generic surface, there is no filled state left.
    const fill=owner&&hex(owner.decls['background'].split(/s+/)[0],theme,filled);
    if(fill&&[hex('var(--paper)',theme,'p'),hex('var(--bg)',theme,'b')].includes(fill))continue;
    if(!owner||owner.specificity<rule.specificity)
     missing.push(theme.name+': '+target+' in a text list (spec '+rule.specificity+') recolors '+filled+' to '+colorWinner+' but its fill is set at spec '+(owner?owner.specificity:'none'));
   }
  }
 }
 assert.deepEqual([...new Set(missing)],[],'the fill must be restated at least as specifically as the text list that recolors the label');
});

// ---------------------------------------------------------------------------
// SC 1.4.11 again, for a STATE rather than an icon. Both fixed bottom navs mark the current slot with
// a filled pill and nothing else, and in BOTH high-contrast themes the idle links are --ink too, so
// that fill is the only distinction there is. --sage gave the settings nav 1.08:1 light, 1.60:1 dark,
// 1.16:1 high contrast and 1.32:1 dark+high contrast -- invisible to exactly the readers who turned
// high contrast on. The board's own nav had already solved this with --green; this holds both to it.
// [selector, the context the fill is stated in]
const CURRENT=[
 ['.settings-bottom-nav a[aria-current=page]',''],
 ['.board-tab.is-current','@media(max-width:760px)'],
];
test('a current-slot pill clears 3:1 against the page in every theme',()=>{
 const failing=[];
 for(const [sel,ctx] of CURRENT){
  const fill=at(ctx,sel,'background');
  assert.ok(fill,sel+' states no fill in '+(ctx||'the base context')+', so the current slot has no indicator');
  assert.equal(fill,'var(--green)',sel+' hard-codes its fill instead of taking the theme token: '+fill);
  for(const theme of THEMES){
   const bg=hex('var(--bg)',theme,'page'),r=ratio(hex(fill,theme,sel),bg);
   if(r<3)failing.push(theme.name+': '+sel+' '+fill+' on '+bg+' = '+r.toFixed(2)+':1 (SC 1.4.11 needs 3:1)');
  }
 }
 assert.deepEqual(failing,[],'these current-slot pills are invisible against the page');
});
// ---------------------------------------------------------------------------
// SC 1.4.11: an icon that carries meaning needs 3:1, and an icon sitting inline
// with text should not be fainter than the text it annotates. Icons that take
// currentColor are listed with a null color: the point is that they inherit.
// ---------------------------------------------------------------------------
const ICONS=[
 ['.feed-note svg',['.card','body'],'.feed-note'],['.post-footer svg',['.post','body'],'.post-footer'],
 ['.family-icon',['.card','body'],null],['.heading-icon',['.card','body'],null],
 ['.stat-icon',['.stat-icon'],null],['.stat-icon.amber',['.stat-icon.amber'],null],
 ['.stat-icon.sage',['.stat-icon.sage'],null],['.stat-icon.rose',['.stat-icon.rose'],null],
 ['.datebox',['body'],null],['.close',['.close','dialog','body'],null],
 ['.mascot-delivery',['body'],null],['.post-status',['.post-status','.post','body'],null],
 ['.today-status',['body'],null],
];
test('every meaningful icon clears 3:1 and never reads fainter than the text beside it',()=>{
 const failing=[];
 for(const theme of THEMES)for(const [sel,chain,inherits] of ICONS){
  const own=winner(sel,'color',theme);
  if(inherits)assert.ok(!own,sel+' hard-codes a color instead of inheriting from '+inherits+', so the themes cannot reach it');
  const raw=own??winner(inherits,'color',theme);
  assert.ok(raw,sel+' has no resolved color in '+theme.name);
  const fg=hex(raw,theme,sel),bg=surface(chain,theme),r=ratio(fg,bg);
  if(r<3)failing.push(theme.name+': '+sel+' '+fg+' on '+bg+' = '+r.toFixed(2)+':1 (SC 1.4.11 needs 3:1)');
  // An icon inline with text must not be weaker than that text: the washed-out-icon regression.
  if(inherits){
   const textFg=hex(winner(inherits,'color',theme),theme,inherits),textR=ratio(textFg,bg);
   if(r+0.01<textR)failing.push(theme.name+': '+sel+' is '+r.toFixed(2)+':1 but the '+inherits+' text it sits in is '+textR.toFixed(2)+':1');
  }
 }
 assert.deepEqual(failing,[],'these icons are below 3:1 or fainter than their own label');
});
test('no icon rule hard-codes a color the themes then cannot reach',()=>{
 // An `svg` descendant rule with its own color overrides the themed lists, which only name the
 // text element; inheriting currentColor is what keeps the icon on-theme in all four modes.
 const named=new Set(ICONS.map(([sel])=>sel));
 const stray=[];
 for(const rule of RULES){
  if(rule.decls['color']===undefined&&rule.decls['stroke']===undefined)continue;
  for(const t of rule.targets)if(/(^|[\s>])svg$/.test(t)&&!named.has(t))stray.push(t);
 }
 assert.deepEqual([...new Set(stray)].sort(),['.mascot-delivery svg','.mascot-note svg','.mascot-pair .mascot-delivery svg','.trail-scene>svg','svg'],
  'a new svg-scoped color rule must be registered in ICONS or proven decorative');
 for(const theme of THEMES){
  const stroke=winner('.mascot-note svg','stroke',theme);
  const bg=surface(['body'],theme),r=ratio(hex(stroke,theme,'.mascot-note svg'),bg);
  assert.ok(r>=3,theme.name+': the mascot-note squiggle is '+r.toFixed(2)+':1 on '+bg);
 }
});

const CONTROL=/(^|[\s>,])(input|textarea|select)$/;
test('every text control stays at 16px at every display scale and phone width',()=>{
 const found=[],failing=[];
 for(const key of Object.keys(map)){
  const [ctx,sel,prop]=key.split('||');
  if(prop!=='font-size'||!CONTROL.test(sel))continue;
  found.push(sel);
  for(const [scale,root] of Object.entries(SCALES))for(const vw of VIEWPORTS){
   if(ctx&&!mediaApplies(ctx,vw))continue;
   const px=sizePx(map[key],clampPx(root,vw));
   if(px<16)failing.push(scale+' @'+vw+'px: '+(ctx||'base')+' '+sel+' = '+map[key]+' → '+px.toFixed(1)+'px');
  }
 }
 assert.ok(found.length>=8,'the control font-size rules did not parse, found '+found.length);
 assert.deepEqual(failing,[],'iOS Safari zooms any focused control under 16px and never zooms back out');
 assert.doesNotMatch(sheet+layout,/maximum-scale|user-scalable/,'pinch zoom must stay available');
});

test('the Small display scale actually shrinks text on a phone',()=>{
 for(const vw of VIEWPORTS){
  const small=clampPx(SCALES.small,vw),normal=clampPx(SCALES.normal,vw),large=clampPx(SCALES.large,vw);
  assert.ok(small<normal&&normal<large,'the three scales collapse at '+vw+'px: '+small+'/'+normal+'/'+large);
 }
});

// ---------------------------------------------------------------------------
// The WCAG large-text exemption (AAA: 4.5:1 instead of 7:1) applies at >=24px, or at
// >=18.66px when the weight is >=700. Both thresholds are CSS pixels, so a rem
// size that qualifies at the Normal scale can stop qualifying at Small, where
// the root is 14px. Every selector in the sheet that could lean on the exemption
// is registered here; probing one of them is how .footer-brand slipped through.
// ---------------------------------------------------------------------------
// [probe, surface chain, selector carrying the size, contexts that restate it, weight]
const LARGE=[
 ['.feed-heading h2 span',['body'],'.feed-heading h2',['','@media(max-width:1060px)','@media(max-width:760px)'],500],
 ['.footer-brand',['body'],'.footer-brand',[''],800],
 ['.brand-dot',['.site-header','body'],'.brand',['','@media(max-width:760px)','@media(max-width:360px)'],800],
];
test('no text leans on the large-text exemption at a scale where it is no longer large',()=>{
 const failing=[];
 for(const [probe,chain,sizeSel,contexts,weight] of LARGE){
  const sizes=contexts.map(ctx=>fontSize(ctx,sizeSel)).filter(Boolean);
  assert.ok(sizes.length,probe+': no font-size parsed from '+sizeSel+'; the registry is stale');
  // The Small scale pins the root at 14px, so it is always the worst case for the exemption.
  const smallest=Math.min(...sizes.map(v=>sizePx(v,clampPx(SCALES.small,320))));
  const large=smallest>=LARGE_PX||(weight>=700&&smallest>=LARGE_BOLD_PX);
  const need=large?4.5:7;
  for(const theme of THEMES){
   const fg=hex(winner(probe,'color',theme),theme,probe),bg=surface(chain,theme),r=ratio(fg,bg);
   if(r<need)failing.push(theme.name+': '+probe+' is '+smallest.toFixed(1)+'px/'+weight+' at the Small scale ('+(large?'large':'not large')+', needs '+need+':1) but '+fg+' on '+bg+' = '+r.toFixed(2)+':1');
  }
 }
 assert.deepEqual(failing,[],'these rely on an exemption they do not qualify for at every scale');
});
test('the large-text registry still covers every selector that could claim the exemption',()=>{
 // Any selector with its own color and a declared size big enough to qualify has to be audited
 // by name, either as plain 7:1 text or as a registered exemption.
 // .star-two is aria-hidden decorative art in the hero, so it carries neither text nor meaning.
 const audited=new Set([...TEXT.map(([sel])=>sel),...LARGE.map(([sel])=>sel),'.brand','.star-two']);
 const missing=[];
 for(const key of Object.keys(map)){
  const [ctx,sel,prop]=key.split('||');
  if(prop!=='font-size'&&prop!=='font')continue;
  const raw=prop==='font-size'?map[key]:/(^|[\s/])([\d.]+rem)([\s/]|$)/.exec(map[key])?.[2];
  if(!raw||!/rem$/.test(raw))continue;
  // Normal scale: the size at which the exemption is most likely to be claimed.
  const px=sizePx(raw,clampPx(SCALES.normal,390));
  if(px<LARGE_BOLD_PX)continue;
  if(!RULES.some(r=>r.targets.includes(sel)&&r.decls['color']!==undefined))continue;
  if(!audited.has(sel))missing.push((ctx||'base')+' '+sel+' = '+raw+' ('+px.toFixed(1)+'px)');
 }
 assert.deepEqual([...new Set(missing)],[],'these are large, carry their own color, and no contrast test names them');
});

// ---------------------------------------------------------------------------
// SC 1.4.11: the focus indicator needs 3:1, including where it lands on the
// pressed sibling next door, whose background is the ring color in dark mode.
// ---------------------------------------------------------------------------
test('the focus ring is one definition and stays visible on every surface it can land on',()=>{
 const rings=[...sheet.matchAll(/([^;{}]*:focus-visible[^{]*)\{([^}]*)\}/g)].map(m=>[m[1],m[2]]);
 const base=rings.filter(([,body])=>/outline:[^;]*var\(--focus\)/.test(body));
 assert.equal(base.length,1,'there should be exactly one base focus-ring rule, found '+rings.length+' focus rules');
 for(const el of ['button','a','select','input','textarea','summary'])
  assert.match(base[0][0],new RegExp('(^|,)'+el+':focus-visible'),el+' is missing from the shared focus ring');
 assert.equal(at('','button:focus-visible','outline-offset'),at('','a:focus-visible','outline-offset'),'links keep a different offset');
 // The ring sits inside a rim of its own, so its contrast cannot depend on what is underneath it.
 const rim=at('','button:focus-visible','box-shadow');
 assert.match(rim||'',/^0 0 0 [\d.]+rem var\(--bg\)$/,'the ring needs a rim wider than outline-offset + outline-width');
 // Geometry, stated once and reused below: the ring survives a same-colored neighbour because the
 // rim reaches past the outline's OUTER edge (offset + width), not because of any color relationship.
 const spread=parseFloat(/0 0 0 ([\d.]+)rem/.exec(rim)[1]);
 const offset=parseFloat(at('','button:focus-visible','outline-offset'));
 const width=parseFloat(/([\d.]+)rem/.exec(at('','button:focus-visible','outline'))[1]);
 const outer=offset+width;
 assert.ok(spread>outer,'the rim ('+spread+'rem) must reach past the outer edge of the outline ('+offset+'+'+width+'='+outer+'rem)');
 assert.equal(at('','button:focus-visible','z-index'),'1','a later sibling would paint over the ring');
 assert.equal(at('','button:focus-visible','position'),'relative','z-index needs a positioned box');
 // Every control whose own box-shadow out-specifies the shared rule has to restate the rim.
 for(const sel of ['.filter-tabs button.active','.site-header.is-scrolled .mobile-menu-button']){
  const own=winner(sel,'box-shadow',THEMES[0])??at('@media(max-width:760px)',sel,'box-shadow');
  assert.ok(own,sel+' no longer has its own box-shadow; drop it from this guard');
  assert.match(at('',sel+':focus-visible','box-shadow')||'',/var\(--bg\)/,sel+' loses the focus rim to its own box-shadow');
 }
 // The rim takes the color of the SURFACE the control sits on, not the page, so a control
 // inside a --paper card does not get a page-colored square punched behind it.
 const paperRim=[...sheet.matchAll(/:is\(([^)]*)\) :is\(([^)]*)\):focus-visible\{box-shadow:0 0 0 ([\d.]+)rem var\(--paper\)\}/g)];
 assert.equal(paperRim.length,1,'there should be exactly one surface-colored rim rule, found '+paperRim.length);
 assert.equal(+paperRim[0][3],spread,'the surface rim and the page rim must be the same width');
 for(const el of ['button','a','input','textarea','select','summary'])
  assert.ok(splitTop(paperRim[0][2],',').includes(el),el+' is missing from the surface-colored rim');
 // Enumerated from the sheet's own --paper lists, not guessed: every container that paints --paper.
 const paperSurfaces=new Set();
 for(const rule of RULES){
  if(!/var\(--paper\)/.test(rule.decls['background']||''))continue;
  for(const t of rule.targets)if(!/:|^html$/.test(t))paperSurfaces.add(t);
 }
 const rimmed=new Set(splitTop(paperRim[0][1],','));
 assert.ok(rimmed.size>=10,'the surface list did not parse, got '+rimmed.size);
 // A container only needs the surface rim if a focusable control can sit inside it.
 // The /settings surfaces are either the control itself (.settings-nav a, .settings-choice,
 // .settings-switch) or sit inside .card .profile-settings, which is already on the rim list above
 // and therefore rims every input, button and summary within them.
 const NOT_CONTAINERS=new Set(['input','textarea','select','.day','.post-avatar','.study-bar-track','.load-more','.post-status','.close','.empty','.filter-tabs button.active','.writing-prompts button','.display-button','.scale-options button','.study-metric-details[open] .metric-expand','.settings-nav a','.settings-choice','.settings-switch','.theme-option','.settings-meta>div']);
 assert.deepEqual([...paperSurfaces].filter(s=>!rimmed.has(s)&&!NOT_CONTAINERS.has(s)).sort(),[],
  'these paint --paper and can hold a focusable control, but the rim there is still page-colored');
 const RIMS=[['var(--bg)','the page'],['var(--paper)','a card']];
 for(const theme of THEMES){
  const focus=hex('var(--focus)',theme,'--focus');
  // SC 1.4.11 is about the ring against the rim; the rim is what the ring is guaranteed to touch.
  for(const [token,where] of RIMS){
   const rim=hex(token,theme,token);
   assert.ok(ratio(focus,rim)>=3,theme.name+': the ring is only '+ratio(focus,rim).toFixed(2)+':1 against its rim on '+where+' ('+focus+' on '+rim+')');
  }
  // The pressed siblings a ring can overlap. In dark mode their background IS --focus, so the
  // ring has NO color contrast against them (1.00:1) and survives purely on the rim's geometry:
  // the rim is wider than the outline's outer edge, so the rim always separates the two.
  for(const sel of ['.display-button[aria-pressed=true]','.filter-tabs button.active','.chart-toggle button.active','.primary','.header-action']){
   const raw=winner(sel,'background',theme)??winner(sel,'background-color',theme);
   assert.ok(raw,sel+' has no resolved background in '+theme.name);
   const pressed=hex(raw.split(/\s+/)[0],theme,sel),touching=ratio(focus,pressed);
   if(touching>=3)continue;
   assert.ok(spread>outer,theme.name+': '+sel+' is '+pressed+' = '+touching.toFixed(2)+':1 against the ring, and the rim ('+spread+'rem) does not reach past the outline ('+outer+'rem) to separate them');
   for(const [token] of RIMS)assert.ok(ratio(focus,hex(token,theme,token))>=3,
    theme.name+': '+sel+' ('+pressed+') erases the ring and the '+token+' rim cannot rescue it');
  }
 }
 assert.equal(at('','html[data-contrast=true]','--focus'),'var(--ink)','high contrast should reuse the ink token');
});

// The dark list is the reference: a class dark mode has to restate is also faint under forced light high contrast.
const members=(attr,body)=>{
 const out=new Set();
 for(const rule of sheet.matchAll(/([^{}\n]*)\{([^}]*)\}/g)){
  if(!rule[1].includes('data-'+attr+'=true')||rule[2]!==body)continue;
  for(const group of rule[1].matchAll(/:is\(([^)]*)\)/g))for(const sel of group[1].split(','))out.add(sel.trim());
 }
 return out;
};
test('high contrast covers every text class dark mode covers',()=>{
 const dark=members('dark','color:var(--text)');
 const covered=new Set([...members('contrast','color:var(--ink)'),...members('contrast','background:var(--paper);color:var(--ink);border-color:var(--line)')]);
 assert.ok(dark.size>20&&covered.size>20,'the :is() lists did not parse');
 assert.deepEqual([...dark].filter(sel=>!covered.has(sel)),[],'high-contrast lists are missing classes the dark lists restate');
});

// ---------------------------------------------------------------------------
// SC 2.5.5 (Target Size Enhanced, 44x44) is AAA and replaces the 24x24 of SC 2.5.8
// that this section used to enforce. Two things change, and both mattered here:
//   - 44px is now the ONLY bar. There is no "comfort target" tier left to park on a
//     coarse pointer, so nothing in the sheet may state a floor inside
//     @media(pointer:coarse) -- that query also fails to match a Windows touch
//     laptop whose mouse is primary, so it was never the right gate anyway.
//   - The floor is CSS PIXELS. 2.75rem is 44px only while the root is 16px; at the
//     Small display scale the root is 14px and 2.75rem measures 38.5px. That is why
//     every floor is written max(2.75rem,44px), and why this test resolves the
//     cascade at all three scales rather than trusting the rem.
// 2.5.5 grants exactly two exceptions that this board can claim, both enumerated in
// TARGET_EXCEPTIONS below with the reason each one qualifies. An inline link inside
// a sentence is the SC's other exception; no control in this sheet is one, so there
// is no entry for it.
// ---------------------------------------------------------------------------
// Every interactive control in the sheet, with the box that establishes its height.
const CONTROLS=[
 ['#retry',''],['.text-button',''],['.home-screen-tip summary',''],['.close',''],
 ['.header-action',''],['.primary',''],['.new-user-button',''],['.filter-tabs button',''],
 ['.chart-toggle button',''],['.writing-prompts button',''],['.settings-save',''],
 ['.scale-options button',''],['.display-button',''],['.profile-selector select',''],
 ['.profile-settings select',''],['.profile-settings input',''],['.load-more',''],
 ['.metric-expand',''],['.study-metric-details>summary',''],['.compact-widget>summary',''],
 ['.footer-brand',''],['.mobile-menu-button','@media(max-width:760px)'],
 ['.settings-nav a',''],['.settings-choice',''],['.settings-switch',''],['.theme-option',''],
 ['.settings-back',''],['.settings-reveal>summary',''],['.settings-bottom-nav a',''],
 // The phone's PRIMARY navigation, and the header link it stands in for above 760px. Both pass; this
 // registry said "every interactive control in the sheet" while omitting the two most used of all.
 ['.board-tab',''],['.header-settings',''],
 // The accent radio used to set min-height:0/min-width:0, opting out of the floor on purpose; it is
 // pinned to a 24px square now, the way .pass-check input[type=checkbox] already was.
 ['.theme-option input',''],['.copy-code',''],
 // The dialog's tick box, and the row that carries its target; neither was in this registry.
 ['.pass-check input[type=checkbox]',''],['#entry-dialog .pass-check',''],
];
// The only SC 2.5.5 exceptions on this board. Each entry is [reason, the selector whose box IS the
// target instead], and the test below refuses an entry whose stand-in row does not itself clear 44px
// at every scale -- an exception is only an exception while something else carries the target.
const TARGET_EXCEPTIONS={
 // 2.5.5 exempts a control whose size is determined by the user agent. These are native inputs: the
 // radio keeps its arrow-key group semantics and the checkbox keeps its tick, and restyling either
 // to 44px would mean replacing it with a div. Both are pinned to a 24px square rather than left to
 // stretch, and in both cases the LABEL wraps the input, so the whole row activates it. Verified in
 // a real browser rather than inferred: clicking the accent row 154px to the right of the radio, at
 // the row's top edge, switches the accent, and so does the opposite corner of a different row.
 '.theme-option input':['native radio, user-agent sized; the .theme-option label row is the target','.theme-option'],
 '.pass-check input[type=checkbox]':['native checkbox, user-agent sized; the .pass-check label row is the target, and that label both wraps the input and names it with htmlFor','#entry-dialog .pass-check'],
};
// Height a control actually occupies with a fine pointer, at a given root size.
const lineHeight=1.6,px=(v,root)=>v===undefined?undefined:sizePx(v,root);
function controlHeight(sel,ctx,root) {
 const fixed=px(at(ctx,sel,'height'),root);if(fixed!==undefined)return fixed;
 const floor=px(at(ctx,sel,'min-height'),root)??0;
 const size=fontSize(ctx,sel)??fontSize('',sel)??at('','body','font-size');
 const pad=at(ctx,sel,'padding')??at('',sel,'padding');
 const padY=pad?2*sizePx(splitTop(pad,' ')[0],root):0;
 const box=size?sizePx(size,root)*lineHeight+padY:0;
 return Math.max(floor,box);
}
test('every interactive control clears the 44px AAA target on a fine pointer, at every scale',()=>{
 const thin=[];
 for(const [sel,ctx] of CONTROLS){
  if(TARGET_EXCEPTIONS[sel])continue;
  for(const [scale,root] of Object.entries(SCALES)){
   const r=clampPx(root,390),h=controlHeight(sel,ctx,r);
   // An invisible hit box behind the control counts, the way .close has always done it.
   const after=px(at(ctx,sel+':after','height'),r)??px(at('',sel+':after','height'),r)??0;
   const target=Math.max(h,after);
   if(target<44)thin.push(scale+': '+sel+' is '+target.toFixed(1)+'px tall (SC 2.5.5 needs 44)');
  }
 }
 assert.deepEqual(thin,[],'these are under 44 CSS px, which SC 2.5.5 does not condition on pointer type');
});
test('every target-size exception is a real 2.5.5 exception, with a reason and a 44px row behind it',()=>{
 const registered=new Set(CONTROLS.map(([sel])=>sel));
 for(const [sel,[why,row]] of Object.entries(TARGET_EXCEPTIONS)){
  assert.ok(registered.has(sel),sel+' is exempted but is not in CONTROLS, so nothing checks it at all');
  assert.ok(why.length>40,sel+' needs the reason it qualifies written next to it, not just a listing');
  // The stand-in row has to carry the target the control is excused from, at every scale.
  for(const [scale,root] of Object.entries(SCALES)){
   const h=controlHeight(row,'',clampPx(root,390));
   assert.ok(h>=44,scale+': '+sel+' is excused because '+row+' is the target, but '+row+' is only '+h.toFixed(1)+'px');
  }
 }
});
test('no control parks its target floor behind a coarse pointer, and the floors are in CSS px',()=>{
 // SC 2.5.5 is unconditional, so a floor that exists only under @media(pointer:coarse) is not a
 // floor. This is a whole-sheet assertion rather than a per-selector one: it catches a NEW rule
 // dropped into a coarse block later, which a registry of today's selectors never would.
 for(const m of sheet.matchAll(/@media\s*\(\s*pointer\s*:\s*coarse\s*\)\s*\{/g)){
  const body=sheet.slice(m.index,matchBrace(sheet,m.index+m[0].length-1)+1);
  assert.doesNotMatch(body,/min-(height|width)\s*:/,'a target floor is hiding behind pointer:coarse: '+body.slice(0,140));
 }
 // Every floor the sheet states for a control must still be 44px at the Small scale, where the root
 // is 14px. max(2.75rem,44px) is the house form: 44 guaranteed, and still free to grow at Large.
 const bare=[];
 for(const [sel,ctx] of CONTROLS){
  if(TARGET_EXCEPTIONS[sel])continue;
  const floor=at(ctx,sel,'min-height')??at('',sel,'min-height');
  if(floor===undefined)continue;
  if(sizePx(floor,clampPx(SCALES.small,390))<44)bare.push(sel+' states '+floor+', under 44px at the Small scale');
 }
 assert.deepEqual(bare,[],'these state a rem floor that shrinks below 44px with the display scale');
 // The two native tick boxes keep an absolute 24px square: that is their own size, not their target.
 for(const sel of ['.theme-option input','.pass-check input[type=checkbox]'])
  assert.equal(at('',sel,'height'),'24px',sel+' must stay a 24px square rather than stretch to fill its row');
 // Below 760px the board tab grows to the full 3.5rem slot the fixed bar is built around, and the
 // settings bar matches it: the two bars sit at the same screen position.
 assert.equal(at('@media(max-width:760px)','.board-tab','height'),'3.5rem');
 assert.equal(at('@media(max-width:760px)','.settings-bottom-nav a','height'),'3.5rem');
 // .close draws a 30px circle on purpose; its target is the unconditional overhang behind it.
 assert.equal(at('','.close','width'),'1.875rem');
 assert.equal(at('','.close:after','height'),'44px','the dismiss target must not be coarse-only any more');
 assert.equal(at('','#retry:after','height'),'44px');
 assert.equal(at('','.home-screen-tip summary:after','height'),'44px');
 for(const sel of ['#retry','.home-screen-tip summary','.brand','.footer-brand','.close'])
  assert.equal(at('',sel,'position'),'relative','the '+sel+' hit box needs a positioned box');
 // The wordmark takes its target from a pseudo-element so the header and footer measures do not move.
 for(const sel of ['.brand:after','.footer-brand:after'])
  assert.equal(at('',sel,'height'),'44px',sel+' is how the wordmark reaches 44px without moving layout');
});

// Media queries add no specificity, so a later wide breakpoint silently eats a narrower one.
test('viewport-fit=cover is paired with safe-area padding that still narrows at narrow widths',()=>{
 const gutter=v=>{assert.match(v||'',/^max\(/,'padding should fall back to the designed gutter, got '+v);return parseFloat(v.slice(4))};
 for(const sel of ['main','.header-inner']){
  // 360 has to be read too: a narrower context that forgets env() is dead only while it happens
  // to be earlier in source than a wider one, and a file split reorders exactly that.
  const steps=[['',Infinity],['@media(max-width:1060px)',1060],['@media(max-width:760px)',760],['@media(max-width:600px)',600],['@media(max-width:360px)',360]]
   .map(([ctx,width])=>[ctx,width,at(ctx,sel,'padding-left')]).filter(step=>step[2]!==undefined);
  for(const [ctx,,value] of steps)for(const side of ['left','right']){
   const v=at(ctx,sel,'padding-'+side);
   assert.match(v||'',new RegExp('env\\(safe-area-inset-'+side+'\\)'),sel+' padding-'+side+' ignores the cutout in '+(ctx||'the base context'));
   gutter(v);
   assert.equal(gutter(v),gutter(value),sel+' has mismatched gutters in '+(ctx||'the base context'));
  }
  // Winner at a width is the last matching context, so the fallbacks must shrink monotonically.
   for(const vw of [320,360,390,600,760,1060]){
   const winning=steps.filter(([ctx])=>!ctx||mediaApplies(ctx.replace('@media',''),vw)).at(-1);
   const tightest=Math.min(...steps.filter(([ctx])=>!ctx||mediaApplies(ctx.replace('@media',''),vw)).map(step=>gutter(step[2])));
   assert.equal(gutter(winning[2]),tightest,sel+' at '+vw+'px resolves to '+winning[2]+' but a narrower rule asked for '+tightest+'rem');
  }
 }
 assert.match(at('','#toast','bottom'),/env\(safe-area-inset-bottom\)/,'the toast sits on the home indicator');
 assert.match(at('','.site-header.is-scrolled .mobile-menu-button','right'),/env\(safe-area-inset-right\)/);
 assert.match(at('','.scroll-indicator','right'),/env\(safe-area-inset-right\)/,'the scroll indicator sits under the landscape corner');
});

// ---------------------------------------------------------------------------
// Setting overflow on one axis computes the other to `auto`, so any scroll or
// clip container clips at its padding box — including the focus rim, which is
// the one thing the ring is not allowed to lose.
// ---------------------------------------------------------------------------
test('no scroll or clip container can crop the focus rim off a control inside it',()=>{
 const rimRem=parseFloat(/0 0 0 ([\d.]+)rem/.exec(at('','button:focus-visible','box-shadow'))[1]);
 // Containers that clip AND can hold a focusable control, with the padding that must clear the rim.
 const CLIPPING=[
  ['.site-header.menu-open .header-actions','@media(max-width:760px)'],
  ['.card',''],
  // The settings sub-nav scrolls sideways at 320px instead of wrapping, which makes it a clip box
  // around five focusable pills.
  ['.settings-nav ul',''],
 ];
 const found=[];
 for(const key of Object.keys(map)){
  const [ctx,sel,prop]=key.split('||');
  if(!/^overflow(-x|-y)?$/.test(prop)||/^(visible|clip)$/.test(map[key]))continue;
  found.push(sel);
 }
 for(const [sel] of CLIPPING)assert.ok(found.includes(sel),sel+' no longer clips; drop it from this guard');
 for(const [sel,ctx] of CLIPPING){
  // The container's own padding, or the padding of whatever lays its children out, has to be
  // at least the rim so a control at the edge keeps its ring.
  const pad=at(ctx,sel,'padding')??at('',sel,'padding');
  const inner=pad?Math.min(...splitTop(pad,' ').map(parseFloat)):null;
  if(inner!==null)assert.ok(inner>=rimRem,sel+' pads '+inner+'rem but the rim needs '+rimRem+'rem; a focused control at its edge is cropped');
 }
 // .card has no padding of its own, so each of its laying-out children must clear the rim instead.
 for(const sel of ['.card-heading','.composer form','.week #week-grid','.level-progress','.profile-settings','.study-week','.widget-content']){
  const pad=at('',sel,'padding')??at('',sel,'margin');
  assert.ok(pad,sel+' no longer sets the inset that keeps controls off the .card clip edge');
  const inline=splitTop(pad,' ').map(parseFloat).at(-1);
  assert.ok(inline>=rimRem,sel+' insets '+inline+'rem inside the clipping .card, under the '+rimRem+'rem rim');
 }
 // Keyboard focus scrolls a control into view; without scroll-padding it parks flush against the
 // clip edge and the rim is cropped even though the resting padding would have cleared it.
 assert.equal(at('','.site-header.menu-open .header-actions','scroll-padding'),rimRem+'rem',
  'the scrolling mobile menu needs scroll-padding at least as deep as the rim');
});

// "Makes sense at any size": the places that used to work only inside one band.
test('nothing is pinned to a width or a scale it only survives at',()=>{
 assert.match(at('@media(min-width:1100px)','aside','top'),/5\.375rem/,'the sticky aside has to clear the sticky header, not the viewport');
 assert.match(at('','.hero-art','width'),/^min\(100%,/,'a fixed rem hero overflows .intro at the Large scale');
 assert.equal(at('@media(min-width:601px)and(max-width:760px)','.feed-heading h2','max-width'),'none','the 12.5rem cap is only needed while the filter tabs share the row');
 assert.match(at('','.weekly-totals','grid-template-columns'),/auto-fit/,'three fixed columns clip their labels at the Large scale');
 // No layout rule may depend on a viewport width the sheet never styles between.
 for(const [sel,prop] of [['.site-header','position'],['.mobile-menu-button','display'],['.layout','grid-template-columns']])
  assert.ok(at('',sel,prop)!==undefined,sel+' '+prop+' has no base value, so it is undefined above its breakpoint');
});

test('the dead html scrollbar layer is gone and the inner-scroller layer survives',()=>{
 for(const dead of [/html\{[^}]*scrollbar-gutter:stable/,/html\.is-scrolling,html:focus-within\{scrollbar-color/,/html\.is-scrolling::-webkit-scrollbar-thumb/,/html\[data-contrast=true\]\{scrollbar-color/,/html\[data-contrast=true\]::-webkit-scrollbar-thumb\{/])
  assert.doesNotMatch(sheet,dead,'this html-scoped rule is overridden by the overlay layer');
 for(const live of [/^::-webkit-scrollbar\{width:8px/m,/^::-webkit-scrollbar-thumb\{background:transparent/m,/^\*:not\(html\)\{scrollbar-width:thin/m,/^\*:not\(html\):hover,\*:not\(html\):focus-within\{/m,/^\*:not\(html\):not\(body\):hover::-webkit-scrollbar-thumb/m])
  assert.match(sheet,live,'inner scrollers still need this rule');
 assert.match(sheet,/html\{scrollbar-gutter:auto;scrollbar-width:none;overflow-y:auto\}/,'the overlay rule itself must stay');
});

test('reduced motion silences every transition and animation in the sheet',()=>{
 assert.match(sheet,/@media\(prefers-reduced-motion:reduce\)\{\*\{transition:none!important;animation:none!important;scroll-behavior:auto!important\}\}/);
 // the hero art is static CSS, so there is nothing there for the block to miss
 assert.doesNotMatch(sheet,/\.(orbit|orbit-two|hero-mascot|mascot-ground|art-star|star-one|star-two)[^{}]*\{[^}]*(animation|transition):/);
});

test('React renders the theme-color meta and the blocking boot script only repaints it',()=>{
 assert.doesNotMatch(layout,/themeColor\s*:/,'a static themeColor cannot track a data attribute');
 assert.match(layout,/<head><meta name="theme-color" content="#[0-9a-f]{3,6}"\/>/,'the meta must be React-rendered, ahead of the script that reads it');
 const script=/dangerouslySetInnerHTML=\{\{__html:"([^"]*)"\}\}/.exec(layout);
 assert.ok(script,'the boot script must stay inline and blocking');
 assert.doesNotMatch(script[1],/createElement|appendChild/,'a script-created node inside the head React hydrates is the thing we removed');
 assert.match(script[1],/querySelector\('meta\[name=theme-color\]'\)/,'the script should find the rendered meta');
 for(const color of ['#14221b','#f6f5ef','#000','#fff'])
  assert.ok(script[1].includes("'"+color+"'"),'theme color '+color+' is missing from the boot script');
 assert.match(script[1],/MutationObserver/,'the meta must follow later dark/contrast toggles');
 assert.match(script[1],/^try\{[\s\S]*\}catch\{\}$/,'the boot script must be fully wrapped in try/catch');
 assert.equal(layout.includes('<head>'),true);
});

// ---------------------------------------------------------------------------
// The boot script is wrapped in try/catch, which means a throw is SILENT: the
// catch swallows it after zero dataset attributes have been written and the
// MutationObserver never registers. Pattern-matching the source cannot see that,
// so run it against stub globals and assert on what it actually produced.
// ---------------------------------------------------------------------------
const bootScript=/dangerouslySetInnerHTML=\{\{__html:"([^"]*)"\}\}/.exec(layout)[1].replace(/\\'/g,"'");
function boot(stored,{meta=true}={}) {
 const element={dataset:{}},tag={content:'#f6f5ef'};
 let observed=null;
 const sandbox={
  localStorage:{getItem:()=>stored},
  document:{documentElement:element,querySelector:sel=>sel==='meta[name=theme-color]'&&meta?tag:null},
  MutationObserver:class{constructor(fn){this.fn=fn}observe(target,options){observed={target,options}}},
 };
 new Function('localStorage','document','MutationObserver',bootScript)(sandbox.localStorage,sandbox.document,sandbox.MutationObserver);
 return {dataset:element.dataset,content:tag.content,observed};
}
test('the boot script still paints the theme when storage or the meta tag is hostile',()=>{
 // The default stamp. theme and reduceMotion joined it when lib/prefs.js took over the shape; the
 // script-versus-module agreement itself is asserted in tests/prefs.test.js.
 const expected={dark:'false',contrast:'false',focus:'false',scale:'normal',theme:'forest',reduceMotion:'system'};
 // The shape the guard was written for, plus the shapes it missed.
 for(const stored of [null,'{}','{"dark":true}','null','"null"','0','false','[]','"not json at all','{"scale":"huge"}']){
  const {dataset,observed}=boot(stored);
  for(const k of ['dark','contrast','focus','scale'])
   assert.ok(dataset[k]!==undefined,'stored '+JSON.stringify(stored)+' lost data-'+k+' entirely: the catch fired before any attribute was written');
  assert.ok(['small','normal','large'].includes(dataset.scale),'stored '+JSON.stringify(stored)+' produced data-scale='+dataset.scale);
  assert.ok(observed,'stored '+JSON.stringify(stored)+' never registered the MutationObserver');
 }
 // A literal "null" is the case `||'{}'` does not cover: JSON.parse returns null and s[k] throws.
 assert.deepEqual(boot('null').dataset,expected,'a stored literal null must fall back to defaults, not abort the script');
 assert.deepEqual(boot('{"dark":true,"scale":"large"}').dataset,{...expected,dark:'true',scale:'large'});
 // No CSSOM in this sandbox, so --bg reads empty and the script falls back to the shipped forest
 // pair -- the same path a real first paint takes before the stylesheet has parsed.
 assert.equal(boot('{"dark":true}').content,'#14221b','the meta must be repainted for the stored theme');
 assert.equal(boot('{"contrast":true}').content,'#fff');
 assert.equal(boot('{"dark":true,"contrast":true}').content,'#000');
 // If the meta ever stops preceding the script the paint must not take the observer down with it.
 const headless=boot('{"dark":true}',{meta:false});
 assert.deepEqual(headless.dataset,{...expected,dark:'true'},'a missing meta must not cost the dataset attributes');
 assert.ok(headless.observed,'a missing meta must not stop the MutationObserver from registering');
 assert.deepEqual(headless.observed.options,{attributeFilter:['data-dark','data-contrast','data-theme']});
});
// globals.css is nothing but an ordered manifest now, so a new partial that nobody imports is dead CSS
// the snapshot would happily bless. The numbers in the filenames ARE the cascade: assert both halves.
test('every stylesheet partial is imported exactly once, in order',()=>{
 const manifest=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 const imported=[...manifest.matchAll(/@import\s+'\.\/styles\/([^']+)'/g)].map(m=>m[1]);
 const onDisk=readdirSync(new URL('../app/styles/',import.meta.url)).filter(name=>name.endsWith('.css')).sort();
 assert.deepEqual([...imported].sort(),onDisk,'app/styles and the globals.css manifest disagree');
 assert.equal(new Set(imported).size,imported.length,'a partial is imported twice');
 assert.deepEqual(imported,[...imported].sort(),'imports are out of numeric order, so the cascade no longer matches the filenames');
 assert.equal(manifest.replace(/@import[^;]+;|\/\*[\s\S]*?\*\/|\s/g,''),'','globals.css must hold nothing but the manifest');
});

// ---------------------------------------------------------------------------
// A FAILED SAVE MUST NOT READ AS BODY COPY. Every settings panel's alert is styled by
// .profile-settings p[role=alert], but the themed :is(p,...) text lists out-specify it, so in dark
// mode the brick red resolved to var(--text) -- byte-identical to the paragraph above it. High
// contrast flattens the whole palette to the ink on purpose and #join-error already does the same,
// so that is the one theme where matching body copy is the intended answer.
// ---------------------------------------------------------------------------
test('a settings panel alert is distinguishable from body copy wherever the theme has colors',()=>{
 for(const theme of THEMES){
  const alert=hex(winner('.profile-settings p[role=alert]','color',theme),theme,'panel alert');
  const body=hex(winner('p','color',theme),theme,'panel body copy');
  const surfaceColor=surface(['.card','body'],theme);
  if(theme.contrast){
   assert.equal(alert,hex('var(--ink)',theme,'ink'),theme.name+': high contrast pins every color to the ink, as #join-error does');
   continue;
  }
  assert.notEqual(alert,body,theme.name+': the alert is the same color as the paragraph above it');
  assert.ok(ratio(alert,surfaceColor)>=7,theme.name+': the alert is '+ratio(alert,surfaceColor).toFixed(2)+':1 on '+surfaceColor);
 }
 // Both errors take ONE token now, so the dialog's error and the panel's cannot drift apart again --
 // and the token is per theme, which is what the ratio check above is really proving.
 const night=THEMES.find(t=>t.dark&&!t.contrast);
 assert.equal(winner('#join-error','color',night),'var(--alert)');
 assert.equal(winner('.profile-settings p[role=alert]','color',night),'var(--alert)');
});
