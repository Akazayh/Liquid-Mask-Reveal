const revealFragment = `
  uniform sampler2D uBaseTexture;
  uniform sampler2D uRevealTexture;
  uniform sampler2D uDisplacement;
  uniform vec2 uResolution;
  uniform vec2 uSimResolution;
  uniform vec2 uBaseAspect;
  uniform vec2 uRevealAspect;
  uniform float uRevealSize;
  uniform float uEdgeSoftness;
  uniform float uDistortionStrength;
  uniform float uNormalStrength;
  uniform float uLightIntensity;
  uniform float uSpecularPower;
  uniform float uFresnelFactor;
  uniform float uChromaticStrength;
  uniform float uSpectralIntensity;
  uniform float uSpectralGlow;
  uniform float uSpectralWidth;
  uniform float uTime;

  varying vec2 vUv;

  // Cover UV - equivalent to object-fit: cover
  vec2 coverUv(vec2 uv, float imageAspect, float planeAspect) {
    vec2 ratio = vec2(
      min(planeAspect / imageAspect, 1.0),
      min(imageAspect / planeAspect, 1.0)
    );
    return vec2(
      uv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      uv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );
  }

  // Compute normal from heightfield using finite differences
  vec3 computeNormal(vec2 uv) {
    vec2 texel = 1.0 / uSimResolution;

    float left   = texture2D(uDisplacement, uv + vec2(-texel.x, 0.0)).r;
    float right  = texture2D(uDisplacement, uv + vec2(texel.x, 0.0)).r;
    float top    = texture2D(uDisplacement, uv + vec2(0.0, texel.y)).r;
    float bottom = texture2D(uDisplacement, uv + vec2(0.0, -texel.y)).r;

    vec3 normal;
    normal.x = (left - right) * uNormalStrength;
    normal.y = (bottom - top) * uNormalStrength;
    normal.z = 1.0;

    return normalize(normal);
  }

  // 7-color spectral palette for the rainbow edge
  vec3 spectralColor(float phase) {
    // Phase wraps 0-1 around the circle
    // 7 bands: RED, ORANGE, YELLOW, GREEN, BLUE, INDIGO, VIOLET
    float p = fract(phase);
    
    // Smooth transitions between 7 spectral bands
    vec3 color = vec3(0.0);
    
    // RED (0/7) -> ORANGE (1/7)
    float t1 = smoothstep(0.0, 1.0/7.0, p) * (1.0 - smoothstep(1.0/7.0, 2.0/7.0, p));
    color += vec3(1.0, 0.5 * p * 7.0, 0.0) * t1;
    
    // ORANGE (1/7) -> YELLOW (2/7)
    float t2 = smoothstep(1.0/7.0, 2.0/7.0, p) * (1.0 - smoothstep(2.0/7.0, 3.0/7.0, p));
    color += vec3(1.0, 0.5 + 0.5 * (p * 7.0 - 1.0), 0.0) * t2;
    
    // YELLOW (2/7) -> GREEN (3/7)
    float t3 = smoothstep(2.0/7.0, 3.0/7.0, p) * (1.0 - smoothstep(3.0/7.0, 4.0/7.0, p));
    color += vec3(1.0 - (p * 7.0 - 2.0), 1.0, 0.0) * t3;
    
    // GREEN (3/7) -> BLUE (4/7)
    float t4 = smoothstep(3.0/7.0, 4.0/7.0, p) * (1.0 - smoothstep(4.0/7.0, 5.0/7.0, p));
    color += vec3(0.0, 1.0 - (p * 7.0 - 3.0), p * 7.0 - 3.0) * t4;
    
    // BLUE (4/7) -> INDIGO (5/7)
    float t5 = smoothstep(4.0/7.0, 5.0/7.0, p) * (1.0 - smoothstep(5.0/7.0, 6.0/7.0, p));
    color += vec3(0.0, 1.0 - (p * 7.0 - 4.0), 1.0) * t5;
    
    // INDIGO (5/7) -> VIOLET (6/7)
    float t6 = smoothstep(5.0/7.0, 6.0/7.0, p) * (1.0 - smoothstep(6.0/7.0, 1.0, p));
    color += vec3((p * 7.0 - 5.0) * 0.5, 0.0, 1.0) * t6;
    
    // VIOLET (6/7) -> RED (1.0/0)
    float t7 = smoothstep(6.0/7.0, 1.0, p);
    color += vec3(0.5 + 0.5 * (p * 7.0 - 6.0), 0.0, 1.0 - (p * 7.0 - 6.0)) * t7;
    
    return color;
  }

  void main() {
    // Base and reveal image aspect ratios
    float baseAspect = uBaseAspect.x / uBaseAspect.y;
    float revealAspect = uRevealAspect.x / uRevealAspect.y;
    float planeAspect = uResolution.x / uResolution.y;

    // Sample displacement at screen UV
    float displacement = texture2D(uDisplacement, vUv).r;

    // Reveal mask: only positive displacement reveals (reference approach)
    float mask = displacement * uRevealSize;
    mask = smoothstep(0.0, uEdgeSoftness, mask);
    mask = clamp(mask, 0.0, 1.0);

    // Compute normal for distortion and lighting
    vec3 normal = computeNormal(vUv);

    // Liquid distortion offset - applied in SCREEN UV space (reference approach)
    vec2 distortion = normal.xy * uDistortionStrength;
    vec2 distortedScreenUv = vUv + distortion;

    // Apply aspect ratio correction AFTER distortion (reference approach)
    vec2 baseUv = coverUv(distortedScreenUv, baseAspect, planeAspect);
    vec2 revealUv = coverUv(distortedScreenUv, revealAspect, planeAspect);

    // Clamp UVs
    baseUv = clamp(baseUv, 0.001, 0.999);
    revealUv = clamp(revealUv, 0.001, 0.999);

    // Sample both images with distorted UVs
    vec4 baseColor = texture2D(uBaseTexture, baseUv);
    vec4 revealColor = texture2D(uRevealTexture, revealUv);

    // Composite: base -> reveal via mask
    vec3 finalColor = mix(baseColor.rgb, revealColor.rgb, mask);

    // 7-color spectral ring on the liquid edge
    if (uChromaticStrength > 0.0) {
      // Edge mask: strongest at the mask transition (50% reveal)
      // Using derivative of mask - peaks at mask=0.5
      float edge = mask * (1.0 - mask) * 4.0; // peaks at 0.5
      edge = smoothstep(0.0, uSpectralWidth, edge);
      
      // Sharpen the edge for a thinner, more defined ring
      edge = pow(edge, 1.5);
      
      // Spectral phase from angle around the ripple center
      // Creates 7 distinct color bands around the circle
      float angle = atan(normal.y, normal.x);
      float spectralPhase = angle / (2.0 * 3.14159) + 0.5; // 0 to 1 around circle
      
      // 7-color spectral palette
      vec3 spectral = spectralColor(spectralPhase);
      
      // Luminous glow - brightest at the edge, falls off
      float glow = uSpectralGlow * edge;
      
      // Combine: spectral color * intensity + glow
      // This is a PURE spectral layer - does NOT sample the image with shifted UVs
      vec3 spectralColor = spectral * uSpectralIntensity * edge;
      spectralColor += vec3(glow) * spectral; // colored glow
      
      // Add to final color (additive for luminous feel)
      // This only adds the spectral color to the edge region
      // The underlying base/reveal images remain completely untouched
      finalColor += spectralColor;
    }

    // Optional wet-surface lighting (reference approach: gated by ripple activity)
    if (uLightIntensity > 0.0) {
      float normalDeviation = length(normal.xy);
      float rippleMask = smoothstep(0.01, 0.1, normalDeviation);

      vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
      vec3 viewDir = vec3(0.0, 0.0, 1.0);
      vec3 halfDir = normalize(lightDir + viewDir);

      // Specular highlight
      float specular = pow(max(dot(normal, halfDir), 0.0), uSpecularPower);
      specular *= uLightIntensity * rippleMask;

      // Fresnel edge glow
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
      fresnel *= uLightIntensity * uFresnelFactor * rippleMask;

      finalColor += vec3(specular + fresnel);
    }

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export default revealFragment;