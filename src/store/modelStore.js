import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import {
  getAllAttributes as _getAllAttributes,
  getAllRelations as _getAllRelations,
  convertAttrValue,
  validateModelShape,
} from '../utils/modelHelpers.js';
import { validateConformance } from '../utils/conformance.js';
import { saveAutosave } from '../utils/autosave.js';
import { selectionPatch } from './selectionChanges.js';

const mkIM = (name = 'NewInstanceModel') => ({
  id: nanoid(8),
  kind: 'instancemodel',
  name,
  objects: [],
  links: [],
  connectors: [],
});

const EMPTY_MM = { kind: 'metamodel', name: 'NewMetaModel', classes: [], relations: [], enumerations: [], behaviours: {}, protocols: [] };

// ── UML-RT protocols & ports ──────────────────────────────────────────────────
// Built-in system protocols, always available (not user-editable). Timing gives
// a receivable `timeout`; Log is a send-only service used in effects.
export const SYSTEM_PROTOCOLS = [
  { id: 'sys-timing', name: 'Timing', system: true, signals: [
    // The port itself identifies the timer (arm one per Timing port) — a
    // simplified stand-in for UML-RT's opaque RTTimerId handle.
    { id: 'timeout',     name: 'timeout',     direction: 'in',  params: [] }, // received → triggers a transition
    { id: 'informIn',    name: 'informIn',    direction: 'out', params: [{ id: 'ms', name: 'ms', type: 'INT' }] }, // sent: arm a one-shot timer
    { id: 'informEvery', name: 'informEvery', direction: 'out', params: [{ id: 'ms', name: 'ms', type: 'INT' }] }, // sent: arm a recurring timer
    { id: 'cancelTimer', name: 'cancelTimer', direction: 'out', params: [] }, // sent: cancel this port's armed timer
  ] },
  { id: 'sys-log',    name: 'Log',    system: true, signals: [
    { id: 'log', name: 'log', direction: 'out', params: [{ id: 'message', name: 'message', type: 'STRING' }] },
  ] },
];

export function allProtocols(metaModel) {
  return [...SYSTEM_PROTOCOLS, ...(metaModel.protocols ?? [])];
}
export function getProtocolById(id, metaModel) {
  return allProtocols(metaModel).find((p) => p.id === id) ?? null;
}

// Resolves a connector/message endpoint (an object id + one of its class's
// port ids) to the actual port definition. The single source of truth for
// this lookup — used by connector validation, pruning, and the structure
// diagram/properties panel.
export function getPortByEndpoint(metaModel, objects, objectId, portId) {
  const obj = objects.find((o) => o.id === objectId);
  const cls = metaModel.classes.find((c) => c.id === obj?.classId);
  return (cls?.ports ?? []).find((p) => p.id === portId) ?? null;
}

// Drops any capsule-structure connector whose two ports no longer resolve to a
// valid base↔conjugate pairing on the same protocol — used after a port or
// protocol is deleted/edited out from under an existing connector.
function pruneDanglingConnectors(metaModel, instanceModels) {
  return instanceModels.map((im) => ({
    ...im,
    connectors: (im.connectors ?? []).filter((c) => {
      const srcPort = getPortByEndpoint(metaModel, im.objects, c.sourceObjectId, c.sourcePortId);
      const tgtPort = getPortByEndpoint(metaModel, im.objects, c.targetObjectId, c.targetPortId);
      return !!srcPort && !!tgtPort && srcPort.protocolId === tgtPort.protocolId && srcPort.conjugated !== tgtPort.conjugated;
    }),
  }));
}

// Messages a capsule can be *triggered* by: for each port, the signals it can
// receive — in-signals of a regular port, out-signals of a conjugated one.
export function capsuleMessages(classId, metaModel) {
  const cls = metaModel.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const out = [];
  for (const port of cls.ports ?? []) {
    const proto = getProtocolById(port.protocolId, metaModel);
    if (!proto) continue;
    const wanted = port.conjugated ? 'out' : 'in';
    for (const sig of proto.signals) {
      if (sig.direction !== wanted) continue;
      const params = sig.params ?? [];
      const label = params.length
        ? `${port.name}.${sig.name}(${params.map((pr) => pr.name).join(', ')})`
        : `${port.name}.${sig.name}`;
      out.push({ value: `${port.name}.${sig.name}`, label });
    }
  }
  return out;
}

// Code-editor completions for a capsule's action code. After a `port.` the
// port's signals are offered (as sends); otherwise the capsule's ports and
// attributes (the cross-state variables). Pure so it can be unit-tested.
export function capsuleCompletions(classId, metaModel, lineBeforeCursor = '') {
  const cls = metaModel.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const dot = lineBeforeCursor.match(/([A-Za-z_$][\w$]*)\.[\w$]*$/);
  if (dot) {
    const port = (cls.ports ?? []).find((p) => p.name === dot[1]);
    if (!port) return [];
    const proto = getProtocolById(port.protocolId, metaModel);
    // You can only *send* the port's sendable signals — out-signals on a
    // regular port, in-signals on a conjugated one (mirror of the trigger rule).
    const sendable = port.conjugated ? 'in' : 'out';
    return (proto?.signals ?? [])
      .filter((sig) => sig.direction === sendable)
      .map((sig) => {
        const params = sig.params ?? [];
        const args = params.map((pr, i) => `\${${i + 1}:${pr.name}}`).join(', ');
        const detail = params.length
          ? `${proto.name} · send(${params.map((pr) => `${pr.name}: ${pr.type}`).join(', ')})`
          : `${proto.name} · send`;
        return { label: sig.name, kind: 'method', insert: `${sig.name}(${args})`, detail };
      });
  }
  const ports = (cls.ports ?? []).map((p) => ({ label: p.name, kind: 'field', insert: p.name, detail: 'port' }));
  const attrs = _getAllAttributes(cls.id, metaModel).map((a) => ({ label: a.name, kind: 'variable', insert: a.name, detail: `${a.type} · capsule attr` }));
  return [...ports, ...attrs];
}

// Immutably update the state machine attached to a class (creating an empty one
// on first use). fn receives { states, transitions } and returns the next value.
function withMachine(metaModel, classId, fn) {
  const behaviours = metaModel.behaviours ?? {};
  const machine = behaviours[classId] ?? { states: [], transitions: [] };
  return { ...metaModel, behaviours: { ...behaviours, [classId]: fn(machine) } };
}

// Updates one protocol via fn(protocol) => next protocol, leaving the rest of
// metaModel.protocols untouched.
function withProtocol(metaModel, protocolId, fn) {
  return { ...metaModel, protocols: (metaModel.protocols ?? []).map((p) => p.id === protocolId ? fn(p) : p) };
}

// Updates one signal within a protocol via fn(signal) => next signal.
function withSignal(protocol, signalId, fn) {
  return { ...protocol, signals: protocol.signals.map((sg) => sg.id === signalId ? fn(sg) : sg) };
}

// Updates only the current instance model via fn(currentIM) => partial patch,
// leaving every other instance model untouched. The single place every
// instance-model-scoped CRUD action goes through instead of hand-rolling the
// same `map((im, i) => i === currentIMIndex ? ... : im)` each time.
function withCurrentIM(instanceModels, currentIMIndex, fn) {
  return instanceModels.map((im, i) => i === currentIMIndex ? { ...im, ...fn(im) } : im);
}

// Re-export so existing importers (ObjectNode, etc.) don't need changing.
export const getAllAttributes = _getAllAttributes;
export const getAllRelations  = _getAllRelations;

// Returns all transitive subclass IDs of classId (not including classId itself).
function getSubclassIds(classId, metaModel) {
  const direct = metaModel.relations
    .filter((r) => r.kind === 'INHERITANCE' && r.target === classId)
    .map((r) => r.source);
  return direct.flatMap((sub) => [sub, ...getSubclassIds(sub, metaModel)]);
}

