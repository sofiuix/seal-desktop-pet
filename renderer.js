import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from './node_modules/gsap/index.js';

// ─── Setup ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const W = window.innerWidth;
const H = window.innerHeight;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 2000);
camera.position.set(0, 50, 300);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000, 0);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(100, 200, 150);
scene.add(dirLight);

// ─── Audio ───────────────────────────────────────────────────────────────────
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const bonkSound = new THREE.Audio(audioListener);
const purrSound = new THREE.Audio(audioListener);
const audioLoader = new THREE.AudioLoader();

audioLoader.load('./assets/bonk.mp3', (buffer) => {
  bonkSound.setBuffer(buffer);
  bonkSound.setVolume(0.7);
}, undefined, (err) => console.warn('bonk.mp3 not found, skipping'));

audioLoader.load('./assets/purr.mp3', (buffer) => {
  purrSound.setBuffer(buffer);
  purrSound.setVolume(0.5);
  purrSound.setLoop(false);
}, undefined, (err) => console.warn('purr.mp3 not found, skipping'));

// ─── Raycaster ───────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const mouseWorld = new THREE.Vector3();

let cursorX = W / 2;
let cursorY = H / 2;
let mouseMoving = false;
let mouseTimer = null;

document.addEventListener('mousemove', (e) => {
  cursorX = e.clientX;
  cursorY = e.clientY;

  mouse.x = (e.clientX / W) * 2 - 1;
  mouse.y = -(e.clientY / H) * 2 + 1;

  mouseMoving = true;
  clearTimeout(mouseTimer);
  mouseTimer = setTimeout(() => { mouseMoving = false; }, 300);

  // Screen → world on Z=0 plane
  raycaster.setFromCamera(mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  raycaster.ray.intersectPlane(plane, mouseWorld);

  // Click-through logic
  if (sealModel) {
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(sealModel, true);
    if (hits.length > 0) {
      window.electronAPI.setIgnoreMouse(false);
      handleHoverSeal();
    } else {
      window.electronAPI.setIgnoreMouse(true);
      isHoveringPurr = false;
    }
  }
});

// ─── Seal Model ──────────────────────────────────────────────────────────────
let sealModel = null;
let mixer = null;
const animations = {};
let currentAction = null;
const sealBBox = new THREE.Box3();
const clock = new THREE.Clock();

let gsapTween = null;
let isBonking = false;
let isHoveringPurr = false;
let fishEaten = 0;
const achItems = document.querySelectorAll('.ach-item');
function markAchDone(target) {
  achItems.forEach(el => {
    if (el.dataset.target === String(target)) el.classList.add('done');
  });
}
let achievementTriggered = false;
let legendaryTriggered = false;
let isRainbowMode = false;
let armyTriggered = false;
const miniSeals = [];
let megaTriggered = false;
let cosmicTriggered = false;
let isCosmicMode = false;
const fishCounterEl = document.getElementById('fish-counter');
const achievementOverlay = document.getElementById('achievement-overlay');
const achievementText = document.getElementById('achievement-text');

// ─── Achievement: Fireworks ─────────────────────────────────────────────────
const fireworkParticles = [];

function launchFirework(origin) {
  const colors = [0xFFD700, 0xFF4500, 0x00FF88, 0xFF1493, 0x00BFFF, 0xFF6347, 0x7B68EE, 0xFFFF00];
  const count = 30 + Math.floor(Math.random() * 20);

  for (let i = 0; i < count; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 1 + Math.random() * 3;
    const geo = new THREE.SphereGeometry(size, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const spark = new THREE.Mesh(geo, mat);
    spark.position.copy(origin);
    scene.add(spark);

    // Random direction in sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const speed = 40 + Math.random() * 80;
    const vx = Math.sin(phi) * Math.cos(theta) * speed;
    const vy = Math.sin(phi) * Math.sin(theta) * speed;
    const vz = Math.cos(phi) * speed * 0.3;

    const dur = 1.0 + Math.random() * 1.0;

    // Explode outward
    gsap.to(spark.position, {
      x: origin.x + vx,
      y: origin.y + vy,
      z: origin.z + vz,
      duration: dur,
      ease: 'power2.out',
    });

    // Gravity fall
    gsap.to(spark.position, {
      y: origin.y + vy - 60,
      duration: dur * 0.6,
      delay: dur * 0.5,
      ease: 'power2.in',
    });

    // Fade out + shrink + cleanup
    gsap.to(mat, {
      opacity: 0,
      duration: dur * 0.8,
      delay: dur * 0.3,
      ease: 'power1.in',
    });

    gsap.to(spark.scale, {
      x: 0, y: 0, z: 0,
      duration: 0.4,
      delay: dur,
      onComplete: () => {
        scene.remove(spark);
        geo.dispose();
        mat.dispose();
      },
    });
  }
}

function triggerAchievement() {
  achievementTriggered = true;
  markAchDone(100);

  // Show text overlay
  achievementOverlay.classList.add('show');
  achievementText.classList.add('animate');

  // Launch multiple fireworks in sequence
  const positions = [
    new THREE.Vector3(-100, 80, 0),
    new THREE.Vector3(100, 60, 0),
    new THREE.Vector3(0, 100, 0),
    new THREE.Vector3(-150, 0, 0),
    new THREE.Vector3(150, 20, 0),
  ];

  positions.forEach((pos, i) => {
    setTimeout(() => launchFirework(pos), i * 400);
  });

  // Second wave
  setTimeout(() => {
    const pos2 = [
      new THREE.Vector3(-60, 120, 0),
      new THREE.Vector3(80, 90, 0),
      new THREE.Vector3(0, -30, 0),
    ];
    pos2.forEach((pos, i) => {
      setTimeout(() => launchFirework(pos), i * 300);
    });
  }, 2500);

  // Hide text after animation
  setTimeout(() => {
    achievementOverlay.classList.remove('show');
    achievementText.classList.remove('animate');
  }, 4000);

  // Flash the counter golden
  fishCounterEl.style.color = '#FFD700';
  fishCounterEl.style.fontSize = '28px';
  fishCounterEl.style.textShadow = '0 0 15px rgba(255,215,0,0.8), 0 0 30px rgba(255,165,0,0.5)';
  setTimeout(() => {
    fishCounterEl.style.color = '#ffffff';
    fishCounterEl.style.fontSize = '18px';
    fishCounterEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.3)';
  }, 5000);
}

// ─── Achievement 250: Rainbow Seal ──────────────────────────────────────────
function triggerLegendary() {
  legendaryTriggered = true;
  isRainbowMode = true;
  markAchDone(250);

  // Show legendary text
  achievementText.textContent = '🌈 LEGENDARY SEAL 🌈';
  achievementOverlay.classList.add('show');
  achievementText.classList.remove('animate');
  // Force reflow to restart animation
  void achievementText.offsetWidth;
  achievementText.classList.add('animate');

  // Epic fireworks — 3 waves
  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          const pos = new THREE.Vector3(
            (Math.random() - 0.5) * 350,
            (Math.random() - 0.5) * 200 + 50,
            0
          );
          launchFirework(pos);
        }, i * 250);
      }
    }, wave * 1500);
  }

  // Hide text after animation
  setTimeout(() => {
    achievementOverlay.classList.remove('show');
    achievementText.classList.remove('animate');
  }, 5000);

  // Permanent rainbow counter
  fishCounterEl.style.fontSize = '22px';

  // Add neon glow point light that follows seal
  const neonLight = new THREE.PointLight(0xff00ff, 2, 150);
  neonLight.position.set(0, 0, 20);
  sealModel.add(neonLight);
  // Store for color cycling
  sealModel._neonLight = neonLight;
}

