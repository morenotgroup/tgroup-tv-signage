import { Suspense } from "react";
import SignageV2 from "@/signage/SignageV2";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ color: "white", padding: 24 }}>Carregando…</div>}>
      <SignageV2 />
    </Suspense>
  );
}
