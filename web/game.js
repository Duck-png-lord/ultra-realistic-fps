import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x899487);
scene.fog = new THREE.Fog(0x899487, 48, 180);
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 260);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xdce9dc, 0x303a30, 1.7));
const sun = new THREE.DirectionalLight(0xffe6c6, 2.4);
sun.position.set(-32, 48, 25); sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536); sun.shadow.camera.left = -100; sun.shadow.camera.right = 100; sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
scene.add(sun);

const arena = new THREE.Group(); scene.add(arena);
const colliders = [];
const bots = [];
const botMeshes = [];
const projectiles = [];
const keys = new Set();
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
const player = { pos: new THREE.Vector3(0, 1.65, 0), health: 100, maxHealth: 100, yaw: 0, pitch: 0, speed: 8 };
const world = { half: 90 };
let seed = (Date.now() ^ Math.random() * 0xffffffff) >>> 0;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let active = false, paused = false, aiming = false, laserOn = false;
let weaponIndex = 0, lastShot = 0, flashReady = 0, grenadeReady = 0, toastTimer;
let mag = 30, reserve = 120, flashUntil = 0;

const weapons = [
  { name: 'RANGER', type: 'ASSAULT', damage: 15, rate: 125, mag: 30, reserve: 120, icon: '▰' },
  { name: 'BREACHER', type: 'SHOTGUN', damage: 15, rate: 650, mag: 8, reserve: 32, icon: '▤' },
  { name: 'VANGUARD', type: 'SMG', damage: 15, rate: 80, mag: 36, reserve: 180, icon: '▥' },
  { name: 'LONGSHOT', type: 'SNIPER', damage: 35, rate: 900, mag: 5, reserve: 30, icon: '⌖' },
  { name: 'FRAG', type: 'GRENADE', damage: 0, rate: 500, mag: 1, reserve: 10, icon: '◉' }
];
const dom = { menu: $('#menu'), pause: $('#pause'), hud: $('#hud'), status: $('#status'), objective: $('#objective'), health: $('#health'), meter: $('#meter'), weapon: $('#weapon'), weaponClass: $('#class'), ammo: $('#ammo'), hotbar: $('#hotbar'), toast: $('#toast'), scope: $('#scope'), flash: $('#flashOverlay'), flashCooldown: $('#flashCooldown'), grenadeCooldown: $('#grenadeCooldown'), laserState: $('#laserState') };

function texturedMaterial(base, fleck, repeat = 5, roughness = 0.88) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d'); ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = i % 3 ? fleck : 'rgba(255,255,255,.07)';
    const size = 1 + Math.random() * 4; ctx.fillRect(Math.random() * 256, Math.random() * 256, size, size);
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness, metalness: 0.08 });
}
const groundMat = texturedMaterial('#596553', '#68745e', 14, 0.98);
const concreteMat = texturedMaterial('#6b6b60', '#828173', 4, 0.91);
const brickMat = texturedMaterial('#66564a', '#806a57', 5, 0.9);
const metalMat = new THREE.MeshStandardMaterial({ color: 0x454e48, roughness: 0.43, metalness: 0.72 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x273c3a, roughness: 0.18, metalness: 0.35, emissive: 0x27483d, emissiveIntensity: 0.28 });

