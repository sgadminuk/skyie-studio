"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Globe, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandForm, type BrandFormValues } from "@/components/brand-form";
import {
  createBrandProfile,
  scrapeBrandFromUrl,
  selectScrapeLogoCandidate,
  type BrandScrapeResult,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "picker" | "scrape" | "manual";

export default function NewBrandPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("picker");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<BrandScrapeResult | null>(null);
  const [initial, setInitial] = useState<BrandFormValues>({ name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [switchingLogo, setSwitchingLogo] = useState(false);

  async function pickLogoCandidate(candidateUrl: string) {
    if (!scrapeResult) return;
    setSwitchingLogo(true);
    try {
      const result = await selectScrapeLogoCandidate(scrapeResult._scrape_id, candidateUrl);
      setInitial((prev) => ({
        ...prev,
        pending_logo_path: result.pending_logo_path,
        logo_preview_url: result.logo_url,
      }));
      setSelectedCandidate(candidateUrl);
      toast.success("Logo updated");
    } catch {
      toast.error("Could not fetch that logo candidate");
    } finally {
      setSwitchingLogo(false);
    }
  }

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
      setSelectedCandidate(result.logo_candidates?.[0] || null);
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
    <div className="mx-auto w-full max-w-4xl flex flex-col gap-[clamp(24px,4vh,48px)]">
      <header className="flex flex-col gap-3">
        <Link
          href="/brand"
          className="text-mono-sm text-ink/55 hover:text-ink flex items-center gap-2 transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          BACK TO BRANDS
        </Link>
        <div className="flex flex-col gap-2">
          <span className="text-mono-sm text-ink/40">BRAND · NEW</span>
          <h1 className="text-h2 text-ink">New brand profile.</h1>
          <p className="text-ink/60 max-w-[60ch]">
            Scrape from your website or add it manually.
          </p>
        </div>
      </header>

      {mode === "picker" && (
        <div className="grid gap-px sm:grid-cols-2 bg-ink/15">
          <button
            type="button"
            onClick={() => setMode("scrape")}
            className="bg-paper p-6 flex flex-col gap-3 text-left transition-colors hover:bg-ink/4"
          >
            <div className="flex items-center gap-3">
              <Wand2 className="h-5 w-5 text-signal" />
              <span className="text-h3 text-ink">Scrape from website.</span>
            </div>
            <p className="text-sm text-ink/65 leading-relaxed">
              Paste your company URL. The studio fetches the page, downloads the logo, and uses Gemini to infer industry, tone, and audience.
            </p>
          </button>
          <button
            type="button"
            onClick={() => {
              setInitial({ name: "" });
              setMode("manual");
            }}
            className="bg-paper p-6 flex flex-col gap-3 text-left transition-colors hover:bg-ink/4"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-signal" />
              <span className="text-h3 text-ink">Add manually.</span>
            </div>
            <p className="text-sm text-ink/65 leading-relaxed">
              Fill in name, tagline, colours, voice, and guidelines yourself. Good for brands that aren&apos;t online yet.
            </p>
          </button>
        </div>
      )}

      {mode === "scrape" && !scrapeResult && (
        <section className="border border-ink/15 px-6 py-5 flex flex-col gap-4">
          <header className="flex items-baseline gap-3">
            <Globe className="h-4 w-4 text-ink/55 self-center" />
            <h2 className="text-h3 text-ink">Website URL.</h2>
          </header>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brandUrl">URL</Label>
            <Input
              id="brandUrl"
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
            <p className="text-mono-sm text-ink/55">
              The studio fetches the homepage, reads meta tags, picks the best logo candidate, and summarises the profile. ~5–10 seconds.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={runScrape} disabled={scraping || !websiteUrl.trim()}>
              {scraping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scraping…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Scrape
                </>
              )}
            </Button>
            <Button variant="ghost" onClick={() => setMode("picker")}>
              Back
            </Button>
          </div>
        </section>
      )}

      {mode === "manual" && (
        <BrandForm
          initial={initial}
          submitLabel="Create brand profile"
          submitting={submitting}
          onSubmit={handleSave}
          extraActions={
            <Button type="button" variant="ghost" onClick={() => setMode("picker")}>
              Back
            </Button>
          }
        />
      )}

      {mode === "scrape" && scrapeResult && (
        <>
          {scrapeResult.logo_candidates && scrapeResult.logo_candidates.length > 1 && (
            <section className="border border-ink/15 px-6 py-5 flex flex-col gap-4">
              <header className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-signal" />
                  <h2 className="text-h3 text-ink">Logo candidates.</h2>
                </div>
                <p className="text-mono-sm text-ink/55">
                  Best guess applied. Click any tile to swap.
                </p>
              </header>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-ink/15">
                {scrapeResult.logo_candidates.map((url) => {
                  const active = url === selectedCandidate;
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => pickLogoCandidate(url)}
                      disabled={switchingLogo || active}
                      className={cn(
                        "relative aspect-square bg-paper flex items-center justify-center p-3 transition-colors",
                        active ? "outline-solid outline-2 outline-signal" : "hover:bg-ink/4",
                      )}
                      aria-label={`Use logo candidate ${url}`}
                      title={url}
                    >
                      <img
                        src={url}
                        alt="Logo candidate"
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement).style.opacity = "0.3";
                        }}
                      />
                      {active && (
                        <span className="absolute top-1 right-1 bg-signal text-paper p-0.5">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      {switchingLogo && active && (
                        <span className="absolute inset-0 flex items-center justify-center bg-paper/70">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <BrandForm
            initial={initial}
            scrapeId={scrapeResult._scrape_id}
            submitLabel="Save brand profile"
            submitting={submitting}
            onSubmit={handleSave}
            extraActions={
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setScrapeResult(null);
                  setWebsiteUrl("");
                  setSelectedCandidate(null);
                }}
              >
                Try another URL
              </Button>
            }
          />
        </>
      )}
    </div>
  );
}
