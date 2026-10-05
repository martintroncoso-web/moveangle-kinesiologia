import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22";

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

const $ = (id) => document.getElementById(id);
const video = $("video");
const skeletonCanvas = $("skeletonCanvas");
const chartCanvas = $("chartCanvas");
const sctx = skeletonCanvas.getContext("2d");
const cctx = chartCanvas.getContext("2d");
const modelStatus = $("modelStatus");
const videoInput = $("videoInput");
const fileName = $("fileName");
const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const recordBtn = $("recordBtn");
const preset = $("preset");
const targetAngle = $("targetAngle");
const visibilityInput = $("visibility");
const fpsInput = $("analysisFps");
const angleValue = $("angleValue");
const minAngle = $("minAngle");
const maxAngle = $("maxAngle");
const rangeAngle = $("rangeAngle");
const timeValue = $("timeValue");
const videoInfo = $("videoInfo");
const emptyState = $("emptyState");
const targetBadge = $("targetBadge");

let landmarker = null;
let videoURL = null;
let animationId = null;
let running = false;
let lastAnalysis = -Infinity;
let analysisClock = 0;
let currentAngle = null;
let history = [];
let selected = {a:11,b:23,c:25,label:"Cadera izquierda"};
let recorder = null;
let recordedChunks = [];
let recordStream = null;
let customMode = false;

const JOINTS = {
  0:"Nariz",1:"Ojo izq. interno",2:"Ojo izq.",3:"Ojo izq. externo",4:"Ojo der. interno",5:"Ojo der.",6:"Ojo der. externo",7:"Oreja izq.",8:"Oreja der.",9:"Boca izq.",10:"Boca der.",11:"Hombro izq.",12:"Hombro der.",13:"Codo izq.",14:"Codo der.",15:"Muñeca izq.",16:"Muñeca der.",17:"Meñique izq.",18:"Meñique der.",19:"Índice izq.",20:"Índice der.",21:"Pulgar izq.",22:"Pulgar der.",23:"Cadera izq.",24:"Cadera der.",25:"Rodilla izq.",26:"Rodilla der.",27:"Tobillo izq.",28:"Tobillo der.",29:"Talón izq.",30:"Talón der.",31:"Pie izq.",32:"Pie der."
};

const CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[27,31],[24,26],[26,28],[28,30],[28,32]
];

const PRESETS = {
  "hip-left": [11,23,25,"Cadera izquierda · hombro–cadera–rodilla"],
  "hip-right": [12,24,26,"Cadera derecha · hombro–cadera–rodilla"],
  "knee-left": [23,25,27,"Rodilla izquierda · cadera–rodilla–tobillo"],
  "knee-right": [24,26,28,"Rodilla derecha · cadera–rodilla–tobillo"],
  "elbow-left": [11,13,15,"Codo izquierdo · hombro–codo–muñeca"],
  "elbow-right": [12,14,16,"Codo derecho · hombro–codo–muñeca"],
  "shoulder-left": [13,11,23,"Hombro izquierdo · codo–hombro–cadera"],
  "shoulder-right": [14,12,24,"Hombro derecho · codo–hombro–cadera"],
  "ankle-left": [25,27,31,"Tobillo izquierdo · rodilla–tobillo–pie"],
  "ankle-right": [26,28,32,"Tobillo derecho · rodilla–tobillo–pie"],
  "wrist-left": [13,15,19,"Muñeca izquierda · codo–muñeca–índice"],
  "wrist-right": [14,16,20,"Muñeca derecha · codo–muñeca–índice"]
};


function fillJointSelects(){
  [$("jointA"),$("jointB"),$("jointC")].forEach(sel=>{
    Object.entries(JOINTS).forEach(([i,name])=>{
      const opt=document.createElement("option"); opt.value=i; opt.textContent=`${i} · ${name}`; sel.appendChild(opt);
    });
  });
  $("jointA").value=11; $("jointB").value=23; $("jointC").value=25;
}
fillJointSelects();

function applyPreset(){
  const p=PRESETS[preset.value];
  selected={a:p[0],b:p[1],c:p[2],label:p[3]};
  customMode=false;
  resetSeries();
}

preset.addEventListener("change",applyPreset);
$("applyCustom").addEventListener("click",()=>{
  selected={a:+$("jointA").value,b:+$("jointB").value,c:+$("jointC").value,label:`${JOINTS[$("jointB").value]} personalizada`};
  customMode=true;
  resetSeries();
});

targetAngle.addEventListener("input",()=>{targetBadge.textContent=`${Number(targetAngle.value)||0}°`; drawChart();});

