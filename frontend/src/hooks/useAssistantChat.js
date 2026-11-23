import { useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { assistantApi, apiError } from "../services/api";
import { useAsyncResource } from "./useAsyncResource";

let assistantMessageSequence = 0;

function nextAssistantMessageId(prefix) {
  assistantMessageSequence += 1;
  return `${prefix}-${Date.now()}-${assistantMessageSequence}`;
}

export function useAssistantChat() {
  const [localMessages, setLocalMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const history = useAsyncResource(
    async () => ((await assistantApi.history()).messages ?? []).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      sources: message.sources,
    })),
    [],
    { initialData: [], fallback: "Could not load your chat history." },
  );

  const messages = useMemo(() => [...(history.data ?? []), ...localMessages], [history.data, localMessages]);

  const send = async (suggested) => {
    const text = (suggested ?? draft).trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setLocalMessages((current) => [
      ...current,
      { id: nextAssistantMessageId("local"), role: "user", content: text },
    ]);
    setDraft("");
    setSending(true);
    setError(null);
    try {
      const response = await assistantApi.chat({ message: text });
      setLocalMessages((current) => [
        ...current,
        {
          id: response.id ?? nextAssistantMessageId("reply"),
          role: "assistant",
          content: response.reply,
          sources: response.sources,
          schemaValidated: response.schema_validated,
        },
      ]);
    } catch (requestError) {
      const message = apiError(requestError, "The assistant could not answer right now.");
      toast.error(message);
      setError(message);
      setLocalMessages((current) => [
        ...current,
        {
          id: nextAssistantMessageId("error"),
          role: "assistant",
          error: true,
          content:
            "I could not reach the AirAware reasoning service. Your readings are unaffected — please try again in a moment.",
        },
      ]);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const retry = () => {
    const lastQuestion = [...messages].reverse().find((message) => message.role === "user");
    setLocalMessages((current) => current.filter((message) => message.id !== lastQuestion?.id && !message.error));
    if (lastQuestion) send(lastQuestion.content);
  };

  const validated = Boolean([...messages].reverse().find((message) => message.role === "assistant" && !message.error)?.schemaValidated);

  return { messages, draft, setDraft, sending, error, send, retry, validated, history };
}

export default useAssistantChat;
