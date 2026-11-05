const player = {
  health: 100,
  maxHealth: 100,
  position: new THREE.Vector3(0, 1.6, 0),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  speed: 8,
  sprint: 100
};

const state = {
  started: false,
  paused: false,
  activeWeapon: 0,
  weaponAmmo: [30, 8, 36, 5, 1],
  weaponReserve: [120, 32, 180, 30, 10],
  lastShot: 0,
  autoFire: false,
  score: 0,
  musicStarted: false,
  audioCtx: null,
  menuVisible: true,
  aimTolerance: 0.14
};

const weaponStats = [
  { name: 'RANGER', type: 'ASSAULT', damage: 15, fireRate: 0.11, mag: 30, reserve: 120 },
  { name: 'BREACHER', type: 'SHOTGUN', damage: 15, fireRate: 0.72, mag: 8, reserve: 32 },
  { name: 'VANGUARD', type: 'SMG', damage: 15, fireRate: 0.08, mag: 36, reserve: 180 },
  { name: 'LONGSHOT', type: 'MARKSMAN', damage: 15, fireRate: 0.9, mag: 5, reserve: 30 },
  { name: 'GRENADE', type: 'EXPLOSIVE', damage: 15, fireRate: 0.4, mag: 1, reserve: 10 }
];

function makeBot(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.userData = {
    alive: true,
    hp: 25 + Math.floor(Math.random() * 26),
    maxHp: 25 + Math.floor(Math.random() * 26),
    speed: 2.6 + Math.random() * 1.8,
    cooldown: Math.random() * 1.8,
    aim: 0
  };

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.7, 0.75),
    new THREE.MeshStandardMaterial({ color: 0x2d3e33, roughness: 0.8, metalness: 0.15 })
  );
  body.position.y = 1.1;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.75, 0.75),
    new THREE.MeshStandardMaterial({ color: 0xd3bf9a, roughness: 0.7 })
  );
  head.position.y = 2.2;
  head.castShadow = true;
  g.add(head);

  scene.add(g);
  bots.push(g);
}

function tryFireWeapon() {
  if (!state.started || state.paused) return;

  const w = weaponStats[state.activeWeapon];
  const now = performance.now();
  if (now - state.lastShot < w.fireRate * 1000) return;

  if (state.weaponAmmo[state.activeWeapon] <= 0) {
    reloadWeapon();
    return;
  }

  state.weaponAmmo[state.activeWeapon] -= 1;
  state.lastShot = now;

  const origin = camera.getWorldPosition(new THREE.Vector3());
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

  let hitBot = null;
  let bestDot = -Infinity;

  for (const bot of bots) {
    if (!bot.userData.alive) continue;

    const center = bot.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    const toBot = center.clone().sub(origin);
    const dist = toBot.length();
    if (dist <= 0.001) continue;

    const dir = toBot.normalize();
    const dot = direction.dot(dir);
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (dot > bestDot && angle < state.aimTolerance) {
      bestDot = dot;
      hitBot = bot;
    }
  }

  if (hitBot) {
    hitBot.userData.hp -= w.damage;
    if (hitBot.userData.hp <= 0) {
      hitBot.userData.alive = false;
      hitBot.visible = false;
      state.score += 1;
      showToast('TARGET DOWN');
    }
  }

  const tracer = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.04, 1.5),
    new THREE.MeshBasicMaterial({ color: 0x9ee8ff })
  );
  tracer.position.copy(origin).add(direction.clone().multiplyScalar(1.6));
  tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone());
  scene.add(tracer);
  setTimeout(() => scene.remove(tracer), 40);
}

function hurtPlayer(amount) {
  player.health = Math.max(0, player.health - amount);
  updateHealthUI();
  if (player.health <= 0) {
    player.health = 100;
    showToast('MISSION FAILED');
  }
}

function updateHealthUI() {
  const pct = (player.health / player.maxHealth) * 100;
  $('#health').textContent = String(Math.round(player.health));
  $('#meter').style.width = `${pct}%`;
}

function start() {
  state.started = true;
  state.paused = false;
  state.menuVisible = false;
  $('#menu').classList.add('hidden');
  $('#pause').classList.add('hidden');
  $('#hud').classList.add('active');
  $('#status').textContent = 'OPERATIVE';
  canvas.requestPointerLock?.();
}

function reloadWeapon() {
  const w = weaponStats[state.activeWeapon];
  const ammo = state.weaponAmmo[state.activeWeapon];
  const reserve = state.weaponReserve[state.activeWeapon];
  if (ammo >= w.mag || reserve <= 0) return;

  const needed = w.mag - ammo;
  const used = Math.min(needed, reserve);
  state.weaponAmmo[state.activeWeapon] += used;
  state.weaponReserve[state.activeWeapon] -= used;
  updateAmmoUI();
}

function updateAmmoUI() {
  const w = weaponStats[state.activeWeapon];
  $('#ammo').textContent = `${state.weaponAmmo[state.activeWeapon]} / ${state.weaponReserve[state.activeWeapon]}`;
  $('#weapon').textContent = w.name;
  $('#class').textContent = `${w.type} // ${String(state.activeWeapon + 1).padStart(2, '0')}`;
}

$('#deploy').onclick = start;
$('#resume').onclick = () => {
  state.paused = false;
  $('#pause').classList.add('hidden');
  canvas.requestPointerLock?.();
};
$('#newMap').onclick = () => {
  buildMap();
  start();
};

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state.started && !state.paused) {
    state.paused = true;
    $('#pause').classList.remove('hidden');
    $('#status').textContent = 'PAUSED';
  }
});

document.addEventListener('mousedown', () => {
  if (!state.started || state.paused) return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
    return;
  }
  state.autoFire = true;
  tryFireWeapon();
});

document.addEventListener('mouseup', () => {
  state.autoFire = false;
});

document.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Escape' && state.started) {
    state.paused = true;
    document.exitPointerLock?.();
    $('#pause').classList.remove('hidden');
    $('#status').textContent = 'PAUSED';
    return;
  }
  if (e.code === 'KeyR') reloadWeapon();
  if (/Digit[1-9]/.test(e.code)) {
    const idx = Number(e.code.replace('Digit', '')) - 1;
    if (idx >= 0 && idx < weaponStats.length) {
      state.activeWeapon = idx;
      updateAmmoUI();
    }
  }
});

function botAttackLoop(dt) {
  for (const bot of bots) {
    if (!bot.userData.alive) continue;
    const toPlayer = player.position.clone().sub(bot.position);
    const dist = toPlayer.length();
    if (dist < 12) {
      bot.userData.cooldown -= dt;
      if (bot.userData.cooldown <= 0) {
        bot.userData.cooldown = 1.2 + Math.random() * 1.2;
        hurtPlayer(15);
      }
    }
  }
}

buildMap();
updateHealthUI();
updateAmmoUI();
