import DataPanel from '../../../components/settings/data-panel.jsx';
import SignInPrompt from '../../../components/settings/sign-in-prompt.jsx';
import viewer from '../../../components/settings/viewer.jsx';
export const metadata={title:'Your data · Checkpoint settings'};
export const dynamic='force-dynamic';
export default async function DataSettingsPage(){
 const user=await viewer();
 return user?<DataPanel username={user.username}/>:<SignInPrompt what="Your data" why="An export is your whole history, so it is only ever handed to the account that owns it."/>;
}
