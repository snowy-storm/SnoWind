export interface IEmbedProvider {
  id: string;
  name: string;
  regex: RegExp;
  getEmbedUrl: (match: RegExpMatchArray, url?: string) => string;
}

/**
 * Intranet / air-gap build: only generic iframe embeds remain.
 * Cloud SaaS providers (Loom, Airtable, Figma, etc.) are removed so the
 * slash menu and paste paths never point browsers at the public internet.
 */
export const embedProviders: IEmbedProvider[] = [
  {
    id: "iframe",
    name: "Iframe",
    regex: /any-iframe/,
    getEmbedUrl: (match, url) => {
      return url;
    },
  },
];

export function getEmbedProviderById(id: string) {
  return (
    embedProviders.find(
      (provider) => provider.id.toLowerCase() === id.toLowerCase(),
    ) ?? embedProviders[0]
  );
}

export interface IEmbedResult {
  embedUrl: string;
  provider: string;
}

export function getEmbedUrlAndProvider(url: string): IEmbedResult {
  for (const provider of embedProviders) {
    if (provider.id === "iframe") {
      continue;
    }
    const match = url.match(provider.regex);
    if (match) {
      return {
        embedUrl: provider.getEmbedUrl(match, url),
        provider: provider.name.toLowerCase(),
      };
    }
  }
  return {
    embedUrl: url,
    provider: "iframe",
  };
}
