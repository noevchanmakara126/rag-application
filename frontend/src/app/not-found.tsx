import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl font-semibold tracking-tight text-brand-300">404</p>
      <p className="text-sm text-muted-foreground">That page does not exist.</p>
      <Button asChild size="sm">
        <Link href="/">Back to the chat</Link>
      </Button>
    </div>
  )
}
