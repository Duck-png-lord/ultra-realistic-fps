import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x899487);
scene.fog = new THREE.Fog(0x899487, 48, 180);
const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 260);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xdce9dc, 0x303a30, 1.7));
const sun = new THREE.DirectionalLight(0xffe6c6, 2.4);
sun.position.set(-32, 48, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
scene.add(sun);

const arena = new THREE.Group();
scene.add(arena);
const colliders = [];
const bots = [];
const botMeshes = [];
const projectiles = [];
const keys = new Set();
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();
const player = { pos: new THREE.Vector3(0, 1.65, 0), health: 100, maxHealth: 100, yaw: 0, pitch: 0, speed: 8 };
const world = { half: 90 };
let seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let active = false;
let paused = false;
let aiming = false;
let laserOn = false;
let weaponIndex = 0;
let lastShot = 0;
let flashReady = 0;
let grenadeReady = 0;
let toastTimer;
let mag = 30;
let reserve = 120;

const weapons = [
  { name: 'RANGER', type: 'ASSAULT', damage: 15, rate: 125, mag: 30, reserve: 120, icon: '▰' },
  { name: 'BREACHER', type: 'SHOTGUN', damage: 15, rate: 650, mag: 8, reserve: 32, icon: '▤' },
  { name: 'VANGUARD', type: 'SMG', damage: 15, rate: 80, mag: 36, reserve: 180, icon: '▥' },
  { name: 'LONGSHOT', type: 'SNIPER', damage: 35, rate: 900, mag: 5, reserve: 30, icon: '⌖' },
  { name: 'FRAG', type: 'GRENADE', damage: 0, rate: 500, mag: 1, reserve: 10, icon: '◉' }
];
const dom = {
  menu: $('#menu'), pause: $('#pause'), hud: $('#hud'), status: $('#status'), objective: $('#objective'),
  health: $('#health'), meter: $('#meter'), weapon: $('#weapon'), weaponClass: $('#class'), ammo: $('#ammo'),
  hotbar: $('#hotbar'), toast: $('#toast'), scope: $('#scope'), flash: $('#flashOverlay'),
  flashCooldown: $('#flashCooldown'), grenadeCooldown: $('#grenadeCooldown'), laserState: $('#laserState')
};

function texturedMaterial(base, fleck, repeat = 5, roughness = 0.88) {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = textureCanvas.height = 256;
  const context = textureCanvas.getContext('2d');
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    context.fillStyle = i % 3 ? fleck : 'rgba(255,255,255,.07)';
    const size = 1 + Math.random() * 4;
    context.fillRect(Math.random() * 256, Math.random() * 256, size, size);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, roughness, metalness: 0.08 });
}
const groundMat = texturedMaterial('#596553', '#68745e', 14, 0.98);
const concreteMat = texturedMaterial('#6b6b60', '#828173', 4, 0.91);
const brickMat = texturedMaterial('#66564a', '#806a57', 5, 0.9);
const metalMat = new THREE.MeshStandardMaterial({ color: 0x454e48, roughness: 0.43, metalness: 0.72 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x273c3a, roughness: 0.18, metalness: 0.35, emissive: 0x27483d, emissiveIntensity: 0.28 });

