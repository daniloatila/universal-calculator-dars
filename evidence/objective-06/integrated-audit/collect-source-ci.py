"""Publish only selected results, test names and CI identities from a completed Actions run."""
import json
import re
import subprocess
import sys
from pathlib import Path

sha, runid = sys.argv[1:]
root = Path('evidence/objective-06/integrated-audit')
private = Path('artifacts/objective-06/integrated-run')
def gh(*args):
    return subprocess.check_output(['gh', *args]).decode('utf-8', errors='replace')
def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def successful_tests(log, step, component):
    tests = []
    for line in log.splitlines():
        if step not in line:
            continue
        m = re.search(r'\btest ('+component+r'::[A-Za-z0-9_:]+) \.\.\. ok\s*$', line)
        if m:
            tests.append(m[1])
    return sorted(set(tests))
info = json.loads(gh('run','view',runid,'--json','databaseId,headSha,createdAt,updatedAt,url,status,conclusion,jobs'))
assert info['headSha']==sha and info['conclusion']=='success' and info['status']=='completed'
jobs = {j['name']:j for j in info['jobs']}
assert len(jobs)==4 and all(j['conclusion']=='success' for j in jobs.values())
logs = {}
for platform in ['windows','ubuntu']:
    jid = str(jobs[f'verify ({platform}-latest)']['databaseId'])
    raw_path = private / f'{runid}-{platform}.log'
    if not raw_path.exists():
        raw_path.write_text(gh('run','view',runid,'--job',jid,'--log'),encoding='utf-8')
    logs[platform]=raw_path.read_text(encoding='utf-8')
credential = successful_tests(logs['windows'],'Verify Windows release lint and credential round trip','credentials')
sensors = successful_tests(logs['windows'],'Build the Windows and macOS desktop targets','capabilities')
assert len(credential)==2 and len(sensors)==5, (credential,sensors)
broker = successful_tests(logs['windows'],'Verify Windows release lint and credential round trip','intelligence')
broker_source = subprocess.check_output(['git', 'show', sha + ':apps/desktop/src/intelligence_tests.rs'], text=True)
expected_broker = re.findall(r'#\[(?:tokio::)?test\]\s+(?:async )?fn (\w+)\(', broker_source)
assert expected_broker and {item.split('::')[-1] for item in broker} == set(expected_broker)
linux_text='\n'.join(re.sub(r'^.*?\d\d:\d\d:\d\d\.\d+Z ', '', ln)
                     for ln in logs['ubuntu'].splitlines() if 'Measure scientific engine line coverage\t' in ln)
suite=linux_text.index('"suite": "science-rust-line-coverage"')
coverage,_ = json.JSONDecoder().raw_decode(linux_text[linux_text.rindex('{',0,suite):])
assert sum(row['covered'] for row in coverage['files']) == coverage['covered']
assert sum(row['total'] for row in coverage['files']) == coverage['total']
assert coverage['covered'] <= coverage['total'] and coverage['total'] > 5000 and 100 * coverage['covered'] > 95 * coverage['total']
optimization = [r for r in coverage['files'] if r['module'] == 'optimization']
assert optimization
optimization_covered = sum(r['covered'] for r in optimization)
optimization_total = sum(r['total'] for r in optimization)
coverage['optimization'] = {'covered': optimization_covered, 'total': optimization_total,
                            'uncovered': optimization_total - optimization_covered,
                            'percent': round(100*optimization_covered/optimization_total, 2),
                            'tracking': 'File-level gaps are reported in files. See the defensive paths documented in Objective 05 revision 01.'}

found = [int(v) for line in logs['ubuntu'].splitlines() if 'Browser verification (Linux)' in line
         for v in re.findall(r'\b(\d+) passed\b', line)]
assert found and max(found)>232, ('Expected inherited and revision browser assertions',found)
chromium=max(found)
save(root/'ci.json',{
    **{k:v for k,v in info.items() if k!='jobs'},
    'jobs':[{k:j[k] for k in ('name','databaseId','url','startedAt','completedAt','status','conclusion')} for j in info['jobs']],
    'windows_credential_checks':credential, 'windows_capability_checks':sensors,
    'windows_intelligence_tests':broker,
    'ubuntu_chromium_passed':chromium,'hosted_scientific_line_coverage':{k:v for k,v in coverage.items() if k!='files'},
})
save(root.parent/'coverage.json',{**coverage,'source_commit':sha,'run_url':info['url']})
print(info['url'], '4/4 jobs; Windows',len(credential),len(sensors),'Ubuntu',chromium,coverage['percent'])
