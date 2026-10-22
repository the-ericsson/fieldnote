import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newBook,validateBook,bounds,eraserHit,inside,selectedBy,transform,searchable,uid} from '../src/model.mjs';
const ink=()=>({id:uid(),kind:'ink',createdAt:Date.now(),color:'#112233',width:4,highlight:false,points:[[10,20,.5,10],[110,20,1,20]]});
test('valid notebook and rejection of malformed geometry, duplicate pages, unsafe asset IDs',()=>{
  const b=newBook('Lecture');b.pages[0].objects.push(ink());assert.equal(validateBook(b),b);
  const bad=structuredClone(b);bad.pages[0].objects[0].points[0][0]=Infinity;assert.throws(()=>validateBook(bad));
  const duplicate=structuredClone(b);duplicate.pages.push(structuredClone(duplicate.pages[0]));assert.throws(()=>validateBook(duplicate));
  const traversal=structuredClone(b);traversal.pages[0].background={asset:'../escape',page:1};assert.throws(()=>validateBook(traversal));
});
test('eraser finds segment crossings between sampled points; ignores distant strokes',()=>{assert.equal(eraserHit(ink(),[60,21],3),true);assert.equal(eraserHit(ink(),[60,100],3),false);});
test('lasso and transforms preserve pressure/time and update geometry',()=>{
  const o=ink();assert.equal(inside([20,20],[[0,0],[200,0],[200,100],[0,100]]),true);assert.equal(selectedBy(o,[[0,0],[200,0],[200,100],[0,100]]),true);
  transform(o,5,10,2,{x:10,y:20});assert.deepEqual(o.points,[[15,30,.5,10],[215,30,1,20]]);assert.equal(o.width,8);
});
test('long strokes do not exceed JS argument limits during bounds calculation',()=>{const o=ink();o.points=Array.from({length:200000},(_,i)=>[i/10,i/100,.5,i]);const b=bounds(o);assert.equal(b.x, -2);assert.ok(b.w>19999);});
test('search indexes folder, tags, typed text and OCR',()=>{const b=newBook('Biology');b.folder='Classes';b.tags=['exam'];b.pages[0].recognized='Mitochondria';b.pages[0].objects.push({kind:'text',text:'Energy'});for(const word of ['biology','classes','exam','mitochondria','energy'])assert.ok(searchable(b).includes(word));});
