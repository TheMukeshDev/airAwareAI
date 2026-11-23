import { Button } from "../common/Button";
import { Card, CardTitle } from "../common/Card";

export const SUGGESTED_PROMPTS = [
  "Is it safe to run outside this evening?",
  "Explain today's PM2.5 in simple terms.",
  "How can I reduce exposure on my commute?",
  "What should I change in my kitchen to cut indoor smoke?",
  "Which of my habits creates the most emissions?",
];

export function InlinePrompts({ onSelect }) {
  return (
    <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto" role="group" aria-label="Suggested questions">
      {SUGGESTED_PROMPTS.slice(0, 3).map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="shrink-0 rounded-lg border border-hairline bg-ink-900/60 px-2.5 py-1.5 text-[11px] text-slate-400 hover:border-aurora-400/30 hover:text-slate-200"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

export function SuggestedPrompts({ onSelect }) {
  return (
    <Card>
      <CardTitle as="h2">Suggested questions</CardTitle>
      <div className="mt-3 space-y-1.5" role="group" aria-label="Suggested questions">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="ghost"
            onClick={() => onSelect(prompt)}
            className="w-full justify-start whitespace-normal text-left text-[11.5px] font-normal text-slate-400 hover:text-slate-200"
          >
            {prompt}
          </Button>
        ))}
      </div>
    </Card>
  );
}

export default SuggestedPrompts;
