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
        <span className="truncate font-medium text-ink">{title}</span>
        <div className="flex shrink-0 items-center gap-3">
          <a
            href={url}
            download
            className="rounded-full bg-coral px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-coral-dark"
          >
            Download
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-ink transition hover:border-coral hover:text-coral-dark"
          >
            Open ↗
          </a>
        </div>
      </div>

      <iframe
        src={embedUrl}
        title={title}
        loading="lazy"
        className="h-[70vh] w-full rounded-3xl border border-line bg-white"
      />

      <p className="text-xs text-muted">
        Preview rendered by the Microsoft Office viewer. Use Download if it does
        not load.
      </p>
    </div>
  );
}