// Rainbow color cycling — called every frame when active
function updateRainbow(time) {
  if (!isRainbowMode || !sealModel) return;

  const hue = (time * 0.3) % 1; // cycle through hues
  const rainbowColor = new THREE.Color().setHSL(hue, 1.0, 0.5);

  // Cycle seal material emissive color
  sealModel.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.emissive = rainbowColor;
      child.material.emissiveIntensity = 0.4;
    }
  });

  // Cycle neon light color
  if (sealModel._neonLight) {
    sealModel._neonLight.color.setHSL(hue, 1.0, 0.5);
  }

  // Rainbow counter text
  const counterHue = ((time * 0.5) % 1) * 360;
  fishCounterEl.style.color = `hsl(${counterHue}, 100%, 70%)`;
  fishCounterEl.style.textShadow = `0 0 10px hsl(${counterHue}, 100%, 50%), 0 0 20px hsl(${(counterHue + 60) % 360}, 100%, 50%)`;
}

// ─── Achievement 400: Mini Seal Army ────────────────────────────────────────
function triggerArmy() {
  armyTriggered = true;
  markAchDone(400);

  // Show army text
  achievementText.textContent = '🦭 SEAL ARMY! 🦭';
  achievementOverlay.classList.add('show');
  achievementText.classList.remove('animate');
  void achievementText.offsetWidth;
  achievementText.classList.add('animate');

  // Epic fireworks
  for (let wave = 0; wave < 3; wave++) {
    setTimeout(() => {
      for (let i = 0; i < 6; i++) {
        setTimeout(() => {
          const pos = new THREE.Vector3(
            (Math.random() - 0.5) * 350,
            (Math.random() - 0.5) * 200 + 50,
            0
          );
          launchFirework(pos);
        }, i * 250);
      }
    }, wave * 1500);
  }

  // Hide text
  setTimeout(() => {
    achievementOverlay.classList.remove('show');
    achievementText.classList.remove('animate');
  }, 5000);

  // Spawn 4 mini seals one by one using a new GLTF load for each
  const offsets = [
    { x: -25, y: -15, delay: 0 },
    { x: 25, y: -15, delay: 600 },
    { x: -15, y: -35, delay: 1200 },
    { x: 15, y: -35, delay: 1800 },
  ];

  const babyLoader = new GLTFLoader();

  offsets.forEach((off) => {
    setTimeout(() => {
      babyLoader.load('./assets/scene.gltf', (gltf) => {
        const babyRaw = gltf.scene;
        babyRaw.scale.set(0.13, 0.13, 0.13); // half of parent
        babyRaw.rotation.y = Math.PI;

        const babyGroup = new THREE.Group();
        babyGroup.add(babyRaw);
        babyGroup.position.copy(sealModel.position);
        babyGroup.position.x += off.x;
        babyGroup.position.y += off.y;

        // Start tiny and grow with bounce
        babyGroup.scale.set(0.01, 0.01, 0.01);
        scene.add(babyGroup);

        gsap.to(babyGroup.scale, {
          x: 1, y: 1, z: 1,
          duration: 0.8,
          ease: 'back.out(3)',
        });

        miniSeals.push({
          mesh: babyGroup,
          offset: { x: off.x, y: off.y },
          wobbleOffset: Math.random() * Math.PI * 2,
        });
      });
    }, off.delay);
  });
}

