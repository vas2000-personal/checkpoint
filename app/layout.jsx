import './globals.css';
export const metadata = {
  title:'Checkpoint · A little progress, every day',
  description:'A daily accountability feed for family. Small wins, honest updates, and a reason to keep going.',
  icons:{icon:'/assets/favicon.svg',apple:'/assets/apple-touch-icon.png'},
  appleWebApp:{capable:true,title:'Checkpoint',statusBarStyle:'default'},
  manifest:'/manifest.webmanifest',
};
export const viewport = {themeColor:'#f6f5ef',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}) {
  return <html lang="en"><head><link rel="stylesheet" href="/assets/fonts.css" /></head><body>{children}</body></html>;
}
