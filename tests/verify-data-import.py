"""Cross-check local tabular import and spreadsheet boundary cases with the native CLI."""
import hashlib
import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CLI = Path(sys.argv[1]).resolve(strict=True)
workbook = subprocess.check_output([sys.executable, "-B", HERE / "fixtures/scientific-workbook.py"])
with zipfile.ZipFile(io.BytesIO(workbook)) as sheet:
    parts = {n: sheet.read(n).decode() for n in sheet.namelist()}
passed = 0


def xlsx(changes):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as output:
        for name, data in {**parts, **changes}.items():
            if data is not None:
                output.writestr(name, data)
    return stream.getvalue()


def check(source, config, expected=None):
    global passed
    run = subprocess.run([CLI, "dataset", json.dumps(config)], input=source, capture_output=True, timeout=10)
    reply = json.loads(run.stdout)
    if isinstance(expected, str):
        assert (run.returncode, reply) == (1, {"ok": False, "code": expected}), (config, reply)
    else:
        assert run.returncode == 0 and reply["ok"], (config, reply)
        manifest = json.loads(reply["proof"]["result"])
        assert manifest["sha256"] == hashlib.sha256(source).hexdigest()
        if expected:
            expected(manifest)
    passed += 1


def equal(a, b):
    assert a == b, (a, b)


def profile(column, origin):
    return lambda r: equal(r["profile"][column]["origins"], {origin: 1})


sheet = "xl/worksheets/sheet1.xml"
rels = "xl/_rels/workbook.xml.rels"
opts = {"format": "xlsx"}
for change, expected in [
    ({"xl/sharedStrings.xml": None}, "invalid_input"),
    ({"xl/styles.xml": None}, profile(4, "stored")),
    ({"xl/workbook.xml": parts["xl/workbook.xml"].replace('date1904="0"', 'date1904="1"')}, profile(4, "date_serial1904")),
    ({sheet: parts[sheet].replace('t="e"><v>#DIV/0!</v>', 't="str"><v>literal</v>')}, profile(5, "stored")),
    ({sheet: parts[sheet].replace('<c r="D2"><f>', '<c r="D2" t="b"><f>')}, profile(3, "formula")),
    ({sheet: parts[sheet].replace('<c r="D2"><f>2+3</f>', '<c r="D2" t="inlineStr"><is><t>ordinary</t></is>')}, profile(3, "stored")),
    ({sheet: parts[sheet].replace('<c r="F2" t="e">', '<c r="F2" t="d">').replace('#DIV/0!', '2024-02-29')}, profile(5, "iso_date")),
    ({"xl/styles.xml": parts["xl/styles.xml"].replace('<xf numFmtId="14"/>','<xf numFmtId="0"/>')}, profile(4, "stored")),
    ({rels: parts[rels].replace('Id="r1"', 'Id="r1" TargetMode="External"')}, "unsupported"),
    ({rels: parts[rels].replace('Target="worksheets/sheet1.xml"', 'Target="drawings/missing.xml"')}, "invalid_input"),
    ({"xl/workbook.xml": parts["xl/workbook.xml"].replace('r:id="r1"', 'other="r1"')}, "invalid_input"),
    ({"xl/workbook.xml": parts["xl/workbook.xml"].replace('name="Other"', 'name="Records"')}, "invalid_input"),
    ({sheet: parts[sheet].replace('r="A2"', 'r="2"')}, "invalid_input"),
    ({sheet: parts[sheet].replace('r="A2"', 'r="A0"')}, "limit"),
    ({sheet: parts[sheet].replace('r="A2"', 'r="A200002"')}, "limit"),
    ({"xl/styles.xml": '<styleSheet><numFmts><numFmt numFmtId="not-an-integer" formatCode="yyyy-mm-dd"/></numFmts></styleSheet>'}, "invalid_input"),
    ({"xl/styles.xml": '<styleSheet><cellXfs><xf numFmtId="unknown"/></cellXfs></styleSheet>'}, "invalid_input"),
]:
    check(xlsx(change), opts, expected)
