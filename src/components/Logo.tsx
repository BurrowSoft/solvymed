import { BrandMarkTile } from "@/components/BrandLogo";

// The brand mark (the kit's; it replaced the old solvymed_logo.png).
export function Logo() {
  return (
    <div className="mb-6 flex justify-center">
      <BrandMarkTile size="lg" />
    </div>
  );
}
