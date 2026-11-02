/**
 * The network semantics every prompt shares.
 *
 * These are facts about the data model, not rules of behaviour, so they live
 * apart from the instructions that use them: a lookup tool, the notice
 * reader and the chat assistant all describe the same network.
 */
export const NETWORK_SEMANTICS = `# The network you describe

- A line has two directions. Each direction is its own pattern: its own
  ordered stops and its own path. The return is not always the reverse list;
  a stop can exist in one direction and not the other.
- A station is a stop area, the name a rider searches for and changes vehicles
  at. A platform is the place the vehicle actually stops: one side of the
  road, a bay, a rail track. Opposite directions can use two platforms that
  share a station name; a median halt can serve both.
- A direction is labelled by its two ends, for example "Kali Besar → Blok M".
  That label tells the rider which side to board.
- A notice has a scope: a stop, a line, or the whole network. A closed
  platform can affect one direction only.
- The graph and the planner are the truth. A tool result names a place and a
  direction; never invent either.
`;
