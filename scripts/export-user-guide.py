"""Export README's four user-guide chapters to an A4 PDF (Markdown 3.8.2).

GUIDE_PLAYWRIGHT_MODULE selects an installed Playwright ESM module. The browser
only reads an ephemeral HTML file with embedded repository images and font.
"""
import base64
import html
from pathlib import Path
import re
import subprocess
import tempfile
import markdown

ROOT = Path(__file__).resolve().parents[1]
# Keep README-only engineering appendices out of the four-chapter guide.
readme = (ROOT / 'README.md').read_text().partition('<!-- USER_GUIDE_END -->')[0]
font = base64.b64encode((ROOT / 'assets/fonts/NanumGothic-Regular.ttf').read_bytes()).decode()
output = ROOT / 'docs/Flag-Edu-User-Guide.pdf'

def render(text):
    text = re.sub(r'<a id="[^"]+"></a>', '', text)
    result = markdown.markdown(text, extensions=['tables'])
    # Make repository links useful outside the repository, including in PDF.
    result = re.sub(r'href="(?!https?://|mailto:|#)([^"]+)"', lambda m: 'href="https://github.com/lego812/flag-edu-prototype/blob/main/' + m[1] + '"', result)
    return result

parts = re.split(r'^## ', readme, flags=re.M)
assert len(parts) == 5, 'Exactly four guide chapters are required'
cover = render(parts[0])
cover = cover.replace('<h1>', '<p class="eyebrow">FLAG EDU · USER GUIDE</p><h1>')
pages = ['<section class="guide-page cover">' + cover + '</section>']
chapter_ids = ['overview', 'common', 'coach', 'admin']
for chapter_index, chunk in enumerate(parts[1:]):
    chapter, _, body = chunk.partition('\n')
    sections = re.split(r'^### ', body, flags=re.M)[1:]
    for index, section in enumerate(sections):
        title, _, content = section.partition('\n')
        # Footer links remain available on the final PDF page.
        captures = re.findall(r'<img src="([^"]+)" width="300" alt="([^"]+)"\s*/>', content)
        content = re.sub(r'<img[^>]+>', '', content)
        figures = []
        for src, alt in captures:
            image = ROOT / src
            assert image.is_file(), f'Missing guide image: {src}'
            data = base64.b64encode(image.read_bytes()).decode()
            figures.append(f'<figure><img src="data:image/jpeg;base64,{data}" alt="{html.escape(alt)}"><figcaption>{html.escape(alt)}</figcaption></figure>')
        anchor = f' id="{chapter_ids[chapter_index]}"' if index == 0 else ''
        pages.append(f'<section class="guide-page"{anchor}><p class="chapter">{html.escape(chapter)}</p><h2>{html.escape(title)}</h2><div class="copy">{render(content)}</div><div class="gallery count-{len(figures)}">' + ''.join(figures) + '</div></section>')
style = '''
@font-face{font-family:Guide;src:url(data:font/ttf;base64,FONT) format("truetype");font-weight:100 900}
@page{size:A4;margin:14mm 16mm 16mm}
*{box-sizing:border-box}html{font-family:Guide,sans-serif;color:#1d252c;font-size:9.3pt;line-height:1.7}body{margin:0}a{color:#116e66;text-decoration:underline;text-underline-offset:2px}strong{font-weight:700;color:#122832}code{font-family:inherit}h1,h2{line-height:1.4;color:#102d36;letter-spacing:-.5px}h1{font-size:29pt;margin:12mm 0 9mm}h2{font-size:18pt;margin:1mm 0 5mm}p{margin:0 0 3mm}ul,ol{padding-left:5mm;margin:2mm 0 4mm}li{margin-bottom:1.1mm}table{width:100%;border-collapse:collapse;margin:4mm 0;font-size:9pt;line-height:1.6}th{background:#e9f1ef;color:#183b39;text-align:left}td,th{padding:2.1mm 2.4mm;border-bottom:1px solid #dbe4e1}td:first-child{font-weight:700}tr{break-inside:avoid}hr{border:0;border-top:1px solid #dbe4e1;margin:4mm 0}.guide-page{width:178mm;height:264mm;break-after:page;position:relative}.guide-page:last-child{break-after:auto}.chapter{font-size:9pt;font-weight:bold;color:#347168;letter-spacing:.2px;border-top:2px solid #347168;padding-top:3mm;margin:0 0 3mm}.eyebrow{letter-spacing:2px;color:#347168;font-weight:bold}.cover{padding-top:15mm}.cover>p{line-height:1.9;margin-bottom:6mm}.cover ul{list-style:none;padding:5mm 0;border-top:1px solid #c4d7d1;border-bottom:1px solid #c4d7d1;margin:8mm 0}.cover li{padding:2mm 0}.gallery{display:flex;justify-content:center;gap:7mm;margin-top:5mm;align-items:flex-start}.gallery figure{margin:0;width:64mm;text-align:center;break-inside:avoid}.gallery img{width:100%;height:auto;display:block;border:1px solid #dce2df;border-radius:3mm}.gallery figcaption{font-size:7.5pt;color:#5c686a;line-height:1.5;margin-top:2mm}.gallery.count-3{gap:4mm}.gallery.count-3 figure{width:54mm}.gallery.count-0{display:none}
'''.replace('FONT', font)
document = '<!doctype html><html lang="ko"><meta charset="utf-8"><title>Flag Edu 사용자 가이드</title><style>' + style + '</style><body>' + ''.join(pages) + '</body></html>'
# Dynamic import accepts an absolute installed module path without adding app dependencies.
node = '''
const {chromium} = await import(process.env.GUIDE_PLAYWRIGHT_MODULE);
const browser = await chromium.launch({executablePath:process.env.GUIDE_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 const page=await browser.newPage();
 await page.route('http**://**/*',route=>route.abort());
 await page.setContent(await (await import('node:fs/promises')).readFile(process.argv[1], 'utf8')); await page.evaluate(()=>document.fonts.ready);
 await page.emulateMedia({media:'print'});
 const overflow=await page.locator('.guide-page').evaluateAll(nodes=>nodes.map((n,i)=>({page:i+1,actual:n.scrollHeight,expected:n.clientHeight})).filter(x=>x.actual>x.expected+2));
 if(overflow.length) throw new Error('Page overflow: '+JSON.stringify(overflow));
 await page.pdf({path:process.argv[2],format:'A4',printBackground:true,preferCSSPageSize:true,tagged:true,outline:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:'<div style="font-family:Arial,sans-serif;font-size:8px;width:100%;padding:0 60px;display:flex;justify-content:space-between;color:#60706d"><span>FLAG EDU · USER GUIDE · 2026.10.13</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'});
 console.log(JSON.stringify({pdf:process.argv[2],pages:await page.locator('.guide-page').count(),overflow:0}));
}finally{await browser.close()}
'''
with tempfile.TemporaryDirectory(prefix='flag-user-guide-') as temporary:
    file = Path(temporary) / 'guide.html'
    file.write_text(document)
    subprocess.run(['node', '--input-type=module', '-e', node, str(file), str(output)], check=True, cwd=ROOT)
