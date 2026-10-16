import './globals.css';
export const metadata = {
  title:'Checkpoint · A little progress, every day',
  description:'A daily accountability feed for family. Small wins, honest updates, and a reason to keep going.',
  icons:{icon:[{url:'/assets/favicon.svg?v=2',type:'image/svg+xml'},{url:'/assets/favicon-32.png?v=2',type:'image/png',sizes:'32x32'}],apple:'/assets/apple-touch-icon.png?v=2'},
  appleWebApp:{capable:true,title:'Checkpoint',statusBarStyle:'default'},
  manifest:'/manifest.webmanifest',
};
// No themeColor in metadata: dark mode is a data attribute, not a media query. React renders the tag, the boot script owns its value.
// The script is the one copy of lib/prefs.js's shape that cannot import it (it must be inline and
// parser-blocking, ahead of the first paint), so tests/prefs.test.js executes this exact string and
// asserts it writes attrs(normalize(x)) for every hostile stored value. Keep it tiny and keep the
// whole body inside try/catch: a throw here loses every setting silently and flashes the wrong theme.
export const viewport = {width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}) {
  return <html lang="en" suppressHydrationWarning><head><meta name="theme-color" content="#f6f5ef"/><script dangerouslySetInnerHTML={{__html:"try{let s={};try{s=JSON.parse(localStorage.getItem('checkpoint-display')||'{}')||{}}catch{}if(typeof s!=='object'||Array.isArray(s))s={};const e=document.documentElement,p=(l,v,d)=>l.includes(v)?v:d;for(const k of ['dark','contrast','focus'])e.dataset[k]=s[k]===true?'true':'false';e.dataset.scale=p(['small','normal','large'],s.scale,'normal');e.dataset.accent=p(['forest','ocean','plum','clay','ink'],s.accent,'forest');e.dataset.reduceMotion=p(['system','on','off'],typeof s.reduceMotion==='boolean'?(s.reduceMotion?'on':'off'):s.reduceMotion,'system');const m=document.querySelector('meta[name=theme-color]');const paint=()=>{if(m)m.content=e.dataset.contrast==='true'?(e.dataset.dark==='true'?'#000':'#fff'):(e.dataset.dark==='true'?'#14221b':'#f6f5ef')};paint();new MutationObserver(paint).observe(e,{attributeFilter:['data-dark','data-contrast']})}catch{}"}}/><link rel="stylesheet" href="/assets/fonts.css" /></head><body>{children}</body></html>;
}
