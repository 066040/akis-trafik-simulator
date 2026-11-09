"""src/ altındaki parçaları tek bir index.html dosyasında birleştirir."""
from pathlib import Path

root = Path(__file__).parent
engine = (root / "src/engine.js").read_text(encoding="utf-8")
engine = engine.replace("if (typeof module !== 'undefined') module.exports = { Sim, Ring, Arrivals, ENV, WEATHER, KMH };", "")
app = (root / "src/app.js").read_text(encoding="utf-8")
page = (root / "src/app.html").read_text(encoding="utf-8").replace("/*ENGINE*/", engine).replace("/*APP*/", app)
# <title>, <meta> ve font bağlantısı <head> içine gider, geri kalanı <body> içine
cut = page.index("<style>")
meta, body = page[:cut], page[cut:]

head = """<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
""" + meta + """<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}</style>
</head>
<body>
"""
(root / "index.html").write_text(head + body + "\n</body>\n</html>\n", encoding="utf-8")
print("index.html oluşturuldu")
