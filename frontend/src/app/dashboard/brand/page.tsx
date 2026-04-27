"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Palette, Globe, Trash2, Loader2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getBrandProfiles,
  deleteBrandProfile,
  type BrandProfile,
} from "@/lib/api";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function BrandListPage() {
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    getBrandProfiles()
      .then(setBrands)
      .catch(() => toast.error("Failed to load brand profiles"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this brand profile? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteBrandProfile(id);
      setBrands((prev) => prev.filter((b) => b.id !== id));
      toast.success("Brand profile deleted");
    } catch {
      toast.error("Failed to delete brand profile");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-[clamp(32px,5vh,64px)]">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-2">
          <span className="text-mono-sm text-ink/40">BRAND KIT · §00</span>
          <h1 className="text-h2 text-ink">Brand profiles.</h1>
          <p className="text-ink/60 max-w-[60ch]">
            Logos, palette, voice, and guidelines — applied to every generation
            so output stays on-brand.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/brand/new">
            <Plus className="h-4 w-4" />
            New brand
          </Link>
        </Button>
      </header>

      {loading ? (
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 bg-ink/15">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : brands.length === 0 ? (
        <div className="border border-ink/15 px-6 py-16 flex flex-col items-center gap-3 text-center">
          <Palette className="h-10 w-10 text-ink/30" />
          <span className="text-h3 text-ink">No brand profiles yet.</span>
          <p className="text-mono-sm text-ink/55 max-w-[42ch]">
            Scrape your company website or add manually — attach logos, colours, voice, and guidelines.
          </p>
          <Button asChild className="mt-2">
            <Link href="/dashboard/brand/new">
              <Plus className="h-4 w-4" />
              Create profile
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3 bg-ink/15">
          {brands.map((brand) => {
            const logoUrl = brand.logo_url
              ? brand.logo_url.startsWith("http")
                ? brand.logo_url
                : `${API_URL}${brand.logo_url}`
              : null;
            return (
              <article key={brand.id} className="bg-paper overflow-hidden flex flex-col">
                <Link
                  href={`/brand/${brand.id}`}
                  className="h-32 bg-ink/4 flex items-center justify-center p-4 border-b border-ink/15 transition-colors hover:bg-ink/8"
                >
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={`${brand.name} logo`}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Palette className="h-10 w-10 text-ink/30" />
                  )}
                </Link>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/brand/${brand.id}`}
                        className="text-ink hover:underline"
                      >
                        <p className="text-h3 truncate">{brand.name}</p>
                      </Link>
                      {brand.tagline && (
                        <p className="text-mono-sm text-ink/55 truncate mt-1">
                          {brand.tagline}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {[brand.primary_color, brand.secondary_color, brand.accent_color]
                        .filter(Boolean)
                        .map((color, i) => (
                          <div
                            key={i}
                            className="h-4 w-4 border border-ink/20"
                            style={{ backgroundColor: color as string }}
                            title={color as string}
                          />
                        ))}
                    </div>
                  </div>
                  {brand.website_url && (
                    <p className="flex items-center gap-1.5 text-mono-sm text-ink/55 truncate">
                      <Globe className="h-3 w-3 shrink-0" />
                      {brand.website_url.replace(/^https?:\/\//, "")}
                    </p>
                  )}
                  <div className="flex gap-2 mt-auto pt-2 border-t border-ink/15">
                    <Button asChild size="sm" variant="outline" className="flex-1 h-8">
                      <Link href={`/brand/${brand.id}`}>
                        <PencilLine className="h-3 w-3" />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 hover:text-destructive"
                      onClick={() => handleDelete(brand.id)}
                      disabled={deletingId === brand.id}
                      aria-label="Delete brand"
                    >
                      {deletingId === brand.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
