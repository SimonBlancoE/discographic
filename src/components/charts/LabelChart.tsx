import type { NamedCountRow } from '../../../shared/contracts/dashboardStats.js';
import RankBarChart from './RankBarChart';

function LabelChart({ data, onSelect }: { data: NamedCountRow[]; onSelect?: (value: string) => void }) {
  return <RankBarChart data={data} limit={10} onSelect={onSelect} />;
}

export default LabelChart;
