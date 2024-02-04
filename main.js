// Import necessary objects from animation.js
import { renderer, scene, camera, planeMesh } from './animation.js';
import { setPlaneMeshScale } from './animation.js';

// Define the moveLogo function
function moveLogo() {
  console.log('Scroll event triggered');

  let scrollPosition = window.scrollY;
  planeMesh.position.y = scrollPosition;
  
  // Calculate scale based on scrollPosition
  let scale = Math.max(0.01, 1 - scrollPosition / 47.5);
  console.log('Scale:', scale); // Log the scale to the console

  // Call the setPlaneMeshScale function with the new scale
  setPlaneMeshScale(scale);

  requestAnimationFrame(() => {
    renderer.render(scene, camera);
  });
}

// Add event listener for the scroll event
window.addEventListener('scroll', moveLogo);