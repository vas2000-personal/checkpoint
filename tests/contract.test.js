import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSync} from '../lib/study.js';
// MISS_LOG_API.md is what Miss Log follows: each request example in it must pass validateSync as written.
const doc=readFileSync(new URL('../MISS_LOG_API.md',import.meta.url),'utf8');
const examples=[...doc.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(m=>JSON.parse(m[1])).filter(b=>!('ok' in b));
test('every request example in MISS_LOG_API.md validates',()=>{
 const kinds=examples.map(b=>b.holiday?'holiday':b.awake_at?'awake':'daily');
 assert.deepEqual(kinds,['daily','holiday','awake']);
 const zone='America/New_York';
 assert.equal(validateSync(examples[0],zone,new Date('2026-10-12T01:06:00Z')).day,'2026-10-11');
 assert.equal(validateSync(examples[1],zone,new Date('2026-10-12T15:00:00Z')).until_day,'2026-10-20');
 assert.equal(validateSync(examples[2],zone,new Date('2026-10-12T18:30:00Z')).day,'2026-10-12');
 // The doc's limits are the code's: text up to 2,000 characters, minutes up to 1440.
 assert.match(doc,/up to 2,000 characters/);assert.match(doc,/minutes and target_minutes <= 1440/);assert.match(doc,/16 KiB/);
 assert.throws(()=>validateSync({...examples[0],text:'x'.repeat(2001)},zone,new Date('2026-10-12T01:06:00Z')),{status:400});
 assert.throws(()=>validateSync({...examples[0],study:{...examples[0].study,minutes:1441,target_hit:true}},zone,new Date('2026-10-12T01:06:00Z')),{status:400});
});
