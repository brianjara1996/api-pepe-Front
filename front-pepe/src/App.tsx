import { FormEvent, useEffect, useRef, useState } from "react";
import "./App.css";

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:8088";
const REQUEST_TIMEOUT_MS = 20000;
const ITALIAN_TECHNICAL_ISSUE_MESSAGE =
  "In questo momento non sono disponibile per problemi tecnici.";
const ITALIAN_SLOW_SEARCH_MESSAGE =
  "Sto cercando su internet, ma ci sta mettendo troppo. Riprova tra qualche secondo.";

type PepeStatus = "idle" | "listening" | "thinking" | "speaking";

type ProcessResponse = {
  replyText?: string;
  message?: string;
  audioBase64?: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void | Promise<void>) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void | Promise<void>) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type BrowserWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  webkitAudioContext?: typeof AudioContext;
};

function getSpeechRecognitionConstructor() {
  const browserWindow = window as BrowserWindow;
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
}


export default function App() {
  const [text, setText] = useState("");
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState<PepeStatus>("idle");
  const [isConversationActive, setIsConversationActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stopRequestedRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;

      if (restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current);
      }

      recognitionRef.current?.stop();
    };
  }, []);

  async function processMessage(message: string) {
    const cleanedMessage = message.trim();
    if (!cleanedMessage) return;

    setStatus("thinking");
    setErrorMessage("");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const slowMessageIntervalId = window.setInterval(() => {
      setResponse(ITALIAN_SLOW_SEARCH_MESSAGE);
    }, 5000);

    try {
      const res = await fetch(`${BACKEND_URL}/api/text/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: cleanedMessage,
          profileName: "Brian",
          familyTarget: "Jara",
        }),
      });

      const data = (await res.json()) as ProcessResponse;

      if (!res.ok) {
        throw new Error(data?.message || "Error del backend");
      }

      const nextResponse = data.replyText?.trim() || "";
      setResponse(nextResponse);
      await speakResponse(nextResponse, data.audioBase64);
    } catch (error) {
      const messageText =
        error instanceof Error && error.name === "AbortError"
          ? "Tiempo de espera agotado. Revisa backend/red y vuelve a intentar."
          : "Error al conectar con el backend.";

      console.error(error);
      setErrorMessage(messageText);
      setResponse(ITALIAN_TECHNICAL_ISSUE_MESSAGE);
      setIsConversationActive(false);
      stopRequestedRef.current = true;
    } finally {
      window.clearTimeout(timeoutId);
      window.clearInterval(slowMessageIntervalId);
    }
  }

  function startConversation() {
    setErrorMessage("");
    stopRequestedRef.current = false;
    setIsConversationActive(true);
    startListeningWithDelay(300);
  }

  function stopConversation() {
    stopRequestedRef.current = true;
    setIsConversationActive(false);
    setStatus("idle");

    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    recognitionRef.current?.stop();
  }

  function startListeningWithDelay(delayMs = 700) {
    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
    }

    restartTimeoutRef.current = window.setTimeout(() => {
      if (!stopRequestedRef.current) {
        startListening();
      }
    }, delayMs);
  }

  function playBeep() {
    try {
      const browserWindow = window as BrowserWindow;
      const AudioContextClass = window.AudioContext || browserWindow.webkitAudioContext;

      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.15, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);

      oscillator.onended = () => {
        audioContext.close();
      };
    } catch (error) {
      console.warn("No fue posible reproducir beep.", error);
    }
  }

  function startListening() {
    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!SpeechRecognition) {
      setErrorMessage("Tu navegador no soporta reconocimiento de voz.");
      setStatus("idle");
      setIsConversationActive(false);
      return;
    }

    if (stopRequestedRef.current) return;

    setStatus("listening");
    playBeep();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = "it-IT";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let finalTranscript = "";
    let lastInterimText = "";
    let silenceTimer: number | null = null;
    let handledResult = false;

    function clearSilenceTimer() {
      if (silenceTimer) {
        window.clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    }

    function resetSilenceTimer() {
      clearSilenceTimer();
      silenceTimer = window.setTimeout(() => {
        recognition.stop();
      }, 1800);
    }

    recognition.onstart = resetSilenceTimer;
    recognition.onaudiostart = resetSilenceTimer;
    recognition.onsoundstart = resetSilenceTimer;
    recognition.onspeechstart = resetSilenceTimer;

    recognition.onresult = (event) => {
      resetSilenceTimer();

      let interim = "";
      let finalPart = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcriptPiece = result[0]?.transcript || "";

        if (result.isFinal) {
          finalPart += transcriptPiece;
        } else {
          interim += transcriptPiece;
        }
      }

      if (finalPart) {
        finalTranscript += finalPart;
      }

      const shownText = `${finalTranscript}${interim}`.trim();
      lastInterimText = shownText;
      setText(shownText);
    };

    recognition.onspeechend = () => {
      clearSilenceTimer();
      silenceTimer = window.setTimeout(() => {
        recognition.stop();
      }, 900);
    };

    recognition.onerror = (event) => {
      console.warn("SpeechRecognition error:", event?.error);
      clearSilenceTimer();

      if (stopRequestedRef.current) {
        setStatus("idle");
        return;
      }

      if (
        event?.error === "no-speech" ||
        event?.error === "aborted" ||
        event?.error === "audio-capture"
      ) {
        startListeningWithDelay(700);
        return;
      }

      setErrorMessage("Error detectando audio. Vuelve a intentarlo.");
      setStatus("idle");
    };

    recognition.onend = async () => {
      clearSilenceTimer();

      if (handledResult) return;

      const spokenText = (finalTranscript || lastInterimText || "").trim();

      if (spokenText && !stopRequestedRef.current) {
        handledResult = true;
        setText(spokenText);
        await processMessage(spokenText);
        return;
      }

      if (!stopRequestedRef.current) {
        startListeningWithDelay(700);
      } else {
        setStatus("idle");
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.warn("No se pudo iniciar recognition; reintento.", error);
      startListeningWithDelay(1000);
    }
  }

  async function playAudioBase64(audioBase64: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!audioBase64.trim()) {
        resolve(false);
        return;
      }

      const dataUrl = `data:audio/mpeg;base64,${audioBase64.trim()}`;
      const audio = new Audio(dataUrl);
      audio.preload = "auto";

      const cleanup = (ok: boolean) => {
        audio.onended = null;
        audio.onerror = null;
        resolve(ok);
      };

      audio.onended = () => cleanup(true);
      audio.onerror = () => cleanup(false);

      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => cleanup(false));
      }
    });
  }

  async function speakResponse(_message: string, audioBase64?: string): Promise<void> {
    if (audioBase64) {
      setStatus("speaking");
      const played = await playAudioBase64(audioBase64);

      if (played) {
        if (!stopRequestedRef.current) {
          startListeningWithDelay(1400);
        } else {
          setStatus("idle");
        }
        return;
      }
    }

    if (!stopRequestedRef.current) {
      startListeningWithDelay(700);
    } else {
      setStatus("idle");
    }
  }

  function handleManualSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    stopRequestedRef.current = true;
    setIsConversationActive(false);
    void processMessage(text);
  }

  function getStatusLabel() {
    switch (status) {
      case "listening":
        return "Pepe te escucha...";
      case "thinking":
        return "Pepe está pensando...";
      case "speaking":
        return "Pepe te responde...";
      default:
        return "Pepe está listo";
    }
  }

  return (
    <main className="app">
      <h1 className="title">Peppe 👴</h1>
      <p className="status">{getStatusLabel()}</p>

      <button
        onClick={isConversationActive ? stopConversation : startConversation}
        className={`conversation-button ${isConversationActive ? "stop" : "start"}`}
      >
        {isConversationActive ? "⏹ Detener conversación" : "🎤 Hablar con Pepe"}
      </button>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <form className="editor" onSubmit={handleManualSend}>
        <textarea
          placeholder="Última frase escuchada..."
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Mensaje para Pepe"
        />
        <button type="submit" className="manual-send" disabled={!text.trim() || status === "thinking"}>
          Enviar texto
        </button>
      </form>

      <h2 className="subtitle">Respuesta</h2>
      <section className="response-card">{response || "Pepe te responderá aquí"}</section>

      <small className="footnote">Backend actual: {BACKEND_URL}</small>
    </main>
  );
}
