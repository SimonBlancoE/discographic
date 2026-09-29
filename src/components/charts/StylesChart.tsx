import type { NamedCountRow } from '../../../shared/contracts/dashboardStats.js';
import RankBarChart from './RankBarChart';

function StylesChart({ data, onSelect }: { data: NamedCountRow[]; onSelect?: (value: string) => void }) {
  return <RankBarChart data={data} limit={15} onSelect={onSelect} />;
}

export default StylesChart;