// Update mini seals — follow parent with delay + wobble
function updateMiniSeals(time) {
  if (miniSeals.length === 0 || !sealModel) return;

  miniSeals.forEach((baby, i) => {
    // Target position: behind parent with offset
    const targetX = sealModel.position.x + baby.offset.x;
    const targetY = sealModel.position.y + baby.offset.y;

    // Smooth follow with slight delay (each baby slightly slower)
    const speed = 0.06 - i * 0.008;
    baby.mesh.position.x += (targetX - baby.mesh.position.x) * speed;
    baby.mesh.position.y += (targetY - baby.mesh.position.y) * speed;

    // Wobble — slight up/down bob
    baby.mesh.position.y += Math.sin(time * 3 + baby.wobbleOffset) * 0.3;

    // Copy parent rotation (follow direction)
    baby.mesh.quaternion.slerp(sealModel.quaternion, 0.08);
  });
}

// ─── Achievement 500: Mega Seal ──────────────────────────────────────────────
function triggerMega() {
  megaTriggered = true;
  markAchDone(500);

  achievementText.textContent = '\u{1F3D4}\u{FE0F} MEGA SEAL \u{1F3D4}\u{FE0F}';
  achievementOverlay.classList.add('show');
  achievementText.classList.remove('animate');
  void achievementText.offsetWidth;
  achievementText.classList.add('animate');

  // Massive fireworks — 5 waves
  for (let wave = 0; wave < 5; wave++) {
    setTimeout(() => {
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          launchFirework(new THREE.Vector3(
            (Math.random() - 0.5) * 400,
            (Math.random() - 0.5) * 300, 0
          ));
        }, i * 150);
      }
    }, wave * 1000);
  }

  setTimeout(() => {
    achievementOverlay.classList.remove('show');
    achievementText.classList.remove('animate');
  }, 5500);

  // Screen shake
  const origX = camera.position.x;
  const origY = camera.position.y;
  let shakeTime = 0;
  const shakeInterval = setInterval(() => {
    shakeTime += 50;
    if (shakeTime > 1500) {
      clearInterval(shakeInterval);
      camera.position.x = origX;
      camera.position.y = origY;
      return;
    }
    const intensity = 5 * (1 - shakeTime / 1500);
    camera.position.x = origX + (Math.random() - 0.5) * intensity;
    camera.position.y = origY + (Math.random() - 0.5) * intensity;
  }, 50);

  // Grow seal to 2x
  const rawModel = sealModel.children[0];
  gsap.to(rawModel.scale, {
    x: 0.52, y: 0.52, z: 0.52,
    duration: 2.0,
    ease: 'elastic.out(1, 0.5)',
    delay: 0.5,
  });

  // Counter flash red
  fishCounterEl.style.fontSize = '30px';
  fishCounterEl.style.color = '#ff4444';
  fishCounterEl.style.textShadow = '0 0 20px #ff0000, 0 0 40px #ff4400';
  setTimeout(() => {
    if (!isRainbowMode) {
      fishCounterEl.style.color = '#ffffff';
      fishCounterEl.style.fontSize = '18px';
      fishCounterEl.style.textShadow = '0 1px 3px rgba(0,0,0,0.3)';
    }
  }, 6000);
}

