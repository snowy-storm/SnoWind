import {
  ActionIcon,
  Button,
  Dialog,
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
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { isEditorReady } from "@snowind/editor-ext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useHotkeys, useToggle } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useLocation, useParams } from "react-router-dom";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query";
import { resolvePageFindTarget } from "@/features/page-find/utils/resolve-page-find-target";
import { findTextMatches } from "@/features/page-find/utils/text-matches";
import {
  getMermaidFindBridge,
  subscribeMermaidFindBridge,
} from "@/features/page-find/mermaid-find-bridge";
import {
  baseQuickSearchAtom,
  pageFindStateAtom,
  searchControlAnchorAtom,
} from "@/features/page-find/atoms/page-find-atom";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms";
import { replaceInBaseCells } from "@/features/page-find/utils/replace-in-base-cells";
import { useBaseQuery } from "@/ee/base/queries/base-query";
import { useUpdateRowMutation } from "@/ee/base/queries/base-row-query";
import {
  closePageFind,
  openGlobalSearch,
  openPageFind,
} from "@/features/search/open-search-spotlight";
import classes from "@/features/editor/components/search-and-replace/search-replace.module.css";

export function PageFindDialog() {
  const { t } = useTranslation();
  const location = useLocation();
  const { pageSlug, pageId: routePageId } = useParams();
  const pageId =
    routePageId || (pageSlug ? extractPageSlugId(pageSlug) : undefined);
  const { data: page } = usePageQuery({ pageId });
  const target = resolvePageFindTarget(page);
  const editable = !page?.deletedAt && (page?.permissions?.canEdit ?? false);
  const editor = useAtomValue(pageEditorAtom);
  const [pageFindState, setPageFindState] = useAtom(pageFindStateAtom);
  const searchAnchor = useAtomValue(searchControlAnchorAtom);
  const setBaseQuickSearch = useSetAtom(baseQuickSearchAtom);
  const { data: base } = useBaseQuery(target === "base" ? pageId : undefined);
  const updateRowMutation = useUpdateRowMutation();

  const isOpen = pageFindState.isOpen;
  const dialogTop = (searchAnchor?.bottom ?? 45) + 8;
  const dialogLeft = searchAnchor?.left;
  const dialogWidth = searchAnchor?.width;
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [mermaidIndex, setMermaidIndex] = useState(0);
  const [bridgeTick, setBridgeTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [caseSensitive, caseSensitiveToggle] = useToggle([
    { isCaseSensitive: false, color: "gray" },
    { isCaseSensitive: true, color: "blue" },
  ]);
  const [replacing, setReplacing] = useState(false);

  useEffect(
    () => subscribeMermaidFindBridge(() => setBridgeTick((n) => n + 1)),
    [],
  );
  void bridgeTick;

  const mermaidBridge = getMermaidFindBridge();
  const canReplace =
    editable &&
    (target === "document" || target === "mermaid" || target === "base");
  const showNav = target === "document" || target === "mermaid";

  const mermaidMatches = useMemo(() => {
    if (!isOpen || target !== "mermaid" || !mermaidBridge) return [];
    return findTextMatches(
      mermaidBridge.getSource(),
      searchText,
      caseSensitive.isCaseSensitive,
    );
  }, [
    isOpen,
    target,
    mermaidBridge,
    searchText,
    caseSensitive.isCaseSensitive,
    bridgeTick,
  ]);

  const resultsCount = useMemo(() => {
    if (!searchText.trim()) return "";
    if (target === "none") {
      return t("In-page search is not supported on this page type.");
    }
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
    if (target === "base") return t("Filtering");
    return "";
  }, [
    searchText,
    target,
    editor,
    t,
    mermaidMatches.length,
    mermaidIndex,
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

  const closeDialog = useCallback(() => {
    setSearchText("");
    setReplaceText("");
    clearEffects();
    closePageFind();
  }, [clearEffects]);

  const tryOpenPageFind = useCallback(() => {
    if (target === "none") {
      notifications.show({
        message: t("In-page search is not supported on this page type."),
        color: "gray",
      });
      return;
    }
    openPageFind();
  }, [t, target]);

  useHotkeys([
    ["mod+K", () => openGlobalSearch()],
    ["mod+F", () => tryOpenPageFind()],
  ]);

  useEffect(() => {
    const onOpen = () => tryOpenPageFind();
    const onClose = () => closeDialog();
    document.addEventListener("openFindDialogFromEditor", onOpen);
    document.addEventListener("closeFindDialogFromEditor", onClose);
    return () => {
      document.removeEventListener("openFindDialogFromEditor", onOpen);
      document.removeEventListener("closeFindDialogFromEditor", onClose);
    };
  }, [tryOpenPageFind, closeDialog]);

  useEffect(() => {
    if (!isOpen) return;
    if (target === "document" && isEditorReady(editor)) {
      const selected = editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
      );
      if (selected) setSearchText(selected);
    }
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) {
      clearEffects();
      return;
    }
    if (target === "none") {
      clearEffects();
      return;
    }
    if (target === "document" && isEditorReady(editor)) {
      editor.commands.setSearchTerm(searchText);
      editor.commands.setCaseSensitive(caseSensitive.isCaseSensitive);
      editor.commands.resetIndex();
      editor.commands.selectCurrentItem();
    } else if (target === "base") {
      setBaseQuickSearch(searchText);
    } else if (target === "mermaid" && mermaidBridge) {
      const matches = findTextMatches(
        mermaidBridge.getSource(),
        searchText,
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
    isOpen,
    target,
    searchText,
    caseSensitive.isCaseSensitive,
    editor,
    mermaidBridge,
    setBaseQuickSearch,
    clearEffects,
  ]);

  useEffect(() => {
    closeDialog();
  }, [location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      clearEffects();
      setPageFindState({ isOpen: false, scope: "page" });
    };
  }, [pageId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!searchText.trim() || !canReplace) return;
    if (target === "document" && isEditorReady(editor)) {
      editor.commands.setReplaceTerm(replaceText);
      editor.commands.replace();
      goToDocumentSelection();
      return;
    }
    if (target === "mermaid" && mermaidBridge) {
      mermaidBridge.replaceCurrent(
        mermaidIndex,
        searchText,
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
          needle: searchText,
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
    searchText,
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
    if (!searchText.trim() || !canReplace) return;
    if (target === "document" && isEditorReady(editor)) {
      editor.commands.setReplaceTerm(replaceText);
      editor.commands.replaceAll();
      return;
    }
    if (target === "mermaid" && mermaidBridge) {
      mermaidBridge.replaceAll(
        searchText,
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
          needle: searchText,
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
    searchText,
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

  return (
    <Dialog
      className={classes.findDialog}
      opened={isOpen}
      size="lg"
      radius="md"
      w={dialogWidth ?? "auto"}
      position={
        dialogLeft != null
          ? { top: dialogTop, left: dialogLeft }
          : { top: dialogTop }
      }
      withBorder
      transitionProps={{ transition: "fade", duration: 120 }}
      aria-label={t("Find and replace")}
    >
      <Stack gap="xs">
        <Text size="xs" c="dimmed" fw={600}>
          {t("This page")}
        </Text>
        <Flex align="center" gap="xs">
          <Input
            ref={inputRef}
            placeholder={t("Search this page...")}
            aria-label={t("Search this page...")}
            leftSection={<IconSearch size={16} />}
            rightSection={
              <Text size="xs" ta="right">
                {resultsCount}
              </Text>
            }
            rightSectionWidth={70}
            rightSectionPointerEvents="all"
            size="xs"
            style={{ flex: 1, minWidth: 0 }}
            value={searchText}
            onChange={(e) => setSearchText(e.currentTarget.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeDialog();
                return;
              }
              if (event.key === "Enter" && showNav) {
                event.preventDefault();
                if (event.shiftKey) previous();
                else next();
              }
              if (event.altKey && event.key.toLowerCase() === "c") {
                event.preventDefault();
                caseSensitiveToggle();
              }
            }}
          />
          <ActionIcon.Group>
            {showNav && (
              <>
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
              </>
            )}
            {(target === "document" || target === "mermaid") && (
              <Tooltip label={t("Match case (Alt+C)")}>
                <ActionIcon
                  variant="subtle"
                  color={caseSensitive.color}
                  onClick={() => caseSensitiveToggle()}
                  aria-pressed={caseSensitive.isCaseSensitive}
                >
                  <IconLetterCase size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={t("Close (Escape)")}>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={closeDialog}
                aria-label={t("Close (Escape)")}
              >
                <IconX size={16} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </ActionIcon.Group>
        </Flex>

        {canReplace && (
          <Flex align="center" gap="xs">
            <Input
              size="xs"
              placeholder={t("Replace")}
              aria-label={t("Replace")}
              leftSection={<IconReplace size={14} />}
              value={replaceText}
              onChange={(e) => setReplaceText(e.currentTarget.value)}
              style={{ flex: 1, minWidth: 0 }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (event.ctrlKey && event.altKey) void replaceAll();
                  else void replaceOne();
                }
              }}
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

        {target === "none" && (
          <Text size="xs" c="dimmed">
            {t("In-page search is not supported on this page type.")}
          </Text>
        )}
        {target === "base" && (
          <Text size="xs" c="dimmed">
            {t("Replaces matching text in searchable cells of loaded rows.")}
          </Text>
        )}
      </Stack>
    </Dialog>
  );
}
