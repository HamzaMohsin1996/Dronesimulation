import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, ProgressBar, OverlayTrigger, Tooltip, Badge } from "react-bootstrap";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiClock,
  FiFilter,
  FiLayers,
  FiList,
  FiMapPin,
  FiPlay,
  FiVideo,
  FiUser,
} from "react-icons/fi";
import 'bootstrap/dist/css/bootstrap.min.css';
import './onboarding.css';


export default function OnboardingFlow({
  onStart,
  targetPath = '/sensor-retrieval',   // ⬅️ default landing page
}: {
  onStart?: () => void;
  targetPath?: string;
})  {
  const navigate = useNavigate();
  const [step, setStep] = useState<number>(1);

  // Practice flags
  const [didMap, setDidMap] = useState(false);
  const [didVideo, setDidVideo] = useState(false);
  const [didFilter, setDidFilter] = useState(false);
  const [didPegman, setDidPegman] = useState(false);

  const total = 5; // persona removed → 5 steps
  const allDone = didMap && didVideo && didFilter && didPegman;


  const goNext = () => setStep((s) => Math.min(total, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleStart = () => {
    localStorage.setItem('onboardingDone', '1'); // optional
    if (onStart) onStart();
    else navigate('/sensor-retrieval'); // ⬅️ go to your interface
  };
  
  return (
    <div className="container py-4 py-md-5">
      <div className="mx-auto" style={{ maxWidth: 980 }}>
        <Card className="shadow-sm border-0 fade-in">
          <Card.Body className="p-4 p-md-5">
            <Header step={step} total={total} />

            <div className="mt-3 mt-md-4">
              {step === 1 && <Welcome onNext={goNext} />}
              {step === 2 && <Overview onNext={goNext} onBack={goBack} />}
              {step === 3 && <Familiarization onNext={goNext} onBack={goBack} />}
              {step === 4 && (
                <Practice
                  onNext={goNext}
                  onBack={goBack}
                  allDone={allDone}
                  flags={{ didMap, didVideo, didFilter, didPegman }}
                  setFlags={{ setDidMap, setDidVideo, setDidFilter, setDidPegman }}
                />
              )}
              {step === 5 && <Ready onStart={handleStart} onBack={goBack} />}
            </div>
          </Card.Body>
        </Card>

     
      </div>
    </div>
  );
}

/*** Header & Utilities ***/
function Header({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="d-flex flex-column flex-md-row gap-2 align-items-md-center justify-content-between">
      <div>
        <div className="text-uppercase small text-muted">Onboarding</div>
        <h2 className="h4 h-md3 mb-0">Step {step} / {total}</h2>
      </div>
      <div className="w-100 w-md-50">
        <ProgressBar now={pct} visuallyHidden label={`${pct}%`} />
      </div>
    </div>
  );
}

function Nav({ onBack, onNext, nextDisabled }: { onBack?: () => void; onNext?: () => void; nextDisabled?: boolean }) {
  return (
    <div className="d-flex justify-content-between align-items-center mt-4">
      <div>
        {onBack && (
          <Button variant="outline-secondary" onClick={onBack} className="rounded-4">
            <FiArrowLeft className="me-1" /> Back
          </Button>
        )}
      </div>
      <div>
        {onNext && (
          <Button disabled={!!nextDisabled} onClick={onNext} className="rounded-4" variant="dark">
            Next <FiArrowRight className="ms-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Blurb({ children }: { children: React.ReactNode }) {
  return <div className="p-2 px-3 rounded-3 border bg-light mb-2 small">{children}</div>;
}

/*** Screen 1: Welcome ***/
function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <section className="content-swap">
      <h1 className="h3">Welcome to the UAV Interface Study</h1>
      <p className="text-muted">You have already signed the consent form. Please click “Next” to continue with the digital briefing.</p>

      <div className="mt-3">
        <Blurb>Thank you for taking part in this research.</Blurb>
        <Blurb>This study investigates how people interact with a UAV-based information system for monitoring emergency incidents.</Blurb>
        <Blurb>You will complete several short monitoring tasks using two versions of an interface.</Blurb>
        <Blurb>Your actions and responses will be recorded anonymously.</Blurb>
        <Blurb>This study focuses on how the system supports you — not on your personal performance.</Blurb>
      </div>

      <div className="d-flex justify-content-end mt-3">
        <Button onClick={onNext} className="rounded-4" variant="dark">
          Next <FiArrowRight className="ms-1" />
        </Button>
      </div>
    </section>
  );
}

/*** Screen 2: Overview ***/
function Overview({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <section className="content-swap">
      <h2 className="h3">What You’ll Do</h2>
      <ol className="mt-3 ps-3">
        <li className="mb-2">
          You will use <strong>two versions</strong> of the UAV interface:
          <ul className="mt-2">
            <li><em>Version A:</em> Basic map and video.</li>
            <li><em>Version B:</em> Includes timeline, re-engagement panel, event feed, filters, and map layers.</li>
          </ul>
        </li>
        <li className="mb-2">You’ll perform a few tasks such as locating information, filtering data, and identifying what changed during an incident.</li>
        <li className="mb-2">Occasionally, you’ll switch briefly to another small task — then return to continue monitoring.</li>
        <li>After each session, you’ll answer short questionnaires about your experience.</li>
      </ol>
      <p className="text-muted small">Note: You can stop at any time.</p>
      <Nav onBack={onBack} onNext={onNext} />
    </section>
  );
}

/*** Screen 3: Familiarization ***/
function Familiarization({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const tiles = useMemo(
    () => [
      { key: "map", title: "Map", icon: <FiMapPin />, text: "Shows the incident area and scanned sectors." },
      { key: "video", title: "Video panel", icon: <FiVideo />, text: "Plays UAV footage of the scene." },
      { key: "timeline", title: "Timeline", icon: <FiClock />, text: "View past events and filter by time." },
      { key: "feed", title: "Event Feed", icon: <FiList />, text: "Lists updates and can be filtered for relevance." },
      { key: "layers", title: "Map Layers", icon: <FiLayers />, text: "Show which areas were scanned." },
      { key: "pegman", title: "Pegman", icon: <FiUser />, text: "Drag to view replay video at a specific location." },
    ],
    []
  );
  return (
    <section className="content-swap">
      <h2 className="h3">Let’s Get Familiar with the Interface</h2>
      <p className="text-muted">Click each card to see a short description. Hover to view tooltips.</p>

      <div className="row g-3 mt-1">
        {tiles.map((t) => (
          <div className="col-12 col-sm-6 col-md-4" key={t.key}>
            <OverlayTrigger
              placement="top"
              overlay={<Tooltip id={`tip-${t.key}`}>{t.text}</Tooltip>}
            >
              <div className="border rounded-4 p-3 hover-lift bg-white h-100">
                <div className="d-flex align-items-center gap-2">
                  <span className="icon-chip">{t.icon}</span>
                  <div className="fw-semibold">{t.title}</div>
                </div>
                <div className="small text-muted mt-2">{t.text}</div>
              </div>
            </OverlayTrigger>
          </div>
        ))}
      </div>

      <Nav onBack={onBack} onNext={onNext} />
    </section>
  );
}

/*** Screen 4: Practice ***/
function Practice({
  onNext,
  onBack,
  allDone,
  flags,
  setFlags,
}: {
  onNext: () => void;
  onBack: () => void;
  allDone: boolean;
  flags: { didMap: boolean; didVideo: boolean; didFilter: boolean; didPegman: boolean };
  setFlags: {
    setDidMap: (v: boolean) => void;
    setDidVideo: (v: boolean) => void;
    setDidFilter: (v: boolean) => void;
    setDidPegman: (v: boolean) => void;
  };
}) {
  const { didMap, didVideo, didFilter, didPegman } = flags;
  const { setDidMap, setDidVideo, setDidFilter, setDidPegman } = setFlags;

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", "pegman");
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.getData("text/plain") === "pegman") setDidPegman(true);
  };

  return (
    <section className="content-swap">
      <h2 className="h3">Quick Practice (No Data Recorded)</h2>
      <ol className="small text-muted ps-3">
        <li>Click the map area labeled <strong>“Sector A.”</strong></li>
        <li>Open the <strong>video feed</strong> for that area.</li>
        <li>Apply a <strong>filter</strong> in the event feed (e.g., “critical events only”).</li>
        <li>Drop the <strong>Pegman</strong> icon on a scanned area to open replay mode.</li>
      </ol>

      <div className="row g-3 mt-2">
        {/* Map mock */}
        <div className="col-12 col-md-8">
          <div className="border rounded-4 overflow-hidden">
            <div className="d-flex justify-content-between align-items-center px-3 py-2 bg-light">
              <div className="d-flex align-items-center gap-2 text-muted"><FiMapPin/> Map</div>
              <Badge bg="secondary" className="bg-opacity-25 text-secondary">Mock</Badge>
            </div>
            <div className="position-relative practice-map">
              <button
                onClick={() => setDidMap(true)}
                className={`sector-btn ${didMap ? "sector-done" : ""}`}
              >
                Sector A {didMap && <FiCheck className="ms-1" />}
              </button>

              {/* Pegman drop zone */}
              <div
                onDragOver={onDragOver}
                onDrop={onDrop}
                className={`dropzone ${didPegman ? "dropzone-done" : ""}`}
              >
                {didPegman ? "Replay opened" : "Drop Pegman here"}
              </div>
            </div>
          </div>
        </div>

        {/* Right rail: Video + Filters + Pegman */}
        <div className="col-12 col-md-4 d-flex flex-column gap-3">
          <Card className="border-0 shadow-xs">
            <Card.Header className="bg-light d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-2 text-muted"><FiVideo/> Video</div>
              {!didVideo && (
                <Button size="sm" variant="outline-secondary" className="rounded-4" onClick={() => setDidVideo(true)}>
                  <FiPlay className="me-1"/> Open feed
                </Button>
              )}
            </Card.Header>
            <Card.Body className={`p-0 ${didVideo ? "video-on" : "bg-light"}`} style={{ height: 120 }}>
              {didVideo ? (
                <div className="h-100 w-100 d-grid place-items-center text-white bg-dark small">(video playing)</div>
              ) : (
                <div className="h-100 w-100 d-grid place-items-center text-muted small">Click “Open feed”</div>
              )}
            </Card.Body>
          </Card>

          <Card className="border-0 shadow-xs">
            <Card.Header className="bg-light d-flex align-items-center gap-2 text-muted"><FiFilter/> Event Filters</Card.Header>
            <Card.Body>
              <div className="d-flex flex-wrap gap-2">
                <Button size="sm" className="rounded-4" variant={didFilter ? "success" : "outline-secondary"} onClick={() => setDidFilter(true)}>Critical</Button>
                <Button size="sm" className="rounded-4" variant="outline-secondary">Movement</Button>
                <Button size="sm" className="rounded-4" variant="outline-secondary">Weather</Button>
              </div>
            </Card.Body>
          </Card>

          <Card className="border-0 shadow-xs">
            <Card.Header className="bg-light d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-2 text-muted"><FiUser/> Pegman</div>
              <small className="text-muted">Drag to map</small>
            </Card.Header>
            <Card.Body>
              <div
                draggable
                onDragStart={onDragStart}
                className={`pegman ${didPegman ? "pegman-done" : ""}`}
              >
                <FiUser className="me-1"/> Pegman
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>

      {/* Checklist */}
      <div className="row g-2 mt-3">
        <div className="col-6 col-md-3"><Pill done={didMap} label="Clicked Sector A"/></div>
        <div className="col-6 col-md-3"><Pill done={didVideo} label="Opened video"/></div>
        <div className="col-6 col-md-3"><Pill done={didFilter} label="Applied filter"/></div>
        <div className="col-6 col-md-3"><Pill done={didPegman} label="Dropped Pegman"/></div>
      </div>

      <Nav onBack={onBack} onNext={onNext} nextDisabled={false} />

    </section>
  );
}

function Pill({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`d-flex align-items-center gap-2 border rounded-4 px-3 py-2 small ${done ? "bg-success-subtle border-success text-success" : "bg-light"}`}>
      <FiCheck className={done ? "opacity-100" : "opacity-25"} />
      <span>{label}</span>
    </div>
  );
}

/*** Screen 5: Ready ***/
function Ready({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  return (
    <section className="content-swap text-center">
      <h2 className="h3">You’re Ready to Start 🚀</h2>
      <p className="text-muted">You’re now familiar with the interface. When you click <strong>“Start Study,”</strong> the main experiment will begin. You’ll receive specific tasks on-screen during each round. Please focus on accuracy and awareness — remember, it’s the system being evaluated, not you. Good luck!</p>
      <div className="d-flex justify-content-center gap-2 mt-3">
        <Button variant="outline-secondary" onClick={onBack} className="rounded-4"><FiArrowLeft className="me-1"/> Back</Button>
        <Button variant="dark" onClick={onStart} className="rounded-4">Start Study</Button>
      </div>
    </section>
  );
}

/*** Minimal CSS (place into styles/onboarding.css) ***/
/*
.fade-in { animation: fadeIn .3s ease-out; }
.content-swap { animation: slide .22s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }
@keyframes slide { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: translateY(0);} }

.hover-lift { transition: transform .15s ease, box-shadow .15s ease; }
.hover-lift:hover { transform: translateY(-2px); box-shadow: 0 .35rem .9rem rgba(0,0,0,.06); }

.icon-chip { display:inline-grid; place-items:center; width:32px; height:32px; border-radius:10px; background:#f3f4f6; }

.practice-map { height: 260px; background: linear-gradient(135deg,#f7f7f9,#eceef2); position: relative; }
.sector-btn { position:absolute; left:1rem; top:1rem; border:1px solid #ced4da; border-radius:14px; padding:.35rem .75rem; background:white; font-weight:600; }
.sector-btn:hover{ background:#f8f9fa; }
.sector-done { background:#198754; color:#fff; border-color:#157347; }

.dropzone { position:absolute; right:1rem; bottom:1rem; width:150px; height:90px; border-radius:12px; border:2px dashed #ced4da; display:grid; place-items:center; font-size:.8rem; background:rgba(255,255,255,.7); }
.dropzone-done { border-color:#198754; background:#e6f4ea; color:#146c43; }

.pegman { display:inline-flex; align-items:center; padding:.35rem .65rem; border-radius:12px; border:1px solid #ced4da; cursor:grab; user-select:none; background:white; }
.pegman:active { cursor:grabbing; }
.pegman-done { border-color:#198754; background:#e6f4ea; color:#146c43; }
*/
