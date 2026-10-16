import {redirect} from 'next/navigation';
// Display is the one panel that needs no session, so it is where a bare /settings belongs.
export default function SettingsIndex(){redirect('/settings/display')}
