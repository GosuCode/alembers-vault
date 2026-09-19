export interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export default function Filter({ label, value, options, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
