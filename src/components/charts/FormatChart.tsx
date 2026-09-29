import type { NamedCountRow } from '../../../shared/contracts/dashboardStats.js';
import RankBarChart from './RankBarChart';

function FormatChart({ data, onSelect }: { data: NamedCountRow[]; onSelect?: (value: string) => void }) {
  return <RankBarChart data={data} limit={8} onSelect={onSelect} />;
}

export default FormatChart;
