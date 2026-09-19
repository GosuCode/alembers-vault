interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = "Search title, course, or tag…",
}: Props) {
  return (
    <label className="block">
      <span className="sr-only">Search</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-line bg-surface px-5 py-2.5 text-sm text-ink shadow-sm transition placeholder:text-muted/70 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
      />
    </label>
  );
}