// Returns true if there is an inheritance path from fromId to toId (following source→target).
function hasInheritancePath(fromId, toId, relations, visited = new Set()) {
  if (fromId === toId) return true;
  if (visited.has(fromId)) return false;
  visited.add(fromId);
  const parentRel = relations.find((r) => r.kind === 'INHERITANCE' && r.source === fromId);
  if (!parentRel) return false;
  return hasInheritancePath(parentRel.target, toId, relations, visited);
}

// Returns true if there is a directed path via `kind` relations from fromId to toId.
function hasRelationPath(fromId, toId, kind, relations, visited = new Set()) {
  if (fromId === toId) return true;
  if (visited.has(fromId)) return false;
  visited.add(fromId);
  const outgoing = relations.filter((r) => r.kind === kind && r.source === fromId);
  return outgoing.some((r) => hasRelationPath(r.target, toId, kind, relations, visited));
}

// Shared by addRelation/updateRelation. Returns an error message if the
// relation described would be invalid, or null if it's OK. `excludeId` omits
// the relation being edited from its own cycle/uniqueness checks so editing
// a relation in place doesn't trip over its own prior state.
function validateRelation(metaModel, excludeId, kind, source, target, name) {
  const srcCls = metaModel.classes.find((c) => c.id === source);
  const tgtCls = metaModel.classes.find((c) => c.id === target);
  const others = metaModel.relations.filter((r) => r.id !== excludeId);

  if (source === target && (kind === 'INHERITANCE' || kind === 'COMPOSITION')) {
    return `A class cannot have a ${kind.toLowerCase()} relation to itself.`;
  }

  if (kind === 'INHERITANCE') {
    const existingParent = others.find((r) => r.kind === 'INHERITANCE' && r.source === source);
    if (existingParent) {
      const parentCls = metaModel.classes.find((c) => c.id === existingParent.target);
      return `"${srcCls?.name}" already extends "${parentCls?.name}". Only single inheritance is supported.`;
    }
    if (hasInheritancePath(target, source, others)) {
      return `Cannot add inheritance: "${srcCls?.name}" and "${tgtCls?.name}" would form a cycle.`;
    }
  }

  if (kind === 'COMPOSITION' && hasRelationPath(target, source, 'COMPOSITION', others)) {
    return `Cannot add composition: "${srcCls?.name}" and "${tgtCls?.name}" would form a composition cycle.`;
  }

  const trimmedName = (name ?? '').trim();
  if (trimmedName) {
    const nameClash = others.some((r) => r.source === source && (r.name || '').trim() === trimmedName);
    if (nameClash) {
      return `"${srcCls?.name}" already has a relation named "${trimmedName}".`;
    }
    const attrClash = srcCls && getAllAttributes(source, metaModel).some((a) => a.name === trimmedName);
    if (attrClash) {
      return `"${srcCls?.name}" already has an attribute named "${trimmedName}".`;
    }
  }

  return null;
}

// ── Java keyword / reserved name blacklist ────────────────────────────────────
const JAVA_KEYWORDS = new Set([
  'abstract','assert','boolean','break','byte','case','catch','char','class',
  'const','continue','default','do','double','else','enum','extends','final',
  'finally','float','for','goto','if','implements','import','instanceof','int',
  'interface','long','native','new','package','private','protected','public',
  'return','short','static','strictfp','super','switch','synchronized','this',
  'throw','throws','transient','try','void','volatile','while','true','false','null',
  // Common Java class names that would shadow the stdlib
  'String','Integer','Double','Boolean','Float','Long','Short','Byte','Character',
  'Object','System','Math','ArrayList','List','Map','Set','Arrays','Collections',
]);

// Exact (case-sensitive) match only — Java identifiers ARE case-sensitive,
// so "Do" or "Class" are perfectly legal names despite "do"/"class" being
// reserved. A case-insensitive check used to block them anyway, which in
// practice meant typing a name like "Donut" got silently rejected the
// instant it passed through "Do".
function isJavaKeyword(name) {
  return JAVA_KEYWORDS.has(name);
}

// ── Layout key helpers ────────────────────────────────────────────────────────
const mmKey  = () => 'mm';
const imKey  = (imId) => `im-${imId}`;

// Drops one node id's saved position from a given layouts key, leaving the
// rest of that key's entries (and every other key) untouched. Used on node
// delete so `layouts` doesn't accumulate stale entries for ids that no
// longer exist anywhere in the model.
function withoutLayoutEntry(layouts, key, nodeId) {
  const entries = layouts[key];
  if (!entries || !(nodeId in entries)) return layouts;
  const { [nodeId]: _dropped, ...rest } = entries;
  return { ...layouts, [key]: rest };
}

// Canonical relationEdge/linkEdge shapes — the single source of truth used by
// both rebuildCanvas's initial build and ModelCanvas's onConnect, so a new
// edge appended live can't drift out of sync with a freshly-rebuilt one.
export function relationToEdge(rel) {
  return {
    id: rel.id, source: rel.source, target: rel.target,
    sourceHandle: rel.sourceHandle ?? null,
    targetHandle: rel.targetHandle ?? null,
    type: 'relationEdge',
    data: { kind: rel.kind, name: rel.name || '', sourceMultiplicity: rel.sourceMultiplicity || '', targetMultiplicity: rel.targetMultiplicity || '' },
    markerEnd: rel.kind === 'INHERITANCE'
      ? { type: 'arrowclosed', width: 16, height: 16 }
      : { type: 'arrow', width: 14, height: 14 },
  };
}

export function linkToEdge(link, metaModel) {
  const rel = metaModel.relations.find((r) => r.id === link.relationId);
  return {
    id: link.id,
    source: link.source ?? link.sourceId,
    target: link.target ?? link.targetId,
    sourceHandle: link.sourceHandle ?? null,
    targetHandle: link.targetHandle ?? null,
    type: 'linkEdge',
    data: { relationId: link.relationId, label: rel?.name || rel?.kind || '' },
    markerEnd: { type: 'arrow', width: 14, height: 14 },
  };
}

// Not store state on purpose — a deliberate fresh load/clear needs to
// suppress the dirty-tracking subscribe handler (below) for the ENTIRE
// duration of the action, across every one of its internal set() calls,
// not just the first. Making it part of the store's own state would mean
// the subscribe handler firing on ITS OWN set({dirty:false}) call could
// race against later set() calls in the same action.
let suppressDirty = false;

