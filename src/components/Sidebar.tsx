import React from 'react';

interface Detection {
  id: string;
  type: string;
  time: string;
}

interface SidebarProps {
  missionInfo?: {
    id: string;
    title: string;
  };
  uavStatus?: {
    battery: number;
    gps: string;
    link: string;
  };
  detections: Detection[];
  onLaunch: () => void;
  onReturn: () => void;
  onEmergencyStop: () => void;
}

export default function Sidebar({
  missionInfo = { id: 'UAV-734', title: 'On-going Mission' },
  uavStatus = { battery: 80, gps: '48.76° N, 11.42° E', link: 'Strong' },
  detections = [],
  onLaunch,
  onReturn,
  onEmergencyStop,
}: SidebarProps) {
  return (
    <aside className="w-96 bg-[#111a22] p-4 flex flex-col gap-6 overflow-y-auto font-display">
      {/* ---- UAV Header ---- */}
      <div className="flex items-center gap-3">
        <div
          className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-12"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=100&q=60")',
          }}
        ></div>
        <div>
          <h1 className="text-white text-lg font-bold">{missionInfo.id}</h1>
          <p className="text-[#92adc9] text-sm">{missionInfo.title}</p>
        </div>
      </div>

      {/* ---- Mission Control ---- */}
      <div className="flex flex-col gap-4">
        <h2 className="text-white text-base font-semibold">Mission Control</h2>
        <div className="flex flex-col gap-3">
          <button
            onClick={onLaunch}
            className="flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold"
          >
            <span className="material-symbols-outlined mr-2">rocket_launch</span>
            Launch UAV
          </button>
          <button
            onClick={onReturn}
            className="flex items-center justify-center rounded-lg h-12 px-5 bg-[#233648] text-white text-base font-bold"
          >
            <span className="material-symbols-outlined mr-2">home</span>
            Return to Base
          </button>
        </div>
      </div>

      {/* ---- UAV Status ---- */}
      <div className="flex flex-col gap-4">
        <h2 className="text-white text-base font-semibold">UAV Status</h2>
        <div className="flex flex-col gap-4 p-4 bg-[#192633] rounded-lg">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <p className="text-white text-sm font-medium">Battery</p>
              <p className="text-white text-sm font-normal">{uavStatus.battery}%</p>
            </div>
            <div className="rounded bg-[#324d67]">
              <div
                className="h-2 rounded bg-primary"
                style={{ width: `${uavStatus.battery}%` }}
              ></div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-white">signal_cellular_alt</span>
              <p className="text-white text-sm font-medium">Link Strength</p>
            </div>
            <p className="text-green-400 text-sm font-semibold">{uavStatus.link}</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-white">location_on</span>
              <p className="text-white text-sm font-medium">GPS</p>
            </div>
            <p className="text-[#92adc9] text-sm">{uavStatus.gps}</p>
          </div>
        </div>
      </div>

      {/* ---- Detection Feed ---- */}
      <div className="flex flex-col gap-4">
        <h2 className="text-white text-base font-semibold">Detection Feed</h2>
        <div className="flex flex-col gap-2">
          {detections.length === 0 ? (
            <p className="text-[#92adc9] text-sm italic">
              No detections yet — waiting for UAV feed...
            </p>
          ) : (
            detections.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-4 bg-[#233648] px-4 min-h-[72px] py-3 justify-between rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center rounded-lg shrink-0 size-10 ${
                      d.type === 'fire'
                        ? 'bg-[#2c1d1f]'
                        : d.type === 'person'
                        ? 'bg-[#2c291d]'
                        : 'bg-[#1d262c]'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined ${
                        d.type === 'fire'
                          ? 'text-red-500'
                          : d.type === 'person'
                          ? 'text-yellow-500'
                          : 'text-blue-400'
                      }`}
                    >
                      {d.type === 'fire'
                        ? 'local_fire_department'
                        : d.type === 'person'
                        ? 'person'
                        : 'traffic'}
                    </span>
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-white text-sm font-medium line-clamp-1">
                      {d.type === 'fire'
                        ? 'Fire Detected'
                        : d.type === 'person'
                        ? 'Person Detected'
                        : 'Roadblock Identified'}
                    </p>
                    <p className="text-[#92adc9] text-xs">{d.time}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="p-1.5 rounded-md hover:bg-primary/20">
                    <span className="material-symbols-outlined text-white text-base">done</span>
                  </button>
                  <button className="p-1.5 rounded-md hover:bg-primary/20">
                    <span className="material-symbols-outlined text-white text-base">close</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ---- Situation Summary ---- */}
      <div className="flex flex-col gap-4">
        <h2 className="text-white text-base font-semibold">Situation Summary</h2>
        <div className="flex flex-col gap-3">
          <textarea
            className="form-textarea w-full min-h-[120px] resize-none rounded-lg text-white focus:ring-2 focus:ring-primary border-none bg-[#192633] placeholder:text-[#92adc9] text-sm"
            placeholder="Add summary notes here..."
          />
          <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-[#233648] text-white text-sm font-bold">
            <span className="material-symbols-outlined mr-2">summarize</span>
            Generate Report
          </button>
        </div>
      </div>

      <div className="flex-grow" />

      {/* ---- Emergency Stop ---- */}
      <button
        onClick={onEmergencyStop}
        className="flex items-center justify-center rounded-lg h-12 px-5 bg-red-600 text-white text-base font-bold"
      >
        <span className="material-symbols-outlined mr-2">pan_tool</span>
        Emergency Stop
      </button>
    </aside>
  );
}
