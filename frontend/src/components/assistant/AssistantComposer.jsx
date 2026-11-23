import { ArrowUp } from "lucide-react";
import { Button } from "../common/Button";
import { InlinePrompts } from "./SuggestedPrompts";

export function AssistantComposer({ draft, onDraftChange, onSend, onSuggestion, disabled, showSuggestions }) {
  return (
    <div className="border-t border-hairline p-3">
      {showSuggestions ? <InlinePrompts onSelect={onSuggestion} /> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message AirAware
        </label>
        <textarea
          id="assistant-input"
          rows={1}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="Ask about today's air, your commute or your kitchen…"
          className="max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border border-hairline bg-ink-900/80 px-3.5 py-2.5 text-[12.5px] text-slate-100 placeholder:text-slate-400 focus:border-aurora-400/60"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || disabled} aria-label="Send message">
          <ArrowUp size={16} aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}

export default AssistantComposer;