// ─── Achievement 1000: Seal Family ───────────────────────────────────────────
const cosmicMiniSeals = [];
const cosmicHearts = [];

function createHeart(color) {
  const shape = new THREE.Shape();
  const s = 1.5;
  shape.moveTo(0, s * 1.5);
  shape.bezierCurveTo(s * 0.5, s * 2.5, s * 2, s * 2, s * 2, s * 0.8);
  shape.bezierCurveTo(s * 2, 0, 0, -s * 0.5, 0, -s * 1.5);
  shape.bezierCurveTo(0, -s * 0.5, -s * 2, 0, -s * 2, s * 0.8);
  shape.bezierCurveTo(-s * 2, s * 2, -s * 0.5, s * 2.5, 0, s * 1.5);
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

function triggerCosmic() {
  cosmicTriggered = true;
  isCosmicMode = true;
  markAchDone(1000);

  achievementText.textContent = '❤️ SEAL FAMILY ❤️';
  achievementOverlay.classList.add('show');
  achievementText.classList.remove('animate');
  void achievementText.offsetWidth;
  achievementText.classList.add('animate');

  // Hide army mini seals from achievement 400
  for (const ms of miniSeals) {
    const mesh = ms.mesh || ms;
    gsap.to(mesh.scale, { x: 0, y: 0, z: 0, duration: 0.5, ease: 'back.in(2)',
      onComplete: () => { scene.remove(mesh); }
    });
  }
  miniSeals.length = 0;

  // Epic fireworks — 6 waves
  for (let wave = 0; wave < 6; wave++) {
    setTimeout(() => {
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          launchFirework(new THREE.Vector3(
            (Math.random() - 0.5) * 400,
            (Math.random() - 0.5) * 300, 0
          ));
        }, i * 120);
      }
    }, wave * 900);
  }

  setTimeout(() => {
    achievementOverlay.classList.remove('show');
    achievementText.classList.remove('animate');
  }, 6000);

  // Spawn 15 mini seals using real GLTF model
  const familyLoader = new GLTFLoader();
  for (let i = 0; i < 15; i++) {
    setTimeout(() => {
      familyLoader.load('./assets/scene.gltf', (gltf) => {
        const mini = new THREE.Group();
        const babyModel = gltf.scene;
        babyModel.scale.set(0.13, 0.13, 0.13); // same as army achievement
        babyModel.rotation.y = Math.PI; // face same direction as parent

        // Make each mini seal a different rainbow color
        const hue = i / 15;
        const rainbowColor = new THREE.Color().setHSL(hue, 0.8, 0.6);
        babyModel.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.color.copy(rainbowColor);
            child.material.emissive = rainbowColor.clone().multiplyScalar(0.3);
            child.material.emissiveIntensity = 0.5;
            child.material.needsUpdate = true;
          }
        });
        mini._hueOffset = hue;

        mini.add(babyModel);

        mini.position.copy(sealModel.position);
        const row = Math.floor(i / 5);
        const col = (i % 5) - 2;
        mini._offsetX = col * 25 + (Math.random() - 0.5) * 8;
        mini._offsetY = -(row + 1) * 22 + (Math.random() - 0.5) * 5;
        mini._phase = Math.random() * Math.PI * 2;
        mini.scale.set(0.01, 0.01, 0.01);
        scene.add(mini);
        cosmicMiniSeals.push(mini);

        // Setup animation
        if (gltf.animations.length > 0) {
          mini._mixer = new THREE.AnimationMixer(babyModel);
          const idleClip = gltf.animations.find(c => c.name === 'idle');
          if (idleClip) {
            const action = mini._mixer.clipAction(idleClip);
            action.play();
          }
        }

        // Pop in
        gsap.to(mini.scale, {
          x: 1, y: 1, z: 1,
          duration: 0.5,
          ease: 'elastic.out(1, 0.5)',
        });

        // Add 2 hearts per mini seal
        for (let h = 0; h < 2; h++) {
          const colors = [0xff4466, 0xff6699, 0xff88aa, 0xff3355];
          const heart = createHeart(colors[Math.floor(Math.random() * colors.length)]);
          heart._parent = mini;
          heart._orbitSpeed = 1.5 + Math.random() * 1.5;
          heart._orbitRadius = 12 + Math.random() * 6;
          heart._orbitOffset = h * Math.PI + Math.random();
          heart._bobSpeed = 2 + Math.random();
          heart.scale.set(0.5, 0.5, 0.5);
          scene.add(heart);
          cosmicHearts.push(heart);
        }
      });
    }, i * 300);
  }

  // Counter style
  fishCounterEl.style.fontSize = '22px';
  fishCounterEl.style.color = '#ff6699';
  fishCounterEl.style.textShadow = '0 0 10px #ff4466, 0 0 20px #ff88aa';
}

