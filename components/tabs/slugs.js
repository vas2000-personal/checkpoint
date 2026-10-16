// Which of lib/tabs.js's slugs the BOARD can render, shared by the server page and the client board so
// both resolve a link to the same panel. Pure on purpose: app/page.jsx is a server component, and a
// 'use client' module's exports reach it as client references it cannot call.
//
// lib/tabs.js owns the slug set and tests/tabs.test.js pins it to today|progress|study|settings, so the
// tab the owner asked to call "Journal" travels in a URL as `study`, and `?tab=journal` is accepted as
// an alias so a hand-written or older link still lands on the feed. `settings` is a real page, not a
// board panel, so it resolves to the fallback here and the nav sends it to /settings instead.
export const BOARD_TABS=['today','study','progress'];
// THE SLOT TABLE BOTH FIXED BOTTOM BARS READ, so the label, the order and the glyph cannot disagree
// the way "Study" in Settings and "Journal" on the board did (SC 3.2.4: two names for one
// destination at the same screen position). Icon names are sprite ids from components/icons.jsx,
// which app/layout's board and app/settings/layout both render. `settings` is a real route, so a nav
// sends it to /settings rather than to tabHref(); the board panel for it is the fallback below.
export const SLOTS=[['today','Today','flag'],['study','Journal','edit'],['progress','Progress','mountain'],['settings','Settings','sliders']];
const ALIAS={journal:'study'};
// A repeated ?tab= arrives as an array in a server component's searchParams, exactly as lib/tabs.js reads it.
const slug=value=>{const one=Array.isArray(value)?value[0]:value,text=String(one??'').trim().toLowerCase();return ALIAS[text]||text};
export function boardTab(value,fallback='today'){
 const wanted=slug(value);
 if(BOARD_TABS.includes(wanted))return wanted;
 const second=slug(fallback);
 return BOARD_TABS.includes(second)?second:BOARD_TABS[0];
}
