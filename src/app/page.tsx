"use client";

import { useEffect, useMemo, useState } from "react";
import WelcomeScene from "@/components/scenes/WelcomeScene";
import BirthdaysScene from "@/components/scenes/BirthdaysScene";
import NewsScene from "@/components/scenes/NewsScene";
import BrandScene from "@/components/scenes/BrandScene";

type SceneKey = "welcome" | "birthdays" | "news" | "brand";

const SCENE_ORDER: { key: SceneKey; durationMs: number }[] = [
  { key: "welcome", durationMs: 15000 },
  { key: "birthdays", durationMs: 15000 },
  { key: "news", durationMs: 20000 },
  { key: "brand", durationMs: 12000 },
];

export default function Home() {
  const [idx, setIdx] = useState(0);

  const current = SCENE_ORDER[idx % SCENE_ORDER.length];

  useEffect(() => {
    const t = setTimeout(() => setIdx((v) => v + 1), current.durationMs);
    return () => clearTimeout(t);
  }, [current.durationMs, idx]);

  const Scene = useMemo(() => {
    switch (current.key) {
      case "welcome":
        return <WelcomeScene />;
      case "birthdays":
        return <BirthdaysScene />;
      case "news":
        return <NewsScene />;
      case "brand":
        return <BrandScene />;
      default:
        return <WelcomeScene />;
    }
  }, [current.key]);

  return (
    <main className="h-screen w-screen overflow-hidden bg-black text-white">
      <div className="h-full w-full">{Scene}</div>
    </main>
  );
}
