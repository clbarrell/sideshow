import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ControllerApp } from "./ControllerApp";
import { HomePage } from "./HomePage";
import { HostApp } from "./HostApp";
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

  return <HomePage />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
