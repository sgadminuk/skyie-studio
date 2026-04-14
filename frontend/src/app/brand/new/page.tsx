"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BrandForm,
  type BrandFormValues,
} from "@/components/brand-form";
import {
  createBrandProfile,
  scrapeBrandFromUrl,
  type BrandScrapeResult,
} from "@/lib/api";
import { toast } from "sonner";

type Mode = "picker" | "scrape" | "manual";

export default function NewBrandPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("picker");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<BrandScrapeResult | null>(null);
  const [initial, setInitial] = useState<BrandFormValues>({ name: "" });
  const [submitting, setSubmitting] = useState(false);

  async function runScrape() {
    if (!websiteUrl.trim()) {
      toast.error("Enter a website URL first");
      return;
    }
    setScraping(true);
    try {
      const result = await scrapeBrandFromUrl(websiteUrl.trim());
      setScrapeResult(result);
      setInitial({
        name: result.name,
        tagline: result.tagline,
        description: result.description,
        website_url: result.website_url,
        primary_color: result.primary_color || undefined,
        secondary_color: result.secondary_color || undefined,
        accent_color: result.accent_color || undefined,
        tone_of_voice: result.tone_of_voice,
        target_audience: result.target_audience,
        industry: result.industry,
        guidelines: result.guidelines,
        pending_logo_path: result.logo_path || null,
        logo_preview_url: result.logo_url || null,
      });
      toast.success("Brand profile scraped — review and save");
    } catch (err) {
      const anyErr = err as { response?: { data?: { detail?: string } } };
      toast.error(anyErr?.response?.data?.detail || "Scrape failed");
    } finally {
      setScraping(false);
    }
  }

  async function handleSave(values: BrandFormValues) {
    setSubmitting(true);
    try {
      const created = await createBrandProfile({
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
        pending_logo_path: values.pending_logo_path,
      });
      toast.success("Brand profile created");
      router.push(`/brand/${created.id}`);
    } catch {
      toast.error("Failed to create brand profile");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/brand">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Brand Profile</h1>
          <p className="text-sm text-muted-foreground">
            Scrape from your website or add it manually.
          </p>
        </div>
      </div>

      {mode === "picker" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            className="cursor-pointer transition-all hover:border-primary/60"
            onClick={() => setMode("scrape")}
          >
            <CardContent className="p-6 space-y-2">
              <div className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-primary" />
                <p className="font-semibold">Scrape from website</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Paste your company URL. Skyie will fetch the page, download the logo, and use Gemini to infer industry, tone, and audience.
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer transition-all hover:border-primary/60"
            onClick={() => {
              setInitial({ name: "" });
              setMode("manual");
            }}
          >
            <CardContent className="p-6 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <p className="font-semibold">Add manually</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Fill in name, tagline, colors, voice, and guidelines yourself. Good for brands that aren&apos;t online yet.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {mode === "scrape" && !scrapeResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Website URL
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://skyieglobal.tech"
                disabled={scraping}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runScrape();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Skyie fetches the homepage, reads meta tags and visible copy, picks the best logo candidate, and asks Gemini to summarize the brand profile. Takes ~5–10 seconds.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={runScrape} disabled={scraping || !websiteUrl.trim()}>
                {scraping ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scraping...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" /> Scrape
                  </>
                )}
              </Button>
              <Button variant="ghost" onClick={() => setMode("picker")}>
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "manual" && (
        <BrandForm
          initial={initial}
          submitLabel="Create Brand Profile"
          submitting={submitting}
          onSubmit={handleSave}
          extraActions={
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode("picker")}
            >
              Back
            </Button>
          }
        />
      )}

      {mode === "scrape" && scrapeResult && (
        <BrandForm
          initial={initial}
          scrapeId={scrapeResult._scrape_id}
          submitLabel="Save Brand Profile"
          submitting={submitting}
          onSubmit={handleSave}
          extraActions={
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setScrapeResult(null);
                setWebsiteUrl("");
              }}
            >
              Try another URL
            </Button>
          }
        />
      )}
    </div>
  );
}
