import {headers} from 'next/headers';
import {currentUser} from '../../lib/sessions.js';
// The one session read the four session-scoped panels share. A failure answers "signed out" on
// purpose: a settings page that cannot reach the database should show the sign-in prompt, which is
// recoverable, rather than the error screen — and the panels themselves never fetch without a user,
// so nothing behind this goes on to ask the API for data it would be refused.
export default async function viewer(){
 try{return await currentUser({headers:await headers()})}
 catch(error){console.error('Settings session read failed:',error.status||error.name);return null}
}
