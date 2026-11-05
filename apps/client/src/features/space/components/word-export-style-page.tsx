import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Code,
  ColorInput,
  Container,
  Group,
  Modal,
  NavLink,
  NumberInput,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconFileWord, IconRotate } from "@tabler/icons-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CHINESE_FONT_SIZES,
  WORD_EXPORT_FONT_SUGGESTIONS,
  formatCharacterCount,
  formatFontSizePt,
  formatSpacingMeasure,
  parseCharacterCount,
  parseSpacingMeasure,
  parseWordExportStyle,
  presetBriefStyle,
  presetOfficialStyle,
  presetTechnicalStyle,
  standardWordExportStyle,
  type WordExportStyle,
} from "@snowind/editor-ext";
import type { ISpace } from "@/features/space/types/space.types";
import { useUpdateWordExportStyleMutation } from "@/features/space/queries/space-query";

type GroupId = "page" | "title" | "body" | "list" | "image" | "table";

const ALIGN = [
  { value: "left", labelKey: "Left" },
  { value: "center", labelKey: "Center" },
  { value: "right", labelKey: "Right" },
  { value: "justify", labelKey: "Justify" },
];

function readPath(style: WordExportStyle, path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, key) => {
    if (cursor && typeof cursor === "object") return (cursor as Record<string, unknown>)[key];
    return undefined;
  }, style);
}

function writeStyle(style: WordExportStyle, path: string, value: unknown): WordExportStyle {
  const next = structuredClone(style);
  const parts = path.split(".");
  let cursor: Record<string, unknown> = next as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cursor = cursor[parts[i]] as Record<string, unknown>;
  }
  const key = parts[parts.length - 1];
  cursor[key] = value;
  if (key === "lineSpacingType") {
    if (value === "single") cursor.lineSpacingVal = 1;
    else if (value === "multiple") cursor.lineSpacingVal = 1.5;
    else cursor.lineSpacingVal = "22pt";
  }
  if (path === "page.size" && value === "A4") {
    next.page.pageWidth = "21cm";
    next.page.pageHeight = "29.7cm";
  }
  if (path === "page.size" && value === "A3") {
    next.page.pageWidth = "29.7cm";
    next.page.pageHeight = "42cm";
  }
  if (path === "tableStyle.borderMode" && value === "threeLine") {
    next.tableStyle.borderSideEnable = false;
  }
  return next;
}

function replaceGroup(style: WordExportStyle, group: GroupId): WordExportStyle {
  const defaults = standardWordExportStyle();
  const next = structuredClone(style);
  if (group === "page") next.page = defaults.page;
  if (group === "title") next.titleStyle = defaults.titleStyle;
  if (group === "body") next.bodyStyle = defaults.bodyStyle;
  if (group === "list") next.listStyle = defaults.listStyle;
  if (group === "image") next.imageStyle = defaults.imageStyle;
  if (group === "table") next.tableStyle = defaults.tableStyle;
  return next;
}

