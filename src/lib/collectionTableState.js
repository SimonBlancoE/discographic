import { MANDATORY } from './columns.js';

export const COLLECTION_PAGE_LIMIT = 20;
export const COLLECTION_TABLE_VIRTUALIZATION_THRESHOLD = 100;

export function shouldVirtualizeCollectionTable(rowCount) {
  return Number(rowCount) > COLLECTION_TABLE_VIRTUALIZATION_THRESHOLD;
}

export function buildCollectionTableVisibleColumns(visibleColumns = []) {
  return [...new Set([...MANDATORY, ...visibleColumns])];
}
