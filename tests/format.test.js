import test from 'node:test';
import assert from 'node:assert/strict';
import {clock,plural} from '../lib/study.js';
test('times read the same way everywhere: a.m./p.m., zone only when asked',()=>{
 assert.equal(clock('2026-10-12T15:48:00Z','America/New_York'),'11:48 a.m.');
 assert.equal(clock('2026-10-13T03:48:00Z','America/New_York'),'11:48 p.m.');
 assert.equal(clock('2026-10-13T03:48:00Z','America/New_York',true),'11:48 p.m. EDT');
 assert.equal(clock('2026-01-13T04:00:00Z','America/New_York',true),'11:00 p.m. EST');
});
test('counts of one are singular',()=>{
 assert.equal(plural(1,'session'),'session');
 assert.equal(plural(0,'session'),'sessions');
 assert.equal(plural(3,'card'),'cards');
});
