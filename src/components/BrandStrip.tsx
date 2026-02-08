"use client";

import { useMemo, useState } from "react";

type Brand = {
  name: string;
  image: string;
};

const BRANDS: Brand[] = [
  { name: "T.Youth", image: "/brands/t-youth.png" },
  { name: "T.Dreams", image: "/brands/t-dreams.png" },
  { name: "T.Brands", image: "/brands/t-brands.png" },
  { name: "T.Venues", image: "/brands/t-venues.png" },
];

export default function BrandStrip() {
  const [hiddenImages, setHiddenImages] = useState<Record<string, true>>({});

  const visibleBrands = useMemo(
    () => BRANDS.map((brand) => ({ ...brand, showImage: !hiddenImages[brand.image] })),
    [hiddenImages]
  );

  return (
    <div className="brandStrip">
      <div className="brandCore">T.Group</div>
      <div className="brandSubs">
        {visibleBrands.map((brand) => (
          <div key={brand.name} className="brandChip">
            {brand.showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.image}
                alt={brand.name}
                className="brandLogo"
                onError={() => setHiddenImages((prev) => ({ ...prev, [brand.image]: true }))}
              />
            ) : (
              <span className="brandWordmark">{brand.name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
