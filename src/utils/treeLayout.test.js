import { describe, it, expect } from 'vitest';
import { layoutTree } from './treeLayout.js';

function mkTree(edgeList, depths) {
  const nodesById = new Map(Object.entries(depths).map(([id, depth]) => [id, { id, depth }]));
  const edgesById = new Map(edgeList.map((e, i) => [`e${i}`, { sourceNodeId: e[0], targetNodeId: e[1] }]));
  return { nodesById, edgesById, rootId: 'root' };
}

describe('layoutTree', () => {
  it('returns an empty map when there is no root', () => {
    expect(layoutTree({ nodesById: new Map(), edgesById: new Map(), rootId: null })).toEqual({});
  });

  it('places a single node (no children) at the origin', () => {
    const tree = mkTree([], { root: 0 });
    expect(layoutTree(tree).root).toEqual({ x: 0, y: 0 });
  });

  it('gives leaves distinct, increasing x positions and centers a parent over its children', () => {
    // root -> a -> (leaf1, leaf2)
    const tree = mkTree([['root', 'a'], ['a', 'leaf1'], ['a', 'leaf2']], { root: 0, a: 1, leaf1: 2, leaf2: 2 });
    const pos = layoutTree(tree);
    expect(pos.leaf1.x).not.toBe(pos.leaf2.x);
    expect(pos.a.x).toBeCloseTo((pos.leaf1.x + pos.leaf2.x) / 2);
  });

  it('derives y purely from depth', () => {
    const tree = mkTree([['root', 'a'], ['a', 'b']], { root: 0, a: 1, b: 2 });
    const pos = layoutTree(tree);
    expect(pos.root.y).toBe(0);
    expect(pos.a.y).toBeGreaterThan(pos.root.y);
    expect(pos.b.y).toBeGreaterThan(pos.a.y);
  });
});
