import {headers} from 'next/headers';
import Dashboard from '../components/dashboard.jsx';
import {getBoard} from '../lib/board.js';
import {currentUser} from '../lib/sessions.js';
import {parseQuery} from '../lib/tabs.js';
import {boardTab} from '../components/tabs/slugs.js';
// Render the board into the first HTML instead of shipping an empty shell that then fetches it: the
// family opens this on phones, and the old path was HTML, then the bundle, then /api/board. The page is
// per-viewer because the session cookie chooses the profile, so it cannot be cached; a failure here is
// not worth a blank page, so it falls back to null and Dashboard fetches on mount exactly as before.
// The query string is read HERE rather than with useSearchParams, which would need a Suspense boundary
// or opt the whole page into client rendering: ?tab= is in the first HTML, so the right panel paints
// once instead of painting Today and jumping. ?user= is passed to getBoard for the same reason — a
// parent can bookmark their son and the server renders him, not whoever the fallback picks. Prefs are
// localStorage, so the server can only seed the default tab; Dashboard applies defaultTab on mount.
export default async function Home({searchParams}) {
  const raw=await searchParams||{};
  // boardTab resolves the `journal` alias (and anything unknown) to a slug lib/tabs.js recognizes, so
  // the cold deep link and the client agree on the panel without touching lib/tabs.js's closed set.
  const query=parseQuery({...raw,tab:raw.tab===undefined?undefined:boardTab(raw.tab)});
  let initialBoard=null;
  try{initialBoard=await getBoard(null,query.user||null,await currentUser({headers:await headers()}))}
  catch(error){console.error('Server board render failed:',error.status||error.name)}
  return <Dashboard initialBoard={initialBoard} initialTab={query.tab} initialUser={query.user} />;
}
