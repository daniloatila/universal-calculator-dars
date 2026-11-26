"""Create a deterministic synthetic SpreadsheetML workbook for the Data Lab oracle."""
import io
import sys
import zipfile

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
parts = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": f'<workbook xmlns="{NS}" xmlns:r="{REL}"><workbookPr date1904="0"/><sheets><sheet name="Records" sheetId="1" r:id="r1"/><sheet name="Other" sheetId="2" r:id="r2"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": f'<Relationships xmlns="{PKG}"><Relationship Id="r1" Type="{REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Type="{REL}/worksheet" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="s" Type="{REL}/styles" Target="styles.xml"/><Relationship Id="str" Type="{REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    "xl/sharedStrings.xml": f'<sst xmlns="{NS}" count="1" uniqueCount="1"><si><r><t>00</t></r><r><t>01</t></r></si></sst>',
    "xl/styles.xml": f'<styleSheet xmlns="{NS}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet2.xml": f'<worksheet xmlns="{NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>label</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>A &amp; B</t></is></c></row></sheetData></worksheet>',
}
names = ["id", "amount", "cached", "formula", "date", "error", "empty", "boolean"]
header = "".join(f'<c r="{chr(65+i)}1" t="inlineStr"><is><t>{name}</t></is></c>' for i, name in enumerate(names))
data = '<c r="A2" t="s"><v>0</v></c><c r="B2"><v>9007199254740993.20</v></c><c r="C2"><f>1+1</f><v>2</v></c><c r="D2"><f>2+3</f></c><c r="E2" s="1"><v>60</v></c><c r="F2" t="e"><v>#DIV/0!</v></c><c r="H2" t="b"><v>1</v></c>'
parts["xl/worksheets/sheet1.xml"] = f'<worksheet xmlns="{NS}"><sheetData><row r="1">{header}</row><row r="2">{data}</row></sheetData></worksheet>'
out = io.BytesIO()
with zipfile.ZipFile(out, "w") as archive:
    for name, content in parts.items():
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED)
sys.stdout.buffer.write(out.getvalue())
