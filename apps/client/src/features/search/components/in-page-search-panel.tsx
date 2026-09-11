import {
  ActionIcon,
  Button,
  Flex,
  Input,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowNarrowDown,
  IconArrowNarrowUp,
  IconLetterCase,
  IconReplace,
} from "@tabler/icons-react";
import { isEditorReady } from "@snowind/editor-ext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { getHotkeyHandler, useToggle } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useParams } from "react-router-dom";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query";
import { resolvePageFindTarget } from "@/features/page-find/utils/resolve-page-find-target";
import { findTextMatches } from "@/features/page-find/utils/text-matches";
import {
  getMermaidFindBridge,
  subscribeMermaidFindBridge,
} from "@/features/page-find/mermaid-find-bridge";
import { baseQuickSearchAtom } from "@/features/page-find/atoms/page-find-atom";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms";
import { replaceInBaseCells } from "@/features/page-find/utils/replace-in-base-cells";
import { useBaseQuery } from "@/ee/base/queries/base-query";
import { useUpdateRowMutation } from "@/ee/base/queries/base-row-query";

type InPageSearchPanelProps = {
  query: string;
  active: boolean;
};

export function InPageSearchPanel({ query, active }: InPageSearchPanelProps) {
  const { t } = useTranslation();
  const { pageSlug, pageId: routePageId } = useParams();
  const pageId = routePageId || (pageSlug ? extractPageSlugId(pageSlug) : undefined);
  const { data: page } = usePageQuery({ pageId });
  const target = resolvePageFindTarget(page);
  const editable = !page?.deletedAt && (page?.permissions?.canEdit ?? false);
  const editor = useAtomValue(pageEditorAtom);
  const setBaseQuickSearch = useSetAtom(baseQuickSearchAtom);
  const { data: base } = useBaseQuery(target === "base" ? pageId : undefined);
  const updateRowMutation = useUpdateRowMutation();

  const [bridgeTick, setBridgeTick] = useState(0);
  useEffect(() => subscribeMermaidFindBridge(() => setBridgeTick((n) => n + 1)), []);
  void bridgeTick;

  const mermaidBridge = getMermaidFindBridge();
  const [replaceText, setReplaceText] = useState("");
  const [mermaidIndex, setMermaidIndex] = useState(0);
  const [caseSensitive, caseSensitiveToggle] = useToggle([
    { isCaseSensitive: false, color: "gray" },
    { isCaseSensitive: true, color: "blue" },
  ]);
  const [replacing, setReplacing] = useState(false);

  const canReplace =
    editable && (target === "document" || target === "mermaid" || target === "base");

  const mermaidMatches = useMemo(() => {
    if (!active || target !== "mermaid" || !mermaidBridge) return [];
    return findTextMatches(
      mermaidBridge.getSource(),
      query,
      caseSensitive.isCaseSensitive,
    );
  }, [active, target, mermaidBridge, query, caseSensitive.isCaseSensitive, bridgeTick]);

  const resultsLabel = useMemo(() => {
    if (!query.trim()) return "";
    if (target === "none") return t("In-page search is not supported on this page type.");
    if (target === "document") {
      if (!isEditorReady(editor)) return "";
      const results = editor.storage.searchAndReplace?.results;
      const resultIndex = editor.storage.searchAndReplace?.resultIndex ?? 0;
      if (results?.length > 0) return `${resultIndex + 1}/${results.length}`;
      return t("Not found");
    }
    if (target === "mermaid") {
      if (mermaidMatches.length > 0) {
        return `${mermaidIndex + 1}/${mermaidMatches.length}`;
      }
      return t("Not found");
    }
    if (target === "base") {
      return t("Filtering");
    }
    return "";
  }, [
    query,
    target,
    editor,
    mermaidMatches.length,
    mermaidIndex,
    t,
    editor?.storage?.searchAndReplace?.results,
    editor?.storage?.searchAndReplace?.resultIndex,
  ]);

  const clearEffects = useCallback(() => {
    setBaseQuickSearch("");
    if (isEditorReady(editor)) {
      editor.commands.setSearchTerm("");
    }
    setMermaidIndex(0);
  }, [editor, setBaseQuickSearch]);

  useEffect(() => {
    if (!active) {
      clearEffects();
      return;
    }
    if (target === "none") {
      clearEffects();
      return;
    }
    if (target === "document" && isEditorReady(editor)) {
      editor.commands.setSearchTerm(query);
      editor.commands.setCaseSensitive(caseSensitive.isCaseSensitive);
      editor.commands.resetIndex();
      editor.commands.selectCurrentItem();
    } else if (target === "base") {
      setBaseQuickSearch(query);
    } else if (target === "mermaid" && mermaidBridge) {
      const matches = findTextMatches(
        mermaidBridge.getSource(),
        query,
        caseSensitive.isCaseSensitive,
      );
      if (matches.length > 0) {
        setMermaidIndex(0);
        mermaidBridge.selectRange(matches[0].start, matches[0].end);
      } else {
        setMermaidIndex(0);
      }
    }
  }, [
    active,
    target,
    query,
    caseSensitive.isCaseSensitive,
    editor,
    mermaidBridge,
    setBaseQuickSearch,
    clearEffects,
  ]);

  useEffect(() => () => clearEffects(), [clearEffects]);

  const goToDocumentSelection = useCallback(() => {
    if (!isEditorReady(editor)) return;
    const { results, resultIndex } = editor.storage.searchAndReplace;
    const position = results?.[resultIndex];
    if (!position) return;
    editor.commands.setTextSelection(position);
    document
      .querySelector(".search-result-current")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    editor.commands.setTextSelection(0);
  }, [editor]);

  const next = useCallback(() => {
    if (target === "document" && isEditorReady(editor)) {
      editor.commands.nextSearchResult();
      goToDocumentSelection();
      return;
    }
    if (target === "mermaid" && mermaidBridge && mermaidMatches.length > 0) {
      const nextIndex = (mermaidIndex + 1) % mermaidMatches.length;
      setMermaidIndex(nextIndex);
      const match = mermaidMatches[nextIndex];
      mermaidBridge.selectRange(match.start, match.end);
    }
  }, [
    target,
    editor,
    goToDocumentSelection,
    mermaidBridge,
    mermaidMatches,
    mermaidIndex,
  ]);

  const previous = useCallback(() => {
    if (target === "document" && isEditorReady(editor)) {
      editor.commands.previousSearchResult();
      goToDocumentSelection();
      return;
    }
    if (target === "mermaid" && mermaidBridge && mermaidMatches.length > 0) {
      const nextIndex =
        (mermaidIndex - 1 + mermaidMatches.length) % mermaidMatches.length;
      setMermaidIndex(nextIndex);
      const match = mermaidMatches[nextIndex];
      mermaidBridge.selectRange(match.start, match.end);
    }
  }, [
    target,
    editor,
    goToDocumentSelection,
    mermaidBridge,
    mermaidMatches,
    mermaidIndex,
  ]);

  const replaceOne = useCallback(async () => {
    if (!query.trim() || !canReplace) return;
    if (target === "document" && isEditorReady(editor)) {
      editor.commands.setReplaceTerm(replaceText);
      editor.commands.replace();
      goToDocumentSelection();
      return;
    }
    if (target === "mermaid" && mermaidBridge) {
      mermaidBridge.replaceCurrent(
        mermaidIndex,
        query,
        replaceText,
        caseSensitive.isCaseSensitive,
      );
      setBridgeTick((n) => n + 1);
      return;
    }
    if (target === "base" && pageId && base) {
      setReplacing(true);
      try {
        const count = await replaceInBaseCells({
          pageId,
          properties: base.properties ?? [],
          needle: query,
          replacement: replaceText,
          caseSensitive: caseSensitive.isCaseSensitive,
          replaceAll: false,
          updateRow: (input) => updateRowMutation.mutateAsync(input),
        });
        notifications.show({
          message:
            count > 0
              ? t("Replaced {{count}} cell(s)", { count })
              : t("Not found"),
        });
      } finally {
        setReplacing(false);
      }
    }
  }, [
    query,
    canReplace,
    target,
    editor,
    replaceText,
    goToDocumentSelection,
    mermaidBridge,
    mermaidIndex,
    caseSensitive.isCaseSensitive,
    pageId,
    base,
    updateRowMutation,
    t,
  ]);

  const replaceAll = useCallback(async () => {
    if (!query.trim() || !canReplace) return;
    if (target === "document" && isEditorReady(editor)) {
      editor.commands.setReplaceTerm(replaceText);
      editor.commands.replaceAll();
      return;
    }
    if (target === "mermaid" && mermaidBridge) {
      mermaidBridge.replaceAll(
        query,
        replaceText,
        caseSensitive.isCaseSensitive,
      );
      setBridgeTick((n) => n + 1);
      return;
    }
    if (target === "base" && pageId && base) {
      setReplacing(true);
      try {
        const count = await replaceInBaseCells({
          pageId,
          properties: base.properties ?? [],
          needle: query,
          replacement: replaceText,
          caseSensitive: caseSensitive.isCaseSensitive,
          replaceAll: true,
          updateRow: (input) => updateRowMutation.mutateAsync(input),
        });
        notifications.show({
          message:
            count > 0
              ? t("Replaced {{count}} cell(s)", { count })
              : t("Not found"),
        });
      } finally {
        setReplacing(false);
      }
    }
  }, [
    query,
    canReplace,
    target,
    editor,
    replaceText,
    mermaidBridge,
    caseSensitive.isCaseSensitive,
    pageId,
    base,
    updateRowMutation,
    t,
  ]);

  if (!active) return null;

  if (target === "none") {
    return (
      <Text size="sm" c="dimmed" px="md" py="sm">
        {t("In-page search is not supported on this page type.")}
      </Text>
    );
  }

  const showNav = target === "document" || target === "mermaid";

  return (
    <Stack gap="xs" px="md" pb="sm">
      <Flex align="center" gap="xs" wrap="wrap">
        <Text size="sm" c="dimmed" style={{ minWidth: 56 }}>
          {resultsLabel}
        </Text>
        {showNav && (
          <ActionIcon.Group>
            <Tooltip label={t("Previous match (Shift+Enter)")}>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={previous}
                aria-label={t("Previous match (Shift+Enter)")}
              >
                <IconArrowNarrowUp size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Next match (Enter)")}>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={next}
                aria-label={t("Next match (Enter)")}
              >
                <IconArrowNarrowDown size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </ActionIcon.Group>
        )}
        {(target === "document" || target === "mermaid") && (
          <Tooltip label={t("Match case (Alt+C)")}>
            <ActionIcon
              variant="subtle"
              color={caseSensitive.color}
              onClick={() => caseSensitiveToggle()}
              aria-label={t("Match case (Alt+C)")}
              aria-pressed={caseSensitive.isCaseSensitive}
            >
              <IconLetterCase size={16} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        )}
      </Flex>

      {canReplace && (
        <Flex align="center" gap="xs" wrap="wrap">
          <Input
            size="xs"
            placeholder={t("Replace")}
            aria-label={t("Replace")}
            leftSection={<IconReplace size={14} />}
            value={replaceText}
            onChange={(e) => setReplaceText(e.currentTarget.value)}
            w={220}
            onKeyDown={getHotkeyHandler([
              ["Enter", () => void replaceOne()],
              ["ctrl+alt+Enter", () => void replaceAll()],
            ])}
          />
          <Button
            size="xs"
            variant="light"
            loading={replacing}
            onClick={() => void replaceOne()}
          >
            {t("Replace")}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            loading={replacing}
            onClick={() => void replaceAll()}
          >
            {t("Replace all")}
          </Button>
        </Flex>
      )}

      {target === "base" && (
        <Text size="xs" c="dimmed">
          {t("Replaces matching text in searchable cells of loaded rows.")}
        </Text>
      )}
    </Stack>
  );
}
