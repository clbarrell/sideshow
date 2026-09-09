import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ControllerApp } from "./ControllerApp";
import { HostApp } from "./HostApp";
import { hostToken, lastHostedParty, rememberHostToken } from "./identity";
import "./styles.css";

/**
 * Routes:
 *   /            start or resume a party on the big screen
 *   /h/CODE      the big screen for a party
 *   /j/CODE      a phone in that party
 *
 * Both party URLs are stable for the whole night. Nothing about launching a
 * game changes the address bar, so phones never have to re-scan.
 */
function App() {
  const path = window.location.pathname;

  const join = path.match(/^\/j\/([A-Za-z0-9]{4})/);
  if (join) return <ControllerApp code={join[1].toUpperCase()} />;

  const hosted = path.match(/^\/h\/([A-Za-z0-9]{4})/);
  if (hosted) return <HostApp code={hosted[1].toUpperCase()} />;

  return <Start />;
}

function Start() {
  const previous = lastHostedParty();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (c: string) => {
    window.history.replaceState(null, "", `/h/${c.toUpperCase()}`);
    window.location.reload();
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      if (!response.ok) throw new Error("create failed");
      const party = (await response.json()) as { code: string; hostToken: string };
      rememberHostToken(party.code, party.hostToken);
      go(party.code);
    } catch {
      setError("Couldn't start a party. Try again.");
      setCreating(false);
    }
  };

  return (
    <main className="start-screen">
      <h1>Sideshow</h1>
      <p className="start-lede">One code for the whole night. Games change, the room doesn't.</p>

      {/* The projector opens the party first on purpose: a Durable Object is
          placed near whoever connects first, and we want it near the big
          screen rather than near whichever guest scanned fastest. */}
      <button className="start" disabled={creating} onClick={() => void create()}>
        {creating ? "Starting…" : "Start a new party"}
      </button>

      {error && <p role="alert">{error}</p>}

      {previous && hostToken(previous) && (
        <button className="ghost" onClick={() => go(previous)}>
          Resume {previous}
        </button>
      )}

      <label className="field">
        <span>Or resume a party started on this screen</span>
        <input value={code} maxLength={4} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD" />
      </label>
      <button className="ghost" disabled={code.length !== 4 || !hostToken(code)} onClick={() => go(code)}>Resume</button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
