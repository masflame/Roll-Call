import { useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react";

interface QRCodeViewProps {
  url: string;
  expiresAt: Date;
  classCode?: string;
  tick?: number;
}

function QRCodeView({ url, expiresAt, classCode, tick = 0 }: QRCodeViewProps) {
  const secondsRemaining = useMemo(() => {
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }, [expiresAt, tick]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-slate-900 text-white">
      <div className="rounded-lg bg-white p-6 shadow-xl">
        <QRCodeCanvas value={url} size={320} includeMargin level="H" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm uppercase tracking-wide text-slate-300">Session link</span>
        <span className="text-lg font-semibold text-white">{url}</span>
        <span className="text-base text-slate-200">Expires in {secondsRemaining}s</span>
        {classCode && (
          <span className="rounded bg-primary-500 px-4 py-2 text-xl font-bold tracking-widest text-white">
            Code: {classCode}
          </span>
        )}
      </div>
    </div>
  );
}

export default QRCodeView;
