import test from 'node:test';
import assert from 'node:assert/strict';
import {clock,plural} from '../lib/study.js';
test('times read the same way everywhere: a.m./p.m., zone only when asked',()=>{
 assert.equal(clock('2026-10-12T15:48:00Z','America/New_York'),'11:48 a.m.');
 assert.equal(clock('2026-10-13T03:48:00Z','America/New_York'),'11:48 p.m.');
 assert.equal(clock('2026-10-13T03:48:00Z','America/New_York',true),'11:48 p.m. EDT');
 assert.equal(clock('2026-01-13T04:00:00Z','America/New_York',true),'11:00 p.m. EST');
});
// '24' is lib/prefs.js's clock pref. clock() is the ONE formatter on the board, so this is the whole
// surface of that setting: a post time, an hourly summary label and the status bar all come through it.
test('the clock preference switches the hour cycle without touching anything else',()=>{
 const noon='2026-10-12T15:48:00Z',night='2026-10-13T03:48:00Z',midnight='2026-10-13T04:30:00Z';
 assert.equal(clock(noon,'America/New_York',false,'24'),'11:48');
 assert.equal(clock(night,'America/New_York',false,'24'),'23:48');
 assert.equal(clock(night,'America/New_York',true,'24'),'23:48 EDT','the zone still comes only when asked');
 // h23, not h24: en-US renders midnight as 24:00 under h24, and a day that resets at 4 a.m. prints
 // the hours either side of midnight constantly.
 assert.equal(clock(midnight,'America/New_York',false,'24'),'00:30');
 assert.equal(clock(midnight,'America/New_York',false,'12'),'12:30 a.m.');
 // Omitted, junk, or the 12 slug: the shipped a.m./p.m. the family reads. A pref that failed to load
 // must never produce a third format.
 for(const style of [undefined,'12','','nope',null,24,true])
  assert.equal(clock(night,'America/New_York',false,style),'11:48 p.m.','style '+JSON.stringify(style));
});
test('counts of one are singular',()=>{
 assert.equal(plural(1,'session'),'session');
 assert.equal(plural(0,'session'),'sessions');
 assert.equal(plural(3,'card'),'cards');
});
