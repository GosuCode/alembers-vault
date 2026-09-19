import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface Props {
  url: string;
  title: string;
}

export default function PDFViewer({ url, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();
  const [numPages, setNumPages] = useState<number>();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.min(entry.contentRect.width, 760));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="truncate font-medium text-ink">{title}</span>
        <div className="flex shrink-0 items-center gap-3">
          {numPages ? (
            <span className="rounded-full border border-line bg-cream px-2.5 py-0.5 text-xs text-muted">
              {numPages} page{numPages === 1 ? "" : "s"}
            </span>
          ) : null}
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

      <Document
        file={url}
        onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
        loading={
          <p className="py-10 text-center text-sm text-muted">Loading PDF…</p>
        }
        error={
          <p className="py-10 text-center text-sm text-coral-dark">
            Could not load this PDF.
          </p>
        }
        className="overflow-hidden rounded-3xl border border-line"
      >
        {Array.from({ length: numPages ?? 0 }, (_, index) => (
          <Page
            key={index + 1}
            pageNumber={index + 1}
            width={width}
            className="bg-white"
          />
        ))}
      </Document>
    </div>
  );
}
