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
