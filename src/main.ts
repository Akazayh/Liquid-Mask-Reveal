import { LiquidReveal } from './LiquidReveal';

const container = document.getElementById('app')!;
if (!container) {
  throw new Error('Container element not found');
}

container.style.width = '100%';
container.style.height = '100%';

const liquidReveal = new LiquidReveal({
  container,
  baseImageSrc: 'image1.jpeg',
  revealImageSrc: 'image2.jpeg',
  simulationResolution: 512,
});

(window as any).liquidReveal = liquidReveal;

window.addEventListener('beforeunload', () => {
  liquidReveal.dispose();
});