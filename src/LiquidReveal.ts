import * as THREE from 'three';
import { MouseTracker, MouseState } from './mouse/MouseTracker';
import { FluidSimulation } from './simulation/FluidSimulation';
import revealVertexRaw from './shaders/reveal.vert?raw';
import revealFragmentRaw from './shaders/reveal.frag?raw';
import { LIQUID_REVEAL_CONFIG } from './config';

// Extract GLSL from template literal string
function extractGLSL(raw: string): string {
  const match = raw.match(/`([\s\S]*)`/);
  return match ? match[1] : raw;
}

const revealVertex = extractGLSL(revealVertexRaw);
const revealFragment = extractGLSL(revealFragmentRaw);

interface LiquidRevealOptions {
  container: HTMLElement;
  baseImageSrc: string;
  revealImageSrc: string;
  simulationResolution?: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export class LiquidReveal {
  private container: HTMLElement;
  private baseImageSrc: string;
  private revealImageSrc: string;
  private simulationResolution: number;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private revealMaterial!: THREE.ShaderMaterial;
  private revealQuad!: THREE.Mesh;
  private fluidSimulation!: FluidSimulation;
  private mouseTracker!: MouseTracker;

  private baseTexture!: THREE.Texture;
  private revealTexture!: THREE.Texture;
  private imagesLoaded = false;
  private animationId: number | null = null;
  private lastTime = 0;
  private isDisposed = false;

  constructor(options: LiquidRevealOptions) {
    this.container = options.container;
    this.baseImageSrc = options.baseImageSrc;
    this.revealImageSrc = options.revealImageSrc;
    this.simulationResolution = options.simulationResolution ?? LIQUID_REVEAL_CONFIG.simulationResolution;

    this.init();
  }

  private async init() {
    try {
      await this.loadImages();
      this.createRenderer();
      this.createScene();
      this.createRevealMaterial();
      this.createFluidSimulation();
      this.createMouseTracker();
      this.handleResize();
      this.startAnimation();

      this.container.appendChild(this.renderer.domElement);
    } catch (error) {
      console.error('LiquidReveal initialization failed:', error);
      this.showFallback();
    }
  }

  private loadImages(): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();

      const loadTexture = (src: string, isBase: boolean) => {
        loader.load(
          src,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;

            if (isBase) {
              this.baseTexture = texture;
            } else {
              this.revealTexture = texture;
            }

            // Wait for image to be fully decoded
            const img = texture.image as HTMLImageElement;
            if (img.complete && img.naturalWidth > 0) {
              checkDone();
            } else {
              img.onload = () => checkDone();
              img.onerror = () => reject(new Error(`Failed to decode ${isBase ? 'base' : 'reveal'} image`));
            }
          },
          undefined,
          (error) => reject(new Error(`Failed to load ${isBase ? 'base' : 'reveal'} image: ${error}`))
        );
      };

      loadTexture(this.baseImageSrc, true);
      loadTexture(this.revealImageSrc, false);

