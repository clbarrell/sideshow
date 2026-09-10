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
    : frame?.phase === "commit" ? "STITCH A SEAM"
      : frame?.phase === "spectator" ? "WATCH THIS DEAL"
        : "LOOK UP";

  useEffect(() => {
    const key = `${frame?.phase ?? "loading"}:${incoming?.id ?? "none"}`;
    if (previousInteraction.current && previousInteraction.current !== key) setSelectedRoad(null);
    previousInteraction.current = key;
  }, [frame?.phase, incoming?.id]);

  if (!connected) {
    return (
      <div className="pad cut-phone cut-phone-offline" style={{ "--seat": you.color } as React.CSSProperties}>
        <strong>SIGNAL LOST</strong>
        <p>Your offer is cancelled. The council will make a legal stitch for you if the clock expires.</p>
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
          <strong>NO CONTRACT THIS GAME</strong>
          <span>You enter when the next game starts.</span>
        </section>
      ) : (
        <section className="cut-contract" aria-label="Private destination contract">
          <small>PRIVATE CONTRACT</small>
          <strong>{frame?.contract.label ?? "Sealed until loaded"}</strong>
          <span>{frame ? `Deliver to seam ${String(frame.contract.seam + 1).padStart(2, "0")} · 4 points each` : "Keep this screen to yourself"}</span>
        </section>
      )}

      <div className="cut-phone-status" role="status" aria-live="polite">
        <strong>{title}</strong>
        <span>{frame?.message ?? "The city plans are arriving."}</span>
      </div>

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
          <strong>STITCH {String(frame.committed.seam + 1).padStart(2, "0")} LOCKED</strong>
          <p>{roadGlyph(frame.committed.shape)} {SHAPE_NAMES[frame.committed.shape]} road · look up</p>
        </section>
      )}

      {!(["market", "commit"] as const).includes(frame?.phase as "market" | "commit") && (
        <section className="cut-look-up">
          <span aria-hidden="true">{frame?.phase === "march" ? "♟ ♟ ♟ ♟ ♟ ♟" : "⌁"}</span>
          <strong>{frame?.phase === "complete" ? "FINAL ACCOUNTS" : "WATCH THE CITY"}</strong>
          <p>{frame ? frame.phase === "recap" ? `This deal: +${frame.roundPersonal} private · shared pot now ${frame.shared}` : `${frame.personal} private · ${frame.shared} shared points` : "Road strips are being dealt."}</p>
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
  return (
    <>
      <p className="cut-action-steps" aria-hidden="true"><b>1</b> PICK ROAD <span>→</span> <b>2</b> PICK SEAM</p>
      <RoadHand hand={frame.hand} selectedRoad={selectedRoad} onSelect={onSelect} />
      <div className="cut-seam-grid" aria-label="Choose a public seam">
        {Array.from({ length: 12 }, (_, seam) => (
          <button
            type="button"
            key={seam}
            disabled={!selected || !seamSet.has(seam)}
            onClick={() => send({ t: "commit", roadId: selected!.id, seam })}
            aria-label={`Commit ${selected ? SHAPE_NAMES[selected.shape] : "selected road"} to seam ${String(seam + 1).padStart(2, "0")}`}
          >
            <span>{String(seam + 1).padStart(2, "0")}</span>
            <small>{seamSet.has(seam) ? "OPEN" : "TAKEN"}</small>
          </button>
        ))}
      </div>
    </>
  );
}
