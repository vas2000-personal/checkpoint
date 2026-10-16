import DisplayPanel from '../../../components/settings/display-panel.jsx';
export const metadata={title:'Display · Checkpoint settings'};
// NO SESSION READ AND NO FETCH. Text size, dark mode, contrast and motion are what his parents in
// Michigan need, and they will never sign in; gating this route would hide the one page that is
// genuinely for them.
export default function DisplaySettingsPage(){return <DisplayPanel/>}
