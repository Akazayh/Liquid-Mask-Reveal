const fluidFragment = `
  uniform sampler2D uCurrent;
  uniform sampler2D uPrevious;
  uniform vec2 uResolution;
  uniform vec2 uMouse;
  uniform vec2 uPrevMouse;
  uniform float uVelocity;
  uniform float uIsMoving;
  uniform float uIntensity;
  uniform float uRadius;
  uniform float uViscosity;
  uniform float uDecay;
  uniform int uTrailSteps;
  uniform float uTime;
  uniform float uMouseVelocityScale;
  uniform float uViewportAspect;
  uniform float uOrganicAmplitude;
  uniform float uOrganicFrequency;
  uniform float uOrganicSpeed;

  varying vec2 vUv;

  float getHeight(sampler2D tex, vec2 uv) {
    return texture2D(tex, uv).r;
  }

  void main() {
    vec2 texel = 1.0 / uResolution;

    // Read neighbors from current state
    float left   = getHeight(uCurrent, vUv + vec2(-texel.x, 0.0));
    float right  = getHeight(uCurrent, vUv + vec2(texel.x, 0.0));
    float top    = getHeight(uCurrent, vUv + vec2(0.0, texel.y));
    float bottom = getHeight(uCurrent, vUv + vec2(0.0, -texel.y));

    // Previous temporal state
    float previous = getHeight(uPrevious, vUv);
    float current  = getHeight(uCurrent, vUv);

    // Wave equation: neighbors average * 2 - previous
    float neighbors = (left + right + top + bottom) * 0.25;
    float wave = neighbors * 2.0 - previous;

    // Viscosity: mix current state with new wave (reference approach)
    wave = mix(current, wave, uViscosity);

    // Energy decay
    wave *= uDecay;

    // Mouse injection - circular ripples with trail (reference approach)
    float velocityFactor = min(uVelocity * uMouseVelocityScale, 1.0);

    // Practical velocity threshold: ignores jitter/micro-movement, allows normal movement
    const float VELOCITY_THRESHOLD = 0.002;

    // Aspect correction for circular ripples in viewport UV space
    // viewportAspect = width / height, so we scale X to match Y physical distance
    float aspect = uViewportAspect;
    vec2 mousePos = uMouse * vec2(aspect, 1.0);
    vec2 prevMousePos = uPrevMouse * vec2(aspect, 1.0);
    vec2 uv = vUv * vec2(aspect, 1.0);

    // Only inject when explicitly moving (set by JS idle detection)
    if (uIsMoving > 0.5 && uVelocity > VELOCITY_THRESHOLD && uRadius > 0.0) {
      
      // Main circular ripple at current position
      vec2 delta = uv - mousePos;
      float dist = length(delta);
      
      // Organic edge modulation with multiple frequencies + slow temporal evolution
      float angle = atan(delta.y, delta.x);
      
      // Multiple wave frequencies for natural organic irregularity
      // Controlled by organic parameters
      float freq = uOrganicFrequency;
      float amp = uOrganicAmplitude;
      float spd = uOrganicSpeed;
      
      // Base wave (lower frequency, larger amplitude)
      float wave1 = sin(angle * (9.0 * freq) + uTime * (0.15 * spd)) * (uRadius * 0.06 * amp);
      // Higher frequency detail (smaller amplitude, faster evolution)
      float wave2 = sin(angle * (17.0 * freq) - uTime * (0.22 * spd)) * (uRadius * 0.03 * amp);
      // Very slow large-scale drift
      float wave3 = sin(angle * (4.0 * freq) + uTime * (0.05 * spd)) * (uRadius * 0.02 * amp);
      
      float organicOffset = wave1 + wave2 + wave3;
      float organicRadius = uRadius + organicOffset;
      
      float ripple = smoothstep(organicRadius, 0.0, dist);
      ripple = pow(ripple, 2.0);

      // Trail effect - interpolate between prev and current mouse
      // Use max() to blend ripples organically (reference approach)
      float stepCount = 8.0; // Fixed 8 steps for smooth trail
      for (float i = 0.0; i < stepCount; i++) {
        float t = i / stepCount;
        vec2 trailPos = mix(prevMousePos, mousePos, t);
        vec2 trailDelta = uv - trailPos;
        float d = length(trailDelta);
        // Trail uses slightly smaller radius for natural falloff
        float trailRipple = smoothstep(uRadius * 0.7, 0.0, d);
        ripple = max(ripple, pow(trailRipple, 2.0));
      }

      // Add ripple with velocity-based intensity
      float finalRipple = ripple * uIntensity * velocityFactor;
      wave += finalRipple;
    }

    gl_FragColor = vec4(wave, 0.0, 0.0, 1.0);
  }
`;

export default fluidFragment;