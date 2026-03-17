"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Ruler,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";

import { UploadZone } from "@/app/components/UploadZone";
import { VirtualMirror } from "@/app/components/VirtualMirror";
import type {
  FitRecommendation,
  MeasurementProfile,
  PitchCatalog,
} from "@/lib/pitch/schemas";

type PitchDashboard = {
  brandSlug: string;
  brandName: string;
  sourceType: PitchCatalog["sourceType"];
  importedAt: string;
  productsImported: number;
  variantsImported: number;
  sizeCoveragePercent: number;
  fitReadyProducts: number;
  catalogQualityScore: number;
  metadataAlerts: Array<{ field: string; count: number }>;
  recentSessions: Array<{
    id: string;
    productTitle: string;
    recommendedSizeLabel: string;
    fitConfidence: FitRecommendation["confidence"];
    shopperName: string | null;
    resultImageUrl: string | null;
    createdAt: string;
  }>;
  tryOnCompletionRate: number;
};

type CatalogResponse = {
  catalog: PitchCatalog;
  dashboard: PitchDashboard;
};

type Tab = "merchant" | "shopper";

const INITIAL_PROFILE = {
  shopperName: "",
  height: "170",
  weight: "65",
  chestBust: "88",
  waist: "70",
  hips: "96",
  inseam: "77",
  usualTopSize: "10",
  usualBottomSize: "10",
  fitPreference: "regular" as MeasurementProfile["fitPreference"],
};

