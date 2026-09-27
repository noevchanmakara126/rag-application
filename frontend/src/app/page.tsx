import { ChatPanel } from "@/components/chat/chat-panel"
import { getChatModels } from "@/lib/api"

export default async function HomePage() {
  // Read on the server so the picker is populated in the first paint, and
  // tolerated when it fails: a dead LLM server must not cost you the chat UI.
  // An empty list simply hides the picker and lets the backend pick LLM_MODEL.
  let models: string[] = []
  let defaultModel = ""
  try {
    const choices = await getChatModels()
    models = choices.models
    defaultModel = choices.default
  } catch {
    // /health is where an operator looks for why; the panel stays usable.
  }

  return (
    <div className="pt-6">
      <ChatPanel models={models} defaultModel={defaultModel} />
    </div>
  )
}
