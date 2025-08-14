import {clamp, bearingToText, iou} from './utils.js';

const video=document.getElementById('video');
const canvas=document.getElementById('overlay'); const ctx=canvas.getContext('2d');
const menuToggle=document.getElementById('menuToggle'); const dropdown=document.getElementById('dropdown');
document.getElementById('fsBtn').onclick=toggleFS;
const guide=document.getElementById('guide'); const guideTitle=document.getElementById('guideTitle'); const guideMeta=document.getElementById('guideMeta'); const gpsMeta=document.getElementById('gpsMeta'); const guideClose=document.getElementById('guideClose'); const arrow=document.getElementById('arrow');
const hud=document.getElementById('hud');
const mapCanvas=document.getElementById('mapCanvas'); const mctx=mapCanvas.getContext('2d'); const mapToggle=document.getElementById('mapToggle');

const modeSelect=document.getElementById('modeSelect'); const cameraSelect=document.getElementById('cameraSelect'); const fovDeg=document.getElementById('fovDeg');
const startBtn=document.getElementById('startBtn'); const stopBtn=document.getElementById('stopBtn'); const simulateBtn=document.getElementById('simulateBtn');
const horizonPct=document.getElementById('horizonPct'); const hitK=document.getElementById('hitK'); const missM=document.getElementById('missM'); const cooldownSec=document.getElementById('cooldownSec');
const roiBtn=document.getElementById('roiBtn'); const clearRoiBtn=document.getElementById('clearRoiBtn');
const refreshMeteoBtn=document.getElementById('refreshMeteoBtn'); const toggleMeteoBtn=document.getElementById('toggleMeteoBtn'); const meteoInfo=document.getElementById('meteoInfo');

menuToggle.onclick=()=> dropdown.classList.toggle('open');
if(!localStorage.getItem('sg_menu_seen45')){ dropdown.classList.add('open'); localStorage.setItem('sg_menu_seen45','1'); }
function toggleFS(){ try{ if(document.fullscreenElement){ document.exitFullscreen(); } else { document.documentElement.requestFullscreen(); } }catch{} }
function fit(){ canvas.width=canvas.clientWidth; canvas.height=canvas.clientHeight; } addEventListener('resize', fit); fit();

// Sensors
let currentGPS={lat:null,lon:null,accuracy:null}; let compassDeg=null;
function startGPS(){ if(!navigator.geolocation){ return; } navigator.geolocation.watchPosition(p=>{ currentGPS.lat=p.coords.latitude; currentGPS.lon=p.coords.longitude; currentGPS.accuracy=p.coords.accuracy; },()=>{}, {enableHighAccuracy:true}); }
function startCompass(){ const handler=(e)=>{ compassDeg = e.webkitCompassHeading ?? (360-(e.alpha||0)); };
  if(window.DeviceOrientationEvent?.requestPermission){ DeviceOrientationEvent.requestPermission().then(s=>{ if(s==='granted') addEventListener('deviceorientation', handler); }).catch(()=>{}); } else { addEventListener('deviceorientation', handler); } }

// Meteo
let useMeteo=true; let meteo=null;
toggleMeteoBtn.onclick=()=>{ useMeteo=!useMeteo; toggleMeteoBtn.textContent='Usa correnti: '+(useMeteo?'ON':'OFF'); };
async function refreshMeteo(){ if(!currentGPS.lat){ meteoInfo.textContent='Concedi posizione e riprova.'; return; }
  const url = new URL('https://marine-api.open-meteo.com/v1/marine'); url.searchParams.set('latitude', currentGPS.lat.toFixed(5)); url.searchParams.set('longitude', currentGPS.lon.toFixed(5)); url.searchParams.set('timezone','auto'); url.searchParams.set('hourly','ocean_current_velocity,ocean_current_direction');
  try{ const r=await fetch(url); const d=await r.json(); const i=d.hourly.time.findIndex(t=>t.startsWith(new Date().toISOString().slice(0,13))); const k=i>=0?i:0; meteo={v:d.hourly.ocean_current_velocity?.[k]||0, dir:d.hourly.ocean_current_direction?.[k]||0}; meteoInfo.textContent=`Corrente ${meteo.v?.toFixed?.(2)||'?'} km/h → ${Math.round(meteo.dir||0)}°`; }catch{ meteoInfo.textContent='Meteo non disponibile'; meteo=null; } }
refreshMeteoBtn.onclick=refreshMeteo;

