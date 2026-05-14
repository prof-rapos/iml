import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

const mkIM = (name = 'NewInstanceModel') => ({
  id: nanoid(8),
  kind: 'instancemodel',
  name,
  objects: [],
  links: [],
});

const EMPTY_MM = { kind: 'metamodel', name: 'NewMetaModel', classes: [], relations: [] };

// ── Inheritance-aware class conformance ──────────────────────────────────────
// Returns true if classId equals expectedId or is a (transitive) subclass of it.
// INHERITANCE relations are stored as source=child, target=parent.
function isConformantClass(classId, expectedId, relations) {
  if (classId === expectedId) return true;
  const parentRel = relations.find((r) => r.kind === 'INHERITANCE' && r.source === classId);
  if (!parentRel) return false;
  return isConformantClass(parentRel.target, expectedId, relations);
}

// Returns all attributes visible on classId, including inherited ones (parent first).
export function getAllAttributes(classId, metaModel) {
  const cls = metaModel.classes.find((c) => c.id === classId);
  if (!cls) return [];
  const parentRel = metaModel.relations.find((r) => r.kind === 'INHERITANCE' && r.source === classId);
  const parentAttrs = parentRel ? getAllAttributes(parentRel.target, metaModel) : [];
  const ownIds = new Set(cls.attributes.map((a) => a.id));
  return [...parentAttrs.filter((a) => !ownIds.has(a.id)), ...cls.attributes];
}

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

function isJavaKeyword(name) {
  return JAVA_KEYWORDS.has(name) || JAVA_KEYWORDS.has(name.toLowerCase());
}

// ── Multiplicity constraint description ──────────────────────────────────────
function multDesc(m) {
  if (m.lower === m.upper) return `exactly ${m.lower}`;
  if (m.upper === Infinity && m.lower === 0) return 'any number of';
  if (m.upper === Infinity) return `at least ${m.lower}`;
  if (m.lower === 0) return `at most ${m.upper}`;
  return `between ${m.lower} and ${m.upper}`;
}

// ── Multiplicity parser ───────────────────────────────────────────────────────
function parseMult(mult) {
  if (!mult || !mult.trim()) return null;
  const t = mult.trim();
  if (t === '*') return { lower: 0, upper: Infinity };
  if (!t.includes('..')) {
    const n = parseInt(t, 10);
    return isNaN(n) ? null : { lower: n, upper: n };
  }
  const [lo, hi] = t.split('..');
  const lower = parseInt(lo, 10);
  const upper = hi.trim() === '*' ? Infinity : parseInt(hi, 10);
  return { lower: isNaN(lower) ? 0 : lower, upper: isNaN(upper) ? Infinity : upper };
}

// ── Layout key helpers ────────────────────────────────────────────────────────
const mmKey  = () => 'mm';
const imKey  = (imId) => `im-${imId}`;

