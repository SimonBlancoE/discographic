import { MANDATORY, type ColumnId } from './columns';

export const COLLECTION_PAGE_LIMIT = 20;
export const COLLECTION_TABLE_VIRTUALIZATION_THRESHOLD = 100;

export function shouldVirtualizeCollectionTable(rowCount: number): boolean {
  return rowCount > COLLECTION_TABLE_VIRTUALIZATION_THRESHOLD;
}

export function buildCollectionTableVisibleColumns(visibleColumns: ColumnId[] = []): ColumnId[] {
  return [...new Set([...MANDATORY, ...visibleColumns])];
}
