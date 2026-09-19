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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-hand text-xl text-pencil">{title}</span>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            download
            className="rounded-md border border-ink/80 bg-accent px-3 py-1 font-hand text-lg leading-tight text-white transition hover:bg-accent-dark"
          >
            download
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-ink/80 bg-white px-3 py-1 font-hand text-lg leading-tight transition hover:bg-marker"
          >
            open ↗
          </a>
        </div>
      </div>

      <iframe
        src={embedUrl}
        title={title}
        loading="lazy"
        className="h-[70vh] w-full rounded-lg border border-ink/60 bg-white"
      />

      <p className="text-xs text-pencil">
        Preview rendered by the Microsoft Office viewer. Use download if it
        doesn't load.
      </p>
    </div>
  );
}
