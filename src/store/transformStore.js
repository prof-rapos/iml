import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { getAllAttributes } from './modelStore';

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

    // Two attributes auto-map when name + type match. For enums we additionally
    // require the referenced enumerations to correspond (same name + literals),
    // since a direct copy across unrelated enums would produce invalid literals.
    const enumById = (mm, id) => (mm.enumerations ?? []).find((e) => e.id === id);
    const sameLiterals = (a = [], b = []) => {
      if (a.length !== b.length) return false;
      const A = [...a].sort();
      const B = [...b].sort();
      return A.every((x, i) => x === B[i]);
    };
    const attrsCompatible = (sa, ta) => {
      if (sa.name !== ta.name || sa.type !== ta.type) return false;
      if (ta.type !== 'ENUM') return true;
      const se = enumById(source.metaModel, sa.enumId);
      const te = enumById(target.metaModel, ta.enumId);
      return !!se && !!te && se.name === te.name && sameLiterals(se.literals, te.literals);
    };

    const attributeMappings = tgtAttrs.map((ta) => {
      const match = srcAttrs.find((sa) => attrsCompatible(sa, ta));
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