check(workbook, {"format":"xlsx","sheet":"Absent"}, "invalid_input")
check(b'\xff\xfe\x61\x00\x0a\x00\x32\x00', {"encoding":"utf16le"}, lambda r: equal(r["rows"],1))
check(b'\xfe\xff\x00\x61\x00\x0a\x00\x32', {"encoding":"utf16be"}, lambda r: equal(r["rows"],1))
for source, config, error in [
    (b'[]', {"format":"json"}, "invalid_input"), (b'null', {"format":"json"}, "invalid_input"),
    (b'[{"id":"x"},{"id":1,"extra":2}]', {"format":"json"},"invalid_input"),
    (b'[{"id":1}] trailing', {"format":"json"},"invalid_input"),
    (b'id\ntext',{"analysis":{"x":"id"}},"domain"),
    (b'x\n1',{"types":{"x":"integer"},"steps":[{"op":"group","by":"x","column":"x","name":"","aggregate":"sum"}]},"invalid_input"),
    (b'x\n1',{"steps":[{"op":"calculate","name":"derived","left":{"column":"x"},"operator":"add","right":{"constant":"1"}}]},"domain"),
    (b'x\n1',{"steps":[{"op":"fill_missing","column":"x","value":"not a number"}],"types":{"x":"integer"}},"domain"),
]:
    check(source, config, error)
# Locale-independent style, row, and schema choices from synthetic workbooks.
for code in ['0.00', '[Blue]0.00', '&quot;USD&quot;0.00', r'\m0.00', '_m0.00', '0.00*X']:
    styles=f'<styleSheet><numFmts><numFmt numFmtId="165" formatCode="{code}"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="165"/></cellXfs></styleSheet>'
    check(xlsx({"xl/styles.xml":styles}),opts,profile(4,"stored"))
check(xlsx({sheet:parts[sheet].replace('<c r="H2" t="b"><v>1</v>','<c r="H2" t="b"><v>0</v>')}),opts,profile(7,"stored"))
check(xlsx({"xl/styles.xml":'<?xml version="1.0"?><!--styles supplied by the workbook--><styleSheet/>'}),opts,profile(4,"stored"))
check(xlsx({sheet:'<worksheet><sheetData/></worksheet>'}),opts,'invalid_input')
check(xlsx({'xl/worksheets/extra.bin':''}),opts,'unsupported')
check(xlsx({"xl/workbook.xml":parts['xl/workbook.xml'].replace('name="Other"','name="'+'n'*129+'"')}),opts,'invalid_input')
check(xlsx({"xl/sharedStrings.xml":'<sst><si><t>'+'x'*4097+'</t></si></sst>'}),opts,'limit')
check(xlsx({sheet:parts[sheet].replace('<c r="A2" t="s"><v>0</v>', '<c r="A2" t="s"><v>1</v>')}),opts,'invalid_input')
check(xlsx({'xl/styles.xml':'<styleSheet><numFmt formatCode="'+'0'*8193+'"/></styleSheet>'}),opts,'limit')
check(xlsx({'xl/styles.xml':'<styleSheet><'+'a'*129+'/></styleSheet>'}),opts,'limit')
check(xlsx({'xl/styles.xml':'<styleSheet>'+'<style>'*32+'</style>'*32+'</styleSheet>'}),opts,'limit')
check(xlsx({sheet:parts[sheet].replace('r="A1"','r="AAAA1"')}),opts,'invalid_input')
check(xlsx({sheet:parts[sheet].replace('r="H2" t="b"','r="H2" t="s"').replace('<v>1</v></c></row>', '<v>0</v></c></row>')}),opts,profile(7,'stored'))
check(xlsx({sheet:parts[sheet].replace('<c r="C2"><f>1+1</f><v>2</v>', '<c r="C2" t="str"><f>1+1</f><v>A</v>')}),
      {"format":"xlsx","types":{"cached":"integer"},"steps":[{"op":"cast","column":"cached","kind":"text"}]},profile(2,'cached_formula'))
check(b'[2]',{"format":"json"},'invalid_input')
check(b'[{}]',{"format":"json"},'invalid_input')
check(b'[{"":"empty header"}]',{"format":"json"},'invalid_input')
check(json.dumps([{"a":"x"*4097}]).encode(),{"format":"json"},'invalid_input')
check(json.dumps([{"a":"x"*24577}]).encode(),{"format":"json"},'invalid_input')
check(('c\n'+'x\n'*200001).encode(),{},'limit')
check((','.join(f'c{i}' for i in range(64))+'\n'+','.join('x' for _ in range(64))).encode(),{"steps":[{"op":"text","column":"c0","name":"extra","transform":"uppercase"}]},'limit')
check('v\n1'.encode(),{"types":{"v":"integer"},"steps":[{"op":"join","column":"v","name":"text","mode":"left","lookup":[[str(i),""] for i in range(1025)]}]},'limit')
print(json.dumps({"suite":"tabular-import-contracts","passed":passed,"failed":0,"cli_sha256":hashlib.sha256(CLI.read_bytes()).hexdigest()}))
