import { Bot, User } from "lucide-react";
import { ErrorState } from "../common/ErrorState";
import { cn } from "../../lib/utils";
import { SourceCitationList } from "./SourceCitationList";

function Message({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "")}>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
          isUser
            ? "border-white/10 bg-white/8 text-slate-300"
            : "border-aurora-400/25 bg-aurora-400/10 text-aurora-300",
        )}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </span>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed",
          isUser
            ? "bg-aurora-400/15 text-aurora-100"
            : message.error
              ? "border border-verypoor/25 bg-verypoor/[0.06] text-verypoor/90"
              : "border border-hairline bg-ink-900/70 text-slate-300",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <SourceCitationList sources={message.sources} />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5" aria-label="Assistant is replying" role="status">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-aurora-400/25 bg-aurora-400/10 text-aurora-300"
      >
        <Bot size={13} />
      </span>
      <div className="flex items-center gap-1 rounded-2xl border border-hairline bg-ink-900/70 px-3.5 py-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-aurora-400/70"
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChatMessageList({ messages, historyError, historyLoading, onRetryHistory, sending, locationName }) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-relevant="additions">
      {historyError ? <ErrorState message={historyError} onRetry={onRetryHistory} retryLabel="Retry history" /> : null}
      {!messages.length && !historyError && !historyLoading ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-aurora-400/25 bg-aurora-400/10 text-aurora-300"
          >
            <Bot size={20} />
          </span>
          <div>
            <p className="text-[13.5px] font-medium text-slate-200">Ask about your air</p>
            <p role="status" className="mt-1 max-w-xs text-[11.5px] leading-relaxed text-slate-400">
              I can see today's reading for {locationName}, your commute mode and your household profile.
            </p>
          </div>
        </div>
      ) : null}
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {sending ? <TypingIndicator /> : null}
    </div>
  );
}

export default ChatMessageList;
