import { routePartykitRequest } from "partyserver";
import { Room, hashToken } from "./room";
import { makeRoomCode } from "../shared/protocol";

export { Room };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      if (!sameOrigin(request, url)) return new Response("Forbidden", { status: 403 });
      const ip = request.headers.get("cf-connecting-ip");
      if (ip && !(await env.ROOM_CREATION_RATE_LIMITER.limit({ key: ip })).success) {
        return new Response("Too many parties", { status: 429 });
      }

      for (let attempt = 0; attempt < 8; attempt++) {
        const code = makeRoomCode();
        const hostToken = randomToken();
        const created = await env.Room.getByName(code).provision(await hashToken(hostToken));
        if (created) {
          return Response.json(
            { code, hostToken },
            { status: 201, headers: { "Cache-Control": "no-store" } },
          );
        }
      }
      return new Response("Couldn't allocate a room", { status: 503 });
    }

    if (url.pathname.startsWith("/parties/") && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (!sameOrigin(request, url)) return new Response("Forbidden", { status: 403 });
      const ip = request.headers.get("cf-connecting-ip");
      if (ip && !(await env.CONNECTION_RATE_LIMITER.limit({ key: ip })).success) {
        return new Response("Too many connections", { status: 429 });
      }
    }

    // /parties/room/:code -> the Room Durable Object for that code.
    // The DO is created in the datacentre of whoever connects first, so the
    // projector machine should always create the room before phones join.
    const routed = await routePartykitRequest(request, env as never);
    if (routed) return routed;

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
