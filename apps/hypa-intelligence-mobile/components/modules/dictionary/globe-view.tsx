import { useColorScheme, View, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'

function getGlobeHTML(isDark: boolean, size: number) {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}
#container{width:100%;height:100%;position:relative}
canvas{display:block;touch-action:none}
#tooltip{
  position:absolute;pointer-events:none;opacity:0;transition:opacity 0.15s;
  padding:8px 12px;border-radius:8px;white-space:nowrap;z-index:10;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  box-shadow:0 4px 16px rgba(0,0,0,${isDark ? '0.5' : '0.15'});
  border:1px solid ${isDark ? '#555' : '#ccc'};
  background:${isDark ? '#1a1a1a' : '#fff'};
}
#tooltip .name{font-size:12px;font-weight:600;color:${isDark ? '#e5e5e5' : '#222'}}
#tooltip .lang{font-size:10px;color:${isDark ? '#999' : '#666'};margin-top:2px}
</style>
</head><body>
<div id="container"><div id="tooltip"><div class="name"></div><div class="lang"></div></div></div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js"}}</script>
<script type="module">
import * as THREE from 'three';

const COLORS = ${
    isDark
      ? `{
  markerActive:'#aaaaaa',markerInactive:'#666666',glowRing:'#888888',
  atmosphere:'#666666',gridLine:'rgba(150,150,150,0.25)',
  land:{r:80,g:80,b:80},water:{r:40,g:40,b:40}
}`
      : `{
  markerActive:'#777777',markerInactive:'#aaaaaa',glowRing:'#999999',
  atmosphere:'#cccccc',gridLine:'rgba(180,180,180,0.25)',
  land:{r:130,g:130,b:130},water:{r:255,g:255,b:255}
}`
  };

