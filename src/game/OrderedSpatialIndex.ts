export interface SpatialRecord {
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
}

interface SpatialEntry<T extends SpatialRecord> {
  readonly record: T;
  readonly order: number;
  readonly cells: SpatialEntry<T>[][];
  mutable: boolean;
  queryGeneration: number;
}

const noExtentPadding = (): number => 0;

function compareEntryOrder<T extends SpatialRecord>(
  left: SpatialEntry<T>,
  right: SpatialEntry<T>,
): number {
  return left.order - right.order;
}

/**
 * Conservative X/Z broadphase that keeps query results in registration order.
 *
 * Stable records are placed in uniform-grid cells. Records whose position or
 * footprint can change stay in a small mutable lane and are tested from their
 * live values on every query, so callers never need to rebuild the index in a
 * frame loop. Query buffers are caller-owned and the internal candidate buffer
 * is reused; an instance is intentionally not re-entrant.
 */
export class OrderedSpatialIndex<T extends SpatialRecord> {
  private readonly rows = new Map<
    number,
    Map<number, SpatialEntry<T>[]>
  >();
  private readonly entries = new Map<T, SpatialEntry<T>>();
  private readonly mutableEntries: SpatialEntry<T>[] = [];
  private readonly queryEntries: SpatialEntry<T>[] = [];
  private readonly cellSize: number;
  private readonly extentPadding: (record: T) => number;
  private nextOrder = 0;
  private queryGeneration = 0;

