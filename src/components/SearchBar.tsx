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
        className="w-full rounded-md border border-ink/70 bg-white px-4 py-2.5 text-sm text-ink pop-sm transition placeholder:text-pencil/70 focus:border-accent focus:outline-none"
      />
    </label>
  );
}
