import AccountPanel from '../../../components/settings/account-panel.jsx';
import SignInPrompt from '../../../components/settings/sign-in-prompt.jsx';
import viewer from '../../../components/settings/viewer.jsx';
export const metadata={title:'Account · Checkpoint settings'};
export const dynamic='force-dynamic';
export default async function AccountSettingsPage(){
 const user=await viewer();
 return user?<AccountPanel username={user.username}/>:<SignInPrompt what="Your account" why="Your name, the line your family reads, your devices and your passphrase all need you signed in."/>;
}
