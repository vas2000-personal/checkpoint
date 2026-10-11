import './globals.css';
export const metadata = {
  title:'Checkpoint · A little progress, every day',
  description:'A daily accountability feed for family. Small wins, honest updates, and a reason to keep going.',
  icons:{icon:[{url:'/assets/favicon.svg?v=2',type:'image/svg+xml'},{url:'/assets/favicon-32.png?v=2',type:'image/png',sizes:'32x32'}],apple:'/assets/apple-touch-icon.png?v=2'},
  appleWebApp:{capable:true,title:'Checkpoint',statusBarStyle:'default'},
  manifest:'/manifest.webmanifest',
};
export const viewport = {themeColor:'#f6f5ef',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{const s=JSON.parse(localStorage.getItem('checkpoint-display')||'{}'),e=document.documentElement;for(const k of ['dark','contrast','focus'])e.dataset[k]=s[k]===true?'true':'false';e.dataset.scale=['small','normal','large'].includes(s.scale)?s.scale:'normal'}catch{}"}}/><link rel="stylesheet" href="/assets/fonts.css" /></head><body>{children}</body></html>;
}
