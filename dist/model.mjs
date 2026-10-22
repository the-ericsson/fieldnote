export const VERSION = 1;
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export function newPage(template = 'ruled') {
  return {id: uid(), width: 800, height: 1060, template, background: null, objects: [], recognized: ''};
}
export function newBook(title = 'Untitled notebook') {
  const now = Date.now();
  return {id: uid(), title, folder: '', tags: [], color: '#476656', created: now, updated: now, pages: [newPage()], recordings: []};
}
function check(ok, message) { if (!ok) throw new Error(message); }
function str(value, max = 10000) { return typeof value === 'string' && value.length <= max; }
function num(value, min = -100000, max = 100000) { return Number.isFinite(value) && value >= min && value <= max; }
function id(value) { return str(value, 100) && /^[a-zA-Z0-9_-]+$/.test(value); }
function unique(items) { return new Set(items).size === items.length; }
function color(value) { return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value); }
export function validateBook(b) {
  check(b && id(b.id) && str(b.title, 300) && str(b.folder, 300) && color(b.color), 'Invalid notebook metadata.');
  check(num(b.created, 0, 1e15) && num(b.updated, 0, 1e15), 'Invalid notebook date.');
  check(Array.isArray(b.tags) && b.tags.length <= 100 && b.tags.every(t => str(t, 100)), 'Invalid tags.');
  check(Array.isArray(b.pages) && b.pages.length > 0 && b.pages.length <= 500 && unique(b.pages.map(p => p.id)), 'Invalid pages (maximum 500).');
  let points = 0;
  for (const p of b.pages) {
    check(id(p.id) && num(p.width, 100, 5000) && num(p.height, 100, 10000), 'Invalid page size or ID.');
    check(['blank','ruled','grid','dots'].includes(p.template) && str(p.recognized, 1000000), 'Invalid page content.');
    check(p.background === null || (p.background && id(p.background.asset) && Number.isInteger(p.background.page) && p.background.page >= 1 && p.background.page <= 500), 'Invalid PDF background.');
    check(Array.isArray(p.objects) && p.objects.length <= 20000 && unique(p.objects.map(o => o.id)), 'Too many or duplicate page objects.');
    for (const o of p.objects) {
      check(id(o.id) && num(o.createdAt, 0, 1e15), 'Invalid object identity.');
      if (o.kind === 'ink') {
        check(color(o.color) && num(o.width, 0.1, 100) && typeof o.highlight === 'boolean' && Array.isArray(o.points) && o.points.length > 0 && o.points.length <= 200000, 'Invalid ink.');
        points += o.points.length;
        check(points <= 2000000 && o.points.every(v => Array.isArray(v) && v.length === 4 && num(v[0]) && num(v[1]) && num(v[2], 0, 1) && num(v[3], 0, 1e15)), 'Invalid ink points or notebook too complex.');
      } else {
        check(num(o.x) && num(o.y) && num(o.w, 1, 20000) && num(o.h, 1, 20000), 'Invalid object bounds.');
        if (o.kind === 'text') check(str(o.text, 100000) && num(o.size, 8, 200) && color(o.color), 'Invalid text.');
        else if (o.kind === 'image') check(id(o.asset), 'Invalid image.');
        else check(o.kind === 'shape' && ['rect','ellipse','line'].includes(o.shape) && color(o.color) && num(o.width, 0.1, 100), 'Invalid shape.');
      }
    }
  }
  check(Array.isArray(b.recordings) && b.recordings.length <= 1000 && unique(b.recordings.map(r => r.id)), 'Invalid recordings.');
  for (const r of b.recordings) check(id(r.id) && id(r.pageId) && str(r.mime, 100) && num(r.startedAt, 0, 1e15) && num(r.duration, 0, 1e9) && Array.isArray(r.assets) && r.assets.length <= 20000 && r.assets.every(id), 'Invalid recording.');
  return b;
}
export function assetIds(book) {
  return [...new Set([...book.pages.flatMap(p => [p.background?.asset, ...p.objects.filter(o => o.kind === 'image').map(o => o.asset)]), ...book.recordings.flatMap(r => r.assets)].filter(Boolean))];
}
export function bounds(o) {
  if (o.kind !== 'ink') return {x: o.x, y: o.y, w: o.w, h: o.h};
  // Avoid argument-limit overflows for long strokes.
  let minX = o.points[0][0], minY = o.points[0][1], maxX = minX, maxY = minY;
  for (const p of o.points) { minX = Math.min(minX,p[0]); minY = Math.min(minY,p[1]); maxX = Math.max(maxX,p[0]); maxY = Math.max(maxY,p[1]); }
  return {x:minX-o.width/2,y:minY-o.width/2,w:Math.max(1,maxX-minX+o.width),h:Math.max(1,maxY-minY+o.width)};
}
export function unionBounds(objects) {
  if (!objects.length) return null;
  const boxes = objects.map(bounds);
  const x = Math.min(...boxes.map(b=>b.x)), y = Math.min(...boxes.map(b=>b.y));
  return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};
}
export function inside(p, polygon) {
  let hit = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i], b=polygon[j];
    if ((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
  }
  return hit;
}
export function selectedBy(o, polygon) {
  if (o.kind === 'ink') return o.points.some(p => inside(p, polygon));
  const b=bounds(o); return inside([b.x+b.w/2,b.y+b.h/2],polygon);
}
export function transform(o, dx, dy, scale=1, anchor={x:0,y:0}) {
  if (o.kind === 'ink') { o.points=o.points.map(p=>[anchor.x+(p[0]-anchor.x)*scale+dx,anchor.y+(p[1]-anchor.y)*scale+dy,p[2],p[3]]); o.width*=scale; }
  else { o.x=anchor.x+(o.x-anchor.x)*scale+dx;o.y=anchor.y+(o.y-anchor.y)*scale+dy;o.w*=scale;o.h*=scale;if(o.kind==='text')o.size*=scale; }
}
export function segmentDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1];const d=dx*dx+dy*dy;
  const t=d ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)) : 0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
export function eraserHit(o,p,radius) {
  if(o.kind!=='ink')return false;
  if(o.points.length===1)return segmentDistance(p,o.points[0],o.points[0])<=radius+o.width/2;
  return o.points.some((v,i)=>i && segmentDistance(p,o.points[i-1],v)<=radius+o.width/2);
}
export function searchable(book) { return [book.title,book.folder,...book.tags,...book.pages.flatMap(p=>[p.recognized,...p.objects.filter(o=>o.kind==='text').map(o=>o.text)])].join('\n').toLowerCase(); }