  constructor(
    cellSize = 4,
    extentPadding: (record: T) => number = noExtentPadding,
  ) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError("Spatial-index cell size must be positive.");
    }
    this.cellSize = cellSize;
    this.extentPadding = extentPadding;
  }

  add(record: T, mutable = false): void {
    if (this.entries.has(record)) {
      throw new Error("Spatial record is already registered.");
    }
    const entry: SpatialEntry<T> = {
      record,
      order: this.nextOrder,
      cells: [],
      mutable,
      queryGeneration: 0,
    };
    this.nextOrder += 1;
    this.entries.set(record, entry);
    if (mutable) {
      this.mutableEntries.push(entry);
    } else {
      this.addEntryToCells(entry);
    }
  }

  markMutable(record: T): void {
    const entry = this.entries.get(record);
    if (!entry) {
      throw new Error("Cannot mark an unregistered spatial record mutable.");
    }
    if (entry.mutable) return;
    this.removeEntryFromCells(entry);
    entry.mutable = true;
    this.mutableEntries.push(entry);
  }

  remove(record: T): boolean {
    const entry = this.entries.get(record);
    if (!entry) return false;
    this.entries.delete(record);
    if (entry.mutable) {
      const mutableIndex = this.mutableEntries.indexOf(entry);
      if (mutableIndex >= 0) this.mutableEntries.splice(mutableIndex, 1);
    } else {
      this.removeEntryFromCells(entry);
    }
    return true;
  }

  clear(): void {
    this.rows.clear();
    this.entries.clear();
    this.mutableEntries.length = 0;
    this.queryEntries.length = 0;
    this.nextOrder = 0;
    this.queryGeneration = 0;
  }

  orderOf(record: T): number {
    const entry = this.entries.get(record);
    if (!entry) {
      throw new Error("Spatial record is not registered.");
    }
    return entry.order;
  }

  queryPoint(
    x: number,
    z: number,
    padding: number,
    result: T[],
  ): T[] {
    const safePadding = Math.max(0, padding);
    return this.queryBounds(
      x - safePadding,
      z - safePadding,
      x + safePadding,
      z + safePadding,
      result,
    );
  }

  queryBounds(
    firstX: number,
    firstZ: number,
    secondX: number,
    secondZ: number,
    result: T[],
  ): T[] {
    result.length = 0;
    this.queryEntries.length = 0;
    const minimumX = Math.min(firstX, secondX);
    const minimumZ = Math.min(firstZ, secondZ);
    const maximumX = Math.max(firstX, secondX);
    const maximumZ = Math.max(firstZ, secondZ);
    const minimumCellX = this.cellCoordinate(minimumX);
    const minimumCellZ = this.cellCoordinate(minimumZ);
    const maximumCellX = this.cellCoordinate(maximumX);
    const maximumCellZ = this.cellCoordinate(maximumZ);
    this.advanceQueryGeneration();
    const generation = this.queryGeneration;

    for (
      let cellX = minimumCellX;
      cellX <= maximumCellX;
      cellX += 1
    ) {
      const row = this.rows.get(cellX);
      if (!row) continue;
      for (
        let cellZ = minimumCellZ;
        cellZ <= maximumCellZ;
        cellZ += 1
      ) {
        const cell = row.get(cellZ);
        if (!cell) continue;
        for (const entry of cell) {
          if (entry.queryGeneration === generation) continue;
          entry.queryGeneration = generation;
          if (
            this.intersectsBounds(
              entry.record,
              minimumX,
              minimumZ,
              maximumX,
              maximumZ,
            )
          ) {
            this.queryEntries.push(entry);
          }
        }
      }
    }

    for (const entry of this.mutableEntries) {
      if (
        this.intersectsBounds(
          entry.record,
          minimumX,
          minimumZ,
          maximumX,
          maximumZ,
        )
      ) {
        this.queryEntries.push(entry);
      }
    }

    this.queryEntries.sort(compareEntryOrder);
    for (const entry of this.queryEntries) result.push(entry.record);
    return result;
  }

  private advanceQueryGeneration(): void {
    this.queryGeneration += 1;
    if (Number.isSafeInteger(this.queryGeneration)) return;
    for (const entry of this.entries.values()) {
      entry.queryGeneration = 0;
    }
    this.queryGeneration = 1;
  }

  private addEntryToCells(entry: SpatialEntry<T>): void {
    const record = entry.record;
    const padding = Math.max(0, this.extentPadding(record));
    const halfWidth = Math.max(0, record.halfWidth + padding);
    const halfDepth = Math.max(0, record.halfDepth + padding);
    const minimumCellX = this.cellCoordinate(record.x - halfWidth);
    const minimumCellZ = this.cellCoordinate(record.z - halfDepth);
    const maximumCellX = this.cellCoordinate(record.x + halfWidth);
    const maximumCellZ = this.cellCoordinate(record.z + halfDepth);

    for (
      let cellX = minimumCellX;
      cellX <= maximumCellX;
      cellX += 1
    ) {
      let row = this.rows.get(cellX);
      if (!row) {
        row = new Map<number, SpatialEntry<T>[]>();
        this.rows.set(cellX, row);
      }
      for (
        let cellZ = minimumCellZ;
        cellZ <= maximumCellZ;
        cellZ += 1
      ) {
        let cell = row.get(cellZ);
        if (!cell) {
          cell = [];
          row.set(cellZ, cell);
        }
        cell.push(entry);
        entry.cells.push(cell);
      }
    }
  }

  private removeEntryFromCells(entry: SpatialEntry<T>): void {
    for (const cell of entry.cells) {
      const cellIndex = cell.indexOf(entry);
      if (cellIndex >= 0) cell.splice(cellIndex, 1);
    }
    entry.cells.length = 0;
  }

  private intersectsBounds(
    record: T,
    minimumX: number,
    minimumZ: number,
    maximumX: number,
    maximumZ: number,
  ): boolean {
    const padding = Math.max(0, this.extentPadding(record));
    const halfWidth = Math.max(0, record.halfWidth + padding);
    const halfDepth = Math.max(0, record.halfDepth + padding);
    return (
      record.x + halfWidth >= minimumX &&
      record.x - halfWidth <= maximumX &&
      record.z + halfDepth >= minimumZ &&
      record.z - halfDepth <= maximumZ
    );
  }

  private cellCoordinate(value: number): number {
    return Math.floor(value / this.cellSize);
  }
}