function updateCosmic(time) {
  if (!isCosmicMode) return;

  // Mini seals follow main seal in formation
  for (const mini of cosmicMiniSeals) {
    const targetX = sealModel.position.x + mini._offsetX + Math.sin(time * 0.8 + mini._phase) * 5;
    const targetY = sealModel.position.y + mini._offsetY + Math.cos(time * 0.6 + mini._phase) * 3;
    mini.position.x += (targetX - mini.position.x) * 0.04;
    mini.position.y += (targetY - mini.position.y) * 0.04;
    mini.quaternion.slerp(sealModel.quaternion, 0.03);
    if (mini._mixer) mini._mixer.update(0.016);
    // Cycle rainbow colors
    if (mini._hueOffset !== undefined) {
      const h = (mini._hueOffset + time * 0.15) % 1;
      mini.traverse((child) => {
        if (child.isMesh && child.material && child.material.color) {
          child.material.color.setHSL(h, 0.8, 0.6);
          child.material.emissive.setHSL(h, 0.8, 0.2);
        }
      });
    }
  }

  // Hearts orbit around their parent mini seals
  for (const heart of cosmicHearts) {
    if (!heart._parent) continue;
    const p = heart._parent.position;
    heart.position.x = p.x + Math.cos(time * heart._orbitSpeed + heart._orbitOffset) * heart._orbitRadius;
    heart.position.y = p.y + Math.sin(time * heart._bobSpeed) * 3 + 8;
    heart.position.z = p.z + Math.sin(time * heart._orbitSpeed + heart._orbitOffset) * heart._orbitRadius;
    heart.rotation.y = time * 2;
    // Pulse scale
    const s = 0.4 + Math.sin(time * 3 + heart._orbitOffset) * 0.1;
    heart.scale.set(s, s, s);
  }
}

const loader = new GLTFLoader();
loader.load('./assets/scene.gltf', (gltf) => {
  const rawModel = gltf.scene;
  rawModel.scale.set(0.26, 0.26, 0.26);
  rawModel.rotation.y = Math.PI; // base orientation — face camera

  // Wrap in pivot so dynamic rotations aren't affected by base Y=PI
  sealModel = new THREE.Group();
  sealModel.add(rawModel);
  sealModel.position.set(0, 0, 0);
  scene.add(sealModel);

  console.log('Seal loaded! Animations:', gltf.animations.map(a => a.name));

  mixer = new THREE.AnimationMixer(sealModel);
  gltf.animations.forEach((clip) => {
    animations[clip.name] = mixer.clipAction(clip);
  });

  // Static pose: play idle paused at frame 0
  if (animations['idle']) {
    currentAction = animations['idle'];
    currentAction.play();
    currentAction.paused = true;
    currentAction.time = 0;
  }
}, (progress) => {
  console.log('Loading model...', Math.round(progress.loaded / progress.total * 100) + '%');
}, (error) => {
  console.error('Failed to load seal model:', error);
});

function crossFadeTo(name, duration = 0.4) {
  if (!animations[name] || !mixer) return;
  const newAction = animations[name];
  if (currentAction === newAction) return;

  newAction.reset();
  newAction.play();
  newAction.paused = false;

  if (currentAction) {
    currentAction.crossFadeTo(newAction, duration, true);
  }
  currentAction = newAction;
}