function addSolid(mesh, size) {
  mesh.castShadow = true; mesh.receiveShadow = true; arena.add(mesh);
  colliders.push({ x: mesh.position.x, z: mesh.position.z, hx: size[0] / 2, hz: size[2] / 2, mesh });
  return mesh;
}
function block(x, y, z, w, h, d, material = concreteMat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); return addSolid(mesh, [w, h, d]);
}
function detailBox(x, y, z, w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); mesh.position.set(x, y, z); mesh.castShadow = true; arena.add(mesh); return mesh;
}
function building(x, z, w, d, h) {
  block(x, h / 2, z, w, h, d, rand() > .5 ? concreteMat : brickMat);
  block(x, h + .18, z, w + .45, .36, d + .45, metalMat);
  const sides = Math.max(1, Math.floor(w / 4));
  for (let i = 0; i < sides; i++) {
    const wx = x - w / 2 + (i + .5) * w / sides;
    for (const face of [-1, 1]) detailBox(wx, h * .62, z + face * (d / 2 + .03), 1.05, 1.05, .06, glassMat);
  }
  for (const side of [-1, 1]) {
    detailBox(x + side * (w / 2 + .045), h * .62, z, .06, 1.05, 1.05, glassMat);
    detailBox(x + side * (w / 2 + .16), .72, z, .22, 1.42, 1.4, metalMat);
  }
  // Low sandbag/cover line beside each building makes approach routes playable.
  for (let i = 0; i < 3; i++) block(x + (i - 1) * 1.5, .48, z + d / 2 + 2.1, 1.35, .9, .8, brickMat);
}
function tower(x, z) {
  block(x, 5, z, 3.2, 10, 3.2, metalMat);
  block(x, 10.4, z, 6.2, .8, 6.2, concreteMat);
  block(x, 12.1, z, 5.2, 2.6, 5.2, metalMat);
  for (let side = -1; side <= 1; side += 2) detailBox(x + side * 2.63, 12.1, z, .08, 1.3, 1.3, glassMat);
  for (let y = .8; y < 9; y += 1.3) detailBox(x + 1.72, y, z, .35, .12, .65, metalMat);
}
function clearArena() {
  for (const child of [...arena.children]) { arena.remove(child); if (child.geometry) child.geometry.dispose(); }
  colliders.length = 0; bots.length = 0; botMeshes.length = 0;
  for (const p of projectiles) scene.remove(p.mesh); projectiles.length = 0;
}
function buildMap() {
  clearArena();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; arena.add(ground);
  // perimeter walls
  block(0, 3, -world.half, 180, 6, 2, concreteMat); block(0, 3, world.half, 180, 6, 2, concreteMat);
  block(-world.half, 3, 0, 2, 6, 180, concreteMat); block(world.half, 3, 0, 2, 6, 180, concreteMat);
  // Broad mix of buildings, towers, containers and waist-high cover.
  const sites = [[-38,-39,18,16,10],[4,-42,23,17,13],[43,-32,20,20,9],[-52,5,18,21,12],[39,12,22,18,11],[-25,48,20,16,9],[24,49,26,18,14],[57,53,16,16,8]];
  for (const s of sites) building(...s);
  tower(-66,-55); tower(64,-58); tower(-69,61); tower(68,62);
  for (let i = 0; i < 36; i++) {
    const x = (rand() - .5) * 145, z = (rand() - .5) * 145;
    if (Math.hypot(x, z) < 14 || colliders.some(c => Math.abs(x-c.x) < c.hx+3 && Math.abs(z-c.z) < c.hz+3)) continue;
    const w = 2.2 + rand() * 3.5, d = 2 + rand() * 3, h = .9 + rand() * 1.3;
    block(x, h/2, z, w, h, d, rand() > .5 ? brickMat : concreteMat);
  }
  player.pos.set(0, 1.65, 0); player.yaw = 0; player.pitch = 0;
  for (let i = 0; i < 13; i++) {
    let x, z, tries = 0;
    do { x = (rand()-.5)*140; z = (rand()-.5)*140; tries++; } while ((Math.hypot(x,z)<25 || blocked(x,z,.8)) && tries < 150);
    makeBot(x, z);
  }
  updateObjective();
}
function blocked(x, z, radius = .5) {
  return colliders.some(c => Math.abs(x-c.x) < c.hx + radius && Math.abs(z-c.z) < c.hz + radius);
}