// ROI
let roi=null; let drawing=false; let points=[];
roiBtn.onclick=()=>{ drawing=true; points=[]; roi=null; HUD('Disegna poligono acqua (tap). Doppio tap per chiudere.'); };
clearRoiBtn.onclick=()=>{ drawing=false; points=[]; roi=null; HUD('ROI cancellata'); };
canvas.addEventListener('click',(e)=>{ if(!drawing) return; const r=canvas.getBoundingClientRect(); points.push({x:(e.clientX-r.left)/r.width, y:(e.clientY-r.top)/r.height}); });
canvas.addEventListener('dblclick',()=>{ if(points.length>=3){ roi=points.slice(); drawing=false; HUD('ROI impostata ✓'); } });
function pointInROI(px,py){ if(!roi) return false; let inside=false; for(let i=0,j=roi.length-1;i<roi.length;j=i++){ const xi=roi[i].x, yi=roi[i].y, xj=roi[j].x, yj=roi[j].y; const intersect=((yi>py)!=(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi); if(intersect) inside=!inside; } return inside; }

// Motion detection
const work=document.createElement('canvas'); const wctx=work.getContext('2d');
let prev=null;
function detectMotionPeople(){ const vw=video.videoWidth||1280, vh=video.videoHeight||720; const s=0.5; const W=Math.round(vw*s), H=Math.round(vh*s); work.width=W; work.height=H; wctx.drawImage(video,0,0,vw,vh,0,0,W,H); const cur=wctx.getImageData(0,0,W,H);
  let fg=new Uint8ClampedArray(W*H);
  if(prev){ for(let i=0;i<W*H;i++){ const off=i*4; const dr=cur.data[off]-prev.data[off]; const dg=cur.data[off+1]-prev.data[off+1]; const db=cur.data[off+2]-prev.data[off+2]; const d=Math.abs(dr)+Math.abs(dg)+Math.abs(db); fg[i]=d>60?255:0; } } prev=cur;
  const tmp=new Uint8ClampedArray(fg); for(let y=1;y<H-1;y++){ for(let x=1;x<W-1;x++){ let m=0; for(let yy=-1;yy<=1;yy++){ for(let xx=-1;xx<=1;xx++){ if(fg[(y+yy)*W+(x+xx)]) m++; }} tmp[y*W+x]=(m>=3)?255:0; }} fg=tmp;
  const labels=new Int32Array(W*H); let lid=0; const bbs=[];
  for(let y=1;y<H-1;y++){ for(let x=1;x<W-1;x++){ const idx=y*W+x; if(fg[idx]&& !labels[idx]){ lid++; let minx=x,maxx=x,miny=y,maxy=y; const stack=[idx]; labels[idx]=lid; while(stack.length){ const p=stack.pop(); const py=(p/W)|0, px=p%W; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const q=(py+dy)*W+(px+dx); if(px+dx<1||px+dx>=W-1||py+dy<1||py+dy>=H-1) continue; if(fg[q] && !labels[q]){ labels[q]=lid; stack.push(q); minx=min(minx,px+dx); maxx=max(maxx,px+dx); miny=min(miny,py+dy); maxy=max(maxy,py+dy); } } }
        const bw=(maxx-minx+1)/s, bh=(maxy-miny+1)/s, bx=minx/s, by=miny/s; bbs.push({x:bx,y:by,w:bw,h:bh}); } } }
  const hPct=parseFloat(horizonPct.value)/100; const horizonY=(video.videoHeight||720)*hPct; const minArea=0.06*1280*720;
  const filtered=bbs.filter(b=> (b.y+b.h/2)>=horizonY && b.w*b.h>=minArea && (b.h/(b.w+1e-3))>0.4 && (b.h/(b.w+1e-3))<6 && pointInROI((b.x+b.w/2)/(video.videoWidth||1280),(b.y+b.h/2)/(video.videoHeight||720)));
  const merged=[]; const used=new Array(filtered.length).fill(false);
  for(let i=0;i<filtered.length;i++){ if(used[i]) continue; let a=filtered[i]; for(let j=i+1;j<filtered.length;j++){ if(used[j]) continue; if(iou(a,filtered[j])>0.3){ const b=filtered[j]; const nx=Math.min(a.x,b.x), ny=Math.min(a.y,b.y), nxx=Math.max(a.x+a.w,b.x+b.w), nyy=Math.max(a.y+a.h,b.y+b.h); a={x:nx,y:ny,w:nxx-nx,h:nyy-ny}; used[j]=true; } } merged.push(a); }
  return merged;
}

// Tracking
let tracks=[]; let nextId=1; const colors={}; function col(id){ if(colors[id]) return colors[id]; const h=(id*53)%360; return colors[id]=`hsl(${h}deg 90% 55%)`; }
function assignIDs(dets){ const assigned=new Set(); for(const tr of tracks){ tr.matched=false; let best=0,bi=-1; for(let j=0;j<dets.length;j++){ if(assigned.has(j)) continue; const ov=iou(tr.bbox,dets[j]); if(ov>best){ best=ov; bi=j; } } if(best>0.3){ tr.bbox=dets[bi]; tr.lastT=performance.now()/1000; tr.hits=(tr.hits||0)+1; tr.miss=0; tr.matched=true; assigned.add(bi);} else { tr.miss=(tr.miss||0)+1; } } for(let j=0;j<dets.length;j++){ if(!assigned.has(j)){ tracks.push({id:nextId++, bbox:dets[j], hits:1, miss:0, lastT:performance.now()/1000}); } } tracks=tracks.filter(tr=> tr.miss<120); }