function Preview({ style }: { style: WordExportStyle }) {
  const { t } = useTranslation();
  const title = style.titleStyle[0];
  const width = style.page.pageOrient === "landscape" ? 297 : 210;
  const height = style.page.pageOrient === "landscape" ? 210 : 297;
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>{t("Preview")}</Text>
      <div
        style={{
          width: 220,
          aspectRatio: `${width} / ${height}`,
          background: "white",
          color: "#111",
          border: "1px solid var(--mantine-color-gray-4)",
          boxShadow: "0 1px 4px rgba(0,0,0,.08)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "8% 10%" }}>
          <div
            style={{
              fontFamily: title.fontFamily,
              fontWeight: title.fontBold ? 700 : 400,
              color: title.fontColor,
              textAlign: title.align === "justify" ? "left" : title.align,
              fontSize: 16,
              marginBottom: 8,
            }}
          >
            {title.numberEnable ? "1 " : ""}
            {t("Heading sample")}
          </div>
          <div
            style={{
              fontFamily: style.bodyStyle.fontFamily,
              color: style.bodyStyle.fontColor,
              fontWeight: style.bodyStyle.fontBold ? 700 : 400,
              textAlign: style.bodyStyle.align,
              textIndent: "2em",
              fontSize: 12,
              lineHeight: style.bodyStyle.lineSpacingType === "multiple" ? Number(style.bodyStyle.lineSpacingVal) || 1.5 : 1.6,
            }}
          >
            {t("Body sample")}
          </div>
          <div
            style={{
              marginTop: 10,
              borderTop: `2px solid ${style.tableStyle.headerBgColor}`,
              background: style.tableStyle.headerBgColor,
              textAlign: "center",
              fontSize: 11,
              fontFamily: style.tableStyle.cellFontFamily,
            }}
          >
            {t("Table sample")}
          </div>
        </div>
      </div>
      <Text size="xs" c="dimmed">{t("Preview is a sketch, not a real Word layout.")}</Text>
    </Stack>
  );
}

export function WordExportStylePage({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const saved = space.settings?.wordExport;
  const savedParsed = saved ? parseWordExportStyle(saved) : null;
  const [style, setStyle] = useState<WordExportStyle>(() =>
    savedParsed?.ok ? savedParsed.value : standardWordExportStyle(),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(style));
  const [hadSaved, setHadSaved] = useState(() => Boolean(savedParsed?.ok));
  const [group, setGroup] = useState<GroupId>("page");
  const [titleLevel, setTitleLevel] = useState("1");
  const [jsonOpen, { open: openJson, close: closeJson }] = useDisclosure(false);
  const save = useUpdateWordExportStyleMutation();

  const parsed = useMemo(() => parseWordExportStyle(style), [style]);
  const errors = useMemo(() => {
    const map = new Map<string, string>();
    if (parsed.ok === false) {
      parsed.errors.forEach((issue) => map.set(issue.path, issue.message));
    }
    return map;
  }, [parsed]);
  const dirty = JSON.stringify(style) !== baseline;

  const groups: { id: GroupId; label: string }[] = [
    { id: "page", label: t("Page setup") },
    { id: "title", label: t("Heading styles") },
    { id: "body", label: t("Body") },
    { id: "list", label: t("Lists") },
    { id: "image", label: t("Images") },
    { id: "table", label: t("Tables") },
  ];

  const setValue = (path: string, value: unknown) => {
    setStyle((current) => writeStyle(current, path, value));
  };

  const fieldError = (path: string) => errors.get(path);

  const applyPreset = (value: string | null) => {
    if (value === "official") setStyle(presetOfficialStyle());
    else if (value === "technical") setStyle(presetTechnicalStyle());
    else if (value === "brief") setStyle(presetBriefStyle());
  };

  return (
    <Container size={1100} py="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Group gap="xs">
            <IconFileWord size={22} />
            <Title order={3}>{t("Word export style")}</Title>
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            {t("Set how pages in this space are exported to Word.")}
          </Text>
        </div>
        <Group gap="xs">
          <Select
            aria-label={t("Load preset")}
            placeholder={t("Load preset")}
            data={[
              { value: "official", label: t("Official document") },
              { value: "technical", label: t("Technical proposal") },
              { value: "brief", label: t("Brief report") },
            ]}
            value={null}
            onChange={applyPreset}
            w={160}
          />
          <Button variant="default" onClick={() => setStyle(standardWordExportStyle())}>
            {t("Reset to standard defaults")}
          </Button>
          <Button variant="default" onClick={openJson}>{t("Preview JSON")}</Button>
          <Button
            loading={save.isPending}
            disabled={!parsed.ok}
            onClick={() => {
              if (parsed.ok === false) return;
              save.mutate(
                { spaceId: space.id, slug: space.slug, style: parsed.value },
                {
                  onSuccess: () => {
                    const next = JSON.stringify(parsed.value);
                    setStyle(parsed.value);
                    setBaseline(next);
                    setHadSaved(true);
                  },
                },
              );
            }}
          >
            {t("Save to this space")}
          </Button>
        </Group>
      </Group>

      {!hadSaved && (
        <Alert mt="md" color="yellow">
          {saved && !savedParsed?.ok
            ? t("Saved style could not be read. Export still uses the built-in style.")
            : t("Not saved yet. Export still uses the built-in style.")}
        </Alert>
      )}
      {hadSaved && dirty && (
        <Alert mt="md" color="blue">
          {t("Unsaved changes. Export still uses the last saved style.")}
        </Alert>
      )}

      <Group align="flex-start" wrap="nowrap" mt="md" gap="md">
        <Paper withBorder p="xs" w={180}>
          {groups.map((item) => (
            <NavLink
              key={item.id}
              active={group === item.id}
              label={item.label}
              onClick={() => setGroup(item.id)}
            />
          ))}
        </Paper>

        <Paper withBorder p="md" style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" mb="sm">
            <Text fw={600}>{groups.find((item) => item.id === group)?.label}</Text>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => setStyle((current) => replaceGroup(current, group))}
            >
              {t("Restore this group")}
            </Button>
          </Group>

          {group === "page" && (
            <Stack>
              <Field label={t("Paper size")} path="page.size" error={fieldError("page.size")} onRestore={() => setValue("page.size", "A4")}>
                <Select
                  data={[
                    { value: "A4", label: "A4" },
                    { value: "A3", label: "A3" },
                    { value: "custom", label: t("Custom") },
                  ]}
                  value={style.page.size}
                  onChange={(value) => value && setValue("page.size", value)}
                />
              </Field>
              <Field label={t("Page width")} path="page.pageWidth" error={fieldError("page.pageWidth")} onRestore={() => setValue("page.pageWidth", "21cm")}>
                <TextInput disabled={style.page.size !== "custom"} value={style.page.pageWidth} onChange={(e) => setValue("page.pageWidth", e.currentTarget.value)} />
              </Field>
              <Field label={t("Page height")} path="page.pageHeight" error={fieldError("page.pageHeight")} onRestore={() => setValue("page.pageHeight", "29.7cm")}>
                <TextInput disabled={style.page.size !== "custom"} value={style.page.pageHeight} onChange={(e) => setValue("page.pageHeight", e.currentTarget.value)} />
              </Field>
              <MeasureField label={t("Top margin")} path="page.marginTop" value={style.page.marginTop} error={fieldError("page.marginTop")} onChange={setValue} />
              <MeasureField label={t("Bottom margin")} path="page.marginBottom" value={style.page.marginBottom} error={fieldError("page.marginBottom")} onChange={setValue} />
              <MeasureField label={t("Left margin")} path="page.marginLeft" value={style.page.marginLeft} error={fieldError("page.marginLeft")} onChange={setValue} />
              <MeasureField label={t("Right margin")} path="page.marginRight" value={style.page.marginRight} error={fieldError("page.marginRight")} onChange={setValue} />
              <Field label={t("Orientation")} path="page.pageOrient" error={fieldError("page.pageOrient")} onRestore={() => setValue("page.pageOrient", "portrait")}>
                <Select
                  data={[
                    { value: "portrait", label: t("Portrait") },
                    { value: "landscape", label: t("Landscape") },
                  ]}
                  value={style.page.pageOrient}
                  onChange={(value) => value && setValue("page.pageOrient", value)}
                />
              </Field>
              <Field label={t("Show page numbers")} path="page.showPageNum" onRestore={() => setValue("page.showPageNum", true)}>
                <Checkbox checked={style.page.showPageNum} onChange={(e) => setValue("page.showPageNum", e.currentTarget.checked)} label={t("Show page numbers")} />
              </Field>
              <Field label={t("Page number position")} path="page.pageNumPos" onRestore={() => setValue("page.pageNumPos", "bottom-center")}>
                <Select
                  disabled={!style.page.showPageNum}
                  data={[
                    { value: "bottom-center", label: t("Bottom center") },
                    { value: "bottom-right", label: t("Bottom right") },
                  ]}
                  value={style.page.pageNumPos}
                  onChange={(value) => value && setValue("page.pageNumPos", value)}
                />
              </Field>
              <Field label={t("Page number start")} path="page.pageNumStart" error={fieldError("page.pageNumStart")} onRestore={() => setValue("page.pageNumStart", 1)}>
                <NumberInput
                  disabled={!style.page.showPageNum}
                  min={1}
                  allowDecimal={false}
                  value={style.page.pageNumStart}
                  onChange={(value) => setValue("page.pageNumStart", typeof value === "number" ? value : 1)}
                />
              </Field>
              <AlignField label={t("Default alignment")} path="page.defaultAlign" value={style.page.defaultAlign} allowJustify onChange={setValue} />
            </Stack>
          )}

          {group === "title" && (
            <Stack>
              <Text size="xs" c="dimmed">{t("Heading levels 5 to 9 use heading 4 when exported.")}</Text>
              <Tabs value={titleLevel} onChange={(value) => setTitleLevel(value || "1")}>
                <Tabs.List>
                  {[1, 2, 3, 4].map((level) => (
                    <Tabs.Tab key={level} value={String(level)}>{t("Heading {{level}}", { level })}</Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
              <TitleFields
                index={Number(titleLevel) - 1}
                style={style}
                error={fieldError}
                onChange={setValue}
              />
            </Stack>
          )}

          {group === "body" && (
            <Stack>
              <FontField path="bodyStyle.fontFamily" value={style.bodyStyle.fontFamily} error={fieldError("bodyStyle.fontFamily")} onChange={setValue} />
              <FontSizeField path="bodyStyle.fontSize" value={style.bodyStyle.fontSize} error={fieldError("bodyStyle.fontSize")} onChange={setValue} />
              <BoolField label={t("Bold")} path="bodyStyle.fontBold" checked={style.bodyStyle.fontBold} onChange={setValue} />
              <ColorField path="bodyStyle.fontColor" value={style.bodyStyle.fontColor} error={fieldError("bodyStyle.fontColor")} onChange={setValue} />
              <AlignField label={t("Alignment")} path="bodyStyle.align" value={style.bodyStyle.align} allowJustify onChange={setValue} />
              <LineSpacingFields
                typePath="bodyStyle.lineSpacingType"
                valuePath="bodyStyle.lineSpacingVal"
                type={style.bodyStyle.lineSpacingType}
                value={style.bodyStyle.lineSpacingVal}
                allowSingle
                error={fieldError("bodyStyle.lineSpacingVal")}
                onChange={setValue}
              />
              <CharacterIndentField label={t("First line indent")} path="bodyStyle.indentFirst" value={style.bodyStyle.indentFirst} error={fieldError("bodyStyle.indentFirst")} onChange={setValue} />
              <SpacingMeasureField label={t("Space before")} path="bodyStyle.spaceBefore" value={style.bodyStyle.spaceBefore} error={fieldError("bodyStyle.spaceBefore")} onChange={setValue} />
              <SpacingMeasureField label={t("Space after")} path="bodyStyle.spaceAfter" value={style.bodyStyle.spaceAfter} error={fieldError("bodyStyle.spaceAfter")} onChange={setValue} />
            </Stack>
          )}

          {group === "list" && (
            <Stack>
              <BoolField label={t("Follow body font")} path="listStyle.followBodyFont" checked={style.listStyle.followBodyFont} onChange={setValue} />
              <FontField path="listStyle.fontFamily" value={style.listStyle.followBodyFont ? style.bodyStyle.fontFamily : style.listStyle.fontFamily} error={fieldError("listStyle.fontFamily")} disabled={style.listStyle.followBodyFont} onChange={setValue} />
              <BoolField label={t("Follow body size")} path="listStyle.followBodySize" checked={style.listStyle.followBodySize} onChange={setValue} />
              <FontSizeField path="listStyle.fontSize" value={style.listStyle.followBodySize ? style.bodyStyle.fontSize : style.listStyle.fontSize} error={fieldError("listStyle.fontSize")} disabled={style.listStyle.followBodySize} onChange={setValue} />
              <CharacterIndentField label={t("Hanging indent")} path="listStyle.indentHang" value={style.listStyle.indentHang} error={fieldError("listStyle.indentHang")} onChange={setValue} />
              <CharacterIndentField label={t("First line indent")} path="listStyle.indentFirst" value={style.listStyle.indentFirst} error={fieldError("listStyle.indentFirst")} onChange={setValue} />
              <BoolField label={t("Sync line spacing with body")} path="listStyle.lineSpacingSync" checked={style.listStyle.lineSpacingSync} onChange={setValue} />
              {!style.listStyle.lineSpacingSync && (
                <Text size="xs" c="dimmed">{t("Lists have no separate line spacing yet, so they still follow the body.")}</Text>
              )}
              <Text size="xs" c="dimmed">{t("Ordered numbers follow the page: 1. 2. 3.")}</Text>
              <Field label={t("Bullet")} path="listStyle.unorderedSymbol" error={fieldError("listStyle.unorderedSymbol")} onRestore={() => setValue("listStyle.unorderedSymbol", "●")}>
                <TextInput value={style.listStyle.unorderedSymbol} onChange={(e) => setValue("listStyle.unorderedSymbol", e.currentTarget.value)} />
              </Field>
            </Stack>
          )}

          {group === "image" && (
            <Stack>
              <MeasureField label={t("Maximum image width")} path="imageStyle.maxWidth" value={style.imageStyle.maxWidth} error={fieldError("imageStyle.maxWidth")} onChange={setValue} />
              <BoolField label={t("Keep aspect ratio")} path="imageStyle.lockRatio" checked={style.imageStyle.lockRatio} onChange={setValue} />
              <Text size="xs" c="dimmed">
                {t("Images stay in proportion. Diagrams are still rasterized at high resolution; this only changes how wide they appear on the page.")}
                {!style.imageStyle.lockRatio && ` ${t("Closing this still keeps the original aspect ratio so pictures are not stretched.")}`}
              </Text>
            </Stack>
          )}

          {group === "table" && (
            <Stack>
              <Field label={t("Table width")} path="tableStyle.widthMode" onRestore={() => setValue("tableStyle.widthMode", "fitPage")}>
                <Select
                  data={[
                    { value: "fitPage", label: t("Fit page") },
                    { value: "auto", label: t("Fit content") },
                  ]}
                  value={style.tableStyle.widthMode}
                  onChange={(value) => value && setValue("tableStyle.widthMode", value)}
                />
              </Field>
              {style.tableStyle.widthMode === "auto" && (
                <Text size="xs" c="dimmed">{t("Auto width is not available yet. Tables still fit the page.")}</Text>
              )}
              <Field label={t("Borders")} path="tableStyle.borderMode" onRestore={() => setValue("tableStyle.borderMode", "threeLine")}>
                <Select
                  data={[
                    { value: "threeLine", label: t("Three line") },
                    { value: "fullLine", label: t("Full grid") },
                  ]}
                  value={style.tableStyle.borderMode}
                  onChange={(value) => value && setValue("tableStyle.borderMode", value)}
                />
              </Field>
              <MeasureField label={t("Top border")} path="tableStyle.borderTopWeight" value={style.tableStyle.borderTopWeight} error={fieldError("tableStyle.borderTopWeight")} onChange={setValue} />
              <MeasureField label={t("Header border")} path="tableStyle.borderHeaderWeight" value={style.tableStyle.borderHeaderWeight} error={fieldError("tableStyle.borderHeaderWeight")} onChange={setValue} />
              <MeasureField label={t("Bottom border")} path="tableStyle.borderBottomWeight" value={style.tableStyle.borderBottomWeight} error={fieldError("tableStyle.borderBottomWeight")} onChange={setValue} />
              <Field label={t("Vertical borders")} path="tableStyle.borderSideEnable" onRestore={() => setValue("tableStyle.borderSideEnable", false)}>
                <Checkbox
                  disabled={style.tableStyle.borderMode === "threeLine"}
                  checked={style.tableStyle.borderSideEnable}
                  onChange={(e) => setValue("tableStyle.borderSideEnable", e.currentTarget.checked)}
                  label={t("Vertical borders")}
                />
              </Field>
              <ColorField path="tableStyle.headerBgColor" label={t("Header background")} value={style.tableStyle.headerBgColor} error={fieldError("tableStyle.headerBgColor")} onChange={setValue} />
              <FontField path="tableStyle.cellFontFamily" label={t("Cell font")} value={style.tableStyle.cellFontFamily} error={fieldError("tableStyle.cellFontFamily")} onChange={setValue} />
              <FontSizeField path="tableStyle.cellFontSize" label={t("Cell font size")} value={style.tableStyle.cellFontSize} error={fieldError("tableStyle.cellFontSize")} onChange={setValue} />
              <AlignField label={t("Header alignment")} path="tableStyle.headerAlign" value={style.tableStyle.headerAlign} onChange={setValue} />
              <AlignField label={t("Cell alignment")} path="tableStyle.cellTextAlign" value={style.tableStyle.cellTextAlign} onChange={setValue} />
              <Field label={t("Cell line spacing")} path="tableStyle.cellLineSpacing" error={fieldError("tableStyle.cellLineSpacing")} onRestore={() => setValue("tableStyle.cellLineSpacing", 1)}>
                <NumberInput
                  min={0.5}
                  max={3}
                  decimalScale={2}
                  value={style.tableStyle.cellLineSpacing}
                  onChange={(value) => setValue("tableStyle.cellLineSpacing", typeof value === "number" ? value : 1)}
                />
              </Field>
              <BoolField label={t("Repeat header row")} path="tableStyle.repeatHeader" checked={style.tableStyle.repeatHeader} onChange={setValue} />
            </Stack>
          )}
        </Paper>

        <Paper withBorder p="md" w={260}>
          <Preview style={style} />
        </Paper>
      </Group>

      <Modal opened={jsonOpen} onClose={closeJson} title={t("Preview JSON")} size="lg">
        <Code block>{JSON.stringify(parsed.ok ? parsed.value : style, null, 2)}</Code>
      </Modal>
    </Container>
  );
}

function Field({
  label,
  path,
  error,
  onRestore,
  children,
}: {
  label: string;
  path: string;
  error?: string;
  onRestore: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Group align="flex-start" wrap="nowrap" gap="xs">
      <Stack gap={4} style={{ flex: 1 }}>
        <Text size="sm" fw={500}>{label}</Text>
        {children}
        {error && <Text size="xs" c="red">{error}</Text>}
      </Stack>
      <ActionIcon mt={24} variant="subtle" aria-label={t("Restore this field")} data-path={path} onClick={onRestore}>
        <IconRotate size={16} />
      </ActionIcon>
    </Group>
  );
}

function MeasureField({
  label,
  path,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  path: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (path: string, value: unknown) => void;
}) {
  const defaults = standardWordExportStyle();
  return (
    <Field label={label} path={path} error={error} onRestore={() => onChange(path, readPath(defaults, path))}>
      <TextInput disabled={disabled} value={value} onChange={(event) => onChange(path, event.currentTarget.value)} />
    </Field>
  );
}

function FontField({
  path,
  value,
  error,
  disabled,
  label,
  onChange,
}: {
  path: string;
  value: string;
  error?: string;
  disabled?: boolean;
  label?: string;
  onChange: (path: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const defaults = standardWordExportStyle();
  const fonts = value && !WORD_EXPORT_FONT_SUGGESTIONS.includes(value)
    ? [...WORD_EXPORT_FONT_SUGGESTIONS, value]
    : [...WORD_EXPORT_FONT_SUGGESTIONS];
  return (
    <Field label={label || t("Font")} path={path} error={error} onRestore={() => onChange(path, readPath(defaults, path))}>
      <Select
        disabled={disabled}
        data={fonts}
        value={value}
        onChange={(next) => next && onChange(path, next)}
        allowDeselect={false}
      />
    </Field>
  );
}

function FontSizeField({
  path,
  value,
  error,
  disabled,
  label,
  onChange,
}: {
  path: string;
  value: string;
  error?: string;
  disabled?: boolean;
  label?: string;
  onChange: (path: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const defaults = standardWordExportStyle();
  const matched = CHINESE_FONT_SIZES.some((item) => formatFontSizePt(item.pt) === value);
  const [custom, setCustom] = useState(!matched);
  useEffect(() => {
    setCustom(!CHINESE_FONT_SIZES.some((item) => formatFontSizePt(item.pt) === value));
  }, [value]);
  const showCustom = custom || !matched;
  return (
    <Field label={label || t("Font size")} path={path} error={error} onRestore={() => onChange(path, readPath(defaults, path))}>
      <Select
        disabled={disabled}
        allowDeselect={false}
        data={[
          ...CHINESE_FONT_SIZES.map((item) => ({
            value: formatFontSizePt(item.pt),
            label: `${item.name}（${formatFontSizePt(item.pt)}）`,
          })),
          { value: "custom", label: t("Custom font size") },
        ]}
        value={showCustom ? "custom" : value}
        onChange={(next) => {
          if (!next || disabled) return;
          if (next === "custom") {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(path, next);
        }}
      />
      {showCustom && (
        <TextInput
          disabled={disabled}
          mt={6}
          value={value}
          placeholder="12pt"
          onChange={(event) => onChange(path, event.currentTarget.value)}
        />
      )}
    </Field>
  );
}

function CharacterIndentField({
  label,
  path,
  value,
  error,
  onChange,
}: {
  label: string;
  path: string;
  value: string;
  error?: string;
  onChange: (path: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const defaults = standardWordExportStyle();
  const amount = parseCharacterCount(value);
  return (
    <Field label={label} path={path} error={error} onRestore={() => onChange(path, readPath(defaults, path))}>
      {amount === null ? (
        <TextInput
          value={value}
          onChange={(event) => {
            const next = event.currentTarget.value.trim();
            const parsed = parseCharacterCount(next);
            if (parsed !== null) {
              onChange(path, formatCharacterCount(parsed));
              return;
            }
            const digits = /^(\d+(?:\.\d{1,2})?)$/.exec(next);
            onChange(path, digits ? formatCharacterCount(Number(digits[1])) : event.currentTarget.value);
          }}
        />
      ) : (
        <NumberInput
          min={0}
          max={100}
          decimalScale={2}
          suffix={t("Character unit")}
          value={amount}
          onChange={(next) => onChange(path, formatCharacterCount(typeof next === "number" ? next : 0))}
        />
      )}
    </Field>
  );
}

function SpacingMeasureField({
  label,
  path,
  value,
  error,
  onChange,
}: {
  label: string;
  path: string;
  value: string;
  error?: string;
  onChange: (path: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const defaults = standardWordExportStyle();
  const parsed = parseSpacingMeasure(value);
  return (
    <Field label={label} path={path} error={error} onRestore={() => onChange(path, readPath(defaults, path))}>
      {parsed === null ? (
        <TextInput
          value={value}
          onChange={(event) => {
            const next = event.currentTarget.value.trim();
            const nextParsed = parseSpacingMeasure(next);
            onChange(path, nextParsed ? formatSpacingMeasure(nextParsed.amount, nextParsed.unit) : event.currentTarget.value);
          }}
        />
      ) : (
        <Group gap="xs" wrap="nowrap">
          <Select
            w={110}
            allowDeselect={false}
            data={[
              { value: "行", label: t("Lines") },
              { value: "pt", label: t("Points") },
            ]}
            value={parsed.unit}
            onChange={(next) => {
              if (next === "行" || next === "pt") onChange(path, formatSpacingMeasure(parsed.amount, next));
            }}
          />
          <NumberInput
            style={{ flex: 1 }}
            min={0}
            max={100}
            decimalScale={2}
            value={parsed.amount}
            onChange={(next) => onChange(path, formatSpacingMeasure(typeof next === "number" ? next : 0, parsed.unit))}
          />
        </Group>
      )}
    </Field>
  );
}

function ColorField({
  path,
  value,
  error,
  label,
  onChange,
}: {
  path: string;
  value: string;
  error?: string;
  label?: string;
  onChange: (path: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field label={label || t("Font color")} path={path} error={error} onRestore={() => onChange(path, "#000000")}>
      <ColorInput format="hex" value={value} onChange={(next) => onChange(path, next)} />
    </Field>
  );
}

function BoolField({
  label,
  path,
  checked,
  onChange,
}: {
  label: string;
  path: string;
  checked: boolean;
  onChange: (path: string, value: unknown) => void;
}) {
  const defaults = standardWordExportStyle();
  return (
    <Field label={label} path={path} onRestore={() => onChange(path, readPath(defaults, path))}>
      <Checkbox checked={checked} onChange={(event) => onChange(path, event.currentTarget.checked)} label={label} />
    </Field>
  );
}

function AlignField({
  label,
  path,
  value,
  allowJustify,
  onChange,
}: {
  label: string;
  path: string;
  value: string;
  allowJustify?: boolean;
  onChange: (path: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field label={label} path={path} onRestore={() => onChange(path, allowJustify ? "justify" : "left")}>
      <Select
        data={ALIGN.filter((item) => allowJustify || item.value !== "justify").map((item) => ({
          value: item.value,
          label: t(item.labelKey),
        }))}
        value={value}
        onChange={(next) => next && onChange(path, next)}
      />
    </Field>
  );
}

function LineSpacingFields({
  typePath,
  valuePath,
  type,
  value,
  allowSingle,
  error,
  onChange,
}: {
  typePath: string;
  valuePath: string;
  type: string;
  value: number | string;
  allowSingle: boolean;
  error?: string;
  onChange: (path: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const options = [
    allowSingle ? { value: "single", label: t("Single") } : null,
    { value: "multiple", label: t("Multiple spacing") },
    { value: "fixed", label: t("Fixed") },
  ].filter(Boolean) as { value: string; label: string }[];
  return (
    <>
      <Field label={t("Line spacing")} path={typePath} onRestore={() => onChange(typePath, readPath(standardWordExportStyle(), typePath))}>
        <Select data={options} value={type} onChange={(next) => next && onChange(typePath, next)} />
      </Field>
      <Field label={t("Line spacing value")} path={valuePath} error={error} onRestore={() => onChange(valuePath, type === "fixed" ? "22pt" : 1)}>
        {type === "fixed" ? (
          <TextInput value={String(value)} onChange={(event) => onChange(valuePath, event.currentTarget.value)} />
        ) : (
          <NumberInput
            disabled={type === "single"}
            min={0.5}
            max={3}
            decimalScale={2}
            value={typeof value === "number" ? value : Number(value) || 1}
            onChange={(next) => onChange(valuePath, typeof next === "number" ? next : 1)}
          />
        )}
      </Field>
    </>
  );
}

function TitleFields({
  index,
  style,
  error,
  onChange,
}: {
  index: number;
  style: WordExportStyle;
  error: (path: string) => string | undefined;
  onChange: (path: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const title = style.titleStyle[index];
  const base = `titleStyle.${index}`;
  return (
    <Stack>
      <FontField path={`${base}.fontFamily`} value={title.fontFamily} error={error(`${base}.fontFamily`)} onChange={onChange} />
      <FontSizeField path={`${base}.fontSize`} value={title.fontSize} error={error(`${base}.fontSize`)} onChange={onChange} />
      <BoolField label={t("Bold")} path={`${base}.fontBold`} checked={title.fontBold} onChange={onChange} />
      <ColorField path={`${base}.fontColor`} value={title.fontColor} error={error(`${base}.fontColor`)} onChange={onChange} />
      <AlignField label={t("Alignment")} path={`${base}.align`} value={title.align} allowJustify onChange={onChange} />
      <LineSpacingFields
        typePath={`${base}.lineSpacingType`}
        valuePath={`${base}.lineSpacingVal`}
        type={title.lineSpacingType}
        value={title.lineSpacingVal}
        allowSingle
        error={error(`${base}.lineSpacingVal`)}
        onChange={onChange}
      />
      <SpacingMeasureField label={t("Space before")} path={`${base}.spaceBefore`} value={title.spaceBefore} error={error(`${base}.spaceBefore`)} onChange={onChange} />
      <SpacingMeasureField label={t("Space after")} path={`${base}.spaceAfter`} value={title.spaceAfter} error={error(`${base}.spaceAfter`)} onChange={onChange} />
      <CharacterIndentField label={t("First line indent")} path={`${base}.indentFirst`} value={title.indentFirst} error={error(`${base}.indentFirst`)} onChange={onChange} />
      <BoolField label={t("Number headings")} path={`${base}.numberEnable`} checked={title.numberEnable} onChange={onChange} />
      <Text size="xs" c="dimmed">{t("Heading numbers follow the page: 1. / 1.1 / 1.1.1.")}</Text>
      <Field label={t("Allow the number to break onto its own line")} path={`${base}.allowBreak`} onRestore={() => onChange(`${base}.allowBreak`, false)}>
        <Checkbox
          disabled={!title.numberEnable}
          checked={title.allowBreak}
          onChange={(event) => onChange(`${base}.allowBreak`, event.currentTarget.checked)}
          label={t("Allow the number to break onto its own line")}
        />
      </Field>
    </Stack>
  );
}
