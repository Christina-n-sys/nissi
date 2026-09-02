#!/bin/sh
# Rebuild the paper. docx-js writes [Content_Types].xml partway through the
# archive, which some readers reject, so the result is repacked with it first.
set -e
cd "$(dirname "$0")"
node build_paper.js
python3 - <<'PY'
import zipfile, shutil
src = "phishing_paper_draft.docx"
zin = zipfile.ZipFile(src)
first = "[Content_Types].xml"
order = [first] + [n for n in zin.namelist() if n != first and not n.endswith("/")]
with zipfile.ZipFile("_tmp.docx", "w", zipfile.ZIP_DEFLATED) as zout:
    for n in order:
        zout.writestr(n, zin.read(n))
zin.close()
shutil.move("_tmp.docx", src)
print("repacked", src)
PY