videoInput.addEventListener("change", async e=>{
  const file=e.target.files?.[0];
  if(!file) return;
  stopLoop();
  if(videoURL) URL.revokeObjectURL(videoURL);
  videoURL=URL.createObjectURL(file);
  video.src=videoURL;
  video.loop=true;
  video.load();
  fileName.textContent=file.name;
  emptyState.style.display="none";
  video.addEventListener("loadedmetadata",()=>{
    videoInfo.textContent=`${Math.round(video.videoWidth)}×${Math.round(video.videoHeight)} · ${formatTime(video.duration)}`;
    resizeCanvases();
    startBtn.disabled=false;
    recordBtn.disabled=false;
    drawEmpty();
  },{once:true});
});

window.addEventListener("resize",()=>{resizeCanvases(); drawChart();});
video.addEventListener("ended",()=>{
  // El video está configurado en bucle; este evento solo funciona como respaldo en navegadores que ignoren loop.
  if(video.loop){ video.currentTime=0; if(running) video.play(); return; }
  running=false; pauseBtn.textContent="Ⅱ Pausar"; startBtn.textContent="↻ Repetir análisis";
  if(recorder?.state==="recording") stopRecording();
});

async function initModel(){
  try{
    modelStatus.textContent="● Cargando modelo…";
    const vision=await FilesetResolver.forVisionTasks(WASM_URL);
    const common={
      baseOptions:{modelAssetPath:MODEL_URL},
      runningMode:"VIDEO",
      numPoses:1,
      minPoseDetectionConfidence:.35,
      minPosePresenceConfidence:.35,
      minTrackingConfidence:.35
    };
    try {
      landmarker=await PoseLandmarker.createFromOptions(vision,{...common,baseOptions:{...common.baseOptions,delegate:"GPU"}});
    } catch (gpuError) {
      console.warn("GPU no disponible; usando CPU",gpuError);
      landmarker=await PoseLandmarker.createFromOptions(vision,{...common,baseOptions:{...common.baseOptions,delegate:"CPU"}});
    }
    modelStatus.textContent="● Modelo listo";
    modelStatus.style.color="#9ae6b4";
  }catch(err){
    console.error(err);
    modelStatus.textContent="● Error al cargar modelo";
    modelStatus.title=String(err);
  }
}
initModel();

startBtn.addEventListener("click",async()=>{
  if(!video.src) return;
  if(!landmarker){alert("El modelo todavía se está cargando. Espera unos segundos y vuelve a intentarlo.");return;}
  resetSeries();
  video.currentTime=0;
  await video.play();
  running=true;
  startBtn.textContent="↻ Reiniciar análisis";
  pauseBtn.disabled=false;
  pauseBtn.textContent="Ⅱ Pausar";
  analysisClock=0;
  lastAnalysis=-Infinity;
  loop();
});

pauseBtn.addEventListener("click",()=>{
  if(running){running=false;video.pause();pauseBtn.textContent="▶ Continuar";}
  else{running=true;video.play();pauseBtn.textContent="Ⅱ Pausar";loop();}
});

recordBtn.addEventListener("click",async()=>{
  if(!video.src) return;
  if(recorder?.state==="recording"){stopRecording();return;}
  if(!running){
    resetSeries(); video.currentTime=0; await video.play(); running=true; pauseBtn.disabled=false; loop();
  }
  startRecording();
});

$("resetBtn").addEventListener("click",()=>{
  stopLoop(); video.pause(); if(video.src) video.currentTime=0; resetSeries(); startBtn.textContent="▶ Iniciar análisis"; pauseBtn.disabled=true; pauseBtn.textContent="Ⅱ Pausar"; drawEmpty();
});

function stopLoop(){running=false;if(animationId)cancelAnimationFrame(animationId);animationId=null;}
function resetSeries(){history=[];currentAngle=null;analysisClock=0;lastAnalysis=-Infinity;updateStats();drawChart();angleValue.textContent="—";}

function resizeCanvases(){
  const rect=skeletonCanvas.getBoundingClientRect();
  const dpr=Math.min(devicePixelRatio||1,2);
  skeletonCanvas.width=Math.max(1,Math.floor(rect.width*dpr)); skeletonCanvas.height=Math.max(1,Math.floor(rect.height*dpr));
  const cr=chartCanvas.getBoundingClientRect();
  chartCanvas.width=Math.max(1,Math.floor(cr.width*dpr)); chartCanvas.height=Math.max(1,Math.floor(cr.height*dpr));
}

function drawEmpty(){
  resizeCanvases();
  sctx.clearRect(0,0,skeletonCanvas.width,skeletonCanvas.height);
  sctx.fillStyle="#0b1020";sctx.fillRect(0,0,skeletonCanvas.width,skeletonCanvas.height);
  sctx.fillStyle="#aeb8c7";sctx.font=`${14*(devicePixelRatio||1)}px system-ui`;sctx.textAlign="center";sctx.fillText("Aquí aparecerá la figura de palitos",skeletonCanvas.width/2,skeletonCanvas.height/2);
}