// HUD & alarm
function HUD(msg,bg){ hud.textContent=msg; hud.style.display='flex'; hud.style.background=bg||'#0b3357'; clearTimeout(hud._t); hud._t=setTimeout(()=>hud.style.display='none',3000); }
let cooldownUntil=0; let alerting=null;
function startAlarm(){ try{ if(!window._ac) window._ac=new (window.AudioContext||window.webkitAudioContext)(); const ac=window._ac; const o=ac.createOscillator(); const g=ac.createGain(); o.type='square'; o.frequency.value=880; g.gain.value=0.2; o.connect(g); g.connect(ac.destination); o.start(); setTimeout(()=>o.stop(),2500);}catch{} if(navigator.vibrate) navigator.vibrate([200,100,200,400,200,100,200]); }
function openGuide(tr){ alerting={id:tr.id, last:{cx:tr.bbox.x+tr.bbox.w/2, cy:tr.bbox.y+tr.bbox.h/2}, t:performance.now()/1000}; guideTitle.textContent=`ALLERTA — Persona #${tr.id}`; guide.style.display='flex'; startAlarm(); mapCanvas.style.display='block'; }
function closeGuide(){ guide.style.display='none'; alerting=null; cooldownUntil=performance.now()/1000 + parseFloat(cooldownSec.value); }
guideClose.onclick=closeGuide; mapToggle.onclick=()=>{ mapCanvas.style.display=(mapCanvas.style.display==='none'||!mapCanvas.style.display)?'block':'none'; };

// Map & bearing
function bearingFromPixel(cxNorm){ const fov=parseFloat(fovDeg.value)*(Math.PI/180); const off=(cxNorm-0.5)*fov; const bearing=((compassDeg??0)+off*180/Math.PI)%360; return (bearing+360)%360; }
function updateMap(){ const mx=mapCanvas.clientWidth||240, my=mapCanvas.clientHeight||160; mapCanvas.width=mx; mapCanvas.height=my; mctx.fillStyle='#02253b'; mctx.fillRect(0,0,mx,my); if(!alerting) return;
  const x=clamp(alerting.last.cx,0,canvas.width)/canvas.width*mx; const y=clamp(alerting.last.cy,0,canvas.height)/canvas.height*my; mctx.fillStyle='#fff'; mctx.beginPath(); mctx.arc(x,y,4,0,Math.PI*2); mctx.fill();
  const ang=((useMeteo&&meteo?.dir)|| (compassDeg??0)) * Math.PI/180; const ex=x+Math.cos(ang)*28, ey=y+Math.sin(ang)*28; mctx.fillStyle='#ff4757'; mctx.beginPath(); mctx.arc(ex,ey,4,0,Math.PI*2); mctx.fill(); mctx.strokeStyle='rgba(255,255,255,0.6)'; mctx.beginPath(); mctx.moveTo(x,y); mctx.lineTo(ex,ey); mctx.stroke(); arrow.setAttribute('transform',`rotate(${ang*180/Math.PI},100,100)`); }

// Demo
let demoNextT=0; function scheduleDemo(){ const t=performance.now()/1000; demoNextT=t+20+Math.random()*30; }
function demoStep(){ const t=performance.now()/1000; if(modeSelect.value!=='demo') return; if(t>demoNextT && tracks.length){ const tr=tracks[Math.floor(Math.random()*tracks.length)]; tr.miss+=parseInt(missM.value,10)+2; openGuide(tr); scheduleDemo(); } }