function playStaticPose() {
  if (currentAction === animations['idle'] && currentAction.paused) return;
  crossFadeTo('idle', 0.4);
  setTimeout(() => {
    if (currentAction === animations['idle']) {
      currentAction.paused = true;
      currentAction.time = 0;
    }
  }, 500);
}

// ─── Cookies (collectibles) ──────────────────────────────────────────────────
const cookies = [];
const cookieBBoxes = [];
const COOKIE_COUNT = 20;
const COOKIE_RESPAWN_TIME = 5000; // 5 seconds

function randomPos() {
  let pos;
  // Keep generating until cookie is far enough from seal
  do {
    pos = {
      x: (Math.random() - 0.5) * 400,
      y: (Math.random() - 0.5) * 200,
      z: -10, // behind seal (further from camera)
    };
  } while (sealModel && new THREE.Vector3(pos.x, pos.y, 0)
    .distanceTo(sealModel.position) < 80);
  return pos;
}

function createCookie() {
  const fishGroup = new THREE.Group();
  const S = 0.9;

  // Body
  const bodyGeo = new THREE.SphereGeometry(6 * S, 12, 8);
  bodyGeo.scale(1.8, 0.6, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a90d9, roughness: 0.5, metalness: 0.1 });
  fishGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

  // Belly (lighter underside)
  const bellyGeo = new THREE.SphereGeometry(5.5 * S, 10, 6);
  bellyGeo.scale(1.6, 0.35, 0.9);
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xb0d4f1 });
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.y = -1 * S;
  fishGroup.add(belly);

  // Tail fin
  const tailGeo = new THREE.ConeGeometry(4 * S, 6 * S, 4);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x3a7bc8 });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -12 * S;
  tail.scale.set(1, 0.4, 1);
  fishGroup.add(tail);

  // Dorsal fin
  const finGeo = new THREE.ConeGeometry(2.5 * S, 4 * S, 4);
  const dorsal = new THREE.Mesh(finGeo, new THREE.MeshStandardMaterial({ color: 0x3a7bc8 }));
  dorsal.position.set(0, 4 * S, 0);
  dorsal.scale.set(0.6, 1, 0.3);
  fishGroup.add(dorsal);

  // Eye
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(1.2 * S, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  eye.position.set(7 * S, 1.5 * S, 3 * S);
  fishGroup.add(eye);

  const mesh = fishGroup;
  mesh.renderOrder = -1;

  // Make all materials transparent for fade-in
  mesh.traverse((child) => {
    if (child.isMesh) {
      child.material.transparent = true;
      child.material.opacity = 0;
    }
  });

  const pos = randomPos();
  mesh.position.set(pos.x, pos.y, pos.z);
  mesh.scale.set(0.3, 0.3, 0.3);
  scene.add(mesh);
  cookies.push(mesh);
  cookieBBoxes.push(new THREE.Box3().setFromObject(mesh));

  // Fade in via opacity + bounce via scale
  mesh.traverse((child) => {
    if (child.isMesh) {
      gsap.to(child.material, {
        opacity: 1,
        duration: 2.0,
        ease: 'power1.inOut',
      });
    }
  });
  gsap.to(mesh.scale, {
    x: 1, y: 1, z: 1,
    duration: 1.0,
    ease: 'back.out(3)',
  });
}

// Spawn fish one by one with delay
let fishSpawned = 0;
function spawnNextFish() {
  if (fishSpawned >= COOKIE_COUNT) return;
  createCookie();
  fishSpawned++;
  if (fishSpawned < COOKIE_COUNT) {
    setTimeout(spawnNextFish, 1000); // one every 1 second
  }
}
spawnNextFish();

// ─── Collisions (eating cookies) ─────────────────────────────────────────────
function findNearestFish() {
  if (!sealModel) return null;
  let nearest = null;
  let minDist = Infinity;
  for (let i = 0; i < cookies.length; i++) {
    if (!cookies[i].visible) continue;
    const d = sealModel.position.distanceTo(cookies[i].position);
    if (d < minDist) {
      minDist = d;
      nearest = { index: i, dist: d };
    }
  }
  return nearest;
}

function checkCollisions() {
  if (!sealModel) return;

  const EAT_DIST = 30; // distance threshold for eating

  for (let i = 0; i < cookies.length; i++) {
    if (!cookies[i].visible || cookies[i]._eating) continue;
    const d = sealModel.position.distanceTo(cookies[i].position);
    if (d < EAT_DIST) {
      cookies[i]._eating = true;
      eatCookie(i);
      break; // only eat one per frame
    }
  }
}

