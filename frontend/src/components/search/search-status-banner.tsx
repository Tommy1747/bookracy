import { AlertTriangle, Database, BookOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchStatusBannerProps {
  source?: "live" | "cache" | "fts" | "public_domain" | "none";
  outage?: boolean;
  partial?: boolean;
  message?: string;
  hasResults?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function SearchStatusBanner({
  source,
  outage,
  partial,
  message,
  hasResults = true,
  onRetry,
  isRetrying = false,
}: SearchStatusBannerProps) {
  if (outage && !hasResults) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="flex flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center sm:p-8"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive mb-3">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          External Search Unreachable
        </h3>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {message || "External book search providers are temporarily experiencing delays or anti-bot checks. No saved matches were found for this query."}
        </p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-4 gap-2 border-destructive/30 hover:bg-destructive/10"
          >
            <RefreshCw className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`} />
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (source === "fts") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
      >
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <span className="font-medium text-amber-500">Showing saved catalog results.</span>{" "}
            <span className="text-muted-foreground">
              {message || "External search providers are currently experiencing delays. Results are being served from Bookracy's saved library index."}
            </span>
          </div>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            Check mirrors
          </Button>
        )}
      </div>
    );
  }

  if (source === "public_domain") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-sm text-foreground"
      >
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 shrink-0 text-blue-500" />
          <div>
            <span className="font-medium text-blue-500">Public-domain catalog results.</span>{" "}
            <span className="text-muted-foreground">
              {message || "Showing curated results from open public-domain archives (Project Gutenberg & Internet Archive)."}
            </span>
          </div>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            Check mirrors
          </Button>
        )}
      </div>
    );
  }

  if (outage && hasResults) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <span className="font-medium text-amber-500">Upstream search degraded.</span>{" "}
            <span className="text-muted-foreground">
              {message || "External providers are currently unreachable. Showing available community uploads."}
            </span>
          </div>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            Retry search
          </Button>
        )}
      </div>
    );
  }

  if (partial && hasResults) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <span className="font-medium text-amber-500">Partial search results.</span>{" "}
            <span className="text-muted-foreground">
              {message || "Some external search mirrors are experiencing delays. Showing available results."}
            </span>
          </div>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            Check mirrors
          </Button>
        )}
      </div>
    );
  }

  return null;
}
