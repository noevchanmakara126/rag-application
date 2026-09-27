"use client"

import dynamic from "next/dynamic"

import { AuroraBackground } from "@/components/layout/aurora-background"
import { WebGLBoundary } from "@/components/layout/webgl-boundary"

// WebGL has no meaning on the server, and importing three into the RSC graph
// only makes the server bundle bigger.
const ShaderBackground = dynamic(() => import("@/components/layout/shader-background"), {
  ssr: false,
})

export function Backdrop() {
  return (
    <>
      <AuroraBackground />
      <WebGLBoundary>
        <ShaderBackground />
      </WebGLBoundary>
    </>
  )
}
