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

    const attributeMappings = tgtAttrs.map((ta) => {
      const match = srcAttrs.find((sa) => sa.name === ta.name && sa.type === ta.type);
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
      const match = srcRels.find((sr) => sr.name === tr.name);
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
