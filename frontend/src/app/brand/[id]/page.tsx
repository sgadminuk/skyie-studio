"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandForm, type BrandFormValues } from "@/components/brand-form";
import {
  deleteBrandProfile,
  getBrandProfile,
  updateBrandProfile,
  uploadBrandLogo,
  type BrandProfile,
} from "@/lib/api";
import { toast } from "sonner";

export default function EditBrandPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [initial, setInitial] = useState<BrandFormValues | null>(null);
  const [brand, setBrand] = useState<BrandProfile | null>(null);

  function loadBrand() {
    return getBrandProfile(id).then((b) => {
      setBrand(b);
      setInitial({
        name: b.name,
        tagline: b.tagline,
        description: b.description,
        website_url: b.website_url,
        primary_color: b.primary_color || undefined,
        secondary_color: b.secondary_color || undefined,
        accent_color: b.accent_color || undefined,
        tone_of_voice: b.tone_of_voice,
        target_audience: b.target_audience,
        industry: b.industry,
        guidelines: b.guidelines,
        logo_preview_url: b.logo_url,
      });
    });
  }

  useEffect(() => {
    loadBrand()
      .catch(() => toast.error("Failed to load brand profile"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(values: BrandFormValues) {
    setSubmitting(true);
    try {
      await updateBrandProfile(id, {
        name: values.name,
        tagline: values.tagline,
        description: values.description,
        website_url: values.website_url,
        primary_color: values.primary_color,
        secondary_color: values.secondary_color,
        accent_color: values.accent_color,
        tone_of_voice: values.tone_of_voice,
        target_audience: values.target_audience,
        industry: values.industry,
        guidelines: values.guidelines,
      });
      toast.success("Brand profile updated");
      await loadBrand();
    } catch {
      toast.error("Failed to update brand profile");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this brand profile? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteBrandProfile(id);
      toast.success("Brand profile deleted");
      router.push("/brand");
    } catch {
      toast.error("Failed to delete brand profile");
      setDeleting(false);
    }
  }

  async function handleLogoReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadBrandLogo(id, file);
      toast.success("Logo updated");
      await loadBrand();
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      e.target.value = "";
    }
  }

  if (loading || !initial || !brand) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ink/55" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex flex-col gap-[clamp(24px,4vh,48px)]">
      <header className="flex flex-col gap-4">
        <Link
          href="/brand"
          className="text-mono-sm text-ink/55 hover:text-ink flex items-center gap-2 transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          BACK TO BRANDS
        </Link>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-2">
            <span className="text-mono-sm text-ink/40">BRAND · EDIT</span>
            <h1 className="text-h2 text-ink">{brand.name}</h1>
            <p className="text-mono-sm text-ink/55">
              Edit profile · last updated {new Date(brand.updated_at ?? brand.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoReplace}
                aria-label="Replace logo"
              />
              <span className="inline-flex items-center gap-2 px-4 py-2 border border-ink/40 hover:border-ink hover:bg-ink hover:text-paper transition-colors cursor-pointer text-mono-sm tracking-[0.18em] uppercase">
                <Upload className="h-3 w-3" />
                Replace logo
              </span>
            </label>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-3 w-3" />
                  Delete
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <BrandForm
        initial={initial}
        submitLabel="Save changes"
        submitting={submitting}
        onSubmit={handleSave}
      />
    </div>
  );
}
