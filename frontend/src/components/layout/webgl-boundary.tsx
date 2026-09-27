"use client"

import { Component, type ReactNode } from "react"

/**
 * Contains a decorative WebGL subtree.
 *
 * Without this, a machine that cannot create a WebGL context — hardware
 * acceleration off, a GPU on Chrome's blocklist, a VM or remote desktop, a
 * locked-down corporate profile — throws out of the Canvas during render. React
 * has no boundary to stop at, so it tears down the entire root and the page
 * becomes Next's "This page couldn't load": nothing clickable, no navigation,
 * no uploads. A purely ornamental backdrop must never be able to do that.
 *
 * Rendering `null` on failure is the whole recovery: AuroraBackground sits
 * behind this and is the real background.
 */
export class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // Reported once, not swallowed: an operator looking at the console should
    // still see why the backdrop is flat.
    console.warn("[backdrop] WebGL unavailable, falling back to the CSS background.", error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
