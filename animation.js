import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import { Simplex, Worley, Curl, patchShaders } from 'gl-noise'

import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';

let colors = [];
let planeMesh;
let startTime = Date.now();

const chunks = [[ Simplex, Worley, Curl], null,]
const [patchedVertexShader, patchedFragmentShader] = await patchShaders([vertexShader, fragmentShader], chunks);

let scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

let camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 1000);
camera.position.set(0, 0, 80);

let renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.body.appendChild(renderer.domElement);

window.addEventListener("resize", (event) => {
  camera.aspect = innerWidth / innerHeight;
  renderer.setSize(innerWidth, innerHeight);
  camera.updateProjectionMatrix();
});

let controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.zoomToCursor = false;
controls.enableRotate = false;
controls.maxDistance = 100;
controls.minDistance = 100;

let textureLoader = new THREE.TextureLoader();
textureLoader.load('src/assets/images/logo.png', function(texture) {
  let planeMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, side: THREE.DoubleSide });
  let scale = 0.035; // Adjust this value to scale the plane
  let planeGeometry = new THREE.PlaneGeometry(texture.image.width * scale, texture.image.height * scale);
  
  planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
  scene.add(planeMesh);

  gsap.to(planeMaterial, {
    opacity: 1,
    duration: 0.75,
    ease: "power2.inOut",
    delay: 5.25,
    onComplete: () => {
      controls.enabled = false;
    }
  });

  let canvas = document.createElement('canvas');
  canvas.width = texture.image.width;
  canvas.height = texture.image.height;
  let context = canvas.getContext('2d');
  context.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
  let imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  let positions = [];

  let n = 3;
  for (let y = 0; y < imageData.height; y += n) {
    for (let x = 0; x < imageData.width; x += n) {
      let index = (x + y * imageData.width) * 4;
      let r = imageData.data[index];
      let g = imageData.data[index + 1];
      let b = imageData.data[index + 2];
      if (r > 0 || g > 0 || b > 0) {
        let scale = 0.035;
        let position = new THREE.Vector3((x - imageData.width / 2) * scale, (-y + imageData.height / 2) * scale, 0);
        positions.push(position.x, position.y, position.z);
        colors.push(r / 255, g / 255, b / 255);
      }
    }
  }
  
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  let pts = new Array(positions.length / 3).fill().map((p, i) => {
    let position = new THREE.Vector3()
      .randomDirection()
      .multiplyScalar(Math.random() * 0.5 + 25);
    return position;
  });

  let initialPositions = [];
  for (let i = 0; i < pts.length; i++) {
    initialPositions.push(pts[i].x, pts[i].y, pts[i].z);
  }
  geometry.setAttribute('initialPosition', new THREE.Float32BufferAttribute(initialPositions, 3));

  let currentPositions = [...initialPositions];
  geometry.setAttribute('currentPosition', new THREE.Float32BufferAttribute(currentPositions, 3));

  let velocities = [];
  for (let i = 0; i < positions.length / 3; i++) {
    let velocity = new THREE.Vector3()
      .randomDirection()
      .multiplyScalar(Math.random() * 0.5)
    velocities.push(velocity.x, velocity.y, velocity.z);
  }
  geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));

  let clock = new THREE.Clock();

  let material = new THREE.ShaderMaterial({
    uniforms: {
      transition: { value: 0 },
      morphTransition: { value: 0 },
      opacity: { value: 1.0 },
      time: { value: 0.0 },
      velocity: { value: 0.0 },
      uSeed: { value: Math.random() },
    },
    vertexShader: patchedVertexShader,
    fragmentShader: patchedFragmentShader,
    transparent: true,
    depthTest: false,
    blending: THREE.NormalBlending,
  });

  let points = new THREE.Points(geometry, material);

  gsap.to(material.uniforms.opacity, {
    value: 0,
    duration: 0.5,
    delay: 5.5,
  });

  let tl = gsap.timeline();

  tl.to(material.uniforms.transition, {
    value: 1,
    duration: 3,
    onStart: function() {
      // Copy the current positions to the initial positions
      geometry.attributes.initialPosition.copy(geometry.attributes.currentPosition);
    }
  });
  
  tl.to(material.uniforms.morphTransition, {
    value: 1,
    duration: 2.9,
    ease: "power2.inOut",
  });

  scene.add(points);
  
  renderer.setAnimationLoop(() => {
    controls.update();
    let t = clock.getElapsedTime();
    let tClamped = Math.min(t, 2); // Clamp t to a maximum of 2
    if (t <= 2) {
      material.uniforms.transition.value = t / 2;
    }
    // Update the current positions
    for (let i = 0; i < positions.length / 3; i++) {
      let velocity = new THREE.Vector3(
        velocities[i * 3],
        velocities[i * 3 + 1],
        velocities[i * 3 + 2]
      );
      let currentPosition = new THREE.Vector3(
        initialPositions[i * 3] + velocity.x * tClamped,
        initialPositions[i * 3 + 1] + velocity.y * tClamped,
        initialPositions[i * 3 + 2] + velocity.z * tClamped
      );
      geometry.attributes.currentPosition.setXYZ(i, currentPosition.x, currentPosition.y, currentPosition.z);
    }
    geometry.attributes.currentPosition.needsUpdate = true;
    material.uniforms.time.value = t;
    renderer.render(scene, camera);
  });
  
}, undefined, function(error) {
  console.error('An error occurred while loading the texture:', error);
});

export function setPlaneMeshScale(newScale) {
  if (planeMesh) {
    planeMesh.scale.set(newScale, newScale, newScale);
  } else {
    console.error('planeMesh is not defined yet.');
  }
}

export { renderer, scene, camera, planeMesh };