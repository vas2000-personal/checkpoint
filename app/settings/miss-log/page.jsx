import MissLogPanel from '../../../components/settings/miss-log-panel.jsx';
import SignInPrompt from '../../../components/settings/sign-in-prompt.jsx';
import viewer from '../../../components/settings/viewer.jsx';
export const metadata={title:'Miss Log · Checkpoint settings'};
export const dynamic='force-dynamic';
// OWNER-ONLY BY BEING SELF-ONLY: everything on this panel is read with the session's own username by
// GET /api/settings, so there is no view of anybody else's key, sync or awake switch to reach.
export default async function MissLogSettingsPage(){
 const user=await viewer();
 return user?<MissLogPanel username={user.username}/>:<SignInPrompt what="Miss Log" why="Your sync key and your awake status are yours alone, so this one needs you signed in."/>;
}
