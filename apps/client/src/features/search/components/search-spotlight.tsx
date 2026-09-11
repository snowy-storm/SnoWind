import { Spotlight } from "@mantine/spotlight";
import { IconSearch, IconSparkles } from "@tabler/icons-react";
import { Group, Button, VisuallyHidden, Text, SegmentedControl } from "@mantine/core";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useDebouncedValue, useHotkeys } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { searchSpotlight, searchSpotlightStore } from "../constants.ts";
import { SearchSpotlightFilters } from "./search-spotlight-filters.tsx";
import { useUnifiedSearch } from "../hooks/use-unified-search.ts";
import { useAiSearch } from "../../../ee/ai/hooks/use-ai-search.ts";
import { SearchResultItem } from "./search-result-item.tsx";
import { AiSearchResult } from "../../../ee/ai/components/ai-search-result.tsx";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { hintVectorCache } from "@/ee/ai/services/ai-search-service.ts";
import { getAiVectorDriver } from "@/lib/config.ts";
import {
  openSearchSpotlight,
  searchSpotlightScopeAtom,
  type SearchSpotlightScope,
} from "@/features/search/open-search-spotlight";
import { InPageSearchPanel } from "@/features/search/components/in-page-search-panel";
import { baseQuickSearchAtom } from "@/features/page-find/atoms/page-find-atom";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms";
import { isEditorReady } from "@snowind/editor-ext";