const MARKERS = [
  {name:'Nigeria',language:'Yoruba, Igbo, Hausa',lat:9.06,lng:7.49},
  {name:'Kenya',language:'Swahili, Kikuyu',lat:-1.29,lng:36.82},
  {name:'South Africa',language:'Zulu, Xhosa, Afrikaans',lat:-33.92,lng:18.42},
  {name:'Egypt',language:'Arabic',lat:30.04,lng:31.24},
  {name:'Morocco',language:'Arabic, Tamazight',lat:33.97,lng:-6.85},
  {name:'Ethiopia',language:'Amharic, Oromo',lat:9.02,lng:38.75},
  {name:'Tanzania',language:'Swahili',lat:-6.37,lng:34.89},
  {name:'DR Congo',language:'French, Lingala, Swahili',lat:-4.44,lng:15.27},
  {name:'Ghana',language:'English, Twi, Ga',lat:7.95,lng:-1.02},
  {name:'Senegal',language:'French, Wolof',lat:14.5,lng:-14.45},
  {name:'Cameroon',language:'French, English, Fulfulde',lat:5.95,lng:10.15},
  {name:'Madagascar',language:'Malagasy, French',lat:-18.77,lng:46.87},
  {name:'Angola',language:'Portuguese, Umbundu',lat:-8.84,lng:13.23},
  {name:'Mozambique',language:'Portuguese, Makhuwa',lat:-15.6,lng:35.53},
  {name:'Uganda',language:'English, Luganda, Swahili',lat:0.35,lng:32.6},
  {name:'Algeria',language:'Arabic, Tamazight, French',lat:28.03,lng:1.66},
  {name:'Sudan',language:'Arabic, Nubian',lat:15.5,lng:32.56},
  {name:'Mali',language:'French, Bambara',lat:12.64,lng:-8.0},
  {name:'Niger',language:'French, Hausa, Zarma',lat:13.51,lng:2.11},
  {name:'Ivory Coast',language:'French, Dioula, Baoulé',lat:6.83,lng:-5.55},
  {name:'Zimbabwe',language:'Shona, Ndebele, English',lat:-19.02,lng:29.15},
  {name:'Rwanda',language:'Kinyarwanda, French, English',lat:-1.94,lng:29.87},
  {name:'Tunisia',language:'Arabic, French',lat:33.89,lng:9.54},
  {name:'Libya',language:'Arabic, Tamazight',lat:26.34,lng:17.23},
  {name:'Somalia',language:'Somali, Arabic',lat:5.15,lng:46.2},
  {name:'France',language:'French',lat:46.6,lng:2.21},
  {name:'Germany',language:'German',lat:51.17,lng:10.45},
  {name:'United Kingdom',language:'English, Welsh',lat:51.51,lng:-0.13},
  {name:'Wales',language:'Welsh (Cymraeg)',lat:52.13,lng:-3.78},
  {name:'Spain',language:'Spanish, Catalan, Basque',lat:40.46,lng:-3.75},
  {name:'Italy',language:'Italian',lat:41.87,lng:12.57},
  {name:'Portugal',language:'Portuguese',lat:38.72,lng:-9.14},
  {name:'Poland',language:'Polish',lat:51.92,lng:19.15},
  {name:'Netherlands',language:'Dutch, Frisian',lat:52.13,lng:5.29},
  {name:'Greece',language:'Greek',lat:39.07,lng:21.82},
  {name:'Sweden',language:'Swedish, Sami',lat:60.13,lng:18.64},
  {name:'Norway',language:'Norwegian, Sami',lat:60.47,lng:8.47},
  {name:'Finland',language:'Finnish, Swedish, Sami',lat:61.92,lng:25.75},
  {name:'Denmark',language:'Danish',lat:56.26,lng:9.5},
  {name:'Ireland',language:'English, Irish (Gaeilge)',lat:53.14,lng:-7.69},
  {name:'Romania',language:'Romanian',lat:45.94,lng:24.97},
  {name:'Czech Republic',language:'Czech',lat:49.82,lng:15.47},
  {name:'Hungary',language:'Hungarian',lat:47.16,lng:19.5},
  {name:'Ukraine',language:'Ukrainian',lat:48.38,lng:31.17},
  {name:'Switzerland',language:'German, French, Italian, Romansh',lat:46.82,lng:8.23},
  {name:'Austria',language:'German',lat:47.52,lng:14.55},
  {name:'Serbia',language:'Serbian',lat:44.02,lng:21.01},
  {name:'Croatia',language:'Croatian',lat:45.1,lng:15.2},
  {name:'Iceland',language:'Icelandic',lat:64.96,lng:-19.02},
  {name:'Japan',language:'Japanese',lat:35.68,lng:139.69},
  {name:'China',language:'Mandarin, Cantonese',lat:39.9,lng:116.4},
  {name:'India',language:'Hindi, Tamil, Bengali',lat:20.59,lng:78.96},
  {name:'Russia',language:'Russian',lat:55.76,lng:37.62},
  {name:'Indonesia',language:'Bahasa Indonesia, Javanese',lat:-6.2,lng:106.85},
  {name:'Thailand',language:'Thai',lat:15.87,lng:100.99},
  {name:'Turkey',language:'Turkish, Kurdish',lat:38.96,lng:35.24},
  {name:'Iran',language:'Persian (Farsi)',lat:32.43,lng:53.69},
  {name:'South Korea',language:'Korean',lat:35.91,lng:127.77},
  {name:'Vietnam',language:'Vietnamese',lat:14.06,lng:108.28},
  {name:'Philippines',language:'Filipino, Cebuano, Ilocano',lat:12.88,lng:121.77},
  {name:'Malaysia',language:'Malay, Tamil, Mandarin',lat:4.21,lng:101.98},
  {name:'Myanmar',language:'Burmese, Shan, Karen',lat:19.76,lng:96.08},
  {name:'Bangladesh',language:'Bengali',lat:23.68,lng:90.36},
  {name:'Pakistan',language:'Urdu, Punjabi, Sindhi',lat:30.38,lng:69.35},
  {name:'Afghanistan',language:'Pashto, Dari',lat:33.94,lng:67.71},
  {name:'Nepal',language:'Nepali, Maithili',lat:28.39,lng:84.12},
  {name:'Sri Lanka',language:'Sinhala, Tamil',lat:7.87,lng:80.77},
  {name:'Cambodia',language:'Khmer',lat:12.57,lng:104.99},
  {name:'Mongolia',language:'Mongolian',lat:46.86,lng:103.85},
  {name:'Kazakhstan',language:'Kazakh, Russian',lat:48.02,lng:66.92},
  {name:'Uzbekistan',language:'Uzbek',lat:41.38,lng:64.59},
  {name:'Saudi Arabia',language:'Arabic',lat:23.89,lng:45.08},
  {name:'Iraq',language:'Arabic, Kurdish',lat:33.22,lng:43.68},
  {name:'Israel',language:'Hebrew, Arabic',lat:31.05,lng:34.85},
  {name:'Georgia',language:'Georgian',lat:42.32,lng:43.36},
  {name:'Armenia',language:'Armenian',lat:40.07,lng:45.04},
  {name:'Papua New Guinea',language:'Tok Pisin, 800+ langs',lat:-6.31,lng:143.96},
  {name:'Siberia (Russia)',language:'Yakut, Evenki, Buryat',lat:62.03,lng:129.73},
  {name:'Tibet (China)',language:'Tibetan',lat:29.65,lng:91.11},
  {name:'United States',language:'English, Spanish, Navajo',lat:38.91,lng:-77.04},
  {name:'Canada',language:'English, French, Cree',lat:56.13,lng:-106.35},
  {name:'Mexico',language:'Spanish, Nahuatl',lat:19.43,lng:-99.13},
  {name:'Brazil',language:'Portuguese',lat:-14.24,lng:-51.93},
  {name:'Peru',language:'Spanish, Quechua',lat:-12.05,lng:-77.04},
  {name:'Colombia',language:'Spanish',lat:4.57,lng:-74.3},
  {name:'Argentina',language:'Spanish',lat:-38.42,lng:-63.62},
  {name:'Chile',language:'Spanish, Mapudungun',lat:-35.68,lng:-71.54},
  {name:'Venezuela',language:'Spanish',lat:6.42,lng:-66.59},
  {name:'Cuba',language:'Spanish',lat:21.52,lng:-77.78},
  {name:'Guatemala',language:"Spanish, K'iche', Kaqchikel",lat:14.63,lng:-90.51},
  {name:'Bolivia',language:'Spanish, Quechua, Aymara',lat:-16.29,lng:-63.59},
  {name:'Ecuador',language:'Spanish, Kichwa',lat:-1.83,lng:-78.18},
  {name:'Haiti',language:'Haitian Creole, French',lat:18.97,lng:-72.29},
  {name:'Jamaica',language:'English, Jamaican Patois',lat:18.11,lng:-77.3},
  {name:'Paraguay',language:'Spanish, Guaraní',lat:-23.44,lng:-58.44},
  {name:'Alaska (US)',language:'English, Yupik, Inupiaq',lat:63.35,lng:-152.0},
  {name:'Greenland',language:'Greenlandic (Kalaallisut)',lat:71.71,lng:-42.6},
  {name:'Hawaii (US)',language:'English, Hawaiian',lat:19.9,lng:-155.58},
  {name:'Australia',language:'English, Aboriginal langs',lat:-25.27,lng:133.78},
  {name:'New Zealand',language:'English, Māori',lat:-40.9,lng:174.89},
  {name:'Fiji',language:'Fijian, Hindi, English',lat:-17.71,lng:178.07},
  {name:'Samoa',language:'Samoan, English',lat:-13.76,lng:-172.1},
  {name:'Tonga',language:'Tongan, English',lat:-21.18,lng:-175.2},
]
;

