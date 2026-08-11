import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { getAllAttributes } from './modelStore';

// Shared with RuleEditor.jsx (the "auto-mapper skipped this enum, here's
// why" warning) so both sides agree on exactly what "the enums correspond"
// means — duplicating this logic risked the UI's explanation drifting out
// of sync with what the auto-mapper actually decided.
export function enumById(mm, id) {
  return (mm.enumerations ?? []).find((e) => e.id === id);
}

function sameLiterals(a = [], b = []) {
  if (a.length !== b.length) return false;
  const A = [...a].sort();
  const B = [...b].sort();
  return A.every((x, i) => x === B[i]);
}

// Two attributes auto-map when name + type match. For enums we additionally
// require the referenced enumerations to correspond (same name + literals),
// since a direct copy across unrelated enums would produce invalid literals.
export function attrsCompatible(sourceMetaModel, targetMetaModel, sa, ta) {
  if (sa.name !== ta.name || sa.type !== ta.type) return false;
  if (ta.type !== 'ENUM') return true;
  const se = enumById(sourceMetaModel, sa.enumId);
  const te = enumById(targetMetaModel, ta.enumId);
  return !!se && !!te && se.name === te.name && sameLiterals(se.literals, te.literals);
}

// For a target ENUM attribute the auto-mapper left unmapped, finds a
// same-named source ENUM attribute that was SKIPPED specifically because
// its enum doesn't correspond (not because no candidate existed at all) —
// lets the UI explain an otherwise-silent omit instead of just showing
// "Omit" with no reason. Returns null when there's nothing to explain
// (no same-named enum candidate, or it would already have auto-mapped).
export function findEnumMismatch(sourceMetaModel, targetMetaModel, srcAttrs, ta) {
  if (ta.type !== 'ENUM') return null;
  const sa = srcAttrs.find((a) => a.name === ta.name && a.type === 'ENUM');
  if (!sa || attrsCompatible(sourceMetaModel, targetMetaModel, sa, ta)) return null;
  return {
    sourceAttr: sa,
    sourceEnum: enumById(sourceMetaModel, sa.enumId),
    targetEnum: enumById(targetMetaModel, ta.enumId),
  };
}

export const useTransformStore = create((set, get) => ({
  source: null,  // { metaModel, instanceModels, layouts }
  target: null,  // { metaModel, instanceModels?, layouts? }
  rules: [],
  result: null,  // { metaModel, instanceModels, layouts } — produced after Run

  loadSource: (data) => set({ source: data, rules: [], result: null }),
  loadTarget: (data) => set({ target: data, rules: [], result: null }),

  addRule: (sourceClassId, targetClassId) => {
    const { source, target } = get();
    if (!source || !target) return;

    const srcAttrs = getAllAttributes(sourceClassId, source.metaModel);
    const tgtAttrs = getAllAttributes(targetClassId, target.metaModel);

    const attributeMappings = tgtAttrs.map((ta) => {
      const match = srcAttrs.find((sa) => attrsCompatible(source.metaModel, target.metaModel, sa, ta));
      return match
        ? { targetAttrId: ta.id, type: 'direct', sourceAttrId: match.id, value: null }
        : { targetAttrId: ta.id, type: 'omit', sourceAttrId: null, value: null };
    });

    const srcRels = source.metaModel.relations.filter(
      (r) => r.source === sourceClassId && r.kind !== 'INHERITANCE'
    );
    const tgtRels = target.metaModel.relations.filter(
      (r) => r.source === targetClassId && r.kind !== 'INHERITANCE'
    );
    const relationMappings = tgtRels.map((tr) => {
      // Match by name AND kind — the UI already describes this as "matched
      // by name and type"; a name-only match could silently pair e.g. a
      // REFERENCE with a COMPOSITION relation of the same name.
      const match = srcRels.find((sr) => sr.name === tr.name && sr.kind === tr.kind);
      return { targetRelId: tr.id, sourceRelId: match?.id ?? null };
    });

    set((s) => ({
      rules: [
        ...s.rules,
        { id: nanoid(8), sourceClassId, targetClassId, attributeMappings, relationMappings },
      ],
      result: null,
    }));
  },

  updateAttrMapping: (ruleId, targetAttrId, patch) =>
    set((s) => ({
      rules: s.rules.map((r) =>
        r.id !== ruleId ? r : {
          ...r,
          attributeMappings: r.attributeMappings.map((m) =>
            m.targetAttrId !== targetAttrId ? m : { ...m, ...patch }
          ),
        }
      ),
      result: null,
    })),

  updateRelMapping: (ruleId, targetRelId, patch) =>
    set((s) => ({
      rules: s.rules.map((r) =>
        r.id !== ruleId ? r : {
          ...r,
          relationMappings: r.relationMappings.map((m) =>
            m.targetRelId !== targetRelId ? m : { ...m, ...patch }
          ),
        }
      ),
      result: null,
    })),

  deleteRule: (ruleId) =>
    set((s) => ({ rules: s.rules.filter((r) => r.id !== ruleId), result: null })),

  setResult: (result) => set({ result }),
}));
