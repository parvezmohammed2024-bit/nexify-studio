"use client";
import { createContext, useContext, useState, useCallback } from "react";
import type { StudioData } from "@/lib/types";
import type { Report } from "@/lib/server/data";
const Context = createContext<{
  data: StudioData;
  report: Report;
  currentProject: string;
  setCurrentProject: (id: string) => void;
  refresh: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
} | null>(null);
export async function api<T = Record<string, unknown>>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}
export function StudioProvider({
  initial,
  children,
}: {
  initial: { data: StudioData; report: Report };
  children: React.ReactNode;
}) {
  const [state, setState] = useState(initial);
  const [currentProject, setCurrentProject] = useState("");
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const refresh = useCallback(async () => {
    const result = await api<{ data: StudioData; report: Report }>(
      "/api/data",
      undefined,
      "GET",
    );
    setState(result);
  }, []);
  const notify = useCallback((text: string, error = false) => {
    setMessage({ text, error });
  }, []);
  return (
    <Context.Provider
      value={{ ...state, refresh, notify, currentProject, setCurrentProject }}
    >
      {children}
      {message && (
        <div
          role={message.error ? "alert" : "status"}
          className={`fixed bottom-6 right-6 z-[60] flex max-w-md items-start gap-4 rounded-xl border p-4 shadow-xl ${message.error ? "border-red-800 bg-[#381d2b] text-red-200" : "border-emerald-800 bg-[#12352d] text-emerald-100"}`}
        >
          <p className="text-sm leading-5">{message.text}</p>
          <button
            onClick={() => setMessage(null)}
            aria-label="Dismiss notification"
            className="text-xl leading-4"
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useStudio() {
  const state = useContext(Context);
  if (!state) throw new Error("Studio context missing");
  return state;
}