drawEmpty();

function loop(){
  if(!running) return;
  const now=performance.now();
  const interval=1000/Math.max(5,Number(fpsInput.value)||20);
  drawVideoFrame();
  if(now-lastAnalysis>=interval){
    lastAnalysis=now;
    analysisClock += interval;
    analyzeFrame(analysisClock);
  }
  animationId=requestAnimationFrame(loop);
}

function drawVideoFrame(){
  // The left panel is the native <video>. The canvas is the export surface.
  if(video.readyState>=2){
    // nothing needed here; browser renders video directly
  }
}

function analyzeFrame(timestamp){
  if(!landmarker || video.readyState<2) return;
  let result;
  try{result=landmarker.detectForVideo(video,timestamp);}catch(e){console.warn(e);return;}
  const landmarks=result.landmarks?.[0];
  drawSkeleton(landmarks);
  if(!landmarks){angleValue.textContent="—";drawChart();return;}
  const A=landmarks[resolveIndex(selected.a)],B=landmarks[resolveIndex(selected.b)],C=landmarks[resolveIndex(selected.c)];
  const threshold=Math.max(.1,Math.min(.9,Number(visibilityInput.value)||.35));
  const angle=angleBetween(A,B,C,threshold);
  currentAngle=angle;
  if(angle!=null){history.push({t:analysisClock/1000,a:angle});if(history.length>1200)history.shift();angleValue.textContent=`${angle.toFixed(1)}°`;updateStats();}
  drawChart();
  if(recorder?.state==="recording") drawExportFrame(landmarks,angle);
}

function angleBetween(A,B,C,threshold){
  if(!A||!B||!C) return null;
  if((A.visibility??1)<threshold||(B.visibility??1)<threshold||(C.visibility??1)<threshold) return null;
  const ux=A.x-B.x,uy=A.y-B.y,uz=(A.z??0)-(B.z??0);
  const vx=C.x-B.x,vy=C.y-B.y,vz=(C.z??0)-(B.z??0);
  const nu=Math.hypot(ux,uy,uz),nv=Math.hypot(vx,vy,vz);
  if(!nu||!nv)return null;
  let cos=(ux*vx+uy*vy+uz*vz)/(nu*nv);cos=Math.max(-1,Math.min(1,cos));
  return Math.acos(cos)*180/Math.PI;
}

function drawSkeleton(landmarks){
  resizeCanvases();
  const w=skeletonCanvas.width,h=skeletonCanvas.height;
  sctx.clearRect(0,0,w,h);sctx.fillStyle="#080c15";sctx.fillRect(0,0,w,h);
  if(!landmarks)return;
  const sx=w,sy=h;
  sctx.lineWidth=Math.max(2,3*(devicePixelRatio||1));sctx.lineCap="round";
  CONNECTIONS.forEach(([i,j])=>{
    const a=landmarks[i],b=landmarks[j];if(!a||!b)return;
    if((a.visibility??1)<.2||(b.visibility??1)<.2)return;
    sctx.strokeStyle="#6574ff";sctx.beginPath();sctx.moveTo(a.x*sx,a.y*sy);sctx.lineTo(b.x*sx,b.y*sy);sctx.stroke();
  });
  landmarks.forEach((p,i)=>{
    if((p.visibility??1)<.2)return;
    sctx.fillStyle="#32bd83";sctx.beginPath();sctx.arc(p.x*sx,p.y*sy,4*(devicePixelRatio||1),0,Math.PI*2);sctx.fill();
  });
  const A=landmarks[resolveIndex(selected.a)],B=landmarks[resolveIndex(selected.b)],C=landmarks[resolveIndex(selected.c)];
  if(A&&B&&C&&(A.visibility??1)>=.2&&(B.visibility??1)>=.2&&(C.visibility??1)>=.2){
    sctx.strokeStyle="#ff9f43";sctx.lineWidth=5*(devicePixelRatio||1);sctx.beginPath();sctx.moveTo(A.x*sx,A.y*sy);sctx.lineTo(B.x*sx,B.y*sy);sctx.lineTo(C.x*sx,C.y*sy);sctx.stroke();
    if(currentAngle!=null){
      const bx=B.x*sx,by=B.y*sy;sctx.fillStyle="rgba(0,0,0,.72)";sctx.fillRect(bx+8,by-28,76*(devicePixelRatio||1),24*(devicePixelRatio||1));
      sctx.fillStyle="#ffb86b";sctx.font=`bold ${15*(devicePixelRatio||1)}px system-ui`;sctx.fillText(`${currentAngle.toFixed(1)}°`,bx+14,by-11);
    }
  }
}

