import CategoryBar from './CategoryBar';

function StylesChart({ data, onSelect }) {
  return (
    <CategoryBar
      data={data}
      fill="#34d399"
      layout="vertical"
      heightClass="h-[480px]"
      yAxisWidth={120}
      yAxisCompactTicks
      onSelect={onSelect}
    />
  );
}

export default StylesChart;