function addSolid(mesh, size) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  arena.add(mesh);
  colliders.push({ x: mesh.position.x, z: mesh.position.z, hx: size[0] / 2, hz: size[2] / 2, mesh });
  return mesh;
}
function block(x, y, z, width, height, depth, material = concreteMat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return addSolid(mesh, [width, height, depth]);
}
function detailBox(x, y, z, width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  arena.add(mesh);
  return mesh;
}
function building(x, z, width, depth, height) {
  block(x, height / 2, z, width, height, depth, rand() > 0.5 ? concreteMat : brickMat);
  block(x, height + 0.18, z, width + 0.45, 0.36, depth + 0.45, metalMat);
  const windows = Math.max(1, Math.floor(width / 4));
  for (let i = 0; i < windows; i++) {
    const wx = x - width / 2 + (i + 0.5) * width / windows;
    for (const face of [-1, 1]) detailBox(wx, height * 0.62, z + face * (depth / 2 + 0.03), 1.05, 1.05, 0.06, glassMat);
  }
  for (const side of [-1, 1]) {
    detailBox(x + side * (width / 2 + 0.045), height * 0.62, z, 0.06, 1.05, 1.05, glassMat);
    detailBox(x + side * (width / 2 + 0.16), 0.72, z, 0.22, 1.42, 1.4, metalMat);
  }
  for (let i = 0; i < 3; i++) block(x + (i - 1) * 1.5, 0.48, z + depth / 2 + 2.1, 1.35, 0.9, 0.8, brickMat);
}
function tower(x, z) {
  block(x, 5, z, 3.2, 10, 3.2, metalMat);
  block(x, 10.4, z, 6.2, 0.8, 6.2, concreteMat);
  block(x, 12.1, z, 5.2, 2.6, 5.2, metalMat);
  for (const side of [-1, 1]) detailBox(x + side * 2.63, 12.1, z, 0.08, 1.3, 1.3, glassMat);
  for (let y = 0.8; y < 9; y += 1.3) detailBox(x + 1.72, y, z, 0.35, 0.12, 0.65, metalMat);
}
function clearArena() {
  for (const child of [...arena.children]) {
    arena.remove(child);
    child.geometry?.dispose();
  }
  colliders.length = 0;
  bots.length = 0;
  botMeshes.length = 0;
  for (const projectile of projectiles) scene.remove(projectile.mesh);
  projectiles.length = 0;
}
function buildMap() {
  clearArena();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 190), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  arena.add(ground);
  block(0, 3, -world.half, 180, 6, 2, concreteMat);
  block(0, 3, world.half, 180, 6, 2, concreteMat);
  block(-world.half, 3, 0, 2, 6, 180, concreteMat);
  block(world.half, 3, 0, 2, 6, 180, concreteMat);

  const buildingSites = [
    [-38, -39, 18, 16, 10], [4, -42, 23, 17, 13], [43, -32, 20, 20, 9],
    [-52, 5, 18, 21, 12], [39, 12, 22, 18, 11], [-25, 48, 20, 16, 9],
    [24, 49, 26, 18, 14], [57, 53, 16, 16, 8]
  ];
  for (const site of buildingSites) building(...site);
  tower(-66, -55); tower(64, -58); tower(-69, 61); tower(68, 62);

  for (let i = 0; i < 36; i++) {
    const x = (rand() - 0.5) * 145;
    const z = (rand() - 0.5) * 145;
    if (Math.hypot(x, z) < 14 || blocked(x, z, 3)) continue;
    const width = 2.2 + rand() * 3.5;
    const depth = 2 + rand() * 3;
    const height = 0.9 + rand() * 1.3;
    block(x, height / 2, z, width, height, depth, rand() > 0.5 ? brickMat : concreteMat);
  }

  player.pos.set(0, 1.65, 0);
  player.health = player.maxHealth;
  player.yaw = 0;
  player.pitch = 0;
  for (let i = 0; i < 13; i++) {
    let x = 0;
    let z = 0;
    let tries = 0;
    do {
      x = (rand() - 0.5) * 140;
      z = (rand() - 0.5) * 140;
      tries++;
    } while ((Math.hypot(x, z) < 25 || blocked(x, z, 0.8)) && tries < 150);
    makeBot(x, z);
  }
  updateObjective();
  updateHUD();
}
function blocked(x, z, radius = 0.5) {
  return colliders.some(c => Math.abs(x - c.x) < c.hx + radius && Math.abs(z - c.z) < c.hz + radius);
}

const botCloth = [0x374b40, 0x4c4940, 0x3c4650, 0x554b3c].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.04 }));
function makeBot(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const skin = new THREE.MeshStandardMaterial({ color: 0x9a8065, roughness: 0.82 });
  const cloth = botCloth[Math.floor(rand() * botCloth.length)];
  const armor = new THREE.MeshStandardMaterial({ color: 0x29332e, roughness: 0.62, metalness: 0.25 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xa2d7bd, emissive: 0x427b62, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.28 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.8, 4, 8), cloth);
  torso.position.y = 1.28; torso.castShadow = true; group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.68, 0.48), armor);
  vest.position.set(0, 1.35, 0.04); vest.castShadow = true; group.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
  head.position.y = 2.12; head.castShadow = true; group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), armor);
  helmet.position.y = 2.19; helmet.castShadow = true; group.add(helmet);
  const faceplate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.08), visor);
  faceplate.position.set(0, 2.1, 0.26); group.add(faceplate);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 3, 6), cloth);
    arm.position.set(side * 0.55, 1.35, 0.02); arm.rotation.z = side * -0.12; arm.castShadow = true; group.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.58, 3, 6), armor);
    leg.position.set(side * 0.2, 0.48, 0); leg.castShadow = true; group.add(leg);
    addBotHitbox(group, new THREE.BoxGeometry(0.3, 0.55, 0.3), side * 0.2, 0.48, 0);
  }
  addBotHitbox(group, new THREE.BoxGeometry(1.05, 1.12, 0.8), 0, 1.38, 0);
  addBotHitbox(group, new THREE.SphereGeometry(0.32, 8, 6), 0, 2.12, 0);
  group.userData = { hp: 25 + Math.floor(rand() * 26), alive: true, speed: 1.2 + rand() * 1.1, cooldown: 0.7 + rand() * 1.5, blindUntil: 0, anim: rand() * 6 };
  scene.add(group);
  bots.push(group);
}
function addBotHitbox(group, geometry, x, y, z) {
  const hitbox = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, visible: false }));
  hitbox.position.set(x, y, z);
  hitbox.userData.bot = group;
  group.add(hitbox);
  botMeshes.push(hitbox);
}

