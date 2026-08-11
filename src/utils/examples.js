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
  {
    file: 'Vending.iml.json',
    name: 'Vending Machine',
    description: 'A VendingMachine and Customer capsule pair coordinating over a two-way protocol (coin insert, item select, dispense, refund), with credit-guarded branching and two instance models (ample funds / short funds) exercising both outcomes.',
  },
  {
    file: 'Elevator.iml.json',
    name: 'Elevator System',
    description: 'An Elevator capsule that moves one floor per Timing tick toward a requested floor, guarded by direction (up/down/arrived), paired with a Rider capsule that calls it, boards, and rides to a Final state. Two instance models show the elevator moving up and moving down.',
  },
  {
    file: 'Thermostat.iml.json',
    name: 'Smart Thermostat',
    description: 'A Thermostat capsule composition-owning two Sensor capsules that periodically report temperature over a shared protocol; the thermostat averages both readings and switches between Heating/Cooling/Off. Two instance models (a cold room / a hot room) exercise both HVAC modes.',
  },
];
