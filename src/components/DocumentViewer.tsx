import { lazy, Suspense, useEffect } from "react";
import OfficeViewer from "./OfficeViewer";

const PDFViewer = lazy(() => import("./PDFViewer"));

interface Props {
  url: string;
  title: string;
  isPdf: boolean;
}

export default function DocumentViewer({ url, title, isPdf }: Props) {
  // Inline viewer open = a pdf_open event (covers PDF and DOCX).
  useEffect(() => {
    window.__vaultTrack?.({
      event_type: "pdf_open",
      link_kind: isPdf ? "pdf" : "docx",
      link_text: title,
    });
  }, [url, isPdf, title]);

  if (!isPdf) {
    return <OfficeViewer url={url} title={title} />;
  }

  return (
    <Suspense
      fallback={
        <p className="py-10 text-center font-hand text-xl text-pencil">
          loading the pages…
        </p>
      }
    >
      <PDFViewer url={url} title={title} />
    </Suspense>
  );
}
