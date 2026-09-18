import * as THREE from 'three';
import fluidVertexRaw from '../shaders/fluidSimulation.vert?raw';
import fluidFragmentRaw from '../shaders/fluidSimulation.frag?raw';

// Extract GLSL from template literal string
function extractGLSL(raw: string): string {
  const match = raw.match(/`([\s\S]*)`/);
  return match ? match[1] : raw;
}

const fluidVertex = extractGLSL(fluidVertexRaw);
const fluidFragment = extractGLSL(fluidFragmentRaw);

console.log('=== FLUID SHADER EXTRACTED ===');
console.log('fluidVertex length:', fluidVertex.length);
console.log('fluidFragment length:', fluidFragment.length);

export class FluidSimulation {
  private renderer: THREE.WebGLRenderer;
  private resolution: number;
  private targets: THREE.WebGLRenderTarget[] = [];
  private currentIndex = 0;
  private simulationMaterial!: THREE.ShaderMaterial;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private quad!: THREE.Mesh;

  constructor(renderer: THREE.WebGLRenderer, resolution: number = 512) {
    this.renderer = renderer;
    this.resolution = resolution;

    this.createRenderTargets();
    this.createSimulationMaterial();
    this.createScene();
  }

  private createRenderTargets() {
    const gl = this.renderer.getContext();
    const isWebGL2 = gl instanceof WebGL2RenderingContext;
    
    // Check float texture support
    const floatExt = gl.getExtension('OES_texture_float');
    const halfFloatExt = gl.getExtension('OES_texture_half_float') || gl.getExtension('EXT_color_buffer_half_float');
    
    let textureType: THREE.TextureDataType = THREE.FloatType;
    if (!floatExt) {
      if (halfFloatExt) {
        console.warn('Float textures not supported, falling back to HalfFloat');
        textureType = THREE.HalfFloatType;
      } else {
        console.warn('Neither float nor half-float textures supported, using unsigned byte');
        textureType = THREE.UnsignedByteType;
      }
    }

    // Format: prefer RedFormat for single channel, fallback to RGBAFormat
    let textureFormat: THREE.PixelFormat = THREE.RedFormat;
    if (!isWebGL2 && !gl.getExtension('EXT_texture_rg')) {
      textureFormat = THREE.RGBAFormat;
    }

    const options: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      format: textureFormat,
      type: textureType,
      depthBuffer: false,
      stencilBuffer: false,
    };

    for (let i = 0; i < 3; i++) {
      const rt = new THREE.WebGLRenderTarget(this.resolution, this.resolution, options);
      rt.texture.name = `FluidRT_${i}`;
      this.targets.push(rt);
    }

    // Initialize all to zero
    this.clearAllTargets();
  }

  private clearAllTargets() {
    const clearMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: fluidVertex,
      fragmentShader: `void main() { gl_FragColor = vec4(0.0); }`,
    });
    const clearScene = new THREE.Scene();
    const clearCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const clearQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), clearMaterial);
    clearScene.add(clearQuad);

    for (const target of this.targets) {
      this.renderer.setRenderTarget(target);
      this.renderer.render(clearScene, clearCamera);
    }
    this.renderer.setRenderTarget(null);
    clearMaterial.dispose();
    clearScene.clear();
  }

  private createSimulationMaterial() {
    this.simulationMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uCurrent: { value: null },
        uPrevious: { value: null },
        uResolution: { value: new THREE.Vector2(this.resolution, this.resolution) },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uVelocity: { value: 0 },
        uIsMoving: { value: 0.0 },
        uViewportAspect: { value: 1.0 },
        uIntensity: { value: 0.73 },
        uRadius: { value: 0.10 },
        uViscosity: { value: 0.59 },
        uDecay: { value: 0.96 },
        uTrailSteps: { value: 8 },
        uTime: { value: 0 },
        uMouseVelocityScale: { value: 10.0 },
        uOrganicAmplitude: { value: 1.0 },
        uOrganicFrequency: { value: 1.0 },
        uOrganicSpeed: { value: 1.0 },
      },
      vertexShader: fluidVertex,
      fragmentShader: fluidFragment,
      depthTest: false,
      depthWrite: false,
    });
  }

  private createScene() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.simulationMaterial);
    this.scene.add(this.quad);
  }

  public step(mouse: { current: { x: number; y: number }; previous: { x: number; y: number }; velocity: number; isMoving: boolean }, viewportAspect: number, deltaTime: number) {
    const uniforms = this.simulationMaterial.uniforms;

    // Update uniforms
    uniforms.uCurrent.value = this.targets[this.currentIndex].texture;
    uniforms.uPrevious.value = this.targets[(this.currentIndex + 1) % 3].texture;
    uniforms.uMouse.value.set(mouse.current.x, mouse.current.y);
    uniforms.uPrevMouse.value.set(mouse.previous.x, mouse.previous.y);
    uniforms.uVelocity.value = mouse.velocity;
    uniforms.uIsMoving.value = mouse.isMoving ? 1.0 : 0.0;
    uniforms.uViewportAspect.value = viewportAspect;
    uniforms.uTime.value += deltaTime;

    // Render to next target
    const nextIndex = (this.currentIndex + 2) % 3;
    this.renderer.setRenderTarget(this.targets[nextIndex]);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    // Rotate indices: current becomes previous, next becomes current
    this.currentIndex = nextIndex;
  }

  public getCurrentTexture(): THREE.Texture {
    return this.targets[this.currentIndex].texture;
  }

  public getPreviousTexture(): THREE.Texture {
    return this.targets[(this.currentIndex + 1) % 3].texture;
  }

  public setResolution(resolution: number) {
    if (resolution === this.resolution) return;

    this.resolution = resolution;
    this.disposeTargets();
    this.createRenderTargets();
    this.simulationMaterial.uniforms.uResolution.value.set(resolution, resolution);
  }

  public setParameter(name: string, value: number | number[]) {
    const uniform = this.simulationMaterial.uniforms[name];
    if (uniform) {
      if (Array.isArray(value)) {
        if (uniform.value instanceof THREE.Vector2) {
          uniform.value.set(value[0], value[1]);
        }
      } else {
        uniform.value = value;
      }
    }
  }

  public getParameter(name: string): number {
    const uniform = this.simulationMaterial.uniforms[name];
    return uniform?.value ?? 0;
  }

  private disposeTargets() {
    for (const target of this.targets) {
      target.dispose();
    }
    this.targets = [];
  }

  public dispose() {
    this.disposeTargets();
    this.simulationMaterial.dispose();
    this.quad.geometry.dispose();
    this.scene.clear();
  }
}