function latLngToVec3(lat,lng,r){
  const phi=(90-lat)*(Math.PI/180), theta=(lng+180)*(Math.PI/180);
  return new THREE.Vector3(-(r*Math.sin(phi)*Math.cos(theta)),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta));
}

const container = document.getElementById('container');
const tooltip = document.getElementById('tooltip');
const tooltipName = tooltip.querySelector('.name');
const tooltipLang = tooltip.querySelector('.lang');

const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(container.clientWidth,container.clientHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45,1,0.1,100);
camera.position.z = 4.2;

scene.add(new THREE.AmbientLight(0xffffff,0.9));
const dl1 = new THREE.DirectionalLight(0xffffff,0.5); dl1.position.set(5,3,5); scene.add(dl1);
const dl2 = new THREE.DirectionalLight(0xffffff,0.15); dl2.position.set(-3,-1,-4); scene.add(dl2);

const RADIUS = 1.6;
const AFRICA_Y = -1.92;
const globeGroup = new THREE.Group();
globeGroup.rotation.y = AFRICA_Y;
scene.add(globeGroup);

const img = new Image();
img.crossOrigin = 'anonymous';
img.src = 'https://unpkg.com/three-globe@2.34.2/example/img/earth-water.png';
img.onload = () => {
  const c2 = document.createElement('canvas');
  c2.width = img.width; c2.height = img.height;
  const ctx = c2.getContext('2d');
  ctx.drawImage(img,0,0);
  const id = ctx.getImageData(0,0,c2.width,c2.height);
  const d = id.data;
  for(let i=0;i<d.length;i+=4){
    if(d[i]>127){d[i]=COLORS.land.r;d[i+1]=COLORS.land.g;d[i+2]=COLORS.land.b}
    else{d[i]=COLORS.water.r;d[i+1]=COLORS.water.g;d[i+2]=COLORS.water.b}
  }
  ctx.putImageData(id,0,0);
  ctx.strokeStyle=COLORS.gridLine; ctx.lineWidth=0.5;
  for(let i=1;i<12;i++){const y=(i/12)*c2.height;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c2.width,y);ctx.stroke()}
  for(let i=1;i<24;i++){const x=(i/24)*c2.width;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c2.height);ctx.stroke()}
  const tex = new THREE.CanvasTexture(c2);
  tex.colorSpace = THREE.SRGBColorSpace;
  globeMesh.material.map = tex;
  globeMesh.material.needsUpdate = true;
};
img.onerror = () => {
  const c2 = document.createElement('canvas');
  c2.width=2048;c2.height=1024;
  const ctx=c2.getContext('2d');
  ctx.fillStyle='${isDark ? '#2a2c35' : '#e8eaf0'}';
  ctx.fillRect(0,0,c2.width,c2.height);
  ctx.strokeStyle=COLORS.gridLine;ctx.lineWidth=1.5;
  for(let i=1;i<12;i++){const y=(i/12)*c2.height;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c2.width,y);ctx.stroke()}
  for(let i=1;i<24;i++){const x=(i/24)*c2.width;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c2.height);ctx.stroke()}
  const tex=new THREE.CanvasTexture(c2);tex.colorSpace=THREE.SRGBColorSpace;
  globeMesh.material.map=tex;globeMesh.material.needsUpdate=true;
};

const globeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS,64,64),
  new THREE.MeshBasicMaterial()
);
globeGroup.add(globeMesh);

const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS*1.02,64,64),
  new THREE.MeshBasicMaterial({color:new THREE.Color(COLORS.atmosphere),transparent:true,opacity:${isDark ? 0.06 : 0.035},side:THREE.BackSide})
);
globeGroup.add(atmo);

const markerMeshes = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
raycaster.params.Points = {threshold:0.1};

MARKERS.forEach(m => {
  const pos = latLngToVec3(m.lat,m.lng,RADIUS+0.015);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.025,16,16),
    new THREE.MeshBasicMaterial({color:new THREE.Color(COLORS.markerInactive),transparent:true,opacity:0.45})
  );
  dot.position.copy(pos);
  dot.userData = m;
  globeGroup.add(dot);
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.12,16,16),
    new THREE.MeshBasicMaterial({transparent:true,opacity:0})
  );
  hit.position.copy(pos);
  hit.userData = m;
  globeGroup.add(hit);
  markerMeshes.push({dot,hit,data:m});
});

let isDragging = false, autoRotate = true, resumeTimer = null;
let dragStartX = 0, dragStartY = 0, rotStartX = 0, rotStartY = 0;
let dragMoved = false;

const canvas = renderer.domElement;

