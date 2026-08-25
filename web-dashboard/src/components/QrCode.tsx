import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, label = "Exam access QR code" }: { value: string; label?: string }) {
  const [dataUrl, setDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setDataUrl("");
    setError("");

    if (!value.trim()) {
      setError("Exam link is not available yet.");
      return () => {
        active = false;
      };
    }

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 256,
      color: { dark: "#020617", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setError("Could not generate the exam QR code.");
      });

    return () => {
      active = false;
    };
  }, [value]);

  if (error) {
    return <p className="text-sm text-rose-600 dark:text-rose-300" role="alert">{error}</p>;
  }

  if (!dataUrl) {
    return <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Generating QR code...</p>;
  }

  return (
    <div className="inline-flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10">
      <img className="h-64 w-64 max-w-full" src={dataUrl} alt={label} width={256} height={256} />
      <a className="secondary-button" href={dataUrl} download="cheatlock-exam-qr.png">
        Download QR code
      </a>
    </div>
  );
}
