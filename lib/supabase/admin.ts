import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseConfigStatus = {
  isConfigured: boolean;
  hasUrl: boolean;
  hasPublishableKey: boolean;
  hasServiceRoleKey: boolean;
  missingVariables: string[];
  urlHost?: string;
};

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim();

  return { url, publishableKey, serviceRoleKey };
}

export function inspectSupabaseConfig(): SupabaseConfigStatus {
  const { url, publishableKey, serviceRoleKey } = getSupabaseEnv();
  const missingVariables: string[] = [];

  if (!url) {
    missingVariables.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!publishableKey) {
    missingVariables.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  if (!serviceRoleKey) {
    missingVariables.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  let urlHost: string | undefined;
  if (url) {
    try {
      urlHost = new URL(url).hostname;
    } catch {
      urlHost = "invalid-url";
    }
  }

  return {
    isConfigured: missingVariables.length === 0,
    hasUrl: Boolean(url),
    hasPublishableKey: Boolean(publishableKey),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    missingVariables,
    urlHost,
  };
}

/**
 * Returns a privileged Supabase administrative client using the service-role key.
 * Throws actionable errors naming missing environment variables if unconfigured.
 */
export function getAdminClient(): SupabaseClient {
  const { url, serviceRoleKey } = getSupabaseEnv();

  if (!url) {
    throw new Error(
      "Supabase server configuration error: NEXT_PUBLIC_SUPABASE_URL is missing. Please set this in your environment or Vercel dashboard.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "Supabase server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing. Please set this in your environment or Vercel dashboard (Server-only secret).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Returns a client suitable for storefront read operations.
 * Prefers the service role key for guaranteed access, but falls back to public/anon key if service role is absent.
 */
export function getStorefrontClient(): SupabaseClient | null {
  const { url, publishableKey, serviceRoleKey } = getSupabaseEnv();
  if (!url) return null;

  const key = serviceRoleKey || publishableKey;
  if (!key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
