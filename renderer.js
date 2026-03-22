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
const fishCounterEl = document.getElementById('fish-counter');

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
const COOKIE_COUNT = 6;
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
    setTimeout(spawnNextFish, 2000); // one every 2 seconds
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
  sealBBox.setFromObject(sealModel);

  // No fish-facing — rotation fully controlled by mouse direction

  for (let i = 0; i < cookies.length; i++) {
    if (!cookies[i].visible || cookies[i]._eating) continue;
    cookieBBoxes[i].setFromObject(cookies[i]);
    if (sealBBox.intersectsBox(cookieBBoxes[i])) {
      cookies[i]._eating = true;
      eatCookie(i);
      break;
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

  // Instant bite — crumbs fly immediately
  spawnCrumbs(cookie.position.clone());

  // Cookie shrinks instantly
  gsap.to(cookie.scale, {
    x: 0, y: 0, z: 0,
    duration: 0.2,
    ease: 'back.in(2)',
    onComplete: () => { cookie.visible = false; },
  });

  // Quick nose dip (bite nod)
  const originalRotX = sealModel.rotation.x;
  gsap.to(sealModel.rotation, {
    x: originalRotX + 0.4,
    duration: 0.12,
    ease: 'power2.in',
    onComplete: () => {
      gsap.to(sealModel.rotation, {
        x: originalRotX,
        duration: 0.25,
        ease: 'power2.out',
      });
    },
  });

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
    gsap.to(sealModel.rotation, {
      x: sealModel.rotation.x + Math.PI * 2,
      duration: 0.8,
      ease: 'power2.inOut',
    });
  }
});

// ─── Movement ────────────────────────────────────────────────────────────────
function updateSealMovement() {
  if (!sealModel || isBonking) return;

  if (mouseMoving) {
    if (currentAction !== animations['jump']) crossFadeTo('jump', 0.3);

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
      const angle = Math.atan2(dx, dy); // horizontal direction
      const verticalRatio = dy / Math.max(dist, 1);

      // Build target quaternion from separate axis rotations
      const qY = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), -angle
      );
      const qX = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), verticalRatio * Math.PI / 2
      );
      // Apply Y first, then X in local space
      const targetQ = new THREE.Quaternion().multiplyQuaternions(qY, qX);

      // Smooth slerp toward target (0.15 = responsive but smooth)
      sealModel.quaternion.slerp(targetQ, 0.15);
    }
  } else {
    playStaticPose();
  }
}

// ─── Render Loop ─────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  updateSealMovement();
  checkCollisions();
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
