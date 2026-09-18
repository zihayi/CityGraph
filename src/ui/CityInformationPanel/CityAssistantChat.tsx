import { Bot, KeyRound, Send, Sparkles, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { TranslationKey } from "../../i18n";
import type { CityAssistantMessage } from "../../services/CityAssistantService";

interface Props {
  messages: readonly CityAssistantMessage[];
  configured: boolean;
  busy: boolean;
  error?: string;
  onAsk(question: string): void;
  onConfigure(): void;
  t(key: TranslationKey): string;
}

const suggestionKeys = ["assistant.suggestion.overview", "assistant.suggestion.universities", "assistant.suggestion.companies", "assistant.suggestion.transport"] as const;

export function CityAssistantChat({ messages, configured, busy, error, onAsk, onConfigure, t }: Props) {
  const [question, setQuestion] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, busy]);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = question.trim();
    if (!value || busy || !configured) return;
    setQuestion("");
    onAsk(value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return <div className="city-assistant-chat">
    <header className="assistant-intro"><span><Bot size={22}/></span><div><strong>{t("assistant.title")}</strong><p>{t("assistant.subtitle")}</p></div></header>
    {!configured ? <div className="assistant-setup"><KeyRound size={26}/><strong>{t("assistant.setupTitle")}</strong><p>{t("assistant.setupHint")}</p><button type="button" onClick={onConfigure}>{t("assistant.configure")}</button></div> : <>
      <div className="assistant-messages" aria-live="polite">
        {messages.length === 0 && <div className="assistant-welcome"><Sparkles size={20}/><p>{t("assistant.welcome")}</p><div>{suggestionKeys.map((key) => <button key={key} type="button" onClick={() => onAsk(t(key))}>{t(key)}</button>)}</div></div>}
        {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`assistant-message is-${message.role}`}><span>{message.role === "assistant" ? <Bot size={15}/> : <UserRound size={15}/>}</span><p>{message.content}</p></article>)}
        {busy && <article className="assistant-message is-assistant is-thinking"><span><Bot size={15}/></span><p>{t("assistant.thinking")}</p></article>}
        {error && <p className="assistant-error" role="alert">{error}</p>}
        <div ref={endRef}/>
      </div>
      <form className="assistant-composer" onSubmit={submit}>
        <textarea rows={2} maxLength={1000} value={question} placeholder={t("assistant.placeholder")} aria-label={t("assistant.placeholder")} disabled={busy} onChange={(event) => setQuestion(event.target.value)} onKeyDown={onKeyDown}/>
        <button type="submit" disabled={busy || !question.trim()} title={t("assistant.send")} aria-label={t("assistant.send")}><Send size={16}/></button>
        <small>{t("assistant.groundingHint")}</small>
      </form>
    </>}
  </div>;
}
