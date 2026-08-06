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
];
