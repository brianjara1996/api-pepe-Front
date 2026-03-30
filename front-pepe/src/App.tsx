import { useRef, useState } from "react";

const BACKEND_URL = "http://localhost:8088";

type PepeStatus = "idle" | "listening" | "thinking" | "speaking";

export default function App() {
  const [text, setText] = useState("");
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState<PepeStatus>("idle");
  const [isConversationActive, setIsConversationActive] = useState(false);

  const recognitionRef = useRef<any>(null);
  const stopRequestedRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);

  async function processMessage(message: string) {
    if (!message) return;

    setStatus("thinking");

    try {
      const res = await fetch(`${BACKEND_URL}/api/text/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: message,
          profileName: "Brian",
          familyTarget: "Jara",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Errore del backend");
      }

      setResponse(data.replyText || "");
      await speakText(data.replyText || "");
    } catch (e) {
      console.error(e);
      alert("Errore chiamando il backend");
      setStatus("idle");
      setIsConversationActive(false);
    }
  }

  function startConversation() {
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

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function startListeningWithDelay(delayMs: number = 700) {
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
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;

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
    } catch (e) {
      console.warn("Beep non disponibile", e);
    }
  }

  function startListening() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Este browser no soporta reconocimiento de voz");
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
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }, 1800);
    }

    recognition.onstart = () => {
      resetSilenceTimer();
    };

    recognition.onaudiostart = () => {
      resetSilenceTimer();
    };

    recognition.onsoundstart = () => {
      resetSilenceTimer();
    };

    recognition.onspeechstart = () => {
      resetSilenceTimer();
    };

    recognition.onresult = async (event: any) => {
      resetSilenceTimer();

      let interim = "";
      let finalPart = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
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

      const shownText = (finalTranscript || "") + (interim || "");
      lastInterimText = shownText.trim();
      setText(lastInterimText);
    };

    recognition.onspeechend = () => {
      clearSilenceTimer();
      silenceTimer = window.setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }, 900);
    };

    recognition.onerror = (event: any) => {
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
    } catch (e) {
      console.warn("Recognition start failed, retrying...", e);
      startListeningWithDelay(1000);
    }
  }

  function speakText(message: string): Promise<void> {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window) || !message) {
        setStatus("idle");
        resolve();
        return;
      }

      setStatus("speaking");

      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = "it-IT";
      utterance.rate = 0.95;

      utterance.onend = () => {
        if (!stopRequestedRef.current) {
          startListeningWithDelay(1400);
        } else {
          setStatus("idle");
        }
        resolve();
      };

      utterance.onerror = () => {
        if (!stopRequestedRef.current) {
          startListeningWithDelay(1400);
        } else {
          setStatus("idle");
        }
        resolve();
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  function getStatusLabel() {
    switch (status) {
      case "listening":
        return "Pepe ti ascolta...";
      case "thinking":
        return "Pepe sta pensando...";
      case "speaking":
        return "Pepe ti risponde...";
      default:
        return "Pepe è pronto";
    }
  }

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "Arial, sans-serif",
        textAlign: "center",
        minHeight: "100vh",
        background: "#f6f6f6",
      }}
    >
      <h1 style={{ fontSize: "64px", marginBottom: "10px" }}>Peppe 👴</h1>
      <h1></h1>

      <div
        style={{
          fontSize: "28px",
          fontWeight: "bold",
          marginBottom: "30px",
          color: "#444",
        }}
      >
        {getStatusLabel()}
      </div>

      <button
        onClick={isConversationActive ? stopConversation : startConversation}
        style={{
          fontSize: "32px",
          padding: "22px 40px",
          borderRadius: "20px",
          border: "none",
          background: isConversationActive ? "#c0392b" : "#2e86de",
          color: "white",
          cursor: "pointer",
          marginBottom: "30px",
          minWidth: "320px",
        }}
      >
        {isConversationActive ? "⏹ Fermar Pepe" : "🎤 Hablar con Pepe"}
      </button>

      <div style={{ width: "80%", margin: "0 auto 30px auto" }}>
        <textarea
          placeholder="Ultima frase ascoltata..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            width: "100%",
            height: 120,
            fontSize: "28px",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #ccc",
            resize: "none",
          }}
        />
      </div>

      <h2 style={{ fontSize: "42px", marginBottom: "10px" }}>Risposta</h2>

      <div
        style={{
          width: "80%",
          margin: "0 auto",
          fontSize: "30px",
          color: "#555",
          background: "white",
          borderRadius: "16px",
          padding: "24px",
          minHeight: "80px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        }}
      >
        {response || "Pepe ti risponderà qui"}
      </div>
    </div>
  );
}