const weaponView = new THREE.Group();
camera.add(weaponView);
scene.add(camera);
const gunMat = new THREE.MeshStandardMaterial({ color: 0x252d29, roughness: 0.32, metalness: 0.82 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x494237, roughness: 0.85 });
function gunPart(geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  weaponView.add(mesh);
  return mesh;
}
gunPart(new THREE.BoxGeometry(0.18, 0.18, 0.56), gunMat, 0.32, -0.28, -0.62);
gunPart(new THREE.BoxGeometry(0.11, 0.12, 0.43), gunMat, 0.32, -0.24, -1.02);
gunPart(new THREE.BoxGeometry(0.13, 0.25, 0.16), gripMat, 0.32, -0.45, -0.5);
gunPart(new THREE.BoxGeometry(0.23, 0.05, 0.22), gunMat, 0.32, -0.16, -0.65);
const scopeBody = gunPart(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 12), metalMat, 0.32, -0.1, -0.72);
scopeBody.rotation.x = Math.PI / 2;
const laser = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.32, -0.23, -0.88), new THREE.Vector3(0.32, -0.23, -30)]),
  new THREE.LineBasicMaterial({ color: 0xff3434 })
);
weaponView.add(laser);
laser.visible = false;

function updateHUD() {
  const weapon = weapons[weaponIndex];
  dom.weapon.textContent = weapon.name;
  dom.weaponClass.textContent = `${weapon.type} // ${String(weaponIndex + 1).padStart(2, '0')}`;
  dom.ammo.textContent = `${mag} / ${reserve}`;
  dom.health.textContent = String(Math.ceil(player.health));
  dom.meter.style.width = `${player.health}%`;
  [...dom.hotbar.children].forEach((slot, index) => slot.classList.toggle('active', index === weaponIndex));
  dom.laserState.textContent = laserOn ? 'ON' : 'OFF';
}
function buildHotbar() {
  dom.hotbar.innerHTML = '';
  weapons.forEach((weapon, index) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML = `<small>${index + 1}</small>${weapon.icon}`;
    dom.hotbar.append(slot);
  });
  updateHUD();
}
function updateObjective() {
  dom.objective.textContent = `HOSTILES: ${bots.filter(bot => bot.userData.alive).length}`;
}
function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 1000);
}
function chooseWeapon(index) {
  if (index < 0 || index >= weapons.length) return;
  weaponIndex = index;
  mag = weapons[index].mag;
  reserve = weapons[index].reserve;
  aiming = false;
  dom.scope.classList.add('hidden');
  camera.fov = 76;
  camera.updateProjectionMatrix();
  updateHUD();
}
function startGame() {
  active = true;
  paused = false;
  dom.menu.classList.add('hidden');
  dom.pause.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  dom.status.textContent = 'LIVE';
  canvas.requestPointerLock?.();
}
function pauseGame() {
  if (!active) return;
  paused = true;
  dom.pause.classList.remove('hidden');
  dom.status.textContent = 'PAUSED';
  document.exitPointerLock?.();
}
$('#deploy').addEventListener('click', startGame);
$('#resume').addEventListener('click', () => {
  paused = false;
  dom.pause.classList.add('hidden');
  dom.status.textContent = 'LIVE';
  canvas.requestPointerLock?.();
});
$('#newMap').addEventListener('click', () => {
  buildMap();
  startGame();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && active && !paused) pauseGame();
});

