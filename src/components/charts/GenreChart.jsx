import CategoryPie from './CategoryPie';

const COLORS = ['#fb7185', '#38bdf8', '#f59e0b', '#34d399', '#a78bfa', '#f97316', '#22c55e', '#e879f9'];

function GenreChart({ data, onSelect }) {
  return (
    <CategoryPie
      data={data}
      colors={COLORS}
      innerRadius={60}
      outerRadius={100}
      paddingAngle={3}
      onSelect={onSelect}
    />
  );
}

export default GenreChart;