export const useModelStore = create((set, get) => ({
  // ── App-level navigation ──────────────────────────────────────────
  appView: 'home',
  setAppView: (view) => set({ appView: view }),

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

      // Drive selection — prioritise selected:true so switching nodes doesn't flash null
      const selChange = changes.find((c) => c.type === 'select' && c.selected)
        ?? changes.find((c) => c.type === 'select');
      if (selChange) {
        if (selChange.selected) {
          patch.selectedId   = selChange.id;
          patch.selectedType = 'node';
        } else if (s.selectedType === 'node' && s.selectedId === selChange.id) {
          patch.selectedId   = null;
          patch.selectedType = null;
        }
      }

      return patch;
    });
  },

  onEdgesChange: (changes) => {
    set((s) => {
      const newEdges = applyEdgeChanges(changes, s.edges);
      const patch = { edges: newEdges };

      const selChange = changes.find((c) => c.type === 'select' && c.selected)
        ?? changes.find((c) => c.type === 'select');
      if (selChange) {
        if (selChange.selected) {
          patch.selectedId   = selChange.id;
          patch.selectedType = 'edge';
        } else if (s.selectedType === 'edge' && s.selectedId === selChange.id) {
          patch.selectedId   = null;
          patch.selectedType = null;
        }
      }

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
    set((s) => {
      const updatedIMs = patch.name
        ? s.instanceModels.map((im) => ({
            ...im,
            objects: im.objects.map((o) => o.classId === id ? { ...o, className: patch.name } : o),
          }))
        : s.instanceModels;
      return {
        metaModel: {
          ...s.metaModel,
          classes: s.metaModel.classes.map((c) => c.id === id ? { ...c, ...patch } : c),
        },
        instanceModels: updatedIMs,
      };
    });
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
          objects: im.objects.map((o) =>
            affected.has(o.classId)
              ? { ...o, slots: [...o.slots, { attrId, attrName: full.name, ...(full.upperBound !== 1 ? { values: [] } : { value: '' }) }] }
              : o
          ),
        })),
      };
    });
    return attrId;
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
    const affected   = new Set([classId, ...getSubclassIds(classId, s.metaModel)]);

    const instanceModels = (patch.name || migrate)
      ? s.instanceModels.map((im) => ({
          ...im,
          objects: im.objects.map((o) => {
            if (!affected.has(o.classId)) return o;
            return {
              ...o,
              slots: o.slots.map((sl) => {
                if (sl.attrId !== attrId) return sl;
                let next = sl;
                if (migrate) {
                  if (isNowMulti) {
                    const { value, ...rest } = next;
                    next = { ...rest, values: value && value.trim() ? [value] : [] };
                  } else {
                    const { values, ...rest } = next;
                    next = { ...rest, value: values?.[0] ?? '' };
                  }
                }
                if (patch.name) next = { ...next, attrName: patch.name };
                return next;
              }),
            };
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
          affected.has(o.classId) ? { ...o, slots: o.slots.filter((sl) => sl.attrId !== attrId) } : o
        ),
      })),
    };
  }),

  deleteClass: (id) => {
    set((s) => ({
      metaModel: {
        ...s.metaModel,
        classes:   s.metaModel.classes.filter((c) => c.id !== id),
        relations: s.metaModel.relations.filter((r) => r.source !== id && r.target !== id),
      },
      instanceModels: s.instanceModels.map((im) => ({
        ...im,
        objects: im.objects.filter((o) => o.classId !== id),
      })),
      nodes:       s.nodes.filter((n) => n.id !== id),
      edges:       s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId:  s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType,
    }));
    get().log(`Deleted class ${id}`);
  },

  addRelation: (kind, source, target, sourceHandle, targetHandle) => {
    const { metaModel } = get();
    const srcCls = metaModel.classes.find((c) => c.id === source);
    const tgtCls = metaModel.classes.find((c) => c.id === target);

    if (source === target) {
      get().notify(`A class cannot have a ${kind.toLowerCase()} relation to itself.`);
      return null;
    }

    if (kind === 'INHERITANCE') {
      // Single inheritance: block if source already has a parent
      const existingParent = metaModel.relations.find((r) => r.kind === 'INHERITANCE' && r.source === source);
      if (existingParent) {
        const parentCls = metaModel.classes.find((c) => c.id === existingParent.target);
        get().notify(`"${srcCls?.name}" already extends "${parentCls?.name}". Only single inheritance is supported.`);
        return null;
      }
      // Block inheritance cycles
      if (hasInheritancePath(target, source, metaModel.relations)) {
        get().notify(`Cannot add inheritance: "${srcCls?.name}" and "${tgtCls?.name}" would form a cycle.`);
        return null;
      }
    }

    if (kind === 'COMPOSITION') {
      // Block composition cycles (A composes B composes ... composes A)
      if (hasRelationPath(target, source, 'COMPOSITION', metaModel.relations)) {
        get().notify(`Cannot add composition: "${srcCls?.name}" and "${tgtCls?.name}" would form a composition cycle.`);
        return null;
      }
    }

    const id  = nanoid(8);
    const rel = { id, kind, source, target, name: '', sourceMultiplicity: '', targetMultiplicity: '', sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null };
    set((s) => ({
      metaModel: { ...s.metaModel, relations: [...s.metaModel.relations, rel] },
    }));
    get().log(`Added ${kind}: ${source} → ${target}`);
    return id;
  },

  updateRelation: (id, patch) => set((s) => ({
    metaModel: {
      ...s.metaModel,
      relations: s.metaModel.relations.map((r) => r.id === id ? { ...r, ...patch } : r),
    },
    conformanceStale: true,
  })),

  deleteRelation: (id) => {
    set((s) => ({
      metaModel: { ...s.metaModel, relations: s.metaModel.relations.filter((r) => r.id !== id) },
      edges:       s.edges.filter((e) => e.id !== id),
      selectedId:  s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType,
    }));
    get().log(`Deleted relation ${id}`);
  },

  updateMetaModelName: (name) => set((s) => ({ metaModel: { ...s.metaModel, name } })),

  clearMetaModel: () => {
    const name = get().metaModel.name;
    set({
      metaModel: { ...EMPTY_MM, name },
      instanceModels: [mkIM('InstanceModel1')],
      currentIMIndex: 0,
      nodes: [], edges: [],
      selectedId: null, selectedType: null,
      conformanceResults: [],
    });
    get().log('Meta-model cleared.');
  },

  clearInstanceModel: () => {
    set((s) => ({
      instanceModels: s.instanceModels.map((im, i) =>
        i === s.currentIMIndex ? { ...im, objects: [], links: [] } : im
      ),
      nodes: [], edges: [],
      selectedId: null, selectedType: null,
      conformanceResults: [],
    }));
    get().log('Instance model cleared.');
  },

  // ══════════════════════════════════════════════════════════════════
  // INSTANCE MODELS (multiple)
  // ══════════════════════════════════════════════════════════════════
  instanceModels: [mkIM('InstanceModel1')],
  currentIMIndex: 0,

  // Convenience selector — use in components: s.instanceModels[s.currentIMIndex]
  _currIM: (s) => s.instanceModels[s.currentIMIndex],

  addInstanceModel: () => {
    const newIM = mkIM(`InstanceModel${get().instanceModels.length + 1}`);
    const idx   = get().instanceModels.length;
    set((s) => ({ instanceModels: [...s.instanceModels, newIM] }));
    get().switchInstanceModel(idx);
    get().log(`Created instance model "${newIM.name}"`);
  },

  switchInstanceModel: (idx) => {
    set((s) => ({
      currentIMIndex:   idx,
      nodes:            [],
      edges:            [],
      selectedId:       null,
      selectedType:     null,
      conformanceResults: [],
    }));
    get().rebuildCanvas('instance');
    get().log(`Switched to instance model "${get().instanceModels[idx]?.name}"`);
  },

  deleteInstanceModel: (idx) => {
    const s = get();
    if (s.instanceModels.length <= 1) return; // keep at least one
    const newList  = s.instanceModels.filter((_, i) => i !== idx);
    const newIdx   = Math.min(s.currentIMIndex, newList.length - 1);
    set({ instanceModels: newList, currentIMIndex: newIdx });
    get().rebuildCanvas('instance');
    get().log(`Deleted instance model at index ${idx}`);
  },

  updateInstanceModelName: (name) => set((s) => ({
    instanceModels: s.instanceModels.map((im, i) =>
      i === s.currentIMIndex ? { ...im, name } : im
    ),
  })),

  // ── Instance model operations (always on currentIMIndex) ──────────
  addObject: (classId) => {
    const id  = nanoid(8);
    const mm  = get().metaModel;
    const cls = mm.classes.find((c) => c.id === classId);
    if (!cls) return null;
    const allAttrs = getAllAttributes(classId, mm);
    const obj = {
      id, classId, className: cls.name,
      name: `${cls.name}1`,
      slots: allAttrs.map((a) => {
        const hasDef = a.defaultValue !== undefined && String(a.defaultValue).trim() !== '';
        return {
          attrId: a.id, attrName: a.name,
          ...(a.upperBound !== 1 ? { values: [] } : { value: hasDef ? String(a.defaultValue) : '' }),
        };
      }),
    };
    set((s) => ({
      instanceModels: s.instanceModels.map((im, i) =>
        i === s.currentIMIndex ? { ...im, objects: [...im.objects, obj] } : im
      ),
    }));
    get().log(`Added object "${obj.name}" : ${cls.name}`);
    return id;
  },

  updateObject: (id, patch) => set((s) => ({
    instanceModels: s.instanceModels.map((im, i) =>
      i === s.currentIMIndex
        ? { ...im, objects: im.objects.map((o) => o.id === id ? { ...o, ...patch } : o) }
        : im
    ),
    conformanceStale: true,
  })),

  updateSlotValues: (objId, attrId, values) => set((s) => ({
    instanceModels: s.instanceModels.map((im, i) =>
      i === s.currentIMIndex
        ? {
            ...im,
            objects: im.objects.map((o) =>
              o.id === objId
                ? { ...o, slots: o.slots.map((sl) => sl.attrId === attrId ? { ...sl, values } : sl) }
                : o
            ),
          }
        : im
    ),
    conformanceStale: true,
  })),

  updateSlot: (objId, attrId, value) => set((s) => ({
    instanceModels: s.instanceModels.map((im, i) =>
      i === s.currentIMIndex
        ? {
            ...im,
            objects: im.objects.map((o) =>
              o.id === objId
                ? { ...o, slots: o.slots.map((sl) => sl.attrId === attrId ? { ...sl, value } : sl) }
                : o
            ),
          }
        : im
    ),
    conformanceStale: true,
  })),

  deleteObject: (id) => {
    set((s) => ({
      instanceModels: s.instanceModels.map((im, i) =>
        i === s.currentIMIndex
          ? {
              ...im,
              objects: im.objects.filter((o) => o.id !== id),
              links:   im.links.filter((l) => l.source !== id && l.target !== id),
            }
          : im
      ),
      nodes:       s.nodes.filter((n) => n.id !== id),
      edges:       s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId:  s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType,
    }));
  },

  updateLink: (id, patch) => set((s) => ({
    instanceModels: s.instanceModels.map((im, i) =>
      i === s.currentIMIndex
        ? { ...im, links: im.links.map((l) => l.id === id ? { ...l, ...patch } : l) }
        : im
    ),
  })),

  addLink: (relationId, source, target, sourceHandle, targetHandle) => {
    const id = nanoid(8);
    set((s) => ({
      instanceModels: s.instanceModels.map((im, i) =>
        i === s.currentIMIndex
          ? { ...im, links: [...im.links, { id, relationId, source, target, sourceHandle: sourceHandle ?? null, targetHandle: targetHandle ?? null }] }
          : im
      ),
    }));
    return id;
  },

  deleteLink: (id) => {
    set((s) => ({
      instanceModels: s.instanceModels.map((im, i) =>
        i === s.currentIMIndex
          ? { ...im, links: im.links.filter((l) => l.id !== id) }
          : im
      ),
      edges:       s.edges.filter((e) => e.id !== id),
      selectedId:  s.selectedId === id ? null : s.selectedId,
      selectedType: s.selectedId === id ? null : s.selectedType,
    }));
  },

  // ══════════════════════════════════════════════════════════════════
  // CONFORMANCE VALIDATION
  // ══════════════════════════════════════════════════════════════════
  _runValidate: () => {
    const { metaModel, instanceModels, currentIMIndex } = get();
    const instanceModel = instanceModels[currentIMIndex];
    const errors = [];

    // Meta-model level: single inheritance only
    for (const cls of metaModel.classes) {
      const parentRels = metaModel.relations.filter((r) => r.kind === 'INHERITANCE' && r.source === cls.id);
      if (parentRels.length > 1) {
        errors.push({ kind: 'class', id: cls.id, msg: `Class "${cls.name}" inherits from multiple parents — only single inheritance is supported` });
      }
    }

    // Meta-model level: reference and composition relations must have a name
    for (const rel of metaModel.relations) {
      if (rel.kind === 'INHERITANCE') continue;
      if (!rel.name || !rel.name.trim()) {
        const srcCls = metaModel.classes.find((c) => c.id === rel.source);
        const tgtCls = metaModel.classes.find((c) => c.id === rel.target);
        errors.push({ kind: 'relation', id: rel.id, msg: `${rel.kind.charAt(0) + rel.kind.slice(1).toLowerCase()} from "${srcCls?.name ?? '?'}" to "${tgtCls?.name ?? '?'}" has no name — required for code generation` });
      }
    }

    for (const obj of instanceModel.objects) {
      const cls = metaModel.classes.find((c) => c.id === obj.classId);
      if (!cls) {
        errors.push({ kind: 'object', id: obj.id, msg: `Object "${obj.name}" references unknown class "${obj.classId}"` });
        continue;
      }
      if (cls.isAbstract) {
        errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}" instantiates abstract class "${cls.name}"` });
      }
      for (const attr of getAllAttributes(obj.classId, metaModel)) {
        const slot = obj.slots.find((sl) => sl.attrId === attr.id);
        if (!slot) continue;
        const isMulti = Array.isArray(slot.values);

        if (isMulti) {
          const nonEmpty = slot.values.filter((v) => v.trim() !== '');
          if (attr.lowerBound > 0 && nonEmpty.length < attr.lowerBound)
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" needs at least ${attr.lowerBound} value(s) — found ${nonEmpty.length}` });
          if (attr.upperBound !== -1 && nonEmpty.length > attr.upperBound)
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" allows at most ${attr.upperBound} value(s) — found ${nonEmpty.length}` });
          for (const val of nonEmpty) {
            if (attr.type === 'INT'     && !/^-?\d+$/.test(val.trim()))
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must contain integers (got "${val}")` });
            if (attr.type === 'DOUBLE'  && isNaN(Number(val)))
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must contain numbers (got "${val}")` });
            if (attr.type === 'BOOLEAN' && val !== 'true' && val !== 'false')
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must contain true/false (got "${val}")` });
          }
        } else {
          const val = slot.value ?? '';
          if (attr.lowerBound > 0 && val === '') {
            errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": required attribute "${attr.name}" is empty` });
            continue;
          }
          if (val !== '') {
            if (attr.type === 'INT'     && !/^-?\d+$/.test(val.trim()))
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must be an integer (got "${val}")` });
            if (attr.type === 'DOUBLE'  && isNaN(Number(val)))
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must be a number (got "${val}")` });
            if (attr.type === 'BOOLEAN' && val !== 'true' && val !== 'false')
              errors.push({ kind: 'object', id: obj.id, msg: `"${obj.name}": "${attr.name}" must be true or false (got "${val}")` });
          }
        }
      }
    }

    for (const lnk of instanceModel.links) {
      if (!lnk.relationId) continue;
      const rel = metaModel.relations.find((r) => r.id === lnk.relationId);
      if (!rel) continue;
      const srcObj     = instanceModel.objects.find((o) => o.id === lnk.source);
      const tgtObj     = instanceModel.objects.find((o) => o.id === lnk.target);
      const relName    = rel.name || rel.kind;
      const srcClsName = metaModel.classes.find((c) => c.id === rel.source)?.name ?? '?';
      const tgtClsName = metaModel.classes.find((c) => c.id === rel.target)?.name ?? '?';
      if (srcObj && !isConformantClass(srcObj.classId, rel.source, metaModel.relations))
        errors.push({ kind: 'link', id: lnk.id, msg: `Relation "${relName}": source "${srcObj.name}" is "${srcObj.className}", expected "${srcClsName}" or a subclass` });
      if (tgtObj && !isConformantClass(tgtObj.classId, rel.target, metaModel.relations))
        errors.push({ kind: 'link', id: lnk.id, msg: `Relation "${relName}": target "${tgtObj.name}" is "${tgtObj.className}", expected "${tgtClsName}" or a subclass` });
    }

    for (const rel of metaModel.relations) {
      if (rel.kind === 'INHERITANCE') continue;
      const srcMult = parseMult(rel.sourceMultiplicity);
      const tgtMult = parseMult(rel.targetMultiplicity);
      if (!srcMult && !tgtMult) continue;

      const relName     = rel.name || `(${rel.kind})`;
      const srcClsName  = metaModel.classes.find((c) => c.id === rel.source)?.name ?? '?';
      const tgtClsName  = metaModel.classes.find((c) => c.id === rel.target)?.name ?? '?';
      const linksForRel = instanceModel.links.filter((l) => l.relationId === rel.id);

      if (tgtMult) {
        for (const srcObj of instanceModel.objects.filter((o) => isConformantClass(o.classId, rel.source, metaModel.relations))) {
          const count = linksForRel.filter((l) => l.source === srcObj.id).length;
          const bad = count < tgtMult.lower || (tgtMult.upper !== Infinity && count > tgtMult.upper);
          if (bad)
            errors.push({ kind: 'object', id: srcObj.id, msg: `"${srcObj.name}" (${srcClsName}): relation "${relName}" needs ${multDesc(tgtMult)} ${tgtClsName} — found ${count}` });
        }
      }
      if (srcMult) {
        for (const tgtObj of instanceModel.objects.filter((o) => isConformantClass(o.classId, rel.target, metaModel.relations))) {
          const count = linksForRel.filter((l) => l.target === tgtObj.id).length;
          const bad = count < srcMult.lower || (srcMult.upper !== Infinity && count > srcMult.upper);
          if (bad)
            errors.push({ kind: 'object', id: tgtObj.id, msg: `"${tgtObj.name}" (${tgtClsName}): relation "${relName}" needs ${multDesc(srcMult)} ${srcClsName} — found ${count}` });
        }
      }
    }

    set({ conformanceResults: errors });
  },


  // ══════════════════════════════════════════════════════════════════
  // SERIALIZATION
  // ══════════════════════════════════════════════════════════════════
  getFullJSON: () => {
    const s = get();
    return { metaModel: s.metaModel, instanceModels: s.instanceModels, layouts: s.layouts };
  },

  loadFromJSON: (data) => {
    if (data.metaModel)      set({ metaModel: data.metaModel });
    if (data.instanceModels) set({ instanceModels: data.instanceModels, currentIMIndex: 0 });
    // Legacy single-IM files
    else if (data.instanceModel) set({ instanceModels: [data.instanceModel], currentIMIndex: 0 });
    if (data.layouts)        set({ layouts: data.layouts });
    set({ nodes: [], edges: [], selectedId: null, conformanceResults: [] });
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
      set({
        nodes: s.metaModel.classes.map((cls, i) => ({
          id: cls.id, type: 'classNode',
          position: getPos(cls.id, i),
          data: { classId: cls.id },
        })),
        edges: s.metaModel.relations.map((r) => ({
          id: r.id, source: r.source, target: r.target,
          sourceHandle: r.sourceHandle ?? null,
          targetHandle: r.targetHandle ?? null,
          type: 'relationEdge',
          data: { kind: r.kind, name: r.name || '', sourceMultiplicity: r.sourceMultiplicity || '', targetMultiplicity: r.targetMultiplicity || '' },
          markerEnd: r.kind === 'INHERITANCE'
            ? { type: 'arrowclosed', width: 16, height: 16 }
            : { type: 'arrow', width: 14, height: 14 },
        })),
      });
    } else {
      if (!currIM) return;
      set({
        nodes: currIM.objects.map((obj, i) => ({
          id: obj.id, type: 'objectNode',
          position: getPos(obj.id, i),
          data: { objectId: obj.id },
        })),
        edges: currIM.links.map((l) => {
          const rel = s.metaModel.relations.find((r) => r.id === l.relationId);
          return {
            id: l.id, source: l.source, target: l.target,
            sourceHandle: l.sourceHandle ?? null,
            targetHandle: l.targetHandle ?? null,
            type: 'linkEdge',
            data: { relationId: l.relationId, label: rel?.name || rel?.kind || '' },
            markerEnd: { type: 'arrow', width: 14, height: 14 },
          };
        }),
      });
    }
    get().log(`Canvas rebuilt: ${mode}`);
  },
}));

// Live conformance: re-validate whenever model data changes
useModelStore.subscribe((state, prevState) => {
  if (
    state.metaModel       !== prevState.metaModel ||
    state.instanceModels  !== prevState.instanceModels ||
    state.currentIMIndex  !== prevState.currentIMIndex
  ) {
    useModelStore.getState()._runValidate();
  }
});
