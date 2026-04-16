import CategoryBar from './CategoryBar';

function LabelChart({ data, onSelect }) {
  return <CategoryBar data={data} fill="#f97316" layout="vertical" limit={10} onSelect={onSelect} />;
}

export default LabelChart;
