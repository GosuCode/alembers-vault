interface Props {
  url: string;
  title: string;
}

export default function OfficeViewer({ url, title }: Props) {
  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
    url,
  )}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="truncate text-slate-300">{title}</span>
        <div className="flex shrink-0 items-center gap-3">
          <a
            href={url}
            download
            className="text-amber-400 transition-colors hover:text-amber-300"
          >
            Download
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 transition-colors hover:text-amber-300"
          >
            Open ↗
          </a>
        </div>
      </div>

      <iframe
        src={embedUrl}
        title={title}
        loading="lazy"
        className="h-[70vh] w-full rounded-lg border border-slate-800 bg-white"
      />

      <p className="text-xs text-slate-500">
        Preview rendered by the Microsoft Office viewer. Use Download if it does
        not load.
      </p>
    </div>
  );
}
