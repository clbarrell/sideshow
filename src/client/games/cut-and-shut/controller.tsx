import "./clarity.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ControllerProps } from "../registry";
import { isCutAndShutFrame, roadGlyph, type CutAndShutFrame, type RoadCard } from "./protocol";

const SHAPE_NAMES = { straight: "Straight", bend: "Bend", junction: "Junction" } as const;

export default function CutAndShutController({ you, send, last, connected }: ControllerProps) {
  const [frame, setFrame] = useState<CutAndShutFrame | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<string | null>(null);
  const previousFeedback = useRef({ initialized: false, stitchNumber: 0, committed: false });
  const previousInteraction = useRef("");

  useEffect(() => {
    if (!isCutAndShutFrame(last)) return;
    const newestStitch = last.stitches.at(-1);
    const next = { initialized: true, stitchNumber: newestStitch?.number ?? 0, committed: Boolean(last.committed) };
    const involved = newestStitch?.fromSeat === you.seat || newestStitch?.toSeat === you.seat;
    try {
      if (previousFeedback.current.initialized && involved && next.stitchNumber > previousFeedback.current.stitchNumber) navigator.vibrate?.([28, 18, 45]);
      else if (previousFeedback.current.initialized && next.committed && !previousFeedback.current.committed) navigator.vibrate?.(42);
    } catch {
      // Haptics are useful confirmation but not required for play.
    }
    previousFeedback.current = next;
    setFrame(last);
  }, [last]);

  useEffect(() => {
    send({ t: "sync" });
  }, [send]);

  useEffect(() => {
    if (selectedRoad && !frame?.hand.some((road) => road.id === selectedRoad)) setSelectedRoad(null);
  }, [frame, selectedRoad]);

  const incoming = frame?.offers.find((offer) => offer.toId === you.id) ?? null;
  const outgoing = frame?.offers.find((offer) => offer.fromId === you.id) ?? null;
  const busy = Boolean(incoming || outgoing);
  const selected = frame?.hand.find((road) => road.id === selectedRoad) ?? null;
  const title = frame?.phase === "market" ? "TRADE ONE ROAD"
    : frame?.phase === "commit" ? "PREVIEW A ROAD"
      : frame?.phase === "spectator" ? "WATCH THIS DEAL"
        : frame?.phase === "runway" ? "FIND YOUR DESTINATION" : "LOOK UP";

  useEffect(() => {
    const key = `${frame?.phase ?? "loading"}:${incoming?.id ?? "none"}`;
    if (previousInteraction.current && previousInteraction.current !== key) setSelectedRoad(null);
    previousInteraction.current = key;
  }, [frame?.phase, incoming?.id]);

  if (!connected) {
    return (
      <div className="pad cut-phone cut-phone-offline" style={{ "--seat": you.color } as React.CSSProperties}>
        <strong>SIGNAL LOST</strong>
        <p>Your offer is cancelled. A road will be placed for you if the clock expires.</p>
      </div>
    );
  }

  return (
    <div className={`pad cut-phone cut-phase-${frame?.phase ?? "runway"}`} style={{ "--seat": you.color } as React.CSSProperties}>
      <header className="cut-phone-head">
        <div><b>{you.seat + 1}</b><span>{you.name}</span></div>
        <p>DEAL {frame?.round ?? 1}/4 · {Math.ceil(frame?.seconds ?? 8)}s</p>
      </header>

      {frame?.phase === "spectator" ? (
        <section className="cut-contract cut-spectator-card" aria-label="Spectator status">
          <small>PUBLIC GALLERY PASS</small>
          <strong>NO DESTINATION THIS GAME</strong>
          <span>You enter when the next game starts.</span>
        </section>
      ) : (
        <section className="cut-contract" aria-label="Private destination contract">
          <small>PRIVATE DESTINATION</small>
          <strong>{frame?.contract.label ?? "Sealed until loaded"}</strong>
          <span>{frame ? `Get any courier to finish on tile ${String(frame.contract.seam + 1).padStart(2, "0")} after 6 steps. Each earns you 4 points.` : "Keep this screen to yourself"}</span>
        </section>
      )}

      <div className="cut-phone-status" role="status" aria-live="polite">
        <strong>{title}</strong>
        <span>{frame?.message ?? "The city plans are arriving."}</span>
      </div>

      {frame?.phase === "runway" && <RoadHand hand={frame.hand} selectedRoad={null} onSelect={() => undefined} disabled />}

      {frame?.phase === "market" && (
        <Market
          frame={frame}
          youId={you.id}
          selectedRoad={selectedRoad}
          onSelect={setSelectedRoad}
          send={send}
          incoming={incoming}
          outgoing={outgoing}
          busy={busy}
        />
      )}

      {frame?.phase === "commit" && !frame.committed && (
        <Commit
          frame={frame}
          selected={selected}
          selectedRoad={selectedRoad}
          onSelect={setSelectedRoad}
          send={send}
        />
      )}

      {frame?.phase === "commit" && frame.committed && (
        <section className="cut-locked" aria-live="polite">
          <span aria-hidden="true">✦</span>
          <strong>TILE {String(frame.committed.seam + 1).padStart(2, "0")} LOCKED</strong>
          <p>{roadGlyph(frame.committed.shape)} {SHAPE_NAMES[frame.committed.shape]} road · look up</p>
        </section>
      )}

      {!(["runway", "market", "commit"] as const).includes(frame?.phase as "runway" | "market" | "commit") && (
        <section className="cut-look-up">
          <span aria-hidden="true">{frame?.phase === "march" ? "♟ ♟ ♟ ♟ ♟ ♟" : "⌁"}</span>
          <strong>{frame?.phase === "complete" ? "FINAL ACCOUNTS" : "WATCH THE CITY"}</strong>
          <p>{frame ? frame.phase === "recap" ? `This deal: +${frame.roundPersonal} delivery points · common bonus total ${frame.shared}` : `${frame.personal} delivery points · ${frame.shared} common bonus · most points wins` : "Road strips are being dealt."}</p>
        </section>
      )}
    </div>
  );
}

