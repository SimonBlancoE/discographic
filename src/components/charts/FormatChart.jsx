import CategoryPie from './CategoryPie';

const COLORS = ['#14b8a6', '#f97316', '#eab308', '#818cf8', '#f43f5e'];

function FormatChart({ data }) {
  return <CategoryPie data={data} colors={COLORS} />;
}

export default FormatChart;