const botCloth = [0x374b40,0x4c4940,0x3c4650,0x554b3c].map(color => new THREE.MeshStandardMaterial({ color, roughness: .88, metalness: .04 }));
function makeBot(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const skin = new THREE.MeshStandardMaterial({ color: 0x9a8065, roughness: .82 });
  const cloth = botCloth[Math.floor(rand()*botCloth.length)];
  const armor = new THREE.MeshStandardMaterial({ color: 0x29332e, roughness: .62, metalness: .25 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xa2d7bd, emissive: 0x427b62, emissiveIntensity: .35, metalness: .3, roughness: .28 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.42,.8,4,8), cloth); torso.position.y=1.28; torso.castShadow=true; g.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(.78,.68,.48), armor); vest.position.set(0,1.35,.04); vest.castShadow=true; g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.28,12,10), skin); head.position.y=2.12; head.castShadow=true; g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.31,12,8,0,Math.PI*2,0,Math.PI*.58), armor); helmet.position.y=2.19; helmet.castShadow=true; g.add(helmet);
  const faceplate = new THREE.Mesh(new THREE.BoxGeometry(.4,.13,.08), visor); faceplate.position.set(0,2.1,.26); g.add(faceplate);
  for (const side of [-1,1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.13,.5,3,6), cloth); arm.position.set(side*.55,1.35,.02); arm.rotation.z=side*-.12; arm.castShadow=true; g.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.17,.58,3,6), armor); leg.position.set(side*.2,.48,0); leg.castShadow=true; g.add(leg);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(.3,.55,.3), new THREE.MeshBasicMaterial({visible:false})); hit.position.set(side*.2,.48,0); hit.userData.bot=g; g.add(hit); botMeshes.push(hit);
  }
  const hitTorso = new THREE.Mesh(new THREE.BoxGeometry(1.05,1.12,.8), new THREE.MeshBasicMaterial({visible:false})); hitTorso.position.y=1.38; hitTorso.userData.bot=g; g.add(hitTorso); botMeshes.push(hitTorso);
  const hitHead = new THREE.Mesh(new THREE.SphereGeometry(.32,8,6), new THREE.MeshBasicMaterial({visible:false})); hitHead.position.y=2.12; hitHead.userData.bot=g; g.add(hitHead); botMeshes.push(hitHead);
  g.userData = { hp: 25 + Math.floor(rand()*26), alive: true, speed: 1.2 + rand()*1.1, cooldown: .7 + rand()*1.5, blindUntil: 0, anim: rand()*6 };
  scene.add(g); bots.push(g);
}

// A camera-attached weapon model remains visible while aiming and follows the view.
const weaponView = new THREE.Group(); camera.add(weaponView); scene.add(camera);
const gunMat = new THREE.MeshStandardMaterial({ color: 0x252d29, roughness: .32, metalness: .82 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x494237, roughness: .85 });
function gunPart(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow=true; weaponView.add(m); return m; }
gunPart(new THREE.BoxGeometry(.18,.18,.56),gunMat,.32,-.28,-.62);
gunPart(new THREE.BoxGeometry(.11,.12,.43),gunMat,.32,-.24,-1.02);
gunPart(new THREE.BoxGeometry(.13,.25,.16),gripMat,.32,-.45,-.5);
gunPart(new THREE.BoxGeometry(.23,.05,.22),gunMat,.32,-.16,-.65);
const scopeBody = gunPart(new THREE.CylinderGeometry(.075,.075,.34,12),metalMat,.32,-.1,-.72); scopeBody.rotation.x=Math.PI/2;
const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.32,-.23,-.88),new THREE.Vector3(.32,-.23,-30)]),new THREE.LineBasicMaterial({color:0xff3434})); weaponView.add(laser);

function updateHUD() {
  const w=weapons[weaponIndex]; $('#weapon').textContent=w.name; $('#class').textContent=`${w.type} // ${String(weaponIndex+1).padStart(2,'0')}`;
  $('#ammo').textContent=`${mag} / ${reserve}`;
  dom.health.textContent=String(Math.ceil(player.health)); dom.meter.style.width=`${player.health}%`;
  [...dom.hotbar.children].forEach((el,i)=>el.classList.toggle('active',i===weaponIndex));
  dom.laserState.textContent=laserOn?'ON':'OFF';
}
function buildHotbar() {
  dom.hotbar.innerHTML='';
  weapons.forEach((w,i)=>{const slot=document.createElement('div');slot.className='slot';slot.innerHTML=`<small>${i+1}</small>${w.icon}`;dom.hotbar.append(slot);});
  updateHUD();
}
function updateObjective(){dom.objective.textContent=`HOSTILES: ${bots.filter(b=>b.userData.alive).length}`;}
function toast(msg){dom.toast.textContent=msg;dom.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>dom.toast.classList.remove('show'),1000);}
function chooseWeapon(i){if(i<0||i>=weapons.length)return;weaponIndex=i;mag=weapons[i].mag;reserve=weapons[i].reserve;aiming=false;dom.scope.classList.add('hidden');camera.fov=76;camera.updateProjectionMatrix();updateHUD();}
function startGame(){active=true;paused=false;dom.menu.classList.add('hidden');dom.pause.classList.add('hidden');dom.hud.classList.remove('hidden');canvas.requestPointerLock?.();}
function pauseGame(){if(!active)return;paused=true;dom.pause.classList.remove('hidden');document.exitPointerLock?.();}
$('#deploy').onclick=()=>{startGame();};$('#resume').onclick=()=>{paused=false;dom.pause.classList.add('hidden');canvas.requestPointerLock?.();};$('#newMap').onclick=()=>{buildMap();startGame();};
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&active&&!paused)pauseGame();});

