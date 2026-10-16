import {headers} from 'next/headers';
import Dashboard from '../components/dashboard.jsx';
import {getBoard} from '../lib/board.js';
import {currentUser} from '../lib/sessions.js';
// Render the board into the first HTML instead of shipping an empty shell that then fetches it: the
// family opens this on phones, and the old path was HTML, then the bundle, then /api/board. The page is
// per-viewer because the session cookie chooses the profile, so it cannot be cached; a failure here is
// not worth a blank page, so it falls back to null and Dashboard fetches on mount exactly as before.
export default async function Home() {
  let initialBoard=null;
  try{initialBoard=await getBoard(null,null,await currentUser({headers:await headers()}))}
  catch(error){console.error('Server board render failed:',error.status||error.name)}
  return <Dashboard initialBoard={initialBoard} />;
}