export const useModelStore = create((set, get) => ({
  // ── App-level navigation ──────────────────────────────────────────
  appView: 'home',
  setAppView: (view) => set({ appView: view }),

  // ── Unsaved-work tracking (beforeunload guard) ─────────────────────
  // Flips true the moment metaModel/instanceModels changes for any reason
  // OTHER than a deliberate fresh load/clear (see the `suppressDirty`
  // module flag below) — App.jsx's beforeunload handler reads this to
  // decide whether to warn before an accidental refresh/close. There's no
  // autosave (see project backlog), so this is the only guard against
  // silently losing a whole session's work to one stray keystroke.
  dirty: false,

  // ── Toast notifications ───────────────────────────────────────────
  notification: null,
  notify: (msg) => {
    set({ notification: msg });
    setTimeout(() => set((s) => s.notification === msg ? { notification: null } : {}), 3500);
  },

  // ── Editor mode ───────────────────────────────────────────────────
  mode: 'metamodel',
  setMode: (mode) => set({ mode }),

  // ── React Flow state ──────────────────────────────────────────────
  nodes: [],
  edges: [],

  onNodesChange: (changes) => {
    set((s) => {
      const newNodes = applyNodeChanges(changes, s.nodes);
      const patch = { nodes: newNodes };

      // Persist drag positions
      const posChanges = changes.filter((c) => c.type === 'position' && c.position);
      if (posChanges.length > 0) {
        const layoutKey = s.mode === 'metamodel'
          ? mmKey()
          : imKey(s.instanceModels[s.currentIMIndex]?.id);
        const updates = {};
        for (const c of posChanges) updates[c.id] = c.position;
        patch.layouts = { ...s.layouts, [layoutKey]: { ...(s.layouts[layoutKey] ?? {}), ...updates } };
      }

      Object.assign(patch, selectionPatch(changes, 'node', s));
      return patch;
    });
  },

  onEdgesChange: (changes) => {
    set((s) => {
      const patch = { edges: applyEdgeChanges(changes, s.edges) };
      Object.assign(patch, selectionPatch(changes, 'edge', s));
      return patch;
    });
  },

  // ── Layout map: { 'mm': {nodeId: {x,y}}, 'im-<id>': {...} } ──────
  layouts: {},

  // ── Viewport map: { 'mm': {x,y,zoom}, 'im-<id>': {x,y,zoom} } ───
  viewports: {},
  saveViewport: (key, viewport) => set((s) => ({
    viewports: { ...s.viewports, [key]: viewport },
  })),

  // ── Selection ─────────────────────────────────────────────────────
  selectedId:   null,
  selectedType: null,
  setSelectedId: (id, type = 'node') => set({ selectedId: id, selectedType: id ? type : null }),

  // ── Edge / relation type palette ──────────────────────────────────
  pendingEdgeType:    null,
  setPendingEdgeType: (t) => set({ pendingEdgeType: t }),
  pendingRelationId:     null,
  setPendingRelationId:  (id) => set({ pendingRelationId: id }),

  // ── Conformance ───────────────────────────────────────────────────
  conformanceResults: [],

  // ── Console log ───────────────────────────────────────────────────
  consoleLog: [],
  log: (msg) => set((s) => ({ consoleLog: [...s.consoleLog.slice(-99), { ts: Date.now(), msg }] })),

  // ══════════════════════════════════════════════════════════════════
  // META-MODEL
  // ══════════════════════════════════════════════════════════════════
  metaModel: EMPTY_MM,

  addClass: (isAbstract = false) => {
    const id  = nanoid(8);
    // Generate a unique default name
    const base    = isAbstract ? 'AbstractClass' : 'Class';
    const existing = new Set(get().metaModel.classes.map((c) => c.name));
    let name = base;
    let n = 1;
    while (existing.has(name)) name = `${base}${++n}`;
    const cls = { id, name, isAbstract, attributes: [] };
    set((s) => ({
      metaModel: { ...s.metaModel, classes: [...s.metaModel.classes, cls] },
    }));
    get().log(`Added ${isAbstract ? 'abstract ' : ''}class "${cls.name}"`);
    return id;
  },

  updateClass: (id, patch) => {
    if (patch.name !== undefined) {
      const { metaModel } = get();
      if (isJavaKeyword(patch.name)) {
        get().notify(`"${patch.name}" is a reserved Java keyword and cannot be used as a class name.`);
        return;
      }
      const duplicate = metaModel.classes.some((c) => c.id !== id && c.name === patch.name);
      if (duplicate) {
        get().notify(`A class named "${patch.name}" already exists. Class names must be unique.`);
        return;
      }
    }
    set((s) => ({
      metaModel: {
        ...s.metaModel,
        classes: s.metaModel.classes.map((c) => c.id === id ? { ...c, ...patch } : c),
      },
    }));
  },

  addClass_attribute: (classId, attr) => {
    const attrId = nanoid(8);
    const full = { id: attrId, name: 'attr', type: 'STRING', visibility: 'PUBLIC', lowerBound: 0, upperBound: 1, defaultValue: '', ...attr };
    // Validate attribute name
    const { metaModel } = get();
    const cls = metaModel.classes.find((c) => c.id === classId);
    if (isJavaKeyword(full.name)) {
      get().notify(`"${full.name}" is a reserved Java keyword and cannot be used as an attribute name.`);
      return null;
    }
    const existingNames = new Set(getAllAttributes(classId, metaModel).map((a) => a.name));
    if (existingNames.has(full.name)) {
      get().notify(`Attribute "${full.name}" already exists in "${cls?.name}" or one of its parent classes.`);
      return null;
    }
    set((s) => {
      const affected = new Set([classId, ...getSubclassIds(classId, s.metaModel)]);
      return {
        metaModel: {
          ...s.metaModel,
          classes: s.metaModel.classes.map((c) =>
            c.id === classId ? { ...c, attributes: [...c.attributes, full] } : c
          ),
        },
        instanceModels: s.instanceModels.map((im) => ({
          ...im,
          objects: im.objects.map((o) => {
            if (!affected.has(o.classId)) return o;
            const hasDef = full.defaultValue !== undefined && String(full.defaultValue).trim() !== '';
            const initVal = full.upperBound !== 1 ? [] : (hasDef ? String(full.defaultValue) : '');
            return { ...o, attributeValues: { ...o.attributeValues, [attrId]: initVal } };
          }),
        })),
      };
    });
    return attrId;
  },

  // Narrowing an attribute from multi- to single-valued (upperBound -> 1)
  // keeps only the first array element for every affected object — callers
  // (PropertiesPanel) should check this BEFORE calling updateAttribute with
  // a narrowing patch and confirm with the user if it's true, since the
  // rest of the values are otherwise dropped silently and there's no undo.
  wouldNarrowingLoseData: (classId, attrId) => {
    const { metaModel, instanceModels } = get();
    const affected = new Set([classId, ...getSubclassIds(classId, metaModel)]);
    return instanceModels.some((im) =>
      im.objects.some((o) => {
        if (!affected.has(o.classId)) return false;
        const v = o.attributeValues[attrId];
        return Array.isArray(v) && v.length > 1;
      })
    );
  },

  updateAttribute: (classId, attrId, patch) => {
    if (patch.name !== undefined) {
      const { metaModel } = get();
      if (isJavaKeyword(patch.name)) {
        get().notify(`"${patch.name}" is a reserved Java keyword and cannot be used as an attribute name.`);
        return;
      }
      // Check for name conflict with other attributes (inherited + own, excluding self)
      const allAttrs = getAllAttributes(classId, metaModel).filter((a) => a.id !== attrId);
      if (allAttrs.some((a) => a.name === patch.name)) {
        get().notify(`Attribute "${patch.name}" already exists in this class or one of its parent classes.`);
        return;
      }
    }
    set((s) => {
    const oldAttr    = s.metaModel.classes.find((c) => c.id === classId)?.attributes.find((a) => a.id === attrId);
    const newUpper   = patch.upperBound !== undefined ? patch.upperBound : (oldAttr?.upperBound ?? 1);
    const wasMulti   = oldAttr ? oldAttr.upperBound !== 1 : false;
    const isNowMulti = newUpper !== 1;
    const migrate    = wasMulti !== isNowMulti;
    const oldType    = oldAttr?.type;
    const newType    = patch.type ?? oldType;
    const typeChanged = !!oldType && oldType !== newType;
    const affected   = new Set([classId, ...getSubclassIds(classId, s.metaModel)]);

    const instanceModels = (migrate || typeChanged)
      ? s.instanceModels.map((im) => ({
          ...im,
          objects: im.objects.map((o) => {
            if (!affected.has(o.classId)) return o;
            let av = { ...o.attributeValues };

            if (migrate) {
              const oldVal = av[attrId];
              av[attrId] = isNowMulti
                ? (typeof oldVal === 'string' && oldVal.trim() ? [oldVal] : [])
                : (Array.isArray(oldVal) ? (oldVal[0] ?? '') : (oldVal ?? ''));
            }

            if (typeChanged) {
              av[attrId] = convertAttrValue(av[attrId], oldType, newType, oldAttr);
            }

            return { ...o, attributeValues: av };
          }),
        }))
      : s.instanceModels;

    return {
      metaModel: {
        ...s.metaModel,
        classes: s.metaModel.classes.map((c) =>
          c.id === classId
            ? { ...c, attributes: c.attributes.map((a) => a.id === attrId ? { ...a, ...patch } : a) }
            : c
        ),
      },
      instanceModels,
    };
    });
  },

  deleteAttribute: (classId, attrId) => set((s) => {
    const affected = new Set([classId, ...getSubclassIds(classId, s.metaModel)]);
    return {
      metaModel: {
        ...s.metaModel,
        classes: s.metaModel.classes.map((c) =>
          c.id === classId ? { ...c, attributes: c.attributes.filter((a) => a.id !== attrId) } : c
        ),
      },
      instanceModels: s.instanceModels.map((im) => ({
        ...im,
        objects: im.objects.map((o) =>
          affected.has(o.classId)
            ? { ...o, attributeValues: Object.fromEntries(Object.entries(o.attributeValues ?? {}).filter(([k]) => k !== attrId)) }
            : o
        ),
      })),
    };
  }),

  deleteClass: (id) => {
    set((s) => {
      const { [id]: _dropped, ...behaviours } = s.metaModel.behaviours ?? {};
      const { [`sm-${id}`]: _droppedLayout, ...layouts } = withoutLayoutEntry(s.layouts, mmKey(), id);
      return {
        metaModel: {
          ...s.metaModel,
          classes:   s.metaModel.classes.filter((c) => c.id !== id),
          relations: s.metaModel.relations.filter((r) => r.source !== id && r.target !== id),
          behaviours,
        },
        instanceModels: s.instanceModels.map((im) => {
          const keptIds = new Set(im.objects.filter((o) => o.classId !== id).map((o) => o.id));
          return {
            ...im,
            objects: im.objects.filter((o) => o.classId !== id),
            links: im.links.filter((l) => keptIds.has(l.source) && keptIds.has(l.target)),
            connectors: (im.connectors ?? []).filter((c) => keptIds.has(c.sourceObjectId) && keptIds.has(c.targetObjectId)),
          };
        }),
        layouts,
        nodes:       s.nodes.filter((n) => n.id !== id),
        edges:       s.edges.filter((e) => e.source !== id && e.target !== id),
        selectedId:  s.selectedId === id ? null : s.selectedId,
        selectedType: s.selectedId === id ? null : s.selectedType,
      };
    });
    get().log(`Deleted class ${id}`);
  },

  // ── Enumeration operations ────────────────────────────────────────
  addEnumeration: () => {
    const id = nanoid(8);
    const existing = new Set(get().metaModel.enumerations?.map((e) => e.name) ?? []);
    let name = 'Enum';
    let n = 1;
    while (existing.has(name)) name = `Enum${++n}`;
    const en = { id, name, literals: [] };
    set((s) => ({
      metaModel: { ...s.metaModel, enumerations: [...(s.metaModel.enumerations ?? []), en] },
    }));
    get().log(`Added enumeration "${name}"`);
    return id;
  },

  updateEnumeration: (id, patch) => {
    if (patch.name !== undefined) {
      const { metaModel } = get();
      if (isJavaKeyword(patch.name)) {
        get().notify(`"${patch.name}" is a reserved Java keyword and cannot be used as an enum name.`);
        return;
      }
      // Enums and classes share Java's type namespace — names must not collide.
      const clash = (metaModel.enumerations ?? []).some((e) => e.id !== id && e.name === patch.name)
        || metaModel.classes.some((c) => c.name === patch.name);
      if (clash) {
        get().notify(`A class or enumeration named "${patch.name}" already exists. Names must be unique.`);
        return;
      }
    }
    set((s) => ({
      metaModel: {
        ...s.metaModel,
        enumerations: (s.metaModel.enumerations ?? []).map((e) => e.id === id ? { ...e, ...patch } : e),
      },
    }));
  },

  deleteEnumeration: (id) => {
    set((s) => ({
      metaModel: {
        ...s.metaModel,
        enumerations: (s.metaModel.enumerations ?? []).filter((e) => e.id !== id),
        // Revert any attribute that referenced this enum back to STRING.
        classes: s.metaModel.classes.map((c) => ({
          ...c,
          attributes: c.attributes.map((a) =>
            a.type === 'ENUM' && a.enumId === id ? { ...a, type: 'STRING', enumId: undefined } : a
          ),
        })),
        // Same reversion for protocol signal params typed with this enum —
        // otherwise they're left with a dangling enumId, desyncing
        // ProtocolManager's type dropdown from the stored param data.
        protocols: (s.metaModel.protocols ?? []).map((p) => ({
          ...p,
          signals: p.signals.map((sg) => ({
            ...sg,
            params: (sg.params ?? []).map((pr) =>
              pr.type === 'ENUM' && pr.enumId === id ? { ...pr, type: 'STRING', enumId: undefined } : pr
            ),
          })),
        })),
      },
      nodes:        s.nodes.filter((n) => n.id !== id),
      layouts:      withoutLayoutEntry(s.layouts, mmKey(), id),
      selectedId:   s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType,
    }));
    get().log(`Deleted enumeration ${id}`);
  },

  addEnumLiteral: (enumId, literal) => {
    const val = String(literal ?? '').trim();
    if (!val) return;
    const en = (get().metaModel.enumerations ?? []).find((e) => e.id === enumId);
    if (en && en.literals.includes(val)) {
      get().notify(`Literal "${val}" already exists in "${en.name}".`);
      return;
    }
    set((s) => ({
      metaModel: {
        ...s.metaModel,
        enumerations: (s.metaModel.enumerations ?? []).map((e) =>
          e.id === enumId ? { ...e, literals: [...e.literals, val] } : e
        ),
      },
    }));
  },

  // Renaming a literal does not rewrite existing instance values; conformance
  // will flag any object still referencing the old literal.
  updateEnumLiteral: (enumId, index, newVal) => {
    const val = String(newVal ?? '').trim();
    if (!val) return;
    const en = (get().metaModel.enumerations ?? []).find((e) => e.id === enumId);
    if (en && en.literals.some((l, i) => i !== index && l === val)) {
      get().notify(`Literal "${val}" already exists in "${en.name}".`);
      return;
    }
    set((s) => ({
      metaModel: {
        ...s.metaModel,
        enumerations: (s.metaModel.enumerations ?? []).map((e) =>
          e.id === enumId ? { ...e, literals: e.literals.map((l, i) => i === index ? val : l) } : e
        ),
      },
    }));
  },

  deleteEnumLiteral: (enumId, index) => set((s) => ({
    metaModel: {
      ...s.metaModel,
      enumerations: (s.metaModel.enumerations ?? []).map((e) =>
        e.id === enumId ? { ...e, literals: e.literals.filter((_, i) => i !== index) } : e
      ),
    },
  })),

  addRelation: (kind, source, target, sourceHandle, targetHandle) => {
    const { metaModel } = get();
    const err = validateRelation(metaModel, null, kind, source, target, '');
    if (err) { get().notify(err); return null; }

    const id  = nanoid(8);
    const rel = { id, kind, source, target, name: '', sourceMultiplicity: '', targetMultiplicity: '', sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null };
    set((s) => ({
      metaModel: { ...s.metaModel, relations: [...s.metaModel.relations, rel] },
    }));
    get().log(`Added ${kind}: ${source} → ${target}`);
    return id;
  },

  // Returns false (and toasts) if the patch would violate a relation
  // invariant addRelation itself would have blocked at creation time — e.g.
  // changing Kind to INHERITANCE, or reconnecting an edge endpoint, into a
  // self-loop or a cycle. Returns true on success so callers (ModelCanvas's
  // onReconnect) can tell whether to keep their optimistic canvas update.
  updateRelation: (id, patch) => {
    const { metaModel } = get();
    const existing = metaModel.relations.find((r) => r.id === id);
    if (!existing) return false;
    const kind   = patch.kind   ?? existing.kind;
    const source = patch.source ?? existing.source;
    const target = patch.target ?? existing.target;
    const name   = patch.name   ?? existing.name;
    const structuralChange = patch.kind !== undefined || patch.source !== undefined
      || patch.target !== undefined || patch.name !== undefined;
    if (structuralChange) {
      const err = validateRelation(metaModel, id, kind, source, target, name);
      if (err) { get().notify(err); return false; }
    }
    set((s) => ({
      metaModel: {
        ...s.metaModel,
        relations: s.metaModel.relations.map((r) => r.id === id ? { ...r, ...patch } : r),
      },
    }));
    return true;
  },

  deleteRelation: (id) => {
    set((s) => ({
      metaModel: { ...s.metaModel, relations: s.metaModel.relations.filter((r) => r.id !== id) },
      // A link's relationId would otherwise dangle forever — same cascade
      // deleteClass already does for links touching a deleted object.
      instanceModels: s.instanceModels.map((im) => ({
        ...im,
        links: im.links.filter((l) => l.relationId !== id),
      })),
      edges:       s.edges.filter((e) => e.id !== id),
      selectedId:  s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType,
    }));
    get().log(`Deleted relation ${id}`);
  },

  updateMetaModelName: (name) => set((s) => ({ metaModel: { ...s.metaModel, name } })),

  clearMetaModel: () => {
    suppressDirty = true;
    set({
      metaModel: { ...EMPTY_MM },
      instanceModels: [mkIM('InstanceModel1')],
      currentIMIndex: 0,
      nodes: [], edges: [],
      selectedId: null, selectedType: null,
      conformanceResults: [],
      layouts: {},
      dirty: false,
    });
    suppressDirty = false;
    get().log('Meta-model cleared.');
  },

  clearInstanceModel: () => {
    suppressDirty = true;
    set((s) => ({
      instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, () => ({ objects: [], links: [], connectors: [] })),
      nodes: [], edges: [],
      selectedId: null, selectedType: null,
      conformanceResults: [],
      dirty: false,
    }));
    suppressDirty = false;
    get().log('Instance model cleared.');
  },

  // ══════════════════════════════════════════════════════════════════
  // INSTANCE MODELS (multiple)
  // ══════════════════════════════════════════════════════════════════
  instanceModels: [mkIM('InstanceModel1')],
  currentIMIndex: 0,

  addInstanceModel: () => {
    const newIM = mkIM(`InstanceModel${get().instanceModels.length + 1}`);
    const idx   = get().instanceModels.length;
    set((s) => ({ instanceModels: [...s.instanceModels, newIM] }));
    get().switchInstanceModel(idx);
    get().log(`Created instance model "${newIM.name}"`);
  },

  switchInstanceModel: (idx) => {
    set({
      currentIMIndex:   idx,
      selectedId:       null,
      selectedType:     null,
      conformanceResults: [],
    });
    // Only Structural Modeling's canvas is keyed off currentIMIndex — skip the
    // rebuild when it isn't actually showing instance mode (e.g. called from
    // Behavioural Modeling's instance-model picker), or this would clobber
    // whatever canvas Structural Modeling has on screen with instance data.
    if (get().mode === 'instance') {
      set({ nodes: [], edges: [] });
      get().rebuildCanvas('instance');
    }
    get().log(`Switched to instance model "${get().instanceModels[idx]?.name}"`);
  },

  deleteInstanceModel: (idx) => {
    const s = get();
    if (s.instanceModels.length <= 1) return; // keep at least one
    const removedId = s.instanceModels[idx]?.id;
    const newList = s.instanceModels.filter((_, i) => i !== idx);
    // Deleting an entry before the current selection shifts it left by one;
    // Math.min alone (the old bug) only handled deleting at/after it.
    const newIdx = idx < s.currentIMIndex
      ? s.currentIMIndex - 1
      : Math.min(s.currentIMIndex, newList.length - 1);
    // Drop this instance model's own layout entries — otherwise they linger
    // forever, keyed off an id nothing references anymore.
    const { [`im-${removedId}`]: _imLayout, [`cs-${removedId}`]: _csLayout, ...layouts } = s.layouts;
    set({ instanceModels: newList, currentIMIndex: newIdx, layouts });
    get().rebuildCanvas('instance');
    get().log(`Deleted instance model at index ${idx}`);
  },

  updateInstanceModelName: (name) => set((s) => ({
    instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, () => ({ name })),
  })),

  // ── Instance model operations (always on currentIMIndex) ──────────
  addObject: (classId) => {
    const id  = nanoid(8);
    const mm  = get().metaModel;
    const cls = mm.classes.find((c) => c.id === classId);
    if (!cls) return null;
    const allAttrs = getAllAttributes(classId, mm);
    const attributeValues = {};
    for (const a of allAttrs) {
      const hasDef = a.defaultValue !== undefined && String(a.defaultValue).trim() !== '';
      attributeValues[a.id] = a.upperBound !== 1 ? [] : (hasDef ? String(a.defaultValue) : '');
    }
    // Auto-increment against every object already in this instance model
    // (not just same-class) — matching every other auto-named entity in the
    // app (classes, ports, states, …), and because generated code needs a
    // unique local variable per object regardless of class.
    const existingNames = new Set((get().instanceModels[get().currentIMIndex]?.objects ?? []).map((o) => o.name));
    let n = 1;
    let name = `${cls.name}${n}`;
    while (existingNames.has(name)) name = `${cls.name}${++n}`;
    const obj = { id, classId, name, attributeValues };
    set((s) => ({
      instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({ objects: [...im.objects, obj] })),
    }));
    get().log(`Added object "${obj.name}" : ${cls.name}`);
    return id;
  },

  updateObject: (id, patch) => {
    if (patch.name !== undefined) {
      const trimmed = String(patch.name).trim();
      const im = get().instanceModels[get().currentIMIndex];
      // Scoped to the whole instance model, not just same-class — two
      // objects sharing a name (even across classes) both compile down to
      // the same local variable name in generated code, and it's confusing
      // in the diagram regardless of class.
      if (im && im.objects.some((o) => o.id !== id && o.name === trimmed)) {
        get().notify(`"${trimmed}" is already used by another object in "${im.name}". Object names must be unique within an instance model.`);
        return;
      }
      patch = { ...patch, name: trimmed };
    }
    set((s) => ({
      instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({
        objects: im.objects.map((o) => o.id === id ? { ...o, ...patch } : o),
      })),
    }));
  },

  updateSlotValues: (objId, attrId, values) => set((s) => ({
    instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({
      objects: im.objects.map((o) =>
        o.id === objId ? { ...o, attributeValues: { ...o.attributeValues, [attrId]: values } } : o
      ),
    })),
  })),

  updateSlot: (objId, attrId, value) => set((s) => ({
    instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({
      objects: im.objects.map((o) =>
        o.id === objId ? { ...o, attributeValues: { ...o.attributeValues, [attrId]: value } } : o
      ),
    })),
  })),

  deleteObject: (id) => {
    set((s) => ({
      instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({
        objects: im.objects.filter((o) => o.id !== id),
        links:   im.links.filter((l) => l.source !== id && l.target !== id),
        connectors: (im.connectors ?? []).filter((c) => c.sourceObjectId !== id && c.targetObjectId !== id),
      })),
      nodes:       s.nodes.filter((n) => n.id !== id),
      edges:       s.edges.filter((e) => e.source !== id && e.target !== id),
      // Parts (capsule-structure canvas) reuse the object's own id, so its
      // position can be saved under either layout key depending on which
      // canvas the drag happened on — prune both.
      layouts:     withoutLayoutEntry(
        withoutLayoutEntry(s.layouts, imKey(s.instanceModels[s.currentIMIndex]?.id), id),
        `cs-${s.instanceModels[s.currentIMIndex]?.id}`, id,
      ),
      selectedId:  s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType,
    }));
  },

  updateLink: (id, patch) => set((s) => ({
    instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({
      links: im.links.map((l) => l.id === id ? { ...l, ...patch } : l),
    })),
  })),

  addLink: (relationId, source, target, sourceHandle, targetHandle) => {
    const id = nanoid(8);
    set((s) => ({
      instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({
        links: [...im.links, { id, relationId, source, target, sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null }],
      })),
    }));
    return id;
  },

  deleteLink: (id) => {
    set((s) => ({
      instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({
        links: im.links.filter((l) => l.id !== id),
      })),
      edges:       s.edges.filter((e) => e.id !== id),
      selectedId:  s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType,
    }));
  },

  // ── Capsule structure connectors (per instance model) ──────────────
  // A connector joins one base port to one conjugate port of the same
  // protocol, on two distinct objects. See capsuleStructureStore.js for the
  // canvas that edits these.
  addConnector: (sourceObjectId, sourcePortId, targetObjectId, targetPortId) => {
    if (sourceObjectId === targetObjectId) {
      get().notify('A connector cannot join a part to itself.');
      return null;
    }
    const { metaModel, instanceModels, currentIMIndex } = get();
    const im = instanceModels[currentIMIndex];
    const srcPort = getPortByEndpoint(metaModel, im?.objects ?? [], sourceObjectId, sourcePortId);
    const tgtPort = getPortByEndpoint(metaModel, im?.objects ?? [], targetObjectId, targetPortId);
    if (!srcPort || !tgtPort) return null;

    if (getProtocolById(srcPort.protocolId, metaModel)?.system || getProtocolById(tgtPort.protocolId, metaModel)?.system) {
      get().notify('Service ports (Timing, Log, …) connect to the runtime, not to other parts.');
      return null;
    }
    if (srcPort.protocolId !== tgtPort.protocolId) {
      get().notify('Connectors must join ports typed by the same protocol.');
      return null;
    }
    if (srcPort.conjugated === tgtPort.conjugated) {
      get().notify('Connectors must join a base port to a conjugate port.');
      return null;
    }
    // Port ids are defined once on the class and shared by every instance, so
    // "already connected" must be scoped to the (object, port) pair — not the
    // bare port id — or a second object's identically-named port would be
    // wrongly seen as already taken.
    const portInUse = (im?.connectors ?? []).some((c) =>
      (c.sourceObjectId === sourceObjectId && c.sourcePortId === sourcePortId) ||
      (c.targetObjectId === sourceObjectId && c.targetPortId === sourcePortId) ||
      (c.sourceObjectId === targetObjectId && c.sourcePortId === targetPortId) ||
      (c.targetObjectId === targetObjectId && c.targetPortId === targetPortId)
    );
    if (portInUse) {
      get().notify('One of these ports is already connected.');
      return null;
    }

    const id = nanoid(8);
    set((s) => ({
      instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (cur) => ({
        connectors: [...(cur.connectors ?? []), { id, sourceObjectId, sourcePortId, targetObjectId, targetPortId }],
      })),
    }));
    return id;
  },

  deleteConnector: (id) => {
    set((s) => ({
      instanceModels: withCurrentIM(s.instanceModels, s.currentIMIndex, (im) => ({
        connectors: (im.connectors ?? []).filter((c) => c.id !== id),
      })),
    }));
  },

  // ══════════════════════════════════════════════════════════════════
  // BEHAVIOUR — per-class state machines (metaModel.behaviours[classId])
  // State positions live in layouts['sm-<classId>'] (kept out of the model,
  // mirroring how structural node positions are stored).
  // ══════════════════════════════════════════════════════════════════
  getBehaviour: (classId) => get().metaModel.behaviours?.[classId] ?? null,

  addState: (classId, kind = 'simple') => {
    const machine = get().metaModel.behaviours?.[classId] ?? { states: [], transitions: [] };
    if (kind === 'initial' && machine.states.some((s) => s.kind === 'initial')) {
      get().notify('A state machine can have only one initial state.');
      return null;
    }
    const id = nanoid(8);
    // Initial and final are symbol-only pseudostates (no name).
    let name = '';
    if (kind === 'simple') {
      const existing = new Set(machine.states.filter((s) => s.kind === 'simple').map((s) => s.name));
      let n = machine.states.filter((s) => s.kind === 'simple').length + 1;
      name = `State${n}`;
      while (existing.has(name)) name = `State${++n}`;
    }
    const state = { id, kind, name, entry: '', exit: '' };
    set((s) => ({ metaModel: withMachine(s.metaModel, classId, (m) => ({ ...m, states: [...m.states, state] })) }));
    return id;
  },

  updateState: (classId, stateId, patch) =>
    set((s) => ({ metaModel: withMachine(s.metaModel, classId, (m) => ({
      ...m, states: m.states.map((st) => st.id === stateId ? { ...st, ...patch } : st),
    })) })),

  deleteState: (classId, stateId) =>
    set((s) => {
      const smKey  = `sm-${classId}`;
      const layout = { ...(s.layouts[smKey] ?? {}) };
      delete layout[stateId];
      return {
        metaModel: withMachine(s.metaModel, classId, (m) => ({
          states:      m.states.filter((st) => st.id !== stateId),
          transitions: m.transitions.filter((t) => t.source !== stateId && t.target !== stateId),
        })),
        layouts: { ...s.layouts, [smKey]: layout },
      };
    }),

  addTransition: (classId, source, target, sourceHandle, targetHandle) => {
    const machine  = get().metaModel.behaviours?.[classId] ?? { states: [], transitions: [] };
    const srcState = machine.states.find((st) => st.id === source);
    const tgtState = machine.states.find((st) => st.id === target);
    if (srcState?.kind === 'final') {
      get().notify('A final state cannot have outgoing transitions.');
      return null;
    }
    if (tgtState?.kind === 'initial') {
      get().notify('The initial pseudostate cannot have incoming transitions.');
      return null;
    }
    const id = nanoid(8);
    const transition = { id, source, target, trigger: '', guard: '', effect: '', sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null };
    set((s) => ({ metaModel: withMachine(s.metaModel, classId, (m) => ({ ...m, transitions: [...m.transitions, transition] })) }));
    return id;
  },

  updateTransition: (classId, transId, patch) => {
    // Reconnecting an existing transition's endpoint is the other path (besides
    // addTransition) that can produce an outgoing-from-Final or incoming-to-Initial
    // transition — apply the same pseudostate validation here.
    if (patch.source !== undefined || patch.target !== undefined) {
      const machine  = get().metaModel.behaviours?.[classId] ?? { states: [], transitions: [] };
      const existing = machine.transitions.find((t) => t.id === transId);
      const source   = patch.source ?? existing?.source;
      const target   = patch.target ?? existing?.target;
      const srcState = machine.states.find((st) => st.id === source);
      const tgtState = machine.states.find((st) => st.id === target);
      if (srcState?.kind === 'final') {
        get().notify('A final state cannot have outgoing transitions.');
        return;
      }
      if (tgtState?.kind === 'initial') {
        get().notify('The initial pseudostate cannot have incoming transitions.');
        return;
      }
    }
    // A guard on the initial transition used to be silently ignored at
    // codegen — start() always takes it unconditionally since there's no
    // triggering signal at bootstrap for the guard to evaluate against.
    // Block it at edit time instead of letting it look like it does something.
    if (patch.guard !== undefined && String(patch.guard).trim() !== '') {
      const machine  = get().metaModel.behaviours?.[classId] ?? { states: [], transitions: [] };
      const existing = machine.transitions.find((t) => t.id === transId);
      const srcState = machine.states.find((st) => st.id === existing?.source);
      if (srcState?.kind === 'initial') {
        get().notify('The initial transition always fires — it cannot have a guard.');
        return;
      }
    }
    set((s) => ({ metaModel: withMachine(s.metaModel, classId, (m) => ({
      ...m, transitions: m.transitions.map((t) => t.id === transId ? { ...t, ...patch } : t),
    })) }));
  },

  deleteTransition: (classId, transId) =>
    set((s) => ({ metaModel: withMachine(s.metaModel, classId, (m) => ({
      ...m, transitions: m.transitions.filter((t) => t.id !== transId),
    })) })),

  // Persist state-machine node positions into layouts['sm-<classId>'].
  setStatePositions: (classId, posMap) =>
    set((s) => {
      const smKey = `sm-${classId}`;
      return { layouts: { ...s.layouts, [smKey]: { ...(s.layouts[smKey] ?? {}), ...posMap } } };
    }),

  // Persists capsule-structure-diagram part positions, keyed independently
  // from the object/attribute canvas's 'im-<id>' layout (see capsuleStructureStore.js).
  setPartPositions: (instanceModelId, posMap) =>
    set((s) => {
      const csKey = `cs-${instanceModelId}`;
      return { layouts: { ...s.layouts, [csKey]: { ...(s.layouts[csKey] ?? {}), ...posMap } } };
    }),

  // ══════════════════════════════════════════════════════════════════
  // PROTOCOLS & PORTS (UML-RT messaging interface)
  // ══════════════════════════════════════════════════════════════════
  addProtocol: () => {
    const id = nanoid(8);
    const existing = new Set(allProtocols(get().metaModel).map((p) => p.name));
    let name = 'Protocol';
    let n = 1;
    while (existing.has(name)) name = `Protocol${++n}`;
    set((s) => ({ metaModel: { ...s.metaModel, protocols: [...(s.metaModel.protocols ?? []), { id, name, signals: [] }] } }));
    return id;
  },

  updateProtocol: (id, patch) => {
    if (patch.name !== undefined) {
      const trimmed = String(patch.name).trim();
      if (isJavaKeyword(trimmed)) {
        get().notify(`"${trimmed}" is a reserved Java keyword and cannot be used as a protocol name.`);
        return;
      }
      const duplicate = allProtocols(get().metaModel).some((p) => p.id !== id && p.name === trimmed);
      if (duplicate) {
        get().notify(`A protocol named "${trimmed}" already exists. Protocol names must be unique.`);
        return;
      }
      patch = { ...patch, name: trimmed };
    }
    set((s) => ({ metaModel: withProtocol(s.metaModel, id, (p) => ({ ...p, ...patch })) }));
  },

  deleteProtocol: (id) =>
    set((s) => {
      const metaModel = {
        ...s.metaModel,
        protocols: (s.metaModel.protocols ?? []).filter((p) => p.id !== id),
        // Drop any ports that referenced the removed protocol.
        classes: s.metaModel.classes.map((c) => ({ ...c, ports: (c.ports ?? []).filter((pt) => pt.protocolId !== id) })),
      };
      return { metaModel, instanceModels: pruneDanglingConnectors(metaModel, s.instanceModels) };
    }),

  addSignal: (protocolId, direction = 'in') => {
    const id = nanoid(8);
    set((s) => ({ metaModel: withProtocol(s.metaModel, protocolId, (p) => {
      const existing = new Set(p.signals.map((sg) => sg.name));
      let n = p.signals.length + 1;
      let name = `signal${n}`;
      while (existing.has(name)) name = `signal${++n}`;
      return { ...p, signals: [...p.signals, { id, name, direction, params: [] }] };
    }) }));
    return id;
  },

  updateSignal: (protocolId, signalId, patch) => {
    if (patch.name !== undefined) {
      const trimmed = String(patch.name).trim();
      if (isJavaKeyword(trimmed)) {
        get().notify(`"${trimmed}" is a reserved Java keyword and cannot be used as a signal name.`);
        return;
      }
      const protocol = allProtocols(get().metaModel).find((p) => p.id === protocolId);
      const duplicate = (protocol?.signals ?? []).some((sg) => sg.id !== signalId && sg.name === trimmed);
      if (duplicate) {
        get().notify(`"${protocol?.name}" already has a signal named "${trimmed}".`);
        return;
      }
      patch = { ...patch, name: trimmed };
    }
    set((s) => ({ metaModel: withProtocol(s.metaModel, protocolId, (p) =>
      withSignal(p, signalId, (sg) => ({ ...sg, ...patch }))) }));
  },

  deleteSignal: (protocolId, signalId) =>
    set((s) => ({ metaModel: withProtocol(s.metaModel, protocolId, (p) => ({
      ...p, signals: p.signals.filter((sg) => sg.id !== signalId),
    })) })),

  addParam: (protocolId, signalId) => {
    const id = nanoid(8);
    set((s) => ({ metaModel: withProtocol(s.metaModel, protocolId, (p) =>
      withSignal(p, signalId, (sg) => {
        const params = sg.params ?? [];
        const existing = new Set(params.map((pr) => pr.name));
        let n = params.length + 1;
        let name = `param${n}`;
        while (existing.has(name)) name = `param${++n}`;
        return { ...sg, params: [...params, { id, name, type: 'STRING' }] };
      })) }));
    return id;
  },

  updateParam: (protocolId, signalId, paramId, patch) => {
    if (patch.name !== undefined) {
      const trimmed = String(patch.name).trim();
      if (isJavaKeyword(trimmed)) {
        get().notify(`"${trimmed}" is a reserved Java keyword and cannot be used as a parameter name.`);
        return;
      }
      const protocol = allProtocols(get().metaModel).find((p) => p.id === protocolId);
      const signal = protocol?.signals.find((sg) => sg.id === signalId);
      const duplicate = (signal?.params ?? []).some((pr) => pr.id !== paramId && pr.name === trimmed);
      if (duplicate) {
        get().notify(`"${signal?.name}" already has a parameter named "${trimmed}".`);
        return;
      }
      patch = { ...patch, name: trimmed };
    }
    set((s) => ({ metaModel: withProtocol(s.metaModel, protocolId, (p) =>
      withSignal(p, signalId, (sg) => ({
        ...sg, params: (sg.params ?? []).map((pr) => pr.id === paramId ? { ...pr, ...patch } : pr),
      }))) }));
  },

  deleteParam: (protocolId, signalId, paramId) =>
    set((s) => ({ metaModel: withProtocol(s.metaModel, protocolId, (p) =>
      withSignal(p, signalId, (sg) => ({
        ...sg, params: (sg.params ?? []).filter((pr) => pr.id !== paramId),
      }))) })),

  addPort: (classId) => {
    const id = nanoid(8);
    const cls = get().metaModel.classes.find((c) => c.id === classId);
    const existing = new Set((cls?.ports ?? []).map((p) => p.name));
    let name = 'port';
    let n = 1;
    while (existing.has(name)) name = `port${++n}`;
    const port = { id, name, protocolId: SYSTEM_PROTOCOLS[0].id, conjugated: false };
    set((s) => ({ metaModel: { ...s.metaModel, classes: s.metaModel.classes.map((c) =>
      c.id === classId ? { ...c, ports: [...(c.ports ?? []), port] } : c) } }));
    return id;
  },

  updatePort: (classId, portId, patch) => {
    if (patch.name !== undefined) {
      const trimmed = String(patch.name).trim();
      const cls = get().metaModel.classes.find((c) => c.id === classId);
      if (cls && (cls.ports ?? []).some((p) => p.id !== portId && p.name === trimmed)) {
        get().notify(`"${cls.name}" already has a port named "${trimmed}".`);
        return;
      }
      patch = { ...patch, name: trimmed };
    }
    set((s) => {
      const metaModel = { ...s.metaModel, classes: s.metaModel.classes.map((c) => {
        if (c.id !== classId) return c;
        return { ...c, ports: (c.ports ?? []).map((p) => {
          if (p.id !== portId) return p;
          const next = { ...p, ...patch };
          // Conjugating a system port (Timing/Log) is meaningless — the
          // sys-timing/sys-log codegen path never reads `conjugated` at all,
          // so it used to silently do nothing while the UI implied it should
          // flip the port's direction. Keep the two mutually exclusive.
          const proto = allProtocols(s.metaModel).find((pr) => pr.id === next.protocolId);
          if (proto?.system) next.conjugated = false;
          return next;
        }) };
      }) };
      // Re-validate: a protocolId/conjugated change may invalidate an existing connector.
      const instanceModels = ('protocolId' in patch || 'conjugated' in patch)
        ? pruneDanglingConnectors(metaModel, s.instanceModels)
        : s.instanceModels;
      return { metaModel, instanceModels };
    });
  },

  deletePort: (classId, portId) =>
    set((s) => {
      const metaModel = { ...s.metaModel, classes: s.metaModel.classes.map((c) =>
        c.id === classId ? { ...c, ports: (c.ports ?? []).filter((p) => p.id !== portId) } : c) };
      return { metaModel, instanceModels: pruneDanglingConnectors(metaModel, s.instanceModels) };
    }),

  // ══════════════════════════════════════════════════════════════════
  // CONFORMANCE VALIDATION
  // ══════════════════════════════════════════════════════════════════
  _runValidate: () => {
    const { metaModel, instanceModels, currentIMIndex } = get();
    set({ conformanceResults: validateConformance(metaModel, instanceModels[currentIMIndex]) });
  },


  // ══════════════════════════════════════════════════════════════════
  // SERIALIZATION
  // ══════════════════════════════════════════════════════════════════
  getFullJSON: () => {
    const s = get();
    return { metaModel: s.metaModel, instanceModels: s.instanceModels, layouts: s.layouts };
  },

  loadFromJSON: (data) => {
    // A syntactically-valid-JSON-but-wrong-shaped file (old schema, an
    // unrelated file, a hand-edit gone wrong) used to pass straight through
    // and crash the first time something downstream did an unconditional
    // array access — with no error boundary anywhere, that's a blank white
    // screen. Refuse up front instead, with a message naming what's wrong.
    const shapeError = validateModelShape(data);
    if (shapeError) { get().notify(`Couldn't load file: ${shapeError}`); return; }

    // Loading a file is itself the "save point" — suppressed for the whole
    // function (not just one set() call) since this makes several separate
    // set() calls below, each of which would otherwise re-mark the session
    // dirty via the module-level subscribe handler.
    suppressDirty = true;

    // Backfill enumerations / behaviours / protocols for older models.
    set({ metaModel: { ...data.metaModel, enumerations: data.metaModel.enumerations ?? [], behaviours: data.metaModel.behaviours ?? {}, protocols: data.metaModel.protocols ?? [] } });

    const normalizeIM = (im) => ({
      ...im,
      objects: (im.objects ?? []).map((obj) => {
        // Legacy format (slots array) → attributeValues map
        if (Array.isArray(obj.slots) && !obj.attributeValues) {
          const attributeValues = {};
          for (const sl of obj.slots) {
            attributeValues[sl.attrId] = sl.values !== undefined ? sl.values : (sl.value ?? '');
          }
          const { slots: _slots, className: _className, ...rest } = obj;
          return { ...rest, attributeValues };
        }
        // New format: strip legacy className field if present
        const { className: _className, ...rest } = obj;
        return rest;
      }),
      // Normalise link endpoints: source/target are the canonical field names.
      links: (im.links ?? []).map((l) => ({
        ...l,
        source: l.source ?? l.sourceId,
        target: l.target ?? l.targetId,
      })),
      connectors: im.connectors ?? [],
    });

    if (Array.isArray(data.instanceModels)) {
      set({ instanceModels: data.instanceModels.map(normalizeIM), currentIMIndex: 0 });
    } else if (data.instanceModel && typeof data.instanceModel === 'object') {
      set({ instanceModels: [normalizeIM(data.instanceModel)], currentIMIndex: 0 });
    }

    if (data.layouts) set({ layouts: data.layouts });
    set({ nodes: [], edges: [], selectedId: null, conformanceResults: [], dirty: false });
    suppressDirty = false;
    get().log('Model loaded.');
    get().rebuildCanvas(get().mode);
  },

  // ══════════════════════════════════════════════════════════════════
  // CANVAS REBUILD (uses persisted layout)
  // ══════════════════════════════════════════════════════════════════
  rebuildCanvas: (mode) => {
    const s         = get();
    const currIM    = s.instanceModels[s.currentIMIndex];
    const layoutKey = mode === 'metamodel' ? mmKey() : imKey(currIM?.id);
    const saved     = s.layouts[layoutKey] ?? {};

    const getPos = (id, idx) =>
      saved[id] ?? { x: 80 + (idx % 4) * 240, y: 80 + Math.floor(idx / 4) * 200 };

    if (mode === 'metamodel') {
      const classNodes = s.metaModel.classes.map((cls, i) => ({
        id: cls.id, type: 'classNode',
        position: getPos(cls.id, i),
        data: { classId: cls.id },
      }));
      const enumNodes = (s.metaModel.enumerations ?? []).map((en, i) => ({
        id: en.id, type: 'enumNode',
        position: getPos(en.id, s.metaModel.classes.length + i),
        data: { enumId: en.id },
      }));
      set({
        nodes: [...classNodes, ...enumNodes],
        edges: s.metaModel.relations.map(relationToEdge),
      });
    } else {
      if (!currIM) return;
      set({
        nodes: currIM.objects.map((obj, i) => ({
          id: obj.id, type: 'objectNode',
          position: getPos(obj.id, i),
          data: { objectId: obj.id },
        })),
        edges: currIM.links.map((l) => linkToEdge(l, s.metaModel)),
      });
    }
    get().log(`Canvas rebuilt: ${mode}`);
  },
}));