// Main loop
let running=false, stream=null, lastLoop=0;
async function loop(){ if(!running) return; const t=performance.now()/1000; if(t-lastLoop<0.1){ requestAnimationFrame(loop); return; } lastLoop=t;
  if(!roi){ HUD('Disegna la ROI acqua prima di avviare'); requestAnimationFrame(loop); return; }
  const dets=detectMotionPeople(); assignIDs(dets);
  const K=parseInt(hitK.value,10), M=parseInt(missM.value,10); const vw=video.videoWidth||1280, vh=video.videoHeight||720;
  for(const tr of tracks){ if(tr.matched) tr.hit=(tr.hit||0)+1; else tr.miss=(tr.miss||0)+1;
    if((tr.hit||0)>=K && (tr.miss||0)>=M && !alerting && t>=cooldownUntil){ const cx=tr.bbox.x+tr.bbox.w/2, cy=tr.bbox.y+tr.bbox.h/2; const br=bearingFromPixel(clamp(cx/vw,0,1));
      guideTitle.textContent=`ALLERTA — Persona #${tr.id}`; guideMeta.textContent=`Ultimo visto: ${Math.round((t-tr.lastT)||0)} s · Bearing: ${Math.round(br)}°`; const compText=compassDeg==null?'--':bearingToText(compassDeg); gpsMeta.textContent=currentGPS.lat?`GPS: ${currentGPS.lat.toFixed(5)}, ${currentGPS.lon.toFixed(5)} (±${currentGPS.accuracy?Math.round(currentGPS.accuracy):'--'} m) · Bussola: ${compText}`:'GPS: --'; alerting={id:tr.id, last:{cx,cy}, t}; startAlarm(); guide.style.display='flex'; mapCanvas.style.display='block'; }
  }
  if(alerting) updateMap();
  drawOverlay(); demoStep(); requestAnimationFrame(loop);
}

// Draw overlay
function drawOverlay(){ fit(); ctx.clearRect(0,0,canvas.width,canvas.height); const hy=canvas.height*(parseFloat(horizonPct.value)/100); ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(0,hy); ctx.lineTo(canvas.width,hy); ctx.stroke();
  if(roi){ ctx.save(); ctx.beginPath(); ctx.moveTo(roi[0].x*canvas.width, roi[0].y*canvas.height); for(let i=1;i<roi.length;i++){ ctx.lineTo(roi[i].x*canvas.width, roi[i].y*canvas.height);} ctx.closePath(); ctx.fillStyle='rgba(30,144,255,0.15)'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='rgba(30,144,255,0.9)'; ctx.stroke(); ctx.restore(); }
  const vw=video.videoWidth||1280, vh=video.videoHeight||720; for(const tr of tracks){ const x=tr.bbox.x/vw*canvas.width, y=tr.bbox.y/vh*canvas.height, w=tr.bbox.w/vw*canvas.width, h=tr.bbox.h/vh*canvas.height; ctx.lineWidth=3; ctx.strokeStyle=col(tr.id); ctx.strokeRect(x,y,w,h); ctx.fillStyle=col(tr.id); ctx.font='700 14px system-ui'; ctx.fillText('#'+tr.id, x, y-6); }
}

// Camera & Demo streams
async function startCamera(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } const val=cameraSelect.value; const cons={audio:false, video:{facingMode:(val==='env'?'environment':'user'), width:{ideal:1280}, height:{ideal:720}}}; stream=await navigator.mediaDevices.getUserMedia(cons); video.srcObject=stream; await video.play(); }
function startDemo(){ const c=document.createElement('canvas'); c.width=1280; c.height=720; const g=c.getContext('2d'); let t=0, hide=false, hideStart=0;
  function step(){ if(!running) return; t+=1/30; g.fillStyle='#00304d'; g.fillRect(0,0,c.width,c.height); for(let i=0;i<50;i++){ const y=(i*16+Math.sin((t+i)*0.8)*12)%c.height; g.fillStyle='rgba(255,255,255,0.02)'; g.fillRect(0,y,c.width,2); }
    for(let k=0;k<3;k++){ const px=300+ k*200 + Math.sin(t*0.5+k)*30; const bob=Math.sin(t*2+k)*6; if(!(hide && k===1)){ g.fillStyle='#ffeeaa'; g.beginPath(); g.arc(px,420+bob-26,10,0,Math.PI*2); g.fill(); g.fillStyle='#c0d8ff'; g.fillRect(px-13,420+bob-26+12,26,40); } }
    if(Math.floor(t)%12===0 && !hide){ hide=true; hideStart=t; } if(hide && t-hideStart>8){ hide=false; } requestAnimationFrame(step);} video.srcObject=c.captureStream(30); video.play(); step(); scheduleDemo(); }

// Controls
guideClose.onclick=()=> closeGuide();
document.addEventListener('visibilitychange',()=>{ if(document.hidden) closeGuide(); });

startBtn.onclick=async ()=>{ try{ dropdown.classList.remove('open'); running=true; fit(); startGPS(); startCompass(); if(modeSelect.value==='live'){ await startCamera(); } else { startDemo(); } HUD('Sessione avviata','#0b3357'); loop(); }catch(e){ alert('Errore: '+e.message); running=false; } };
stopBtn.onclick=()=>{ running=false; if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } guide.style.display='none'; HUD('Sessione terminata','#0b3357'); };
simulateBtn.onclick=()=>{ if(!alerting){ const tr=tracks[0]||{id:0,bbox:{x:(video.videoWidth||1280)/2-30,y:(video.videoHeight||720)/2-50,w:60,h:90}, lastT:performance.now()/1000}; openGuide(tr); } };
