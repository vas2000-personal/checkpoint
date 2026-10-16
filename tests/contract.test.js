import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSync} from '../lib/study.js';
// MISS_LOG_API.md is what Miss Log follows: each request example in it must pass validateSync as written.
const doc=readFileSync(new URL('../MISS_LOG_API.md',import.meta.url),'utf8');
const blocks=[...doc.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(m=>JSON.parse(m[1]));
const examples=blocks.filter(b=>!('ok' in b)),replies=blocks.filter(b=>'ok' in b);
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
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const route=read('app/api/checkpoint/route.js'),hourlySql=read('supabase/hourly_study.sql'),awakeSql=read('supabase/awake_status.sql');
// Keys the SQL actually returns, read off each jsonb_build_object argument list.
// One list per jsonb_build_object in the file: checkpoint_sync has two returns (a normal hourly sync
// and a backdated correction, which writes no card) and both must answer the documented shape.
const builtShapes=sql=>[...sql.matchAll(/jsonb_build_object\((.*)\)/g)].map(m=>[...m[1].matchAll(/'(\w+)',/g)].map(k=>k[1]));
const builtKeys=sql=>builtShapes(sql).flat();
test('the documented limits, token shape, response keys and status codes match the route',()=>{
 // The doc states the cap in KiB; the route enforces the same number of bytes, twice.
 const bytes=Number(doc.match(/(\d+) KiB/)[1])*1024;
 assert.equal(bytes,16384);assert.equal([...route.matchAll(/16384/g)].length,2);
 // The bearer shape the doc's header implies is whatever this regex in the route accepts.
 assert.match(doc,/^Authorization: Bearer /m);
 const bearer=new RegExp(route.match(/\/(\^Bearer .+?\$)\//)[1]);
 assert.ok(bearer.test('Bearer cp_'+'a'.repeat(64)));
 for(const wrong of ['Bearer cp_'+'a'.repeat(63),'Bearer cp_'+'a'.repeat(65),'Bearer '+'a'.repeat(67),'cp_'+'a'.repeat(64),'Bearer cp_'+'a!'.repeat(32)])assert.ok(!bearer.test(wrong),wrong);
 // Every documented success key is one the sync RPC builds, in the same order.
 for(const shape of builtShapes(hourlySql))assert.deepEqual(shape,Object.keys(replies[0]));
 const awakeReply=route.match(/return response\(\{ok:true,date:.*?\}\);/)[0];
 for(const key of Object.keys(replies[1])){assert.ok(builtKeys(awakeSql).includes(key),key);assert.ok(awakeReply.includes(key+':'),key)}
 // still_up is stored and never documented, because it never leaves the server.
 assert.ok(builtKeys(awakeSql).includes('still_up')&&!awakeReply.includes('still_up')&&!doc.includes('"still_up"'));
 for(const status of [401,400,413])assert.ok(route.includes('},'+status+')'),String(status));
});
