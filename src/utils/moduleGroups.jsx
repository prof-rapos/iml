import { Network, FileSliders, Workflow, Code2, ShieldCheck } from 'lucide-react';

// Single source of truth for the app's module list, shared by LandingPage
// (the grouped cards) and ModuleSwitcher (the per-topbar quick-switch menu)
// so the two places a module list appears never drift apart.
//
// Grouped by actual dependency shape, not just module number: Structural
// feeds Behavioural feeds {Code Explorer, MBT} — a real "core -> downstream"
// chain. Transformations needs two independently-imported meta-models of
// its own and doesn't sit on that chain at all, so it gets its own group
// rather than being squeezed into a sequence it isn't part of.
export const GROUPS = [
  {
    id: 'core',
    label: 'Core modeling',
    modules: [
      {
        id: 'structural',
        title: 'Structural Modeling',
        description: 'Define meta-models, create object instances, and validate conformance.',
        color: '#0077CA',
        available: true,
      },
      {
        id: 'behavioural',
        title: 'Behavioural Modeling',
        description: 'Model capsules, protocols, and state machines in UML-RT style.',
        color: '#d97706',
        available: true,
      },
    ],
  },
  {
    id: 'downstream',
    label: 'Downstream — built from your capsule models',
    modules: [
      {
        id: 'ide',
        title: 'Code Explorer',
        description: 'Edit, run, and debug generated code in an integrated development environment.',
        color: '#059669',
        available: true,
      },
      {
        id: 'testing',
        title: 'Model-Based Testing',
        description: 'Verify models and generate test cases using symbolic execution.',
        color: '#dc2626',
        available: true,
      },
    ],
  },
  {
    id: 'standalone',
    label: 'Standalone',
    modules: [
      {
        id: 'transformations',
        title: 'Model Transformations',
        description: 'Define and apply model-to-model transformations between meta-models.',
        color: '#7c3aed',
        available: true,
      },
    ],
  },
];

export const MODULES = GROUPS.flatMap((g) => g.modules);

export function moduleIcon(id, size = 26) {
  const props = { size, strokeWidth: 1.6 };
  switch (id) {
    case 'structural':      return <Network {...props} />;
    case 'transformations': return <FileSliders {...props} />;
    case 'behavioural':     return <Workflow {...props} />;
    case 'ide':             return <Code2 {...props} />;
    case 'testing':         return <ShieldCheck {...props} />;
    default:                return null;
  }
}
