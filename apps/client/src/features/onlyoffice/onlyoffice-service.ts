import api from "@/lib/api-client";
import i18n from "@/i18n.ts";
import type { OnlyOfficeConfigResponse } from "./onlyoffice.utils";

export async function fetchOnlyOfficeConfig(opts: {
  attachmentId: string;
  shareJwt?: string;
  mode?: "view" | "edit";
}): Promise<OnlyOfficeConfigResponse> {
  const lang = i18n.resolvedLanguage || i18n.language;
  if (opts.shareJwt) {
    const req = await api.post("/onlyoffice/public-config", {
      attachmentId: opts.attachmentId,
      jwt: opts.shareJwt,
      lang,
    });
    return req.data;
  }
  const req = await api.post("/onlyoffice/config", {
    attachmentId: opts.attachmentId,
    lang,
    mode: opts.mode,
  });
  return req.data;
}

export async function awaitOnlyOfficeSave(opts: {
  attachmentId: string;
  since: string;
}): Promise<{ saved: boolean; updatedAt: string }> {
  const req = await api.post("/onlyoffice/await-save", {
    attachmentId: opts.attachmentId,
    since: opts.since,
  });
  return req.data;
}