function targetRay() {
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  raycaster.far=180;
  const hits=raycaster.intersectObjects([...colliders.map(c=>c.mesh),...botMeshes],false);
  return hits[0]||null;
}
function fire() {
  if(!active||paused||performance.now()-lastShot<weapons[weaponIndex].rate)return;
  if(mag<=0){reload();return;}
  lastShot=performance.now();mag--;updateHUD();
  const hit=targetRay();
  if(hit?.object.userData.bot){const bot=hit.object.userData.bot;if(bot.userData.alive){bot.userData.hp-=weapons[weaponIndex].damage;if(bot.userData.hp<=0){bot.userData.alive=false;bot.visible=false;toast('HOSTILE DOWN');updateObjective();}}}
  // Short muzzle flash is attached to the weapon, so the bullet direction always matches the center reticle.
  const flash=new THREE.PointLight(0xffc071,3,4);flash.position.set(.32,-.25,-1.05);weaponView.add(flash);setTimeout(()=>weaponView.remove(flash),55);
}
function reload(){const w=weapons[weaponIndex];if(mag>=w.mag||reserve<=0)return;const n=Math.min(w.mag-mag,reserve);mag+=n;reserve-=n;updateHUD();toast('RELOADED');}
function throwItem(type) {
  const now=performance.now();
  if(type==='flash'&&now<flashReady){toast('FLASHBANG RECHARGING');return;}
  if(type==='grenade'&&now<grenadeReady){toast('GRENADE RECHARGING');return;}
  if(type==='flash')flashReady=now+1600;else grenadeReady=now+1600;
  const dir=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(type==='flash'?.12:.2,10,8),new THREE.MeshStandardMaterial({color:type==='flash'?0xe6e5c8:0x3e5946,metalness:.55,roughness:.4}));
  mesh.position.copy(camera.position).add(dir.clone().multiplyScalar(.8));scene.add(mesh);
  projectiles.push({mesh,dir:dir.multiplyScalar(15).add(new THREE.Vector3(0,4,0)),time:1.55,type});toast(type==='flash'?'FLASH OUT':'FRAG OUT');
}
function detonate(p) {
  if(p.type==='flash'){
    const light=new THREE.PointLight(0xffffff,35,40);light.position.copy(p.mesh.position);scene.add(light);setTimeout(()=>scene.remove(light),160);
    for(const bot of bots)if(bot.userData.alive&&bot.position.distanceTo(p.mesh.position)<28)bot.userData.blindUntil=performance.now()+3500;
    if(player.pos.distanceTo(p.mesh.position)<12){dom.flash.classList.add('flash');setTimeout(()=>dom.flash.classList.remove('flash'),320);}
  } else {
    const boom=new THREE.Mesh(new THREE.SphereGeometry(3,12,10),new THREE.MeshBasicMaterial({color:0xff9c4a,transparent:true,opacity:.65}));boom.position.copy(p.mesh.position);scene.add(boom);setTimeout(()=>scene.remove(boom),180);
    for(const bot of bots)if(bot.userData.alive){const d=bot.position.distanceTo(p.mesh.position);if(d<9){bot.userData.hp-=Math.ceil(45*(1-d/12));if(bot.userData.hp<=0){bot.userData.alive=false;bot.visible=false;}}}
    updateObjective();
  }
}
function updateProjectiles(dt){for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.time-=dt;p.dir.y-=9.8*dt;p.mesh.position.addScaledVector(p.dir,dt);if(p.mesh.position.y<.18||blocked(p.mesh.position.x,p.mesh.position.z,.2))p.time=Math.min(p.time,0);if(p.time<=0){detonate(p);scene.remove(p.mesh);projectiles.splice(i,1);}}}
function hurt(amount){player.health=Math.max(0,player.health-amount);updateHUD();if(player.health===0){player.health=100;toast('REDEPLOYED');updateHUD();}}
function updateBots(dt){for(const bot of bots){const u=bot.userData;if(!u.alive)continue;u.anim+=dt*7;u.cooldown-=dt;const delta=player.pos.clone().sub(bot.position);const distance=delta.length();if(distance>5&&distance<38&&performance.now()>u.blindUntil){delta.y=0;delta.normalize();const nx=bot.position.x+delta.x*u.speed*dt,nz=bot.position.z+delta.z*u.speed*dt;if(!blocked(nx,nz,.55)){bot.position.x=nx;bot.position.z=nz;}bot.rotation.y=Math.atan2(delta.x,delta.z);for(let i=0;i<bot.children.length;i++){const c=bot.children[i];if(c.geometry?.type==='CapsuleGeometry'&&c.position.y<.8)c.rotation.x=Math.sin(u.anim+i)*.15;}}if(distance<24&&u.cooldown<=0&&performance.now()>u.blindUntil){u.cooldown=1.35+rand()*.65;const from=bot.position.clone().add(new THREE.Vector3(0,1.4,0));const to=player.pos.clone().sub(from).normalize();raycaster.set(from,to);raycaster.far=distance;const wall=raycaster.intersectObjects(colliders.map(c=>c.mesh),false)[0];if(!wall)hurt(15);}}}
function movePlayer(dt){const forward=new THREE.Vector3(Math.sin(player.yaw),0,-Math.cos(player.yaw));const right=new THREE.Vector3(Math.cos(player.yaw),0,Math.sin(player.yaw));const v=new THREE.Vector3();if(keys.has('KeyW'))v.add(forward);if(keys.has('KeyS'))v.sub(forward);if(keys.has('KeyD'))v.add(right);if(keys.has('KeyA'))v.sub(right);if(!v.lengthSq())return;v.normalize().multiplyScalar((keys.has('ShiftLeft')||keys.has('ShiftRight')?12:player.speed)*dt);const nx=THREE.MathUtils.clamp(player.pos.x+v.x,-world.half+2,world.half-2);if(!blocked(nx,player.pos.z,.55))player.pos.x=nx;const nz=THREE.MathUtils.clamp(player.pos.z+v.z,-world.half+2,world.half-2);if(!blocked(player.pos.x,nz,.55))player.pos.z=nz;}
function updateAim(){const sniper=weaponIndex===3;if(sniper&&aiming){camera.fov=31;dom.scope.classList.remove('hidden');}else{camera.fov=76;dom.scope.classList.add('hidden');}camera.updateProjectionMatrix();}
function tick(){requestAnimationFrame(tick);const dt=Math.min(clock.getDelta(),.04);if(active&&!paused){movePlayer(dt);camera.position.copy(player.pos);camera.rotation.y=player.yaw;camera.rotation.x=player.pitch;updateBots(dt);updateProjectiles(dt);if(laserOn){laser.visible=true;}else laser.visible=false;const now=performance.now();dom.flashCooldown.textContent=now>=flashReady?'READY':`${((flashReady-now)/1000).toFixed(1)}s`;dom.grenadeCooldown.textContent=now>=grenadeReady?'READY':`${((grenadeReady-now)/1000).toFixed(1)}s`;updateAim();}renderer.render(scene,camera);}

document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas||paused)return;player.yaw-=e.movementX*.0022;player.pitch=THREE.MathUtils.clamp(player.pitch-e.movementY*.0018,-1.4,1.4);});
document.addEventListener('mousedown',e=>{if(!active||paused)return;if(document.pointerLockElement!==canvas){canvas.requestPointerLock?.();return;}if(e.button===0)fire();if(e.button===2&&weaponIndex===3){aiming=!aiming;updateAim();}});
document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Escape'&&active){pauseGame();return;}if(e.code==='KeyR')reload();if(e.code==='KeyF')throwItem('flash');if(e.code==='KeyG')throwItem('grenade');if(e.code==='KeyL'){laserOn=!laserOn;updateHUD();}if(e.code.startsWith('Digit'))chooseWeapon(Number(e.code.slice(5))-1);});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

buildMap();buildHotbar();camera.position.copy(player.pos);tick();
