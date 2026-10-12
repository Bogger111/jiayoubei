"use client";

import { useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

const dispose = (recognition: Recognition) => {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  try {
    recognition.abort();
  } catch {
    /* The browser may already have closed the microphone. */
  }
};

export function useSpeechInput(onText: (text: string) => void | boolean) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const callbackRef = useRef(onText);
  useEffect(() => {
    callbackRef.current = onText;
  }, [onText]);
  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      if (recognition) dispose(recognition);
      recognitionRef.current = null;
      stopRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );
  const startVoice = () => {
    if (recognitionRef.current) {
      stopRef.current?.();
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Constructor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    setVoiceError("");
    if (!Constructor) {
      setVoiceError("当前浏览器不支持语音输入，请直接输入文字。");
      return;
    }
    let recognition: Recognition;
    try {
      recognition = new Constructor();
    } catch {
      setVoiceError("无法开启语音输入，请检查权限后重试。");
      return;
    }
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    const finish = (abort = false) => {
      if (recognitionRef.current !== recognition) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      recognitionRef.current = null;
      stopRef.current = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (abort) dispose(recognition);
      setListening(false);
    };
    const stop = () => {
      if (recognitionRef.current !== recognition) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      try {
        recognition.stop();
      } catch {
        finish(true);
        return;
      }
      if (recognitionRef.current === recognition)
        timeoutRef.current = setTimeout(() => finish(true), 750);
    };
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join("")
        .trim();
      if (text && (text.length > 4000 || callbackRef.current(text) === false))
        setVoiceError("内容超过 4000 字，已保留现有文字，请分段输入。");
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const messages: Record<string, string> = {
        "not-allowed": "未获得麦克风权限，请检查浏览器权限或直接输入文字。",
        "audio-capture": "没有可用的麦克风，请直接输入文字。",
        "no-speech": "没有识别到声音，可以再试一次。",
        network: "语音服务连接失败，请直接输入文字。",
      };
      if (event.error !== "aborted")
        setVoiceError(
          messages[event.error] ?? "语音识别未完成，请重试或输入文字。",
        );
      finish(true);
    };
    recognition.onend = () => {
      finish();
    };
    try {
      recognitionRef.current = recognition;
      stopRef.current = stop;
      setListening(true);
      recognition.start();
      if (recognitionRef.current === recognition)
        timeoutRef.current = setTimeout(stop, 25_000);
    } catch {
      finish(true);
      setVoiceError("无法开启语音输入，请检查权限后重试。");
    }
  };
  return { listening, voiceError, startVoice };
}