function targetRay() {
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = 180;
  const hits = raycaster.intersectObjects([...colliders.map(collider => collider.mesh), ...botMeshes], false);
  return hits.find(hit => {
    const bot = hit.object.userData.bot;
    return !bot || bot.userData.alive;
  }) || null;
}
function eliminateBot(bot) {
  if (!bot.userData.alive) return;
  bot.userData.alive = false;
  bot.visible = false;
  toast('HOSTILE DOWN');
  updateObjective();
}
function fire() {
  if (!active || paused || performance.now() - lastShot < weapons[weaponIndex].rate) return;
  if (mag <= 0) { reload(); return; }
  lastShot = performance.now();
  mag--;
  updateHUD();
  const hit = targetRay();
  if (hit?.object.userData.bot) {
    const bot = hit.object.userData.bot;
    if (bot.userData.alive) {
      bot.userData.hp -= weapons[weaponIndex].damage;
      if (bot.userData.hp <= 0) eliminateBot(bot);
    }
  }
  const muzzleFlash = new THREE.PointLight(0xffc071, 3, 4);
  muzzleFlash.position.set(0.32, -0.25, -1.05);
  weaponView.add(muzzleFlash);
  setTimeout(() => weaponView.remove(muzzleFlash), 55);
}
function reload() {
  const weapon = weapons[weaponIndex];
  if (mag >= weapon.mag || reserve <= 0) return;
  const amount = Math.min(weapon.mag - mag, reserve);
  mag += amount;
  reserve -= amount;
  updateHUD();
  toast('RELOADED');
}
function throwItem(type) {
  const now = performance.now();
  if (type === 'flash' && now < flashReady) { toast('FLASHBANG RECHARGING'); return; }
  if (type === 'grenade' && now < grenadeReady) { toast('GRENADE RECHARGING'); return; }
  if (type === 'flash') flashReady = now + 1600;
  else grenadeReady = now + 1600;

  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(type === 'flash' ? 0.12 : 0.2, 10, 8),
    new THREE.MeshStandardMaterial({ color: type === 'flash' ? 0xe6e5c8 : 0x3e5946, metalness: 0.55, roughness: 0.4 })
  );
  mesh.position.copy(camera.position).add(direction.clone().multiplyScalar(0.8));
  scene.add(mesh);
  projectiles.push({ mesh, velocity: direction.multiplyScalar(15).add(new THREE.Vector3(0, 4, 0)), time: 1.55, type });
  toast(type === 'flash' ? 'FLASH OUT' : 'FRAG OUT');
}
function detonate(projectile) {
  if (projectile.type === 'flash') {
    const light = new THREE.PointLight(0xffffff, 35, 40);
    light.position.copy(projectile.mesh.position);
    scene.add(light);
    setTimeout(() => scene.remove(light), 160);
    for (const bot of bots) {
      if (bot.userData.alive && bot.position.distanceTo(projectile.mesh.position) < 28) bot.userData.blindUntil = performance.now() + 3500;
    }
    if (player.pos.distanceTo(projectile.mesh.position) < 12) {
      dom.flash.classList.add('flash');
      setTimeout(() => dom.flash.classList.remove('flash'), 320);
    }
    return;
  }
  const blast = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff9c4a, transparent: true, opacity: 0.65 }));
  blast.position.copy(projectile.mesh.position);
  scene.add(blast);
  setTimeout(() => { scene.remove(blast); blast.geometry.dispose(); blast.material.dispose(); }, 180);
  for (const bot of bots) {
    if (!bot.userData.alive) continue;
    const distance = bot.position.distanceTo(projectile.mesh.position);
    if (distance < 9) {
      bot.userData.hp -= Math.ceil(45 * (1 - distance / 12));
      if (bot.userData.hp <= 0) eliminateBot(bot);
    }
  }
  updateObjective();
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const projectile = projectiles[i];
    projectile.time -= dt;
    projectile.velocity.y -= 9.8 * dt;
    projectile.mesh.position.addScaledVector(projectile.velocity, dt);
    if (projectile.mesh.position.y < 0.18 || blocked(projectile.mesh.position.x, projectile.mesh.position.z, 0.2)) projectile.time = Math.min(projectile.time, 0);
    if (projectile.time <= 0) {
      detonate(projectile);
      scene.remove(projectile.mesh);
      projectile.mesh.geometry.dispose();
      projectile.mesh.material.dispose();
      projectiles.splice(i, 1);
    }
  }
}
function hurt(amount) {
  player.health = Math.max(0, player.health - amount);
  updateHUD();
  if (player.health === 0) {
    player.health = player.maxHealth;
    toast('REDEPLOYED');
    updateHUD();
  }
}
function updateBots(dt) {
  for (const bot of bots) {
    const data = bot.userData;
    if (!data.alive) continue;
    data.anim += dt * 7;
    data.cooldown -= dt;
    const delta = player.pos.clone().sub(bot.position);
    const distance = delta.length();
    if (distance > 5 && distance < 38 && performance.now() > data.blindUntil) {
      delta.y = 0;
      delta.normalize();
      const nextX = bot.position.x + delta.x * data.speed * dt;
      const nextZ = bot.position.z + delta.z * data.speed * dt;
      if (!blocked(nextX, nextZ, 0.55)) { bot.position.x = nextX; bot.position.z = nextZ; }
      bot.rotation.y = Math.atan2(delta.x, delta.z);
      for (let i = 0; i < bot.children.length; i++) {
        const child = bot.children[i];
        if (child.geometry?.type === 'CapsuleGeometry' && child.position.y < 0.8) child.rotation.x = Math.sin(data.anim + i) * 0.15;
      }
    }
    if (distance < 24 && data.cooldown <= 0 && performance.now() > data.blindUntil) {
      data.cooldown = 1.35 + rand() * 0.65;
      const origin = bot.position.clone().add(new THREE.Vector3(0, 1.4, 0));
      const direction = player.pos.clone().sub(origin).normalize();
      raycaster.set(origin, direction);
      raycaster.far = distance;
      const wallHit = raycaster.intersectObjects(colliders.map(collider => collider.mesh), false)[0];
      if (!wallHit) hurt(15);
    }
  }
}
function movePlayer(dt) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, Math.sin(player.yaw));
  const direction = new THREE.Vector3();
  if (keys.has('KeyW')) direction.add(forward);
  if (keys.has('KeyS')) direction.sub(forward);
  if (keys.has('KeyD')) direction.add(right);
  if (keys.has('KeyA')) direction.sub(right);
  if (!direction.lengthSq()) return;
  direction.normalize().multiplyScalar((keys.has('ShiftLeft') || keys.has('ShiftRight') ? 12 : player.speed) * dt);
  const nextX = THREE.MathUtils.clamp(player.pos.x + direction.x, -world.half + 2, world.half - 2);
  if (!blocked(nextX, player.pos.z, 0.55)) player.pos.x = nextX;
  const nextZ = THREE.MathUtils.clamp(player.pos.z + direction.z, -world.half + 2, world.half - 2);
  if (!blocked(player.pos.x, nextZ, 0.55)) player.pos.z = nextZ;
}
function updateAim() {
  if (weaponIndex === 3 && aiming) {
    camera.fov = 31;
    dom.scope.classList.remove('hidden');
  } else {
    camera.fov = 76;
    dom.scope.classList.add('hidden');
  }
  camera.updateProjectionMatrix();
}
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.04);
  if (active && !paused) {
    movePlayer(dt);
    camera.position.copy(player.pos);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    updateBots(dt);
    updateProjectiles(dt);
    laser.visible = laserOn;
    const now = performance.now();
    dom.flashCooldown.textContent = now >= flashReady ? 'READY' : `${((flashReady - now) / 1000).toFixed(1)}s`;
    dom.grenadeCooldown.textContent = now >= grenadeReady ? 'READY' : `${((grenadeReady - now) / 1000).toFixed(1)}s`;
    updateAim();
  }
  renderer.render(scene, camera);
}

document.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== canvas || paused) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.0018, -1.4, 1.4);
});
document.addEventListener('mousedown', event => {
  if (!active || paused) return;
  if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  if (event.button === 0) fire();
  if (event.button === 2 && weaponIndex === 3) { aiming = !aiming; updateAim(); }
});
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', event => {
  keys.add(event.code);
  if (event.code === 'Escape' && active) { pauseGame(); return; }
  if (event.code === 'KeyR') reload();
  if (event.code === 'KeyF') throwItem('flash');
  if (event.code === 'KeyG') throwItem('grenade');
  if (event.code === 'KeyL') { laserOn = !laserOn; updateHUD(); }
  if (event.code.startsWith('Digit')) chooseWeapon(Number(event.code.slice(5)) - 1);
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

buildMap();
buildHotbar();
camera.position.copy(player.pos);
tick();
