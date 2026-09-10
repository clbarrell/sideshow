import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "../../src/client/HomePage";
import { hostToken, lastHostedParty } from "../../src/client/identity";

const stored = new Map<string, string>();
const memoryStorage: Storage = {
  get length() { return stored.size; },
  clear: () => stored.clear(),
  getItem: (key) => stored.get(key) ?? null,
  key: (index) => [...stored.keys()][index] ?? null,
  removeItem: (key) => stored.delete(key),
  setItem: (key, value) => stored.set(key, value),
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });

describe("clubhouse home page", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("makes Clubhouse the single home direction with an unmistakable primary action", () => {
    render(<HomePage navigateParty={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Couch co-op got a bigger couch." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start a new party" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Landing page concept" })).toBeNull();
  });

  it("creates a party, remembers its host credential, and navigates", async () => {
    const navigateParty = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "FUN7", hostToken: "secret-host-token" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<HomePage navigateParty={navigateParty} />);

    fireEvent.click(screen.getByRole("button", { name: "Start a new party" }));
    expect(screen.getByRole("button", { name: "Starting the party…" }).hasAttribute("disabled")).toBe(true);

    await waitFor(() => expect(navigateParty).toHaveBeenCalledWith("FUN7"));
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms", { method: "POST" });
    expect(hostToken("FUN7")).toBe("secret-host-token");
    expect(lastHostedParty()).toBe("FUN7");
  });

  it("recovers cleanly when party creation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<HomePage navigateParty={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Start a new party" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't start a party. Try again.");
    expect(screen.getByRole("button", { name: "Start a new party" }).hasAttribute("disabled")).toBe(false);
  });

  it("only resumes parties whose host token exists on this device", () => {
    localStorage.setItem("party.lastHosted", "LAST");
    localStorage.setItem("party.hostToken.LAST", "last-token");
    localStorage.setItem("party.hostToken.SAFE", "safe-token");
    const navigateParty = vi.fn();
    render(<HomePage navigateParty={navigateParty} />);

    fireEvent.click(screen.getByRole("button", { name: /Return to your last party/i }));
    expect(navigateParty).toHaveBeenCalledWith("LAST");

    const input = screen.getByLabelText("Already started?");
    fireEvent.change(input, { target: { value: "sa-fe" } });
    expect((input as HTMLInputElement).value).toBe("SAFE");
    const resume = screen.getByRole("button", { name: "Resume" });
    expect((resume as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(resume);
    expect(navigateParty).toHaveBeenCalledWith("SAFE");
  });
});
