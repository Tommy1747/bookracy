import { useSettingsStore } from "@/stores/settings";
import { ofetch } from "ofetch";

export type BaseResponse<T> = {
  results: T[];
  degraded?: boolean;
  outage?: boolean;
  source?: "live" | "cache" | "fts" | "public_domain" | "none";
  upstreamNotice?: {
    code: string;
    message: string;
  };
  message?: string;
};

const backendURL = useSettingsStore.getState().backendURL;

export const client = ofetch.create({
  baseURL: backendURL + `/api`,
});
