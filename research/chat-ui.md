# A semantic chat surface

The route assistant started as prose plus a few link-like buttons. That is
not enough: a rider wants to see the journey, the lines, the wait and the
action in one place, and a model's sentence is not a safe source for an id,
a fare or a departure time.

## What the research says

The useful pattern is **tool result -> semantic UI part**, not "render the
model's Markdown and hope it contains a route".

- OpenAI's Apps SDK renders structured tool output as a widget and exposes
  actions that the app handles; the model does not own the widget's data.
  <https://developers.openai.com/apps-sdk/>
- Vercel AI SDK's UI message parts model is the same idea in a different
  stack: text, tool calls and typed data parts live side by side in one
  message. <https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot>
- MCP Apps extends tool results with UI resources and a bridge for app
  actions. <https://modelcontextprotocol.io/docs/learn/architecture>
- In this repository the correct semantic boundary is already Anvia:
  `createTool` defines the input and the structured result; the browser
  renders only what the tool returned. No provider call is made by the
  browser.

The implementation keeps the existing SSE route. It does not claim to be
the Anvia client protocol v3; it uses the Anvia **tool** contract as the
source of truth and maps it to application-owned `ChatCard` values.

## The contract

`packages/transit/src/chat.ts` defines the card union:

- `route` — origin, destination, verdict, a primary option with legs,
  service windows, fare and alternatives;
- `stop` — station, area, coordinates and the lines that serve it;
- `notice` — a stored notice with scope, severity and source link;
- `source` — a source link when a tool returns one.

`apps/api/src/chat-cards.ts` maps `plan_journey`, `get_station`,
`resolve_place` and `list_active_disruptions` results. The SSE stream sends
a `card` event next to the existing `actions` event. The browser dedupe and
orders the cards; a later, richer result for the same stop replaces the
placeholder from the resolver.

The action buttons are also derived from the tool result. A route card can
open the journey; a stop card can show the stop or set either endpoint; a
notice card can show the notice or open its source. The fallback action in
the card component uses only fields already present in the card, so a
missing SSE `actions` frame does not remove the action.

## What is deliberately not done

- No raw Markdown HTML. A small rich-text fallback handles bold labels and
  lists, but the route data is never parsed from that text.
- No model-generated ids, coordinates, fares or durations.
- No hidden side effect. "Open this journey" goes through the same planner
  the deterministic search uses.
- No claim that the panel is a full Anvia client. It is a product-owned
  stream with Anvia tools behind it; resumable protocol and interactions are
  a separate migration.

## Cases captured

- `35-chat-route-card.png` — route card with
  service window and "Open this journey".
- `36-chat-stop-card.png` — stop card with lines
  and endpoint actions.
- `32-chat-notice-cards.png` — notice cards with source actions.
- `33-chat-action-opened-route.png` — the route after the card action.
