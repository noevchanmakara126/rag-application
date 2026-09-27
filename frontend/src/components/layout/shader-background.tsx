"use client"

import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import type { Mesh, ShaderMaterial } from "three"

/**
 * Animated WebGL backdrop: slow fractal-noise flow in the brand blues over white.
 *
 * Two deliberate constraints. It renders behind everything at low opacity, so
 * `dpr` is capped well below retina — nobody can see the difference through
 * 100px of blur, and it halves the fragment count. And with reduced motion it
 * renders exactly one frame instead of running at 60fps, which is the honest
 * reading of the preference for a purely decorative animation.
 */

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uAspect;
  uniform vec3 uPale;
  uniform vec3 uMid;
  uniform vec3 uDeep;

  // Value noise: cheap, and smooth enough that the blur hides the lattice.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      total += noise(p) * amplitude;
      p *= 2.02;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uAspect;
    float t = uTime * 0.035;

    // Domain warping: offset the lookup by another noise field so the flow
    // curls instead of sliding, which is what stops it reading as a scroll.
    vec2 warp = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 4.7));
    float field = fbm(p * 2.1 + warp * 1.3 + vec2(0.0, t * 0.6));

    vec3 color = mix(uPale, uMid, smoothstep(0.25, 0.68, field));
    color = mix(color, uDeep, smoothstep(0.62, 0.95, field) * 0.55);

    // Fade toward the edges so the canvas never shows a hard rectangle.
    float vignette = smoothstep(1.25, 0.15, length(p));
    gl_FragColor = vec4(color, vignette * 0.9);
  }
`

function Field({ animate }: { animate: boolean }) {
  const mesh = useRef<Mesh>(null)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: [1, 1] as [number, number] },
      // Sampled from the --brand-* oklch scale in globals.css, converted to
      // linear-ish sRGB triples since the shader writes gl_FragColor directly.
      uPale: { value: [0.898, 0.945, 0.996] },
      uMid: { value: [0.596, 0.788, 0.953] },
      uDeep: { value: [0.278, 0.514, 0.804] },
    }),
    [],
  )

  useFrame((state, delta) => {
    const material = mesh.current?.material as ShaderMaterial | undefined
    if (!material) return
    const { width, height } = state.size
    material.uniforms.uAspect.value = [Math.max(1, width / height), 1]
    if (animate) material.uniforms.uTime.value += delta
  })

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

export default function ShaderBackground() {
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={reducedMotion ? "demand" : "always"}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        style={{ opacity: 0.85 }}
      >
        <Field animate={!reducedMotion} />
      </Canvas>
    </div>
  )
}
