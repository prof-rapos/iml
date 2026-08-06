// Manifest of example .iml.json models bundled under public/examples/ and
// offered via the "Load Example Model" menu item. Static hosting (GitHub
// Pages) can't list a directory at runtime, so this list is the source of
// truth — add a new example by dropping the file into public/examples/ and
// adding an entry here.
export const EXAMPLES = [
  {
    file: 'Lights.iml.json',
    name: 'Traffic Lights',
    description: 'Two intersecting traffic light capsules coordinating via a shared protocol, with a full state machine (Red → Green → Yellow → All Red) and working Java codegen.',
  },
  {
    file: 'RPS.iml.json',
    name: 'Rock-Paper-Scissors',
    description: 'A referee capsule composition-owning two Player capsules over a shared protocol, with a Timing port for pacing, a Log port for match commentary, and two instance models (Best of 3 / Best of 7) showing the same meta-model reused with different players and win targets.',
  },
];