      let loadedCount = 0;
      const checkDone = () => {
        loadedCount++;
        if (loadedCount === 2) {
          this.imagesLoaded = true;
          resolve();
        }
      };
    });
  }

  private createRenderer() {
    // Check WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      throw new Error('WebGL not supported');
    }

    // Check float texture support
    const ext = gl.getExtension('OES_texture_float') || gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
      console.warn('Float textures may not be fully supported');
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  private createScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  private createRevealMaterial() {
    const baseImg = this.baseTexture.image as HTMLImageElement;
    const revealImg = this.revealTexture.image as HTMLImageElement;
    const baseWidth = baseImg?.naturalWidth || baseImg?.width || 1;
    const baseHeight = baseImg?.naturalHeight || baseImg?.height || 1;
    const revealWidth = revealImg?.naturalWidth || revealImg?.width || 1;
    const revealHeight = revealImg?.naturalHeight || revealImg?.height || 1;

    this.revealMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uBaseTexture: { value: this.baseTexture },
        uRevealTexture: { value: this.revealTexture },
        uDisplacement: { value: null },
        uResolution: { value: new THREE.Vector2(this.container.clientWidth, this.container.clientHeight) },
        uSimResolution: { value: new THREE.Vector2(this.simulationResolution, this.simulationResolution) },
        uBaseAspect: { value: new THREE.Vector2(baseWidth, baseHeight) },
        uRevealAspect: { value: new THREE.Vector2(revealWidth, revealHeight) },
        uRevealSize: { value: LIQUID_REVEAL_CONFIG.revealSize },
        uEdgeSoftness: { value: LIQUID_REVEAL_CONFIG.edgeSoftness },
        uDistortionStrength: { value: LIQUID_REVEAL_CONFIG.distortionStrength },
        uNormalStrength: { value: LIQUID_REVEAL_CONFIG.normalStrength },
        uLightIntensity: { value: LIQUID_REVEAL_CONFIG.lightIntensity },
        uSpecularPower: { value: LIQUID_REVEAL_CONFIG.specularPower },
        uFresnelFactor: { value: LIQUID_REVEAL_CONFIG.fresnelFactor },
        uChromaticStrength: { value: LIQUID_REVEAL_CONFIG.chromaticStrength },
        uSpectralIntensity: { value: LIQUID_REVEAL_CONFIG.spectralIntensity },
        uSpectralGlow: { value: LIQUID_REVEAL_CONFIG.spectralGlow },
        uSpectralWidth: { value: LIQUID_REVEAL_CONFIG.spectralWidth },
        uTime: { value: 0 },
      },
      vertexShader: revealVertex,
      fragmentShader: revealFragment,
      depthTest: false,
      depthWrite: false,
    });

    this.revealMaterial.needsUpdate = true;

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.revealQuad = new THREE.Mesh(geometry, this.revealMaterial);
    this.scene.add(this.revealQuad);
  }

  private createFluidSimulation() {
    this.fluidSimulation = new FluidSimulation(this.renderer, this.simulationResolution);

    // Apply frozen configuration
    this.fluidSimulation.setParameter('uIntensity', LIQUID_REVEAL_CONFIG.intensity);
    this.fluidSimulation.setParameter('uRadius', LIQUID_REVEAL_CONFIG.radius);
    this.fluidSimulation.setParameter('uViscosity', LIQUID_REVEAL_CONFIG.viscosity);
    this.fluidSimulation.setParameter('uDecay', LIQUID_REVEAL_CONFIG.decay);
    this.fluidSimulation.setParameter('uTrailSteps', LIQUID_REVEAL_CONFIG.trailSteps);
    this.fluidSimulation.setParameter('uMouseVelocityScale', LIQUID_REVEAL_CONFIG.mouseVelocityScale);
    this.fluidSimulation.setParameter('uOrganicAmplitude', LIQUID_REVEAL_CONFIG.organicAmplitude);
    this.fluidSimulation.setParameter('uOrganicFrequency', LIQUID_REVEAL_CONFIG.organicFrequency);
    this.fluidSimulation.setParameter('uOrganicSpeed', LIQUID_REVEAL_CONFIG.organicSpeed);
  }

  private createMouseTracker() {
    this.mouseTracker = new MouseTracker(this.renderer.domElement);
  }

  private handleResize = () => {
    if (this.isDisposed) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.renderer.setSize(width, height);
    this.revealMaterial.uniforms.uResolution.value.set(width, height);
  };

  private animate = (time: number) => {
    if (this.isDisposed) return;

    const deltaTime = (time - this.lastTime) / 1000;
    this.lastTime = time;

    const mouseState = this.mouseTracker.getState();
    const viewportAspect = this.container.clientWidth / this.container.clientHeight;
    this.fluidSimulation.step(
      {
        current: mouseState.normalized,
        previous: mouseState.prevNormalized,
        velocity: mouseState.velocity,
        isMoving: mouseState.isMoving,
      },
      viewportAspect,
      deltaTime
    );

    const dispTexture = this.fluidSimulation.getCurrentTexture();
    this.revealMaterial.uniforms.uDisplacement.value = dispTexture;
    this.revealMaterial.uniforms.uTime.value += deltaTime;

    this.renderer.render(this.scene, this.camera);

    this.animationId = requestAnimationFrame(this.animate);
  };

  private startAnimation() {
    this.lastTime = performance.now();
    this.animationId = requestAnimationFrame(this.animate);
  }

  private showFallback() {
    const img = document.createElement('img');
    img.src = this.baseImageSrc;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.display = 'block';
    this.container.appendChild(img);
  }

  public dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.mouseTracker.destroy();
    this.fluidSimulation.dispose();
    this.revealMaterial.dispose();
    this.revealQuad.geometry.dispose();
    this.baseTexture.dispose();
    this.revealTexture.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    window.removeEventListener('resize', this.handleResize);
  }
}