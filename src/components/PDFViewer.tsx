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
  const deepestRef = useRef(0);
  const numPagesRef = useRef<number | undefined>(undefined);
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

  useEffect(() => {
    numPagesRef.current = numPages;
  }, [numPages]);

  // Reset depth when a different document is loaded.
  useEffect(() => {
    deepestRef.current = 0;
  }, [url]);

  // Track how far into the document the reader gets.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !numPages) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-page]"));
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (page > deepestRef.current) deepestRef.current = page;
        }
      },
      { threshold: 0.35 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [numPages]);

  // Report reading depth when the viewer closes or the tab is hidden.
  useEffect(() => {
    const flush = () => {
      const pages = numPagesRef.current;
      if (!pages) return;
      window.__vaultTrack?.({
        event_type: "engagement",
        link_kind: "pdf",
        link_text: title,
        meta: { surface: "pdf", pages, deepest: deepestRef.current },
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [title]);

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-hand text-xl text-pencil">{title}</span>
        <div className="flex shrink-0 items-center gap-2">
          {numPages ? (
            <span className="rounded-full border border-dashed border-pencil/50 px-2.5 py-0.5 font-hand text-base leading-tight text-pencil">
              {numPages} page{numPages === 1 ? "" : "s"}
            </span>
          ) : null}
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

      <Document
        file={url}
        onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
        loading={
          <p className="py-10 text-center font-hand text-xl text-pencil">
            loading the pages…
          </p>
        }
        error={
          <p className="py-10 text-center text-accent-dark">
            Could not load this PDF.
          </p>
        }
        className="flex flex-col items-center gap-3 overflow-hidden rounded-lg border border-ink/60"
      >
        {Array.from({ length: numPages ?? 0 }, (_, index) => (
          <div key={index + 1} data-page={index + 1} className="flex w-full justify-center">
            <Page
              pageNumber={index + 1}
              width={width}
              className="mx-auto bg-white shadow-sm"
            />
          </div>
        ))}
      </Document>
    </div>
  );
}
