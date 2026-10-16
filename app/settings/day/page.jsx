import DayPanel from '../../../components/settings/day-panel.jsx';
import SignInPrompt from '../../../components/settings/sign-in-prompt.jsx';
import viewer from '../../../components/settings/viewer.jsx';
export const metadata={title:'Your day · Checkpoint settings'};
export const dynamic='force-dynamic';
export default async function DaySettingsPage(){
 const user=await viewer();
 return user?<DayPanel/>:<SignInPrompt what="Your day, your pace" why="Your time zone and your breaks belong to your account, so this one needs you signed in."/>;
}