function spawnCrumbs(position) {
  const crumbCount = 8;
  for (let i = 0; i < crumbCount; i++) {
    const size = 0.5 + Math.random() * 1.5;
    // Fish chunks
    const colors = [0x4a90d9, 0x3a7bc8, 0x6baaf0, 0xb0d4f1];
    const crumb = new THREE.Mesh(
      new THREE.TetrahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)] })
    );
    crumb.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    crumb.position.copy(position);
    scene.add(crumb);

    // Random direction for each crumb
    const angle = Math.random() * Math.PI * 2;
    const speed = 15 + Math.random() * 30;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed * 0.5 + 10; // slight upward bias

    gsap.to(crumb.position, {
      x: crumb.position.x + vx,
      y: crumb.position.y + vy,
      duration: 0.6,
      ease: 'power2.out',
    });
    // Gravity fall after arc
    gsap.to(crumb.position, {
      y: crumb.position.y - 40,
      duration: 0.5,
      delay: 0.4,
      ease: 'power2.in',
    });
    // Fade out and remove
    gsap.to(crumb.scale, {
      x: 0, y: 0, z: 0,
      duration: 0.3,
      delay: 0.6,
      ease: 'power2.in',
      onComplete: () => {
        scene.remove(crumb);
        crumb.geometry.dispose();
        crumb.material.dispose();
      },
    });
  }
}

function eatCookie(index) {
  const cookie = cookies[index];
  // Don't stop movement — eat on the go
  fishEaten++;
  fishCounterEl.textContent = `🐟 ${fishEaten}`;
  if (bonkSound.buffer && !bonkSound.isPlaying) bonkSound.play();

  // Achievement at 100 fish!
  if (fishEaten === 100 && !achievementTriggered) {
    triggerAchievement();
  }
  // Achievement at 250 fish — LEGENDARY RAINBOW!
  if (fishEaten === 250 && !legendaryTriggered) {
    triggerLegendary();
  }
  // Achievement at 400 fish — SEAL ARMY!
  if (fishEaten === 400 && !armyTriggered) {
    triggerArmy();
  }
  // Achievement at 500 fish — MEGA SEAL!
  if (fishEaten === 500 && !megaTriggered) {
    triggerMega();
  }
  // Achievement at 1000 fish — SEAL FAMILY!
  if (fishEaten === 1000 && !cosmicTriggered) {
    triggerCosmic();
  }

  // Instant bite — crumbs fly immediately
  spawnCrumbs(cookie.position.clone());

  // Cookie shrinks instantly
  gsap.to(cookie.scale, {
    x: 0, y: 0, z: 0,
    duration: 0.2,
    ease: 'back.in(2)',
    onComplete: () => { cookie.visible = false; },
  });

  // Bite squeeze effect (no rotation conflict)
  if (!sealModel._isBiting) {
    sealModel._isBiting = true;
    const raw = sealModel.children[0];
    if (raw) {
      const origScale = raw.scale.x;
      gsap.to(raw.scale, {
        x: origScale * 1.15, y: origScale * 0.85, z: origScale * 1.15,
        duration: 0.1,
        ease: 'power2.in',
        onComplete: () => {
          gsap.to(raw.scale, {
            x: origScale, y: origScale, z: origScale,
            duration: 0.2,
            ease: 'elastic.out(1, 0.5)',
            onComplete: () => { sealModel._isBiting = false; },
          });
        },
      });
    } else {
      sealModel._isBiting = false;
    }
  }

  // Happy bounce
  gsap.to(sealModel.position, {
    y: sealModel.position.y + 15,
    duration: 0.2,
    delay: 0.1,
    ease: 'power2.out',
    yoyo: true,
    repeat: 1,
  });

  // Respawn fish after timeout — fade in via opacity
  setTimeout(() => {
    const pos = randomPos();
    cookie.position.set(pos.x, pos.y, pos.z);
    cookie.scale.set(0.3, 0.3, 0.3);
    cookie.visible = true;
    cookie._eating = false;
    cookie.traverse((child) => {
      if (child.isMesh) {
        child.material.opacity = 0;
        gsap.to(child.material, {
          opacity: 1,
          duration: 2.0,
          ease: 'power1.inOut',
        });
      }
    });
    gsap.to(cookie.scale, {
      x: 1, y: 1, z: 1,
      duration: 1.0,
      ease: 'back.out(3)',
    });
  }, COOKIE_RESPAWN_TIME);
}

