"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Palette, Globe, Trash2, Loader2, PencilLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Brand Kit</h1>
          <p className="text-muted-foreground mt-1">
            Manage your brand profiles — logos, colors, tone, and guidelines — used to steer AI generation.
          </p>
        </div>
        <Button asChild>
          <Link href="/brand/new">
            <Plus className="mr-2 h-4 w-4" /> New Brand
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : brands.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Palette className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">No brand profiles yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Create one by scraping your company website, or add it manually — you can attach a logo, primary colors, voice, and guidelines.
            </p>
            <Button asChild className="mt-4">
              <Link href="/brand/new">
                <Plus className="mr-2 h-4 w-4" /> Create Brand Profile
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => {
            const logoUrl = brand.logo_url
              ? brand.logo_url.startsWith("http")
                ? brand.logo_url
                : `${API_URL}${brand.logo_url}`
              : null;
            return (
              <Card
                key={brand.id}
                className="overflow-hidden transition-all hover:border-primary/50"
              >
                <Link href={`/brand/${brand.id}`}>
                  <div className="h-28 bg-muted flex items-center justify-center p-4 border-b">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={`${brand.name} logo`}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <Palette className="h-10 w-10 text-muted-foreground/40" />
                    )}
                  </div>
                </Link>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/brand/${brand.id}`} className="hover:underline">
                        <p className="font-semibold truncate">{brand.name}</p>
                      </Link>
                      {brand.tagline && (
                        <p className="text-xs text-muted-foreground truncate">
                          {brand.tagline}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {brand.primary_color && (
                        <div
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: brand.primary_color }}
                          title={brand.primary_color}
                        />
                      )}
                      {brand.secondary_color && (
                        <div
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: brand.secondary_color }}
                          title={brand.secondary_color}
                        />
                      )}
                      {brand.accent_color && (
                        <div
                          className="h-4 w-4 rounded-full border"
                          style={{ backgroundColor: brand.accent_color }}
                          title={brand.accent_color}
                        />
                      )}
                    </div>
                  </div>
                  {brand.website_url && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                      <Globe className="h-3 w-3 shrink-0" />
                      {brand.website_url.replace(/^https?:\/\//, "")}
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                    >
                      <Link href={`/brand/${brand.id}`}>
                        <PencilLine className="mr-1 h-3 w-3" /> Edit
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
