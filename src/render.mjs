import {getAsset} from './storage.mjs';
import {unionBounds} from './model.mjs';
let pdfModule;
export async function pdfjs(){
  if(!pdfModule){pdfModule=await import('./vendor/pdf.mjs');pdfModule.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;}
  return pdfModule;
}
const pdfCache=new Map();
export async function loadPDF(id){
  if(!pdfCache.has(id)){
    const asset=await getAsset(id);if(!asset)throw new Error('The PDF attachment is missing. Restore a backup.');
    const lib=await pdfjs();const task=lib.getDocument({data:new Uint8Array(await asset.blob.arrayBuffer()),cMapUrl:new URL('./vendor/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/standard_fonts/',import.meta.url).href,isEvalSupported:false});
    task.onPassword=()=>task.destroy();
    pdfCache.set(id,task.promise.catch(e=>{pdfCache.delete(id);throw e;}));
    if(pdfCache.size>3){const key=pdfCache.keys().next().value;const old=pdfCache.get(key);pdfCache.delete(key);old.then(doc=>doc.destroy());}
  }return pdfCache.get(id);
}
export class Renderer {
  constructor(canvas){this.canvas=canvas;this.images=new Map();this.base=document.createElement('canvas');this.generation=0;}
  async prepare(page,scale=1.5){
    const gen=++this.generation;const base=document.createElement('canvas');base.width=Math.round(page.width*scale);base.height=Math.round(page.height*scale);
    const ctx=base.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fffefb';ctx.fillRect(0,0,page.width,page.height);
    if(page.background){
      const pdf=await loadPDF(page.background.asset),p=await pdf.getPage(page.background.page);
      const viewport=p.getViewport({scale:base.width/p.getViewport({scale:1}).width});ctx.setTransform(1,0,0,1,0,0);
      await p.render({canvasContext:ctx,viewport}).promise;p.cleanup();
    } else this.template(ctx,page);
    for(const o of page.objects)if(o.kind==='image'&&!this.images.has(o.asset)){
      const a=await getAsset(o.asset);if(!a)throw new Error('An image attachment is missing.');
      const url=URL.createObjectURL(a.blob),img=new Image();try{img.src=url;await img.decode();this.images.set(o.asset,img);}finally{URL.revokeObjectURL(url);}
    }
    if(gen!==this.generation)return false;
    this.base=base;this.scale=scale;this.canvas.width=base.width;this.canvas.height=base.height;this.page=page;return true;
  }
  template(ctx,p){
    ctx.strokeStyle='#dce6e8';ctx.fillStyle='#bccdd1';ctx.lineWidth=.7;
    if(p.template==='ruled'||p.template==='grid'){for(let y=60;y<p.height;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(p.width,y);ctx.stroke();}}
    if(p.template==='grid'){for(let x=0;x<p.width;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,p.height);ctx.stroke();}}
    if(p.template==='dots'){for(let y=36;y<p.height;y+=24)for(let x=28;x<p.width;x+=24){ctx.beginPath();ctx.arc(x,y,.8,0,Math.PI*2);ctx.fill();}}
    if(p.template==='ruled'){ctx.strokeStyle='#e9c9c2';ctx.beginPath();ctx.moveTo(68,0);ctx.lineTo(68,p.height);ctx.stroke();}
  }
  object(ctx,o,cutoff=Infinity){
    if(o.createdAt>cutoff)return;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=o.color;ctx.fillStyle=o.color;
    if(o.kind==='ink'){
      const pts=o.points.filter(p=>p[3]<=cutoff);ctx.globalAlpha=o.highlight?.25:1;
      if(pts.length===1){ctx.beginPath();ctx.arc(pts[0][0],pts[0][1],o.width*(.3+pts[0][2]*.7)/2,0,Math.PI*2);ctx.fill();}
      for(let i=1;i<pts.length;i++){ctx.lineWidth=o.width*(o.highlight?1:.3+pts[i][2]*.7);ctx.beginPath();ctx.moveTo(pts[i-1][0],pts[i-1][1]);ctx.lineTo(pts[i][0],pts[i][1]);ctx.stroke();}
    }else if(o.kind==='text'){
      ctx.font=`${o.size}px -apple-system, BlinkMacSystemFont, sans-serif`;ctx.textBaseline='top';
      o.text.split('\n').forEach((line,i)=>ctx.fillText(line,o.x,o.y+i*o.size*1.3));
    }else if(o.kind==='image'){const img=this.images.get(o.asset);if(img)ctx.drawImage(img,o.x,o.y,o.w,o.h);}
    else {ctx.lineWidth=o.width;ctx.beginPath();if(o.shape==='rect')ctx.rect(o.x,o.y,o.w,o.h);else if(o.shape==='ellipse')ctx.ellipse(o.x+o.w/2,o.y+o.h/2,o.w/2,o.h/2,0,0,Math.PI*2);else{ctx.moveTo(o.x,o.y);ctx.lineTo(o.x+o.w,o.y+o.h);}ctx.stroke();}
    ctx.restore();
  }
  draw({draft=null,selection=[],polygon=[],cutoff=Infinity}={}){
    if(!this.page)return;const c=this.canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.canvas.width,this.canvas.height);c.drawImage(this.base,0,0);c.scale(this.scale,this.scale);
    for(const o of this.page.objects)this.object(c,o,cutoff);if(draft)this.object(c,draft);
    c.strokeStyle='#316653';c.lineWidth=1.5;c.setLineDash([7,5]);
    if(polygon.length){c.beginPath();polygon.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();}
    const b=unionBounds(this.page.objects.filter(o=>selection.includes(o.id)));if(b)c.strokeRect(b.x-5,b.y-5,b.w+10,b.h+10);
  }
}
