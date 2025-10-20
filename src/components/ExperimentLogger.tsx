import React, { useState, useRef } from "react";
import Papa from "papaparse";
import { saveAs } from "file-saver";

interface LogEvent {
  timestamp: number;
  eventType: string;
  [key: string]: any;
}

interface SessionInfo {
  participantId: string;
  scenario: string;
  condition: string;
}

interface ExperimentLoggerProps {
  onSessionStart: (session: SessionInfo) => void;
}

// ✅ Paste your Google Sheets API URL here
const GOOGLE_SHEETS_API =
  "https://script.google.com/macros/s/AKfycbzC1mDQLzOdUos_VS1BvzErNYdwd1hagh7Y7dHhS98Lwx9Ko2QNpOuP7AjWm3Wi9uyv/exec";

const SCENARIOS = ["Highway", "Urban"];
const CONDITIONS = ["Baseline", "Retrieval"];

const ExperimentLogger: React.FC<ExperimentLoggerProps> = ({ onSessionStart }) => {
  const [participantId, setParticipantId] = useState("");
  const [scenario, setScenario] = useState("");
  const [condition, setCondition] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");

  const logsRef = useRef<LogEvent[]>([]);
  const sessionRef = useRef<SessionInfo | null>(null);

  /** 🔹 Log utility */
  const logEvent = (eventType: string, data: Record<string, any> = {}) => {
    const log: LogEvent = {
      timestamp: parseFloat(performance.now().toFixed(2)),
      eventType,
      ...data,
    };
    logsRef.current.push(log);
    console.log("LOG:", log);
  };

  /** 🔹 Upload data to Google Sheets */
  const uploadToGoogleSheets = async (session: SessionInfo, logs: LogEvent[]) => {
    if (!session) {
      alert("⚠️ No active session found.");
      return;
    }
    setUploadStatus("uploading");
    try {
      const response = await fetch(GOOGLE_SHEETS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, logs }),
      });

      if (!response.ok) throw new Error("Upload failed");

      console.log("✅ Logs successfully uploaded to Google Sheets");
      setUploadStatus("success");
      alert("✅ Data uploaded successfully to Google Sheets!");
    } catch (err) {
      console.error("❌ Upload error:", err);
      setUploadStatus("error");
      alert("❌ Failed to upload logs. Check console for details.");
    }
  };

  /** 🔹 Start participant session */
  const startSession = () => {
    if (!participantId || !scenario || !condition) {
      alert("⚠️ Please fill in all fields before starting.");
      return;
    }

    const session = { participantId, scenario, condition };
    sessionRef.current = session;
    logEvent("session_start", session);
    localStorage.setItem("participantSession", JSON.stringify(session));
    localStorage.setItem("cachedLogs", JSON.stringify(logsRef.current));
    
    // ✅ Instantly tell Header to recheck localStorage
    window.dispatchEvent(new Event("storage"));
    

    setIsRunning(true);
    onSessionStart(session);
  };

  /** 🔹 End session and upload */
  const endAndUploadSession = () => {
    if (!sessionRef.current) return;
    logEvent("session_end");
    uploadToGoogleSheets(sessionRef.current, logsRef.current);
  };

  /** 🔹 Local CSV backup */
  const exportLogsLocally = () => {
    if (!sessionRef.current) return;
    const csv = Papa.unparse(logsRef.current);
    const filename = `${sessionRef.current.participantId}_${sessionRef.current.scenario}_${sessionRef.current.condition}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, filename);
  };

  // ✅ --- UI STARTS HERE ---
  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-slate-50 to-blue-100 p-6">
      {/* 🔹 HEADER BAR */}
      <div className="w-full flex justify-between items-center bg-blue-600 text-white p-3 rounded-lg shadow mb-6 max-w-md">
        <h2 className="text-lg font-semibold">📊 UAV Experiment Logger</h2>

        {sessionRef.current && (
          <button
            onClick={() =>
              uploadToGoogleSheets(sessionRef.current!, logsRef.current)
            }
            className="bg-white text-blue-700 font-semibold px-3 py-1 rounded-md hover:bg-blue-100 transition duration-200"
          >
            ☁️ Upload to Google Sheets
          </button>
        )}
      </div>

      {/* 🔹 MAIN CARD */}
      <div className="bg-white shadow-2xl rounded-2xl p-8 max-w-md w-full border border-gray-200">
        <h1 className="text-2xl font-bold text-blue-700 mb-4 text-center">
          🧭 Start Participant Session
        </h1>

        <p className="text-gray-600 text-sm mb-6 text-center leading-relaxed">
          Welcome to the UAV Control Experiment.
          <br />
          Please enter participant information below. Once started, the system
          logs automatically. You can upload logs anytime using the button above.
        </p>

        {/* 🔹 INPUT SECTION */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Participant ID
            </label>
            <input
              type="text"
              placeholder="e.g. P01"
              className="border border-gray-300 rounded-lg w-full p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scenario
            </label>
            <select
              className="border border-gray-300 rounded-lg w-full p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              <option value="">Select Scenario</option>
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Condition
            </label>
            <select
              className="border border-gray-300 rounded-lg w-full p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            >
              <option value="">Select Condition</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 🔹 BUTTONS */}
          {!isRunning ? (
            <button
              onClick={startSession}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition duration-200"
            >
              🚀 Start Session
            </button>
          ) : (
            <>
              <button
                onClick={endAndUploadSession}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition duration-200"
              >
                💾 Finish & Upload
              </button>

              <button
                onClick={exportLogsLocally}
                className="mt-2 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition duration-200"
              >
                ⬇️ Backup Locally (CSV)
              </button>
            </>
          )}
        </div>

        {/* 🔹 UPLOAD STATUS */}
        {uploadStatus !== "idle" && (
          <div className="text-center mt-4 text-sm">
            {uploadStatus === "uploading" && (
              <p className="text-blue-600">⏳ Uploading to Google Sheets...</p>
            )}
            {uploadStatus === "success" && (
              <p className="text-green-600">✅ Upload successful!</p>
            )}
            {uploadStatus === "error" && (
              <p className="text-red-600">❌ Upload failed. Try again.</p>
            )}
          </div>
        )}

        <footer className="text-xs text-gray-400 mt-6 text-center">
          Data is automatically logged and can be uploaded anytime.
        </footer>
      </div>
    </div>
  );
};

export default ExperimentLogger;
