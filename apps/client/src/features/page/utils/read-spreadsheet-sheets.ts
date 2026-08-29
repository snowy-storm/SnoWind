export async function readSpreadsheetSheetNames(file: File): Promise<string[]> {
  const mod = await import("xlsx");
  const XLSX = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, {
    type: "array",
    bookSheets: true,
  });
  let names = (workbook.SheetNames ?? []).filter(
    (name) => typeof name === "string" && name.length > 0,
  );
  if (names.length === 0) {
    const full = XLSX.read(data, { type: "array" });
    names = (full.SheetNames ?? []).filter(
      (name) => typeof name === "string" && name.length > 0,
    );
  }
  return names;
}