// ─── Interactions ────────────────────────────────────────────────────────────
function handleHoverSeal() {
  if (!isHoveringPurr) {
    isHoveringPurr = true;
    if (purrSound.buffer && !purrSound.isPlaying) purrSound.play();
  }
}

document.addEventListener('click', (e) => {
  if (!sealModel) return;
  const cm = new THREE.Vector2((e.clientX / W) * 2 - 1, -(e.clientY / H) * 2 + 1);
  raycaster.setFromCamera(cm, camera);
  if (raycaster.intersectObject(sealModel, true).length > 0) {
    // Flip via scale bounce instead of rotation (avoids quaternion conflict)
    const raw = sealModel.children[0];
    if (raw) {
      const s = raw.scale.x;
      gsap.to(raw.scale, {
        y: s * 0.3, duration: 0.2, ease: 'power2.in',
        onComplete: () => {
          gsap.to(raw.scale, { y: s, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
        },
      });
    }
  }
});

let isBarrelRolling = false;

// ─── Periodic Jump ───────────────────────────────────────────────────────────
let lastJumpTime = 0;
let isJumping = false;
const JUMP_INTERVAL = 4000; // 4 seconds

function tryPeriodicJump() {
  const now = Date.now();
  if (mouseMoving && !isJumping && !isBonking && now - lastJumpTime > JUMP_INTERVAL) {
    isJumping = true;
    lastJumpTime = now;
    crossFadeTo('jump', 0.3);

    // Get jump animation duration or default to 2 seconds
    const jumpClip = animations['jump'] ? animations['jump'].getClip() : null;
    const jumpDuration = jumpClip ? jumpClip.duration * 1000 : 2000;

    setTimeout(() => {
      isJumping = false;
      if (mouseMoving) crossFadeTo('idle', 0.3);
    }, jumpDuration);
  }
}

// ─── Movement ────────────────────────────────────────────────────────────────
function updateSealMovement() {
  if (!sealModel || isBonking) return;

  if (mouseMoving) {
    tryPeriodicJump();
    if (!isJumping && (currentAction !== animations['idle'] || currentAction.paused)) crossFadeTo('idle', 0.3);

    // Smooth lerp toward cursor (70% of the way)
    const targetX = mouseWorld.x;
    const targetY = mouseWorld.y;

    // Smooth position via quickTo
    if (!sealModel._qx) {
      sealModel._qx = gsap.quickTo(sealModel.position, 'x', { duration: 1.2, ease: 'power3.out' });
      sealModel._qy = gsap.quickTo(sealModel.position, 'y', { duration: 1.2, ease: 'power3.out' });
    }
    sealModel._qx(targetX);
    sealModel._qy(targetY);

    // Direction from seal to mouse — use quaternions to avoid gimbal lock
    const dx = mouseWorld.x - sealModel.position.x;
    const dy = mouseWorld.y - sealModel.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 1) {
      const angle = Math.atan2(dx, dy);

      // Smooth the target angle to avoid jitter
      if (!sealModel._smoothAngle) sealModel._smoothAngle = angle;
      let aDiff = angle - sealModel._smoothAngle;
      while (aDiff > Math.PI) aDiff -= Math.PI * 2;
      while (aDiff < -Math.PI) aDiff += Math.PI * 2;
      sealModel._smoothAngle += aDiff * 0.35;

      // Smooth vertical angle — responsive but no jitter
      // 180° vertical range — full up/down rotation
      const verticalAngle = Math.atan2(dy, Math.abs(dx) + 0.01);
      if (!sealModel._smoothVertical) sealModel._smoothVertical = 0;
      sealModel._smoothVertical += (verticalAngle - sealModel._smoothVertical) * 0.2;

      // Build target quaternion from smoothed values
      const euler = new THREE.Euler(sealModel._smoothVertical, -sealModel._smoothAngle, 0, 'YXZ');
      const targetQ = new THREE.Quaternion().setFromEuler(euler);

      // Responsive slerp — follows mouse closely
      sealModel.quaternion.slerp(targetQ, 0.25);
    }
  } else {
    playStaticPose();
  }
}

// ─── Render Loop ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (mixer) mixer.update(delta);
  updateSealMovement();
  checkCollisions();
  updateRainbow(elapsed);
  updateMiniSeals(elapsed);
  updateCosmic(elapsed);
  renderer.render(scene, camera);
}

animate();
console.log('Renderer started, canvas:', W, 'x', H);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
