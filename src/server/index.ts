import { routePartykitRequest } from "partyserver";
import { Room } from "./room";

export { Room };

interface Env {
  Room: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // /parties/room/:code -> the Room Durable Object for that code.
    // The DO is created in the datacentre of whoever connects first, so the
    // projector machine should always create the room before phones join.
    const routed = await routePartykitRequest(request, env as never);
    if (routed) return routed;

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
