/**
 * Static CSS colour fields, painted behind the WebGL canvas.
 *
 * This is the floor, not a fallback nobody sees: it covers the frames before
 * the shader compiles, and it is the whole background when WebGL is
 * unavailable or reduced motion is on. Purely decorative, so it is hidden from
 * assistive tech.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-background">
      <div className="absolute -top-[20vh] -left-[10vw] h-[70vh] w-[70vw] rounded-full bg-brand-200/55 blur-[110px] animate-drift-a" />
      <div className="absolute top-[30vh] -right-[15vw] h-[65vh] w-[65vw] rounded-full bg-brand-300/45 blur-[120px] animate-drift-b" />
      <div className="absolute -bottom-[25vh] left-[20vw] h-[60vh] w-[60vw] rounded-full bg-brand-100/70 blur-[100px] animate-drift-c" />
    </div>
  )
}
