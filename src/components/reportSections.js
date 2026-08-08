// Shared by every topbar's "Generate Report…" wiring (Structural, Behavioural,
// MBT) so the section list only needs updating in one place.
export const REPORT_SECTIONS = [
  { key: 'metamodel', label: 'Meta-Model' },
  { key: 'instances', label: 'Instance Models' },
  { key: 'structure', label: 'Composite Structure' },
  { key: 'statemachines', label: 'State Machines' },
  { key: 'code', label: 'Generated Code' },
  { key: 'set', label: 'SET (Symbolic Execution Tree)' },
  { key: 'tests', label: 'Generated Tests' },
];