// Live conformance: re-validate whenever model data changes. Debounced so
// typing in a name/attribute field doesn't run a full model scan on every
// keystroke — only once the user pauses.
let validateTimer = null;
useModelStore.subscribe((state, prevState) => {
  if (
    state.metaModel       !== prevState.metaModel ||
    state.instanceModels  !== prevState.instanceModels ||
    state.currentIMIndex  !== prevState.currentIMIndex
  ) {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => useModelStore.getState()._runValidate(), 250);
  }
});

// Unsaved-work tracking: any metaModel/instanceModels change marks the
// session dirty, UNLESS it came from a deliberate fresh load/clear action
// (which sets suppressDirty for its own duration — see the flag's own
// comment above). Deliberately does NOT also watch currentIMIndex — just
// switching which instance model tab you're looking at isn't work you'd be
// upset to lose.
useModelStore.subscribe((state, prevState) => {
  if (state.metaModel !== prevState.metaModel || state.instanceModels !== prevState.instanceModels) {
    if (!suppressDirty && !state.dirty) useModelStore.setState({ dirty: true });
  }
});

// Periodic crash-recovery snapshot to localStorage (see utils/autosave.js).
// Always writes the current state, dirty flag included — App.jsx's
// mount-time restore prompt only offers to restore when the snapshot's own
// `dirty` is true, i.e. there really was unsaved work at the moment of the
// last reload/crash. A clean save point (a fresh load, a deliberate Clear)
// resets `dirty` to false, so the *next* snapshot correctly stops looking
// like something worth recovering, without needing to special-case those
// actions here.
let autosaveTimer = null;
useModelStore.subscribe((state, prevState) => {
  if (
    state.metaModel      !== prevState.metaModel ||
    state.instanceModels !== prevState.instanceModels ||
    state.layouts        !== prevState.layouts
  ) {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const s = useModelStore.getState();
      saveAutosave({ metaModel: s.metaModel, instanceModels: s.instanceModels, layouts: s.layouts, dirty: s.dirty });
    }, 2000);
  }
});
