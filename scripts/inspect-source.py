# Helper to inspect intact paragraphs and source offsets without generated quotations.
import pathlib,re,sys
text=pathlib.Path('data/sources/'+sys.argv[1]+'.txt').read_text()
for m in re.finditer(r'\S[^\n]*(?:\n[^\n]+)*',text):
 if len(m.group().split())>60 and (len(sys.argv)<3 or sys.argv[2].lower() in m.group().lower()):
  print(m.start(),m.end(),m.group()[:260].replace('\n',' '))
