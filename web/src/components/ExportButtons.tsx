// @ts-nocheck
import { httpsCallable } from "firebase/functions";
import { useState } from "react";
import { functions } from "../firebase";
import { useToast } from "./ToastProvider";

type Template = "minimal" | "standard" | "pdf";

interface ExportButtonsProps {
  sessionId: string;
}

function ExportButtons({ sessionId }: ExportButtonsProps) {
  const [loading, setLoading] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleExport = async (template: Template) => {
    setLoading(template);
    setError(null);
    try {
      const callable = httpsCallable(functions, "exportSessionCsv");
      const result = (await callable({ sessionId, template })) as any;
      const data = result?.data;
      if (data?.url) {
        window.open(data.url, "_blank");
       showToast({ message: "Export started", variant: "success" });
        return;
      }
      if (data?.fileContents) {
        const byteString = atob(data.fileContents);
        const bytes = new Uint8Array(byteString.length);
        for (let index = 0; index < byteString.length; index += 1) {
          bytes[index] = byteString.charCodeAt(index);
        }
        const blob = new Blob([bytes], { type: data.contentType || "text/csv" });
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = data.filename || `attendance-${Date.now()}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);
        showToast({ message: "Export downloaded", variant: "success" });
        return;
      }
      throw new Error("No export data returned");
    } catch (err: any) {
      setError(err.message || "Export failed");
      showToast({ message: err.message || "Export failed", variant: "error" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={loading !== null}
          onClick={() => handleExport("standard")}
        >
          {loading === "standard" ? "Exporting..." : "Export Standard CSV"}
        </button>

        <button
          type="button"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-900 bg-white transition hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={loading !== null}
          onClick={() => handleExport("pdf")}
        >
          {loading === "pdf" ? "Exporting..." : "Export PDF"}
        </button>
      </div>
      {error && <p className="text-sm text-accent-error">{error}</p>}
    </div>
  );
}

export default ExportButtons;
