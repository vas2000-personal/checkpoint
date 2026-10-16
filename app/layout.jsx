import './globals.css';
export const metadata = {
  title:'Checkpoint · A little progress, every day',
  description:'A daily accountability feed for family. Small wins, honest updates, and a reason to keep going.',
  icons:{icon:[{url:'/assets/favicon.svg?v=2',type:'image/svg+xml'},{url:'/assets/favicon-32.png?v=2',type:'image/png',sizes:'32x32'}],apple:'/assets/apple-touch-icon.png?v=2'},
  appleWebApp:{capable:true,title:'Checkpoint',statusBarStyle:'default'},
  manifest:'/manifest.webmanifest',
};
// No themeColor in metadata: dark mode is a data attribute, not a media query. React renders the tag, the boot script owns its value.
export const viewport = {width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}) {
  return <html lang="en" suppressHydrationWarning><head><meta name="theme-color" content="#f6f5ef"/><script dangerouslySetInnerHTML={{__html:"try{let s={};try{s=JSON.parse(localStorage.getItem('checkpoint-display')||'{}')||{}}catch{}const e=document.documentElement;for(const k of ['dark','contrast','focus'])e.dataset[k]=s[k]===true?'true':'false';e.dataset.scale=['small','normal','large'].includes(s.scale)?s.scale:'normal';const m=document.querySelector('meta[name=theme-color]');const paint=()=>{if(m)m.content=e.dataset.contrast==='true'?(e.dataset.dark==='true'?'#000':'#fff'):(e.dataset.dark==='true'?'#14221b':'#f6f5ef')};paint();new MutationObserver(paint).observe(e,{attributeFilter:['data-dark','data-contrast']})}catch{}"}}/><link rel="stylesheet" href="/assets/fonts.css" /></head><body>{children}</body></html>;
}
