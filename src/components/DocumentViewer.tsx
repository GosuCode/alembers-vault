import { lazy, Suspense } from "react";
import OfficeViewer from "./OfficeViewer";

const PDFViewer = lazy(() => import("./PDFViewer"));

interface Props {
  url: string;
  title: string;
  isPdf: boolean;
}

export default function DocumentViewer({ url, title, isPdf }: Props) {
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
