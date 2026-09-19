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
    <label className="flex flex-col gap-1.5">
      <span className="font-hand text-lg leading-none text-pencil">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-ink/70 bg-white px-3 py-2.5 text-sm text-ink pop-sm transition focus:border-accent focus:outline-none"
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