function updateStats(){
  const vals=history.map(x=>x.a);if(!vals.length){minAngle.textContent=maxAngle.textContent=rangeAngle.textContent="—";timeValue.textContent="00:00.0";return;}
  const mn=Math.min(...vals),mx=Math.max(...vals);minAngle.textContent=`${mn.toFixed(1)}°`;maxAngle.textContent=`${mx.toFixed(1)}°`;rangeAngle.textContent=`${(mx-mn).toFixed(1)}°`;timeValue.textContent=formatTime(video.currentTime);
}

function drawChart(){
  resizeCanvases();
  const dpr=Math.min(devicePixelRatio||1,2),w=chartCanvas.width,h=chartCanvas.height;
  cctx.clearRect(0,0,w,h);cctx.fillStyle="#fff";cctx.fillRect(0,0,w,h);
  const pad={l:52*dpr,r:18*dpr,t:20*dpr,b:34*dpr};
  const pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
  cctx.strokeStyle="#e5e8ec";cctx.lineWidth=1*dpr;cctx.font=`${11*dpr}px system-ui`;cctx.fillStyle="#7a838c";
  [0,45,90,135,180].forEach(v=>{const y=pad.t+ph-(v/180)*ph;cctx.beginPath();cctx.moveTo(pad.l,y);cctx.lineTo(w-pad.r,y);cctx.stroke();cctx.fillText(`${v}°`,10*dpr,y+4*dpr);});
  const target=Math.max(0,Math.min(180,Number(targetAngle.value)||180));const ty=pad.t+ph-(target/180)*ph;cctx.setLineDash([6*dpr,5*dpr]);cctx.strokeStyle="#9b82ff";cctx.beginPath();cctx.moveTo(pad.l,ty);cctx.lineTo(w-pad.r,ty);cctx.stroke();cctx.setLineDash([]);
  if(history.length<2)return;
  const maxT=Math.max(history[history.length-1].t,1);cctx.strokeStyle="#2457ff";cctx.lineWidth=2.5*dpr;cctx.beginPath();
  history.forEach((p,i)=>{const x=pad.l+(p.t/maxT)*pw;const y=pad.t+ph-(p.a/180)*ph;i?cctx.lineTo(x,y):cctx.moveTo(x,y);});cctx.stroke();
  cctx.fillStyle="#7a838c";cctx.fillText("Tiempo (s)",w/2-24*dpr,h-8*dpr);
}

function formatTime(sec){if(!Number.isFinite(sec))return"00:00.0";const m=Math.floor(sec/60);const s=(sec%60).toFixed(1).padStart(4,"0");return `${String(m).padStart(2,"0")}:${s}`;}

function drawExportFrame(landmarks,angle){
  // Export uses the skeleton canvas only in this implementation; recording starts from a dedicated composite canvas.
  const exportCanvas=getExportCanvas();
  const x=exportCanvas.getContext("2d");const W=1280,H=720;x.fillStyle="#080c15";x.fillRect(0,0,W,H);
  const half=W/2;
  try{x.drawImage(video,0,0,half,H);}catch{}
  x.drawImage(skeletonCanvas,half,0,half,H);
  x.fillStyle="rgba(0,0,0,.7)";x.fillRect(half+20,20,300,70);
  x.fillStyle="#fff";x.font="700 22px system-ui";x.fillText(selected.label,half+38,48);x.font="700 30px system-ui";x.fillStyle="#ffb86b";x.fillText(angle!=null?`${angle.toFixed(1)}°`:"Sin detección",half+38,80);
  x.fillStyle="#fff";x.font="600 15px system-ui";x.fillText("MoveAngle · análisis angular",24,H-24);
}
let exportCanvas=null;
function getExportCanvas(){if(exportCanvas)return exportCanvas;exportCanvas=document.createElement("canvas");exportCanvas.width=1280;exportCanvas.height=720;return exportCanvas;}

function startRecording(){
  const canvas=getExportCanvas();recordStream=canvas.captureStream(30);recordedChunks=[];
  const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(MediaRecorder.isTypeSupported)||"video/webm";
  recorder=new MediaRecorder(recordStream,{mimeType:mime,videoBitsPerSecond:5_000_000});
  recorder.ondataavailable=e=>{if(e.data.size)recordedChunks.push(e.data);};
  recorder.onstop=()=>{
    const blob=new Blob(recordedChunks,{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`MoveAngle_${new Date().toISOString().slice(0,19).replaceAll(":","-")}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);recordBtn.textContent="● Grabar video analizado";
  };
  recorder.start();recordBtn.textContent="■ Detener y descargar";
}
function stopRecording(){if(recorder?.state==="recording")recorder.stop();}

// Export rendering continues with the same analysis loop; if recording is active, the composite is refreshed every analysis frame.
