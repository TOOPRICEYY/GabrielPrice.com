import json, numpy as np, base64
man=json.load(open('stage_man.json'))
P=np.fromfile('stage_pos.bin','<f4').reshape(-1,3)
I=np.fromfile('stage_simp.bin','<u4')
SI=np.load('stage_si.npy'); SW=np.load('stage_sw.npy')
used,inv=np.unique(I,return_inverse=True)
P=P[used]; SI=SI[used]; SW=SW[used]; I=inv.astype(np.uint16)
SW8=np.round(SW*255).astype(np.uint8)
buf=P.astype('<f4').tobytes()+I.tobytes()+SI.tobytes()+SW8.tobytes()
out={'nv':len(P),'nt':len(I)//3,'bones':man['bones']}
open('figure_data.js','w').write('window.FIGURE_MAN='+json.dumps(out)+';\nwindow.FIGURE_B64="'+base64.b64encode(buf).decode()+'";\n')
print(out['nv'],out['nt'])
