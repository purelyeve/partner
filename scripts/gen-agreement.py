import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

z = zipfile.ZipFile(r"c:\Users\HELLO\Downloads\Partner Agreement Electronic.docx")
root = ET.fromstring(z.read("word/document.xml"))
paras = []
for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
    texts = [
        t.text or ""
        for t in p.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
    ]
    paras.append("".join(texts).strip())

while paras and not paras[-1]:
    paras.pop()

nonempty = [p for p in paras if p]
section_re = re.compile(r"^(\d+)\.\s+.+")
sections = []
intro_parts = []
current = None
started = False
expected = 1

for p in nonempty[1:]:
    m = section_re.match(p)
    if m and int(m.group(1)) == expected and len(p) < 140:
        if current:
            sections.append(current)
        current = {"num": expected, "title": p, "body": []}
        expected += 1
        started = True
        continue
    if not started:
        intro_parts.append(p)
    else:
        current["body"].append(p)

if current:
    sections.append(current)

print("sections", [s["num"] for s in sections])
print("intro paras", len(intro_parts))


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


out = Path(r"D:\work\Git\Next\PurelyEve\src\content\partner-agreement.ts")
lines = [
    "/** Partner Terms & Wholesale Agreement — Version 1.0 | Effective August 20, 2026 */",
    "",
    "export const AGREEMENT_TITLE =",
    "  'PURELY EVE LLC PARTNER TERMS & WHOLESALE AGREEMENT'",
    "",
    "export const AGREEMENT_VERSION_LABEL =",
    "  'Partner Terms & Wholesale Agreement Version 1.0 Effective August 20, 2026'",
    "",
    "export const AGREEMENT_EFFECTIVE_DATE = 'August 20, 2026'",
    "",
    f"export const AGREEMENT_INTRO = `{esc(chr(10).join(intro_parts))}`",
    "",
    "export const PARTNER_AGREEMENT_SECTIONS = [",
]

for s in sections:
    body = "\n\n".join(s["body"]).strip()
    lines.append("  {")
    lines.append(f"    title: `{esc(s['title'])}`,")
    lines.append(f"    body: `{esc(body)}`,")
    lines.append("  },")

lines.extend(
    [
        "] as const",
        "",
        "/** Full plain-text agreement for display / audit reference. */",
        "export function agreementFullText(): string {",
        "  const parts = [AGREEMENT_TITLE, '', AGREEMENT_INTRO]",
        "  for (const section of PARTNER_AGREEMENT_SECTIONS) {",
        "    parts.push('', section.title, '', section.body)",
        "  }",
        "  return parts.join('\\n')",
        "}",
        "",
    ]
)

out.write_text("\n".join(lines), encoding="utf-8")
print("wrote", out, "bytes", out.stat().st_size)
