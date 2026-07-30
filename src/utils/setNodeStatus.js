// Shared status → color/label maps for SET nodes — lives outside SETNode.jsx
// (a component file) so SETLegend.jsx can reuse the exact same values
// without a react-refresh-hostile non-component export from a component file.
export const STATUS_BORDER = {
  open:              'var(--iml-primary)',
  'leaf-deadend':    '#64748b',
  'leaf-final':      '#dc2626',
  'leaf-subsumed':   '#7c3aed',
  'leaf-depth-bound': '#d97706',
};

export const STATUS_LABEL = {
  open: 'open',
  'leaf-deadend': 'dead end',
  'leaf-final': 'final',
  'leaf-subsumed': 'subsumed',
  'leaf-depth-bound': 'depth limit',
};
