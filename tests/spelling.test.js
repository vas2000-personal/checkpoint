import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
// The board is written in American English. Agents and editors drift to British spellings, and the one
// that actually reached a user was "Accent colour" in the settings panel, so this is a cheap guard on
// the words this project plausibly uses. Identifiers count too: a colourWinner helper is as wrong as
// the label above it.
const BRITISH=/\b(colour|behaviour|honour|recognis|organis|customis|optimis|normalis|apologis|defence|offence|licence|favour|labour|centre|grey|whilst|fulfil|enrolment|skilful|cancelled|travelled|catalogue)[a-z]*/gi;
const SKIP=new Set(['node_modules','.next','.git','.vercel','fixtures']);
// This file necessarily contains every word it bans.
const SELF='spelling.test.js';
const EXTENSIONS=/\.(js|jsx|mjs|css|sql|md)$/;
function walk(dir,found=[]) {
 for(const name of readdirSync(dir)){
  if(SKIP.has(name))continue;
  const path=join(dir,name);
  if(statSync(path).isDirectory()){walk(path,found);continue}
  if(!EXTENSIONS.test(name)||name===SELF)continue;
  const text=readFileSync(path,'utf8');
  for(const match of text.matchAll(BRITISH)){
   const line=text.slice(0,match.index).split('\n').length;
   found.push(`${path}:${line} ${match[0]}`);
  }
 }
 return found;
}
test('the project is written in American English',()=>{
 const found=walk(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
 assert.deepEqual(found,[],'British spellings found:\n  '+found.join('\n  '));
});
