"""Small, deterministic workbook with formula, cache and storage types specified separately."""
import io
import subprocess
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
HEADERS = ("amount", "id", "direct_date", "formula_date", "cached_text", "no_cache",
           "empty_cache", "cached_error", "iso_date", "flag", "cached_number")


def cell(row, name, storage="n", value=None, formula=None, style=None):
    attrs = {"r": name, "t": storage}
    if style is not None:
        attrs["s"] = str(style)
    item = ET.SubElement(row, "c", attrs)
    if formula is not None:
        ET.SubElement(item, "f").text = formula
    if value is not None:
        if storage == "inlineStr":
            ET.SubElement(ET.SubElement(item, "is"), "t").text = value
        else:
            ET.SubElement(item, "v").text = value


def workbook(epoch):
    if epoch not in (1900, 1904):
        raise ValueError("Unsupported test epoch")
    source = subprocess.check_output([sys.executable, "-B", Path(__file__).with_name("scientific-workbook.py")])
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        parts = {name: archive.read(name).decode() for name in archive.namelist()}
    types = ("styles", "sharedStrings")
    extra = "".join(f'<Override PartName="/xl/{name}.xml" '
                    f'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.{name}+xml"/>'
                    for name in types)
    parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace("</Types>", extra + "</Types>")
    parts["xl/workbook.xml"] = parts["xl/workbook.xml"].replace('date1904="0"', f'date1904="{int(epoch == 1904)}"')
    parts["xl/styles.xml"] = (
        f'<styleSheet xmlns="{NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/>'
        '</numFmts><fonts count="1"><font/></fonts><fills count="1"><fill><patternFill/></fill></fills>'
        '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs>'
        '<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    )
    sheet = ET.Element("worksheet", {"xmlns": NS})
    data = ET.SubElement(sheet, "sheetData")
    row = ET.SubElement(data, "row", {"r": "1"})
    for index, name in enumerate(HEADERS):
        cell(row, f"{chr(65 + index)}1", "inlineStr", name)
    for rownum, serial in enumerate(["60.5", "61.25", "2"], 2):
        row = ET.SubElement(data, "row", {"r": str(rownum)})
        storage, amount = [("n", "1.25"), ("inlineStr", "2,50"), ("n", "4E-2")][rownum-2]
        cell(row, f"A{rownum}", storage, amount)
        cell(row, f"B{rownum}", "s", "0")
        cell(row, f"C{rownum}", value=serial, style=2)
        cell(row, f"D{rownum}", value=serial, formula=f"C{rownum}", style=2)
        cell(row, f"E{rownum}", "str", "3,75", '"3,75"')
        cell(row, f"F{rownum}", formula="1+1", style=1)
        cell(row, f"G{rownum}", "str", "", '""')
        cell(row, f"H{rownum}", "e", "#N/A", "NA()")
        cell(row, f"I{rownum}", "d", "2024-04-06T07:08:09")
        cell(row, f"J{rownum}", "b", "0" if rownum == 2 else "1")
        cell(row, f"K{rownum}", "n", "3.5", "7/2")
    parts["xl/worksheets/sheet1.xml"] = ET.tostring(sheet, encoding="unicode")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        for name, xml in parts.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            archive.writestr(info, xml.encode(), compress_type=zipfile.ZIP_DEFLATED)
    return out.getvalue()


if __name__ == "__main__":
    sys.stdout.buffer.write(workbook(int(sys.argv[1])))