canvas.addEventListener('pointerdown', e => {
  isDragging = true; dragMoved = false;
  autoRotate = false;
  if(resumeTimer) clearTimeout(resumeTimer);
  dragStartX = e.clientX; dragStartY = e.clientY;
  rotStartX = globeGroup.rotation.x; rotStartY = globeGroup.rotation.y;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', e => {
  if(!isDragging) return;
  const dx = (e.clientX - dragStartX)*0.005;
  const dy = (e.clientY - dragStartY)*0.005;
  if(Math.abs(dx)>0.002||Math.abs(dy)>0.002) dragMoved = true;
  globeGroup.rotation.y = rotStartY + dx;
  globeGroup.rotation.x = Math.max(-Math.PI/3, Math.min(Math.PI/3, rotStartX + dy));
});

canvas.addEventListener('pointerup', e => {
  isDragging = false;
  canvas.releasePointerCapture(e.pointerId);
  resumeTimer = setTimeout(()=>{autoRotate=true},2500);

  if(!dragMoved){
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX-rect.left)/rect.width)*2-1;
    pointer.y = -((e.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(pointer,camera);
    const hits = raycaster.intersectObjects(markerMeshes.map(m=>m.hit));
    if(hits.length>0){
      const m = hits[0].object.userData;
      showTooltip(m, e.clientX, e.clientY);
    } else {
      hideTooltip();
    }
  }
});

let activeMarker = null, tooltipTimer = null;
function showTooltip(m, cx, cy){
  if(activeMarker) resetMarkerColor(activeMarker);
  activeMarker = m;
  highlightMarker(m);
  tooltipName.textContent = m.name;
  tooltipLang.textContent = m.language;
  const rect = container.getBoundingClientRect();
  let tx = cx - rect.left;
  let ty = cy - rect.top - 50;
  const tw = tooltip.offsetWidth||120;
  if(tx-tw/2<4) tx=tw/2+4;
  if(tx+tw/2>rect.width-4) tx=rect.width-tw/2-4;
  if(ty<4) ty=cy-rect.top+20;
  tooltip.style.left=tx+'px'; tooltip.style.top=ty+'px';
  tooltip.style.transform='translate(-50%,0)';
  tooltip.style.opacity='1';
  if(tooltipTimer) clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(()=>{hideTooltip()},2000);
}
function hideTooltip(){
  tooltip.style.opacity='0';
  if(activeMarker){resetMarkerColor(activeMarker);activeMarker=null}
}
function highlightMarker(m){
  const entry=markerMeshes.find(e=>e.data===m);
  if(entry){entry.dot.material.color.set(COLORS.markerActive);entry.dot.material.opacity=0.7;entry.dot.scale.setScalar(1.3)}
}
function resetMarkerColor(m){
  const entry=markerMeshes.find(e=>e.data===m);
  if(entry){entry.dot.material.color.set(COLORS.markerInactive);entry.dot.material.opacity=0.45;entry.dot.scale.setScalar(1)}
}

const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const delta = clock.getDelta();

  if(autoRotate && !isDragging){
    globeGroup.rotation.y += 0.0025;
  }

  markerMeshes.forEach(({dot,data})=>{
    if(activeMarker===data) return;
    const s = 1 + Math.sin(t*2)*0.15;
    dot.scale.setScalar(s);
  });

  renderer.render(scene,camera);
}
animate();

function onResize(){
  const w=container.clientWidth, h=container.clientHeight;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
window.addEventListener('resize',onResize);
</script></body></html>`
}

export function GlobeView({ size = 280 }: { size?: number }) {
  const scheme = useColorScheme()

  return (
    <View style={[s.container, { width: size, height: size }]}> 
      <WebView
        source={{ html: getGlobeHTML(scheme === 'dark', size) }}
        style={s.webview}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        androidLayerType="hardware"
        allowsInlineMediaPlayback
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: 'transparent' },
  webview: { flex: 1, backgroundColor: 'transparent' },
})