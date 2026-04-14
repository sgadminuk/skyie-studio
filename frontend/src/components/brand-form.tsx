"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Upload, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadScrapeLogo, type BrandProfileInput } from "@/lib/api";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface BrandFormValues extends BrandProfileInput {
  logo_preview_url?: string | null;
}

interface BrandFormProps {
  initial: BrandFormValues;
  scrapeId?: string | null;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: BrandFormValues) => void | Promise<void>;
  extraActions?: React.ReactNode;
}

export function BrandForm({
  initial,
  scrapeId,
  submitLabel,
  submitting,
  onSubmit,
  extraActions,
}: BrandFormProps) {
  const [values, setValues] = useState<BrandFormValues>(initial);
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync logo-related fields from props when the parent swaps candidates —
  // useState(initial) only captures on first mount, so without this effect a
  // newly-picked logo URL would never reach the img element.
  useEffect(() => {
    setValues((prev) => {
      if (
        prev.logo_preview_url === initial.logo_preview_url &&
        prev.pending_logo_path === initial.pending_logo_path
      ) {
        return prev;
      }
      return {
        ...prev,
        logo_preview_url: initial.logo_preview_url,
        pending_logo_path: initial.pending_logo_path,
      };
    });
    setLogoError(false);
  }, [initial.logo_preview_url, initial.pending_logo_path]);

  function update<K extends keyof BrandFormValues>(key: K, val: BrandFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!scrapeId) {
      toast.error("Save the brand first, then upload a logo via edit.");
      return;
    }
    setUploading(true);
    try {
      const result = await uploadScrapeLogo(scrapeId, file);
      update("pending_logo_path", result.pending_logo_path);
      update("logo_preview_url", result.logo_url);
      toast.success("Logo uploaded");
    } catch {
      toast.error("Logo upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name?.trim()) {
      toast.error("Brand name is required");
      return;
    }
    await onSubmit(values);
  }

  const logoUrl = values.logo_preview_url
    ? values.logo_preview_url.startsWith("http")
      ? values.logo_preview_url
      : `${API_URL}${values.logo_preview_url}`
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Brand name *</Label>
            <Input
              value={values.name || ""}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Tagline</Label>
            <Input
              value={values.tagline || ""}
              onChange={(e) => update("tagline", e.target.value)}
              placeholder="Short memorable phrase"
            />
          </div>
          <div className="space-y-2">
            <Label>Website URL</Label>
            <Input
              value={values.website_url || ""}
              onChange={(e) => update("website_url", e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={values.description || ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="What does the brand do, for whom, and why does it matter?"
            />
          </div>
          <div className="space-y-2">
            <Label>Industry</Label>
            <Input
              value={values.industry || ""}
              onChange={(e) => update("industry", e.target.value)}
              placeholder="SaaS, Fashion, Fintech..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
            aria-label="Upload brand logo"
          />
          {logoUrl ? (
            <div className="flex items-start gap-4">
              <div className="h-28 w-28 rounded-md border bg-muted flex items-center justify-center p-2 shrink-0 overflow-hidden">
                {logoError ? (
                  <div className="flex flex-col items-center justify-center text-center text-[9px] text-muted-foreground gap-0.5 px-1">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span>Preview failed</span>
                    <a
                      href={logoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline break-all"
                    >
                      Open in new tab
                    </a>
                  </div>
                ) : logoUrl.toLowerCase().endsWith(".svg") ? (
                  // <object> renders cross-origin SVG with the browser's full
                  // SVG engine (<img> has quirks with certain SVGs — viewBox,
                  // intrinsic sizing, etc). onError-via-onLoadError.
                  <object
                    key={logoUrl}
                    data={logoUrl}
                    type="image/svg+xml"
                    aria-label="Brand logo"
                    className="max-h-full max-w-full pointer-events-none"
                    onLoad={() => setLogoError(false)}
                    onError={() => setLogoError(true)}
                  >
                    <img
                      src={logoUrl}
                      alt="Brand logo"
                      className="max-h-full max-w-full object-contain"
                      onError={() => setLogoError(true)}
                    />
                  </object>
                ) : (
                  <img
                    key={logoUrl}
                    src={logoUrl}
                    alt="Brand logo"
                    className="max-h-full max-w-full object-contain"
                    onLoad={() => setLogoError(false)}
                    onError={() => setLogoError(true)}
                  />
                )}
              </div>
              <div className="space-y-2 flex-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || !scrapeId}
                >
                  <Upload className="mr-2 h-3 w-3" /> Replace logo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-400"
                  onClick={() => {
                    update("logo_preview_url", null);
                    update("pending_logo_path", null);
                  }}
                >
                  <X className="mr-2 h-3 w-3" /> Remove
                </Button>
                {!scrapeId && (
                  <p className="text-[11px] text-muted-foreground">
                    Save the brand first, then use the edit page to upload a new logo.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="h-32 w-full border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || !scrapeId}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span className="text-xs mt-1">
                    {scrapeId ? "Upload logo (PNG with transparent background)" : "Save brand first to upload logo"}
                  </span>
                </>
              )}
            </button>
          )}
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["primary_color", "secondary_color", "accent_color"] as const).map(
              (key, idx) => (
                <div key={key} className="space-y-2">
                  <Label>
                    {["Primary", "Secondary", "Accent"][idx]}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={values[key] || "#000000"}
                      onChange={(e) => update(key, e.target.value)}
                      className="h-9 w-12 rounded border bg-transparent cursor-pointer"
                      aria-label={`${["Primary", "Secondary", "Accent"][idx]} color`}
                    />
                    <Input
                      value={values[key] || ""}
                      onChange={(e) => update(key, e.target.value)}
                      placeholder="#000000"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ),
            )}
          </div>
        </CardContent>
      </Card>

      {/* Voice & audience */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voice &amp; Audience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tone of voice</Label>
            <Textarea
              rows={3}
              value={values.tone_of_voice || ""}
              onChange={(e) => update("tone_of_voice", e.target.value)}
              placeholder="Friendly, expert, concise. Avoid jargon. Prefer active voice."
            />
          </div>
          <div className="space-y-2">
            <Label>Target audience</Label>
            <Textarea
              rows={3}
              value={values.target_audience || ""}
              onChange={(e) => update("target_audience", e.target.value)}
              placeholder="Who are we speaking to? Demographics, psychographics, goals, pain points."
            />
          </div>
        </CardContent>
      </Card>

      {/* Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Guidelines</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={8}
            value={values.guidelines || ""}
            onChange={(e) => update("guidelines", e.target.value)}
            placeholder={
              "Free-form rules the AI should follow:\n- Never show competitors\n- Always lead with benefit, not feature\n- Prefer warm natural lighting\n- Include logo in bottom-right of hero shots"
            }
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
        {extraActions}
      </div>
    </form>
  );
}