interface SearchSpotlightProps {
  spaceId?: string;
}
export function SearchSpotlight({ spaceId }: SearchSpotlightProps) {
  const workspace = useAtomValue(workspaceAtom);
  const { t } = useTranslation();
  const hasAiFeature = useHasFeature(Feature.AI);
  const hasAttachmentIndexing = useHasFeature(Feature.ATTACHMENT_INDEXING);
  const [query, setQuery] = useState("");
  const [debouncedSearchQuery] = useDebouncedValue(query, 300);
  const [scope, setScope] = useAtom(searchSpotlightScopeAtom);
  const setBaseQuickSearch = useSetAtom(baseQuickSearchAtom);
  const editor = useAtomValue(pageEditorAtom);
  const [filters, setFilters] = useState<{
    spaceId?: string | null;
    contentType?: string;
    creatorId?: string | null;
    labelIds?: string[];
    titleOnly?: boolean;
  }>({
    contentType: "page",
    titleOnly: true,
  });
  const [isAiMode, setIsAiMode] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  const isPageMode = scope === "page";
  const isGlobalMode = scope === "global";

  // Build unified search params
  const searchParams = useMemo(() => {
    const params: any = {
      query: debouncedSearchQuery,
      contentType: filters.contentType || "page",
    };

    if (filters.spaceId) {
      params.spaceId = filters.spaceId;
    }

    if (filters.creatorId) {
      params.creatorId = filters.creatorId;
    }

    if (filters.labelIds?.length) {
      params.labelIds = filters.labelIds;
    }

    if (filters.titleOnly) {
      params.titleOnly = true;
    }

    return params;
  }, [debouncedSearchQuery, filters]);

  const {
    data: searchResults,
    isFetching,
  } = useUnifiedSearch(
    searchParams,
    isGlobalMode && !isAiMode && spotlightOpen,
  );
  const {
    //@ts-ignore
    data: aiSearchResult,
    //@ts-ignore
    isPending: isAiLoading,
    //@ts-ignore
    mutate: triggerAiSearchMutation,
    //@ts-ignore
    reset: resetAiMutation,
    //@ts-ignore
    error: aiSearchError,
    streamingAnswer,
    streamingSources,
    clearStreaming,
  } = useAiSearch();

  useEffect(() => {
    clearStreaming();
    resetAiMutation();
  }, [query, clearStreaming, resetAiMutation]);

  useEffect(() => {
    if (aiSearchError) {
      notifications.show({
        message: aiSearchError.message || t("AI search failed. Please try again."),
        color: "red",
        position: "top-center"
      });
    }
  }, [aiSearchError, t]);

  const clearPageEffects = useCallback(() => {
    setBaseQuickSearch("");
    if (isEditorReady(editor)) {
      editor.commands.setSearchTerm("");
    }
  }, [editor, setBaseQuickSearch]);

  const handleScopeChange = useCallback(
    (next: SearchSpotlightScope) => {
      if (next === "global") {
        clearPageEffects();
        setIsAiMode(false);
      }
      setScope(next);
    },
    [clearPageEffects, setScope],
  );

  useHotkeys([
    ["mod+K", () => openSearchSpotlight("global")],
    ["mod+F", () => openSearchSpotlight("page")],
  ]);

  // TipTap / legacy events
  useEffect(() => {
    const onOpenPage = () => openSearchSpotlight("page");
    const onClose = () => {
      searchSpotlight.close();
      clearPageEffects();
    };
    document.addEventListener("openFindDialogFromEditor", onOpenPage);
    document.addEventListener("closeFindDialogFromEditor", onClose);
    return () => {
      document.removeEventListener("openFindDialogFromEditor", onOpenPage);
      document.removeEventListener("closeFindDialogFromEditor", onClose);
    };
  }, [clearPageEffects]);

  const isFilterBrowse =
    (filters.labelIds?.length ?? 0) > 0 || !!filters.creatorId;
  const isQuerySettled = query === debouncedSearchQuery;

  const isAttachmentSearch =
    filters.contentType === "attachment" && hasAttachmentIndexing;

  const resultItems = (searchResults || []).map((result) => (
    <SearchResultItem
      key={result.id}
      result={result}
      isAttachmentResult={isAttachmentSearch}
      showSpace={!filters.spaceId}
    />
  ));

  const handleSpotlightOpen = () => {
    setSpotlightOpen(true);
    if (
      workspace?.settings?.ai?.search === true &&
      getAiVectorDriver() === "turbopuffer"
    ) {
      hintVectorCache();
    }
  };

  const handleSpotlightClose = () => {
    setSpotlightOpen(false);
    clearPageEffects();
    setIsAiMode(false);
  };

  const handleFiltersChange = useCallback((newFilters: any) => {
    setFilters(newFilters);
  }, []);

  const handleAskClick = () => {
    setIsAiMode(!isAiMode);
  };

  const handleAiSearchTrigger = () => {
    if (query.trim() && isAiMode) {
      triggerAiSearchMutation(searchParams);
    }
  };

  return (
    <>
      <Spotlight.Root
        size="xl"
        maxHeight={600}
        onSpotlightOpen={handleSpotlightOpen}
        onSpotlightClose={handleSpotlightClose}
        store={searchSpotlightStore}
        query={query}
        onQueryChange={setQuery}
        scrollable
        shortcut={null}
        overlayProps={{
          backgroundOpacity: 0.55,
        }}
      >
        <Group gap="xs" px="sm" pt="sm" pb="xs" wrap="nowrap">
          <Spotlight.Search
            placeholder={
              isAiMode
                ? t("Ask a question...")
                : isPageMode
                  ? t("Search this page...")
                  : t("Search...")
            }
            aria-label={
              isAiMode
                ? t("Ask a question...")
                : isPageMode
                  ? t("Search this page...")
                  : t("Search")
            }
            leftSection={<IconSearch size={20} stroke={1.5} />}
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isAiMode && query.trim() && !isAiLoading) {
                e.preventDefault();
                handleAiSearchTrigger();
              }
            }}
          />
          <SegmentedControl
            size="xs"
            value={scope}
            onChange={(value) => handleScopeChange(value as SearchSpotlightScope)}
            data={[
              { label: t("Global mode"), value: "global" },
              { label: t("This page"), value: "page" },
            ]}
          />
          {isAiMode && hasAiFeature && isGlobalMode && (
            <Button
              size="xs"
              leftSection={<IconSparkles size={16} />}
              onClick={handleAiSearchTrigger}
              disabled={!query.trim()}
              loading={isAiLoading}
            >
              Ask
            </Button>
          )}
        </Group>

        {isGlobalMode && (
          <div style={{ padding: "4px 16px" }}>
            <SearchSpotlightFilters
              onFiltersChange={handleFiltersChange}
              onAskClick={handleAskClick}
              spaceId={spaceId}
              isAiMode={isAiMode}
              defaultTitleOnly
            />
          </div>
        )}

        {isPageMode && (
          <InPageSearchPanel query={query} active={spotlightOpen && isPageMode} />
        )}

        <VisuallyHidden role="status" aria-live="polite">
          {isPageMode
            ? ""
            : isAiMode
              ? query.length > 0 && !isAiLoading && !aiSearchResult
                ? t("No answer available")
                : ""
              : (query.length > 0 || isFilterBrowse) && !isFetching
                ? resultItems.length === 0
                  ? t("No results found")
                  : t("{{count}} results found", { count: resultItems.length })
                : ""}
        </VisuallyHidden>

        {isGlobalMode && (
          <Spotlight.ActionsList>
            {isAiMode ? (
              <>
                {query.length === 0 && (
                  <Spotlight.Empty>{t("Ask a question...")}</Spotlight.Empty>
                )}
                {query.length > 0 && (isAiLoading || aiSearchResult || streamingAnswer) && (
                  <AiSearchResult
                    result={aiSearchResult}
                    isLoading={isAiLoading}
                    streamingAnswer={streamingAnswer}
                    streamingSources={streamingSources}
                  />
                )}
                {query.length > 0 && !isAiLoading && !aiSearchResult && (
                  <Spotlight.Empty>{t("No answer available")}</Spotlight.Empty>
                )}
              </>
            ) : (
              <>
                {query.length === 0 && !isFilterBrowse && resultItems.length === 0 && (
                  <Spotlight.Empty>{t("Start typing to search...")}</Spotlight.Empty>
                )}

                {(query.length > 0 || isFilterBrowse) &&
                  !isFetching &&
                  isQuerySettled &&
                  resultItems.length === 0 && (
                    <Spotlight.Empty>{t("No results found...")}</Spotlight.Empty>
                  )}

                {resultItems.length > 0 && <>{resultItems}</>}

                {(query.length > 0 || isFilterBrowse) &&
                  isFetching &&
                  resultItems.length === 0 && (
                  <Spotlight.Empty>
                    <Text size="sm" style={{ marginTop: 10 }}>
                      {t("Searching...")}
                    </Text>
                  </Spotlight.Empty>
                )}
              </>
            )}
          </Spotlight.ActionsList>
        )}
      </Spotlight.Root>
    </>
  );
}
