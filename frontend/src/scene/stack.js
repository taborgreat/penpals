// The camera as it was before each stroke (the scene, §4: cam_before now holds
// the whole camera, not just the flat offset). It runs beside the ink's own undo
// stack, one entry per stroke: undo pops both.
export function createCameraStack() {
  const before = [];
  return {
    penDown(cam) {
      before.push(cam ? JSON.parse(JSON.stringify(cam)) : null);
    },
    undo() {
      return before.length ? before.pop() : null;
    },
    clear() {
      before.length = 0;
    },
    get size() {
      return before.length;
    },
  };
}
