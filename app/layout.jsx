import './globals.css';
export const metadata = {
  title:'Checkpoint · A little progress, every day',
  description:'A daily accountability feed for family. Small wins, honest updates, and a reason to keep going.',
  icons:{icon:'/assets/favicon.svg'},
};
export const viewport = {themeColor:'#f6f5ef'};
export default function RootLayout({children}) {
  return <html lang="en"><head><link rel="stylesheet" href="/assets/fonts.css" /></head><body>{children}</body></html>;
}
