import * as THREE from "three";

/**
 * Registered scenery can include both an assembly and some of its children.
 * Resolve that overlap with ancestor lookups, rather than comparing every pair
 * of registrations each frame. Visibility and reparenting remain live.
 */
export class VisibleOccluders {
  readonly objects: THREE.Object3D[] = [];
  private readonly roots: THREE.Object3D[] = [];
  private readonly registered = new Set<THREE.Object3D>();
  private readonly updatedAncestors = new Set<THREE.Object3D>();
  private readonly ancestorStack: THREE.Object3D[] = [];
  private readonly raycastObjects: THREE.Object3D[] = [];
  private readonly hits: THREE.Intersection[] = [];

  add(object: THREE.Object3D): void {
    if (this.registered.has(object)) return;
    this.registered.add(object);
    this.objects.push(object);
  }

  prepare(): void {
    this.roots.length = 0;
    this.raycastObjects.length = 0;
    this.updatedAncestors.clear();
    for (const object of this.objects) {
      if (!object.visible) continue;
      let covered = false;
      let visible = true;
      for (let parent = object.parent; parent; parent = parent.parent) {
        if (!parent.visible) {
          visible = false;
          break;
        }
        if (this.registered.has(parent)) covered = true;
      }
      if (visible && !covered) this.roots.push(object);
    }

    for (const root of this.roots) {
      this.ancestorStack.length = 0;
      let ancestor = root.parent;
      while (ancestor && !this.updatedAncestors.has(ancestor)) {
        this.ancestorStack.push(ancestor);
        ancestor = ancestor.parent;
      }
      for (let index = this.ancestorStack.length - 1; index >= 0; index -= 1) {
        const pending = this.ancestorStack[index]!;
        pending.updateWorldMatrix(false, false);
        this.updatedAncestors.add(pending);
      }
      this.prepareSubtree(root);
    }
  }

  private prepareSubtree(object: THREE.Object3D): void {
    if (!object.visible) return;
    object.updateWorldMatrix(false, false);
    this.updatedAncestors.add(object);
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points ||
      object instanceof THREE.Sprite
    ) {
      this.raycastObjects.push(object);
    }
    for (const child of object.children) this.prepareSubtree(child);
  }

  intersects(raycaster: THREE.Raycaster): boolean {
    for (const object of this.raycastObjects) {
      this.hits.length = 0;
      // Flattening also prevents hidden descendants of a registered assembly
      // from enabling an outline after a seal or prop has disappeared.
      raycaster.intersectObject(object, false, this.hits);
      if (this.hits.length > 0) return true;
    }
    return false;
  }

  clear(): void {
    this.objects.length = 0;
    this.roots.length = 0;
    this.registered.clear();
    this.updatedAncestors.clear();
    this.ancestorStack.length = 0;
    this.raycastObjects.length = 0;
    this.hits.length = 0;
  }
}