function formatImportedAt(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function labelForAlert(field: string): string {
  switch (field) {
    case "sizeType":
      return "Missing size type";
    case "stretch":
      return "Missing stretch data";
    case "variantDimensions":
      return "Missing fit dimensions";
    case "material":
      return "Missing fabric data";
    case "image":
      return "Missing hero image";
    case "sizeSystem":
      return "Missing size system";
    default:
      return field;
  }
}

function sourceTypeLabel(sourceType: PitchCatalog["sourceType"]): string {
  switch (sourceType) {
    case "shopify_site_snapshot":
      return "Shopify site snapshot";
    case "shopify_csv":
      return "Shopify CSV";
    case "google_merchant":
      return "Google Merchant feed";
    case "partner_csv":
      return "Partner CSV";
    default:
      return "Seed catalog";
  }
}

export function BrandPitchPrototype() {
  const [activeTab, setActiveTab] = useState<Tab>("merchant");
  const [catalog, setCatalog] = useState<PitchCatalog | null>(null);
  const [dashboard, setDashboard] = useState<PitchDashboard | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [profileForm, setProfileForm] = useState(INITIAL_PROFILE);
  const [userImages, setUserImages] = useState<File[]>([]);
  const [recommendation, setRecommendation] = useState<FitRecommendation | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProduct = useMemo(
    () => catalog?.products.find((product) => product.id === selectedProductId) || null,
    [catalog, selectedProductId]
  );

  async function loadCatalog(brandSlug?: string) {
    setIsLoadingCatalog(true);
    setErrorMessage(null);
    try {
      const query = brandSlug ? `?brandSlug=${encodeURIComponent(brandSlug)}` : "";
      const res = await fetch(`/api/pitch/catalog${query}`, { cache: "no-store" });
      const payload = (await res.json()) as CatalogResponse;

      if (!res.ok) {
        throw new Error((payload as { message?: string }).message || "Failed to load the pitch catalog.");
      }

      setCatalog(payload.catalog);
      setDashboard(payload.dashboard);
      setSuccessMessage(
        `Pitch catalog ready: ${payload.catalog.brandName} imported with ${payload.dashboard.productsImported} products.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load the pitch catalog.");
    } finally {
      setIsLoadingCatalog(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (catalog?.products.length && !selectedProductId) {
      setSelectedProductId(catalog.products[0].id);
    }
  }, [catalog, selectedProductId]);

  useEffect(() => {
    if (catalog && selectedProductId && !catalog.products.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(catalog.products[0]?.id || "");
      setRecommendation(null);
      setGeneratedImageUrl(null);
    }
  }, [catalog, selectedProductId]);

  function buildProfilePayload(): MeasurementProfile {
    return {
      unitSystem: "metric",
      height: Number(profileForm.height),
      weight: Number(profileForm.weight),
      chestBust: Number(profileForm.chestBust),
      waist: Number(profileForm.waist),
      hips: Number(profileForm.hips),
      inseam: Number(profileForm.inseam),
      usualTopSize: profileForm.usualTopSize,
      usualBottomSize: profileForm.usualBottomSize,
      fitPreference: profileForm.fitPreference,
    };
  }

  async function handleSeedImport() {
    setIsImporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/pitch/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: "frontrunner-site-demo" }),
      });
      const payload = (await res.json()) as CatalogResponse;
      if (!res.ok) {
        throw new Error((payload as { message?: string }).message || "Seed import failed.");
      }
      setCatalog(payload.catalog);
      setDashboard(payload.dashboard);
      setSelectedProductId(payload.catalog.products[0]?.id || "");
      setSuccessMessage("Front Runner snapshot loaded and normalized for the pitch flow.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Seed import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCsvUpload(file: File) {
    setIsImporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const csvText = await file.text();
      const res = await fetch("/api/pitch/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: file.name.replace(/\.[^.]+$/, ""),
          sourceType: "shopify_csv",
          csvText,
        }),
      });
      const payload = (await res.json()) as CatalogResponse | { message?: string };
      if (!res.ok) {
        throw new Error(("message" in payload && payload.message) || "CSV import failed.");
      }
      const typedPayload = payload as CatalogResponse;
      setCatalog(typedPayload.catalog);
      setDashboard(typedPayload.dashboard);
      setSelectedProductId(typedPayload.catalog.products[0]?.id || "");
      setSuccessMessage(
        `${typedPayload.dashboard.productsImported} products normalized from ${file.name}.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "CSV import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleRecommend() {
    if (!catalog || !selectedProduct) {
      setErrorMessage("Select a product before requesting a size recommendation.");
      return;
    }

    setIsRecommending(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setGeneratedImageUrl(null);

    try {
      const profile = buildProfilePayload();
      const res = await fetch("/api/pitch/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandSlug: catalog.brandSlug,
          productId: selectedProduct.id,
          profile,
        }),
      });
      const payload = (await res.json()) as {
        recommendation?: FitRecommendation;
        message?: string;
      };

      if (!res.ok || !payload.recommendation) {
        throw new Error(payload.message || "We could not generate a size recommendation.");
      }

      setRecommendation(payload.recommendation);
      setSuccessMessage(
        `${payload.recommendation.recommendedSizeLabel} recommended with ${payload.recommendation.confidence} confidence.`
      );
      setActiveTab("shopper");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "We could not generate a size recommendation."
      );
    } finally {
      setIsRecommending(false);
    }
  }

  async function handleTryOn() {
    if (!catalog || !selectedProduct || !recommendation) {
      setErrorMessage("Generate a fit recommendation before running the virtual try-on.");
      return;
    }

    if (userImages.length === 0) {
      setErrorMessage("Upload at least one body photo to run the try-on.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("brandSlug", catalog.brandSlug);
      formData.append("productId", selectedProduct.id);
      formData.append("shopperName", profileForm.shopperName);
      formData.append("profile", JSON.stringify(buildProfilePayload()));
      formData.append("recommendation", JSON.stringify(recommendation));
      for (const file of userImages) {
        formData.append("userImages", file);
      }

      const res = await fetch("/api/pitch/try-on", {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json()) as {
        imageUrl?: string | null;
        message?: string;
      };

      if (!res.ok || !payload.imageUrl) {
        throw new Error(payload.message || "The virtual try-on did not return an image.");
      }

      setGeneratedImageUrl(payload.imageUrl);
      setSuccessMessage("Virtual try-on generated and saved to the merchant dashboard story.");
      if (catalog.brandSlug) {
        void loadCatalog(catalog.brandSlug);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The virtual try-on failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  const isBusy = isImporting || isRecommending || isGenerating;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(244,232,220,0.95)_42%,_rgba(231,221,212,1)_100%)] text-black">
      <section className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 rounded-[2rem] border border-black/10 bg-white/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.08)] backdrop-blur md:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-black/70">
              <Building2 className="h-4 w-4" />
              Front Runner Partner Demo
            </span>
            <div className="space-y-3">
              <h1 className="max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">
                Show Front Runner a retailer-ready story for fit guidance and virtual try-on.
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-black/70 sm:text-base">
                Built from a live Shopify snapshot of frontrunnerau.com, this demo shows how
                ChangeRoom can normalize Front Runner sizing, recommend the right fit, and turn
                that into a shopper-facing try-on plus a merchant-facing value summary.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActiveTab("merchant")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "merchant"
                    ? "bg-black text-white"
                    : "border border-black/15 bg-white text-black hover:bg-black hover:text-white"
                }`}
              >
                Merchant demo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("shopper")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "shopper"
                    ? "bg-black text-white"
                    : "border border-black/15 bg-white text-black hover:bg-black hover:text-white"
                }`}
              >
                Shopper demo
              </button>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.5rem] border border-black/10 bg-[#15110f] p-5 text-white">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">
                Pitch track
              </p>
              <p className="mt-2 text-lg font-semibold">
                “We can ingest Front Runner’s assortment quickly, normalize fit data, guide size
                choice, and make conversion more believable.”
              </p>
            </div>
            <div className="grid gap-3 text-sm text-white/80">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Structured sizing moat</p>
                <p className="mt-1">AU numeric sizing, unisex oversized fits, and confidence scoring are explicit.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="font-semibold text-white">Retailer-facing credibility</p>
                <p className="mt-1">Catalog health, import stats, and recent shopper sessions stay visible.</p>
              </div>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{errorMessage}</p>
          </div>
        ) : null}

        {successMessage ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{successMessage}</p>
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="grid gap-4">
            <div className="rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-black/55">
                    Merchant controls
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Import a Front Runner-ready mini catalog</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (catalog?.brandSlug) {
                      void loadCatalog(catalog.brandSlug);
                    } else {
                      void loadCatalog();
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingCatalog ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleSeedImport}
                  disabled={isImporting}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Load Front Runner snapshot
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  Upload partner CSV
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleCsvUpload(file);
                    }
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="mt-4 rounded-2xl border border-dashed border-black/15 bg-[#f7f3ef] p-4 text-sm text-black/65">
                <p className="font-semibold text-black">Supported fast-import columns</p>
                <p className="mt-1">
                  `Title`, `Handle` or `id`, `Vendor`, `Type`, `Image Src`, `Option1 Value` or
                  `size`, optional `size_system`, `size_type`, and garment dimension columns like
                  `bust_min` and `waist_max`.
                </p>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-black/55">
                    Merchant story
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">Catalog health and demo outcomes</h2>
                </div>
              </div>

              {isLoadingCatalog || !dashboard ? (
                <div className="mt-6 flex items-center gap-2 text-sm text-black/55">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading merchant metrics...
                </div>
              ) : (
                <div className="mt-6 grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: "Products imported",
                        value: dashboard.productsImported,
                        hint: dashboard.brandName,
                      },
                      {
                        label: "Variants normalized",
                        value: dashboard.variantsImported,
                        hint: `${dashboard.sizeCoveragePercent}% size coverage`,
                      },
                      {
                        label: "Fit-ready products",
                        value: dashboard.fitReadyProducts,
                        hint: "dimension-backed",
                      },
                      {
                        label: "Try-on completion",
                        value: `${dashboard.tryOnCompletionRate}%`,
                        hint: "recent sessions",
                      },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-2xl border border-black/10 bg-[#f7f3ef] p-4"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
                          {card.label}
                        </p>
                        <p className="mt-2 text-3xl font-semibold">{card.value}</p>
                        <p className="mt-1 text-sm text-black/55">{card.hint}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
                    <div className="rounded-2xl border border-black/10 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">Catalog quality score</p>
                          <p className="text-xs text-black/50">
                            Imported {formatImportedAt(dashboard.importedAt)} via {sourceTypeLabel(dashboard.sourceType)}
                          </p>
                        </div>
                        <div className="rounded-full bg-black px-3 py-1 text-sm font-semibold text-white">
                          {dashboard.catalogQualityScore}/100
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {dashboard.metadataAlerts.length > 0 ? (
                          dashboard.metadataAlerts.slice(0, 4).map((alert) => (
                            <div
                              key={alert.field}
                              className="flex items-center justify-between rounded-xl bg-[#f7f3ef] px-3 py-2 text-sm"
                            >
                              <span>{labelForAlert(alert.field)}</span>
                              <span className="font-semibold text-black/75">{alert.count}</span>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl bg-[#f7f3ef] px-3 py-2 text-sm text-black/60">
                            No metadata alerts yet.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-black/10 p-4">
                      <p className="text-sm font-semibold">Recent demo sessions</p>
                      <p className="mt-1 text-xs text-black/50">
                        Each successful try-on updates the merchant value story.
                      </p>
                      <div className="mt-4 space-y-3">
                        {dashboard.recentSessions.length > 0 ? (
                          dashboard.recentSessions.map((session) => (
                            <div
                              key={session.id}
                              className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f3ef] px-3 py-3"
                            >
                              <div>
                                <p className="text-sm font-semibold">{session.productTitle}</p>
                                <p className="text-xs text-black/55">
                                  {session.shopperName || "Demo shopper"} • {session.recommendedSizeLabel} •{" "}
                                  {session.fitConfidence} confidence
                                </p>
                              </div>
                              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                                {new Intl.DateTimeFormat("en-AU", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                }).format(new Date(session.createdAt))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl bg-[#f7f3ef] px-3 py-3 text-sm text-black/60">
                            Run one shopper flow and the merchant dashboard will capture the
                            recommendation and try-on outcome here.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-4">
            <div className="rounded-[1.75rem] border border-black/10 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3">
                <Ruler className="h-5 w-5" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-black/55">
                    Shopper demo
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    Capture measurements, recommend a size, then generate the try-on
                  </h2>
                </div>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { key: "shopperName", label: "Shopper name", type: "text" },
                      { key: "usualTopSize", label: "Usual top size", type: "text" },
                      { key: "height", label: "Height (cm)", type: "number" },
                      { key: "weight", label: "Weight (kg)", type: "number" },
                      { key: "chestBust", label: "Chest / bust (cm)", type: "number" },
                      { key: "waist", label: "Waist (cm)", type: "number" },
                      { key: "hips", label: "Hips (cm)", type: "number" },
                      { key: "inseam", label: "Inseam (cm)", type: "number" },
                    ].map((field) => (
                      <label key={field.key} className="grid gap-2 text-sm">
                        <span className="font-medium text-black/75">{field.label}</span>
                        <input
                          type={field.type}
                          value={profileForm[field.key as keyof typeof profileForm]}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          className="rounded-2xl border border-black/10 bg-[#f7f3ef] px-4 py-3 outline-none transition focus:border-black/35"
                        />
                      </label>
                    ))}
                  </div>

                  <label className="grid gap-2 text-sm">
                    <span className="font-medium text-black/75">Fit preference</span>
                    <select
                      value={profileForm.fitPreference}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fitPreference: event.target.value as MeasurementProfile["fitPreference"],
                        }))
                      }
                      className="rounded-2xl border border-black/10 bg-[#f7f3ef] px-4 py-3 outline-none transition focus:border-black/35"
                    >
                      <option value="fitted">Fitted</option>
                      <option value="regular">Regular</option>
                      <option value="relaxed">Relaxed</option>
                    </select>
                  </label>

                  <div className="rounded-2xl border border-black/10 bg-[#f7f3ef] p-4">
                    <p className="text-sm font-semibold">Upload 1-3 body photos</p>
                    <p className="mt-1 text-xs leading-5 text-black/55">
                      Front-facing, full-length images give the strongest try-on story. Photos stay
                      in the demo workflow and are not shown in the merchant dashboard.
                    </p>
                    <div className="mt-4">
                      <UploadZone
                        multiple
                        maxFiles={3}
                        label="Body photos"
                        selectedFiles={userImages}
                        onFilesSelect={setUserImages}
                        showGuidance
                        highlightMainReference
                        showInlineTip
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleRecommend}
                      disabled={isBusy || !selectedProduct}
                      className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRecommending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      Get fit recommendation
                    </button>
                    <button
                      type="button"
                      onClick={handleTryOn}
                      disabled={isBusy || !recommendation}
                      className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      Generate try-on
                    </button>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-2xl border border-black/10 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Imported assortment</p>
                        <p className="text-xs text-black/50">
                          Select a garment from the current merchant catalog.
                        </p>
                      </div>
                      {catalog ? (
                        <span className="rounded-full bg-[#f7f3ef] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-black/55">
                          {catalog.brandName}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 grid max-h-[24rem] gap-3 overflow-y-auto pr-1">
                      {catalog?.products.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setRecommendation(null);
                            setGeneratedImageUrl(null);
                          }}
                          className={`grid grid-cols-[88px_1fr] gap-3 rounded-2xl border p-3 text-left transition ${
                            product.id === selectedProductId
                              ? "border-black bg-black text-white"
                              : "border-black/10 bg-[#f7f3ef] hover:border-black/30"
                          }`}
                        >
                          <div className="overflow-hidden rounded-xl bg-white">
                            <img
                              src={product.images[0]}
                              alt={product.title}
                              className="h-24 w-full object-cover"
                            />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{product.title}</p>
                            <p className="mt-1 text-xs opacity-70">
                              {product.category === "dress" ? "Dress" : "Women’s top"} •{" "}
                              {product.variants.length} sizes • score {product.completenessScore}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full border border-current/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                                {product.sizeSystem || "AU"}
                              </span>
                              {product.sizeType ? (
                                <span className="rounded-full border border-current/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                                  {product.sizeType}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      )) || (
                        <div className="rounded-2xl bg-[#f7f3ef] p-4 text-sm text-black/60">
                          Load a demo brand or upload a partner CSV to start the shopper flow.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border border-black/10 p-4">
                      <p className="text-sm font-semibold">Fit recommendation</p>
                      {selectedProduct ? (
                        <p className="mt-1 text-xs text-black/50">
                          {selectedProduct.title} • {selectedProduct.brand}
                        </p>
                      ) : null}
                      {recommendation ? (
                        <div className="mt-4 space-y-3">
                          <div className="rounded-2xl bg-[#f7f3ef] p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                              Recommended size
                            </p>
                            <p className="mt-2 text-4xl font-semibold">
                              {recommendation.recommendedSizeLabel}
                            </p>
                            <p className="mt-2 text-sm text-black/70">{recommendation.reasoning}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                              {recommendation.confidence} confidence
                            </span>
                            {recommendation.alternateSizes.map((alternate) => (
                              <span
                                key={alternate.variantId}
                                className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-black/60"
                              >
                                Alternate {alternate.sizeLabel}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl bg-[#f7f3ef] p-4 text-sm text-black/60">
                          Enter measurements, choose a product, then request a recommendation.
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-black/10 p-4">
                      <p className="text-sm font-semibold">Virtual try-on result</p>
                      <p className="mt-1 text-xs text-black/50">
                        Powered by the existing try-on backend, wrapped in a pitch-safe demo flow.
                      </p>
                      <div className="mt-4">
                        <VirtualMirror
                          imageUrl={generatedImageUrl}
                          isLoading={isGenerating}
                          errorMessage={errorMessage}
                          onDownloadClean={() => undefined}
                          onTryAnother={() => setGeneratedImageUrl(null)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-black/10 bg-[#15110f] p-5 text-white shadow-[0_18px_60px_rgba(0,0,0,0.12)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">
                Demo operating notes
              </p>
              <div className="mt-4 grid gap-3 text-sm text-white/80 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-semibold text-white">Feed-first story</p>
                  <p className="mt-1">
                    Lead with a structured Front Runner snapshot or CSV instead of a brittle scrape demo.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-semibold text-white">Explainable fit</p>
                  <p className="mt-1">
                    The first recommendation engine is rules-based on dimensions and normalized sizes.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-semibold text-white">Retailer seriousness</p>
                  <p className="mt-1">
                    The merchant dashboard quantifies coverage gaps and recent try-on outcomes.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
