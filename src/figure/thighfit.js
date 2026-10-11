(()=>{const R=window.__rig,T=R.THREE;const cm=R.kicker.parts.cuffs.m;cm.updateMatrixWorld(true);const inv=cm.matrixWorld.clone().invert();
let sk;R.figure.traverse(o=>{if(o.isSkinnedMesh)sk=o});sk.updateMatrixWorld(true);sk.skeleton.update();const v=new T.Vector3(),g=cm.geometry.attributes.position;
if(!window.__prof2){window.__prof2=[[44,99],[0,44]].map(([lo,hi])=>{const pts=[];for(let i=0;i<g.count;i++){v.fromBufferAttribute(g,i);if(v.y>=lo&&v.y<hi)pts.push([v.x,v.y,v.z]);}
 let ymin=1e9,ymax=-1e9,cx=0,cz=0;for(const p of pts){ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);cx+=p[0];cz+=p[2];}cx/=pts.length;cz/=pts.length;
 const NB=90,NY=12,rin=new Float32Array(NB*NY).fill(1e9);
 for(const p of pts){const b=Math.floor((Math.atan2(p[2]-cz,p[0]-cx)+Math.PI)/(2*Math.PI)*NB)%NB,y=Math.min(NY-1,Math.floor((p[1]-ymin)/(ymax-ymin)*NY));const r=Math.hypot(p[0]-cx,p[2]-cz);if(r<rin[y*NB+b])rin[y*NB+b]=r;}
 // fill single empty bins between filled ones (sparse sampling), leave the real opening empty
 for(let y=0;y<NY;y++)for(let it=0;it<2;it++)for(let b=0;b<NB;b++){const k=y*NB+b;if(rin[k]<1e8)continue;const l=rin[y*NB+(b+NB-1)%NB],r=rin[y*NB+(b+1)%NB];if(l<1e8&&r<1e8)rin[k]=Math.min(l,r);}
 // a column whose row is empty takes the min of rows above/below
 return {ymin,ymax,cx,cz,NB,NY,rin,n:pts.length};});}
const SI=sk.geometry.attributes.skinIndex,SW=sk.geometry.attributes.skinWeight,n=sk.geometry.attributes.position.count;
const S=new T.Matrix4(),Bm=new T.Matrix4(),M=new T.Matrix4(),out=[];let worst=0,cnt=0;const q=new T.Vector3(),tw=new T.Vector3(),dw=new T.Vector3();
const CL=.4,FALL=3;
for(let i=0;i<n;i++){let w=0;for(let k=0;k<4;k++){const bi=SI.getComponent(i,k);if(bi>=18&&bi<=20)w+=SW.getComponent(i,k);}if(w<.3)continue;
 sk.getVertexPosition(i,v);v.applyMatrix4(sk.matrixWorld);q.copy(v).applyMatrix4(inv);
 let best=null;
 for(const P of window.__prof2){const dy=q.y<P.ymin?P.ymin-q.y:q.y>P.ymax?q.y-P.ymax:0;if(dy>FALL)continue;
  const r=Math.hypot(q.x-P.cx,q.z-P.cz);if(r>25)continue;const a=Math.atan2(q.z-P.cz,q.x-P.cx),b=Math.floor((a+Math.PI)/(2*Math.PI)*P.NB)%P.NB;
  const yy=Math.min(P.NY-1,Math.max(0,Math.floor((Math.min(Math.max(q.y,P.ymin),P.ymax)-P.ymin)/(P.ymax-P.ymin)*P.NY)));
  let ri=P.rin[yy*P.NB+b];if(ri>1e8)continue;const lim=ri-CL+dy*1.2;const pen=r-lim;if(pen>0&&(!best||pen>best.pen))best={pen,ux:(q.x-P.cx)/r,uz:(q.z-P.cz)/r};}
 if(!best)continue;cnt++;worst=Math.max(worst,best.pen);
 tw.set(q.x-best.ux*best.pen,q.y,q.z-best.uz*best.pen).applyMatrix4(cm.matrixWorld);dw.copy(tw).sub(v);
 S.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const e=S.elements;
 for(let k=0;k<4;k++){const ww=SW.getComponent(i,k);if(!ww)continue;const bi=SI.getComponent(i,k);Bm.multiplyMatrices(sk.skeleton.bones[bi].matrixWorld,sk.skeleton.boneInverses[bi]);for(let j=0;j<16;j++)e[j]+=ww*Bm.elements[j];}
 M.copy(sk.matrixWorld).multiply(sk.bindMatrixInverse).multiply(S).multiply(sk.bindMatrix);M.setPosition(0,0,0);M.invert();dw.applyMatrix4(M);
 out.push([i,+dw.x.toFixed(3),+dw.y.toFixed(3),+dw.z.toFixed(3)]);}
return {worst:+worst.toFixed(2),cnt,prof:window.__prof2.map(P=>[+P.ymin.toFixed(1),+P.ymax.toFixed(1),P.n]),out}})()