function RoadHand({ hand, selectedRoad, onSelect, disabled = false }: {
  hand: RoadCard[];
  selectedRoad: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cut-road-hand" aria-label="Your road strips">
      {hand.map((road) => (
        <button
          type="button"
          key={road.id}
          disabled={disabled}
          aria-pressed={selectedRoad === road.id}
          className={selectedRoad === road.id ? "is-selected" : ""}
          onClick={() => onSelect(road.id)}
        >
          <span aria-hidden="true">{roadGlyph(road.shape)}</span>
          <strong>{SHAPE_NAMES[road.shape]}</strong>
        </button>
      ))}
    </div>
  );
}

function Market({ frame, youId, selectedRoad, onSelect, send, incoming, outgoing, busy }: {
  frame: CutAndShutFrame;
  youId: string;
  selectedRoad: string | null;
  onSelect: (id: string) => void;
  send: (value: unknown) => void;
  incoming: CutAndShutFrame["offers"][number] | null;
  outgoing: CutAndShutFrame["offers"][number] | null;
  busy: boolean;
}) {
  if (incoming) {
    return (
      <section className="cut-offer-card" aria-label={`Offer from ${incoming.fromName}`}>
        <p><b>{incoming.fromName}</b> offers</p>
        <strong><span aria-hidden="true">{roadGlyph(incoming.offered)}</span> {SHAPE_NAMES[incoming.offered]}</strong>
        <small>Choose one road to return, then accept.</small>
        <RoadHand hand={frame.hand} selectedRoad={selectedRoad} onSelect={onSelect} />
        <div>
          <button type="button" className="is-reject" onClick={() => send({ t: "respond", offerId: incoming.id, accept: false })}>REJECT</button>
          <button type="button" disabled={!selectedRoad} onClick={() => send({ t: "respond", offerId: incoming.id, accept: true, roadId: selectedRoad })}>ACCEPT SWAP</button>
        </div>
      </section>
    );
  }

  if (outgoing) {
    return (
      <section className="cut-waiting-offer" aria-live="polite">
        <span aria-hidden="true">{roadGlyph(outgoing.offered)}</span>
        <strong>OFFER WITH {outgoing.toName.toUpperCase()}</strong>
        <p>They choose the road coming back. One live deal only.</p>
      </section>
    );
  }

  return (
    <>
      <p className="cut-action-steps" aria-hidden="true"><b>1</b> PICK ROAD <span>→</span> <b>2</b> PICK DEALER</p>
      <RoadHand hand={frame.hand} selectedRoad={selectedRoad} onSelect={onSelect} disabled={busy} />
      <div className="cut-dealer-grid" aria-label="Choose a dealer">
        {frame.dealers.filter((dealer) => dealer.id !== youId).map((dealer) => (
          <button
            type="button"
            key={dealer.id}
            disabled={!selectedRoad || dealer.locked || !dealer.connected}
            onClick={() => send({ t: "offer", roadId: selectedRoad, targetId: dealer.id })}
          >
            <b style={{ background: dealer.color }}>{dealer.seat + 1}</b>
            <span>{dealer.name}</span>
            <small>{!dealer.connected ? "AWAY" : dealer.locked ? "IN DEAL" : "OFFER"}</small>
          </button>
        ))}
      </div>
    </>
  );
}

