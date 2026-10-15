import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cascade} from '../scripts/css-cascade.mjs';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/css-cascade.json',import.meta.url),'utf8'));
const ADVICE='run `node scripts/css-cascade.mjs --write` and review the diff — that diff IS the change under review';
// Splitting or pruning the stylesheet must not move a single resolved value.
test('every resolved declaration still matches the committed cascade snapshot',()=>{
 const {map,stats}=cascade();
 assert.ok(stats.rules>0&&stats.declarations>0,'the stylesheet parsed to nothing');
 // deepEqual on 1,800 keys prints the whole map, so name the moved keys first.
 const moved=[...new Set([...Object.keys(fixture),...Object.keys(map)])].sort().filter(k=>fixture[k]!==map[k]).map(k=>k+': '+JSON.stringify(fixture[k])+' -> '+JSON.stringify(map[k]));
 assert.deepEqual(moved,[],moved.length+' resolved declarations changed — '+ADVICE+'\n'+moved.slice(0,20).join('\n'));
 assert.deepEqual(map,fixture,ADVICE);
});
