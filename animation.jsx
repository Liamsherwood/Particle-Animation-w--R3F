import { useEffect, useRef } from 'react';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Simplex, Curl, patchShaders } from 'gl-noise'
import { createRoot } from 'react-dom/client';

import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';
const chunks = [[ Simplex, Curl], null,]
let patchedVertexShader, patchedFragmentShader;

const loadShaders = async () => {
  [patchedVertexShader, patchedFragmentShader] = await patchShaders([vertexShader, fragmentShader], chunks);
};

loadShaders();

// Functions...
const createCanvas = (texture) => {
  let canvas = document.createElement('canvas');
  let textureWidth = texture.image.width * 0.35;
  let textureHeight = texture.image.height * 0.35;
  let aspect = texture.image.width / texture.image.height;
  canvas.height = window.innerHeight * 0.55;
  canvas.width = canvas.height * aspect;
  let context = canvas.getContext('2d');
  context.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
  return { canvas, context };
};
const getImageData = (canvas, context) => {
  return context.getImageData(0, 0, canvas.width, canvas.height);
};
const extractPositionsAndColors = (imageData) => {
  let positions = [];
  let colors = [];
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      let index = (x + y * imageData.width) * 4;
      let r = imageData.data[index];
      let g = imageData.data[index + 1];
      let b = imageData.data[index + 2];
      if (r > 0 || g > 0 || b > 0) {
        let scale = 0.05;
        let position = new THREE.Vector3((x - imageData.width / 2) * scale, (-y + imageData.height / 2) * scale, 0);
        positions.push(position.x, position.y, position.z);
        colors.push(r / 255, g / 255, b / 255);
      }
    }
  }
  return { positions, colors };
}
const createGeometry = (positions, colors) => {
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
};
const Animation = React.memo(() => {
  const texture = useLoader(THREE.TextureLoader, 'src/assets/images/logo.png');
  const { camera, gl, scene } = useThree();
  const PointsRef = useRef();
  const materialRef = useRef();
  const geometryRef = useRef();
  const positionRef = useRef([]);
  const positionsRef = useRef([]);
  const velocitiesRef = useRef([]);
  const initialPositionsRef = useRef([]);
  const currentPositionsRef = useRef([]);
  
  // moved functions from here to top of file
  useEffect(() => {
    if (!texture.image || !PointsRef.current) {
      return;
    }
    const { canvas, context } = createCanvas(texture);
    const imageData = getImageData(canvas, context);
    let position = [];
    let velocities = [];
    let initialPositions = [];
    let currentPositions = [];
    const { positions, colors } = extractPositionsAndColors(imageData);
    geometryRef.current = createGeometry(positions, colors);
    // positionsRef.current = positions; * Check if this is needed, if not remove it. -> significantly drops CPU load *

    let pts = new Array(positions.length / 3).fill().map((p, i) => {
      let position = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(Math.random() * 0.5 + 25);
      return position;
    });
    position = pts;
    positionRef.current = position;
    initialPositions = [];
    for (let i = 0; i < pts.length; i++) {
      initialPositions.push(pts[i].x, pts[i].y, pts[i].z);
    }
    geometryRef.current.setAttribute('initialPosition', new THREE.Float32BufferAttribute(initialPositions, 3));
    initialPositionsRef.current = initialPositions;
    currentPositions = [...initialPositions];
    geometryRef.current.setAttribute('currentPosition', new THREE.Float32BufferAttribute(currentPositions, 3));
    currentPositionsRef.current = currentPositions;
    velocities = [];
    for (let i = 0; i < positions.length / 3; i++) {
      let velocity = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(Math.random() * 0.5)
      velocities.push(velocity.x, velocity.y, velocity.z);
    }
    geometryRef.current.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
    velocitiesRef.current = velocities;
    let clock = new THREE.Clock();
  
    try {
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
      materialRef.current = material;
    } catch (error) {
      console.error("Error creating ShaderMaterial: ", error);
    }

    // gsap.to(materialRef.current.uniforms.opacity, {
    //   value: 0,
    //   duration: 0.5,
    //   delay: 5.9,
    // });
  
    let tl = gsap.timeline();

    tl.to(materialRef.current.uniforms.transition, {
      value: 1,
      duration: 3,
      onStart: function() {
        geometryRef.current.attributes.initialPosition.copy(geometryRef.current.attributes.currentPosition);
      }
    });
    
    tl.to(materialRef.current.uniforms.morphTransition, {
      value: 1,
      duration: 2.9,
      ease: "power2.inOut",
    });
  
    tl.eventCallback("onComplete", function() {
    }, [texture, PointsRef.current]);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useFrame(({ clock }) => {
    if (materialRef.current && geometryRef.current) {
      let material = materialRef.current;
      let geometry = geometryRef.current;
      let position = positionRef.current;
      let positions = positionsRef.current;
      let velocities = velocitiesRef.current;
      let initialPositions = initialPositionsRef.current;
      let t = clock.getElapsedTime();
      let tClamped = Math.min(t, 2); // Clamp t to a maximum of 2
      if (t <= 2) {
        material.uniforms.transition.value = t / 2;
      }
      // Update the current positions
      if (geometryRef.current && geometryRef.current.attributes.currentPosition) {
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
          geometryRef.current.attributes.currentPosition.setXYZ(i, currentPosition.x, currentPosition.y, currentPosition.z);
        }
        geometryRef.current.attributes.currentPosition.needsUpdate = true;
        material.uniforms.time.value = t;
      }
    }
  });
  return (
    <>
      <points ref={PointsRef} args={[geometryRef.current, materialRef.current]}>
        <bufferGeometry attach="geometryRef.current"/>
        <shaderMaterial attach="materialRef.current"/>
      </points>
    </>
  );
})

export default function App() {
  return (
    <Canvas 
      camera={{ fov: 50, aspect: window.innerWidth / window.innerHeight, near: 1, far: 1000, position: [0, 0, 80] }}
      style={{ width: '100vw', height: '100vh' }}
    >
      <PerspectiveCamera makeDefault position={[0, 0, 80]} />
      <Animation />
      <OrbitControls enableDamping={false} zoomToCursor={false} enableRotate={false} maxDistance={100} minDistance={100} />
    </Canvas>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);