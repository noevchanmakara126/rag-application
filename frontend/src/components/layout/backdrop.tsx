"use client"

import dynamic from "next/dynamic"

import { AuroraBackground } from "@/components/layout/aurora-background"

// WebGL has no meaning on the server, and importing three into the RSC graph
// only makes the server bundle bigger.
const ShaderBackground = dynamic(() => import("@/components/layout/shader-background"), {
  ssr: false,
})

export function Backdrop() {
  return (
    <>
      <AuroraBackground />
      <ShaderBackground />
    </>
  )
}