function Commit({ frame, selected, selectedRoad, onSelect, send }: {
  frame: CutAndShutFrame;
  selected: RoadCard | null;
  selectedRoad: string | null;
  onSelect: (id: string) => void;
  send: (value: unknown) => void;
}) {
  const seamSet = useMemo(() => new Set(frame.availableSeams), [frame.availableSeams]);
  const [tile, setTile] = useState<number | null>(null);
  const preview = frame.preview?.roadId === selectedRoad && frame.preview.seam === tile ? frame.preview : null;
  const chooseRoad = (roadId: string) => {
    onSelect(roadId);
    if (tile !== null && seamSet.has(tile)) send({ t: "preview", roadId, seam: tile });
  };
  return (
    <>
      <p className="cut-action-steps" aria-hidden="true"><b>1</b> PICK ROAD <span>→</span> <b>2</b> TILE <span>→</span> <b>3</b> CONFIRM</p>
      <RoadHand hand={frame.hand} selectedRoad={selectedRoad} onSelect={chooseRoad} />
      {!preview && <div className="cut-seam-grid" aria-label="Choose a public tile">
        {(frame.layout ?? Array.from({ length: 12 }, (_, seam) => seam)).map((seam) => (
          <button
            type="button"
            key={seam}
            disabled={!selected || !seamSet.has(seam)}
            onClick={() => { setTile(seam); send({ t: "preview", roadId: selected!.id, seam }); }}
            aria-pressed={tile === seam}
            aria-label={`Preview ${selected ? SHAPE_NAMES[selected.shape] : "selected road"} on tile ${String(seam + 1).padStart(2, "0")}`}
          >
            <span>{String(seam + 1).padStart(2, "0")}</span>
            <small>{!seamSet.has(seam) ? "TAKEN" : seam === frame.contract.seam ? "DESTINATION" : "OPEN"}</small>
          </button>
        ))}
      </div>}
      {tile !== null && seamSet.has(tile) && !preview && <p role="status">Updating your private forecast…</p>}
      {preview && seamSet.has(preview.seam) && (
        <section className="cut-placement-preview" aria-label="Road placement preview">
          <div className="cut-preview-road">
            <svg viewBox="0 0 100 70" role="img" aria-label={`Road connects ${preview.connections}`}>
              <path d="M50 3 97 35 50 67 3 35Z" fill="#b8a7c8" stroke="#17131c" strokeWidth="3" />
              {preview.arms.map((arm) => <path key={arm} d={`M50 35 L${[73, 73, 27, 27][arm]} ${[19, 51, 51, 19][arm]}`} stroke="#17131c" strokeWidth="9" />)}
            </svg>
            <div><strong>TILE {preview.seam + 1} · {selected && SHAPE_NAMES[selected.shape]}</strong><p>{preview.connections}</p></div>
          </div>
          <button type="button" className="cut-change-tile" onClick={() => setTile(null)}>CHANGE TILE</button>
          <p>After 6 steps with roads placed so far:</p>
          <ul>{preview.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul>
          <small>Other players’ roads can change this forecast.</small>
          <button type="button" onClick={() => send({ t: "commit", roadId: preview.roadId, seam: preview.seam })}>CONFIRM ROAD ON TILE {preview.seam + 1}</button>
        </section>
      )}
      {tile !== null && !seamSet.has(tile) && <p role="status">That tile was taken. Choose another tile.</p>}
    </>
  );
}
