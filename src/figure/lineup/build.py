import sys
page=open('page.html').read()
data=''.join('<script>'+open(f).read().replace('window.LINEUP=','window.LINEUP=Object.assign(window.LINEUP||{},',1).rstrip().rstrip(';')+');</script>\n' for f in sys.argv[2:])
open(sys.argv[1],'w').write(page.replace('<!--DATA-->',data))
