import { useEffect } from "react";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

export default function LoadingCursor() {
  const loading = useWorkforceStore((s) => s.loading);

  useEffect(() => {
    document.body.classList.toggle("app-loading", Boolean(loading));

    return () => {
      document.body.classList.remove("app-loading");
    };
  }, [loading]);

  return null;
}