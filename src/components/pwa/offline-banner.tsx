"use client";

import { useEffect, useState } from "react";

const OFFLINE_READ_ONLY_STYLE = `
  html[data-offline="true"] form {
    pointer-events: none;
    opacity: 0.55;
  }
  html[data-offline="true"] [data-write-action] {
    pointer-events: none;
    opacity: 0.55;
  }
`;

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.offline = isOffline ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.offline;
    };
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <>
      <style>{OFFLINE_READ_ONLY_STYLE}</style>
      <div
        role="status"
        className="border-b border-peach/40 bg-peach px-4 py-2 text-center text-xs leading-relaxed text-peach-foreground"
      >
        กำลังออฟไลน์ · กำลังดูข้อมูลที่เปิดไว้ก่อนหน้าในโหมดอ่านอย่างเดียว
        การบันทึกข้อมูลจะกลับมาได้เมื่อเชื่อมต่ออีกครั้ง
      </div>
    </>
  );
}
