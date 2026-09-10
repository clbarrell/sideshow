import { useEffect, useState, type ReactNode } from "react";
import { hostToken, lastHostedParty, rememberHostToken } from "./identity";
import "./home.css";

export type HomePageProps = {
  navigateParty?: (code: string) => void;
};

type StartActionsProps = {
  code: string;
  creating: boolean;
  error: string | null;
  previous: string | null;
  setCode: (code: string) => void;
  startParty: () => void;
  navigateParty: (code: string) => void;
};

function defaultNavigateParty(code: string) {
  window.history.replaceState(null, "", `/h/${code.toUpperCase()}`);
  window.location.reload();
}

export function HomePage({ navigateParty = defaultNavigateParty }: HomePageProps) {
  const previous = lastHostedParty();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const original = meta.content;
    meta.content = "#ead5ad";
    return () => { meta.content = original; };
  }, []);

  const startParty = async () => {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      if (!response.ok) throw new Error("create failed");
      const party = (await response.json()) as { code: string; hostToken: string };
      rememberHostToken(party.code, party.hostToken);
      navigateParty(party.code);
    } catch {
      setError("Couldn't start a party. Try again.");
      setCreating(false);
    }
  };

  const actions = (
    <StartActions
      code={code}
      creating={creating}
      error={error}
      previous={previous}
      setCode={setCode}
      startParty={() => void startParty()}
      navigateParty={navigateParty}
    />
  );

  return (
    <main className="home home--clubhouse">
      <ClubhouseConcept actions={actions} />
    </main>
  );
}

function StartActions({
  code,
  creating,
  error,
  previous,
  setCode,
  startParty,
  navigateParty,
}: StartActionsProps) {
  const resumablePrevious = previous && hostToken(previous) ? previous : null;
  const typedCodeCanResume = code.length === 4 && Boolean(hostToken(code));

  return (
    <section className="home-actions" aria-label="Start or resume a party">
      <p className="home-actions__eyebrow"><i aria-hidden="true" /> Your game night starts here</p>
      <button
        className="home-primary"
        type="button"
        disabled={creating}
        aria-label={creating ? "Starting the party…" : "Start a new party"}
        onClick={startParty}
      >
        <span>
          {creating ? "Starting the party…" : "Start a new party"}
          <small>{creating ? "Warming up the room" : "Create a room and show the join code"}</small>
        </span>
        <b aria-hidden="true">→</b>
      </button>

      {error && <p className="home-error" role="alert">{error}</p>}

      {resumablePrevious && (
        <button className="home-previous" type="button" onClick={() => navigateParty(resumablePrevious)}>
          <span>Return to your last party</span>
          <b>{resumablePrevious}</b>
        </button>
      )}

      <form
        className="home-resume"
        onSubmit={(event) => {
          event.preventDefault();
          if (typedCodeCanResume) navigateParty(code);
        }}
      >
        <label htmlFor="resume-code">Already started?</label>
        <div>
          <input
            id="resume-code"
            value={code}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="resume-hint"
            onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
            placeholder="ABCD"
          />
          <button type="submit" disabled={!typedCodeCanResume}>Resume</button>
        </div>
        <p id="resume-hint">Resume a party previously hosted on this device.</p>
      </form>
    </section>
  );
}

function ClubhouseConcept({ actions }: { actions: ReactNode }) {
  return (
    <div className="clubhouse">
      <header className="clubhouse__header">
        <a href="#party-start">Sideshow <span>●</span></a>
        <p>Big-screen party games<br />best served from the sofa</p>
        <span className="clubhouse__edition">Made for<br />the living room</span>
      </header>
      <section className="clubhouse__body">
        <div className="clubhouse__copy">
          <h1 aria-label="Couch co-op got a bigger couch.">Couch co-op<br />got a bigger<br /><em>couch.</em></h1>
          <p>Settle in, pass the snacks, and turn the biggest screen in the room into a game everyone can play.</p>
        </div>
        <div className="clubhouse__scene" aria-hidden="true">
          <picture>
            <source
              media="(max-width: 700px)"
              srcSet="/images/clubhouse-living-room-mobile.webp"
              type="image/webp"
            />
            <source
              srcSet="/images/clubhouse-living-room.webp"
              type="image/webp"
            />
            <img
              src="/images/clubhouse-living-room.jpg"
              alt=""
              width="1024"
              height="1536"
            />
          </picture>
        </div>
        <div className="clubhouse__actions" id="party-start">{actions}</div>
      </section>
    </div>
  );
}
