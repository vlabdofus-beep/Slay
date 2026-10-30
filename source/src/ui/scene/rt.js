// Moteur de rendu des personnages, porté de Dofus Survivors (même auteur) : squelette + peaux extraits de Dofus 3,
// « cuits » dans le navigateur en planches d'animation (WebGL, repli canvas 2D). Code d'origine conservé tel quel
// entre les marqueurs ci-dessous ; seuls le chargement des fichiers et la construction d'un personnage sont propres au jeu.
/* eslint-disable */

const BASE = 'game/anims/';
const RT = { reg: {}, wait: {} };
window.DSV_RT = (k, d) => { RT.reg[k] = d; (RT.wait[k] || []).forEach((f) => f(d)); RT.wait[k] = []; };

/** Charge un fichier d'animation (base, look_<classe><m|f>, sp_<classe>). */
export function rtLoad(k) {
  if (RT.reg[k]) return Promise.resolve(RT.reg[k]);
  return new Promise((res) => {
    (RT.wait[k] = RT.wait[k] || []).push(res);
    if (!document.querySelector(`script[data-rt="${k}"]`)) {
      const sc = document.createElement('script');
      sc.src = `${BASE}${k}.js`; sc.dataset.rt = k; sc.onerror = () => res(null);
      document.head.appendChild(sc);
    }
    setTimeout(() => res(RT.reg[k] || null), 60000);
  });
}

/* ───── début du code d'origine (Dofus Survivors) ───── */
const rtImg=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src});
const RT_K=128,RT_S=.75;
/* peaux : corps + tête + accessoires ; teintes par emplacement de couleur (gris × couleur / 128) */
async function rtPrepare(look,accs,cols){
 const lists=[...look.atlas,...accs.map(a=>a.atlas[0])];const tint=[];
 for(let s=0;s<lists.length;s++){tint[s]=[];
  for(let t=0;t<lists[s].length;t++){const im=await rtImg(lists[s][t]);if(!im){tint[s][t]=[];continue}
   const W=im.width,H=im.height,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
   const base=x.getImageData(0,0,W,H);const arr=[];
   for(let z=0;z<=8;z++){const col=cols[z];if(!col||z===0||s>=2){arr[z]=c;continue}
    const o=new ImageData(new Uint8ClampedArray(base.data),W,H),D=o.data;const r=(col>>16)&255,g=(col>>8)&255,b=col&255;
    for(let i=0;i<D.length;i+=4){D[i]=Math.min(255,D[i]*r/RT_K);D[i+1]=Math.min(255,D[i+1]*g/RT_K);D[i+2]=Math.min(255,D[i+2]*b/RT_K)}
    const c2=document.createElement('canvas');c2.width=W;c2.height=H;c2.getContext('2d').putImageData(o,0,0);arr[z]=c2}
   tint[s][t]=arr}}
 const geo=Object.assign({},look.geo);
 const mul=(A,B)=>[A[0]*B[0]+A[2]*B[1],A[1]*B[0]+A[3]*B[1],A[0]*B[2]+A[2]*B[3],A[1]*B[2]+A[3]*B[3],A[0]*B[4]+A[2]*B[5]+A[4],A[1]*B[4]+A[3]*B[5]+A[5]];
 /* emplacements d'accessoires dans les parties (ex. Chapeau_1 dans la tête) */
 const slotIdx={};for(const [node,L] of Object.entries(look.slots||{}))for(const [nm,idx,tf] of L)(slotIdx[nm]=slotIdx[nm]||[]).push([node,idx,tf]);
 const pend={};accs.forEach((a,i)=>{for(const [n,chs] of Object.entries(a.geo)){const mine=chs.map(ch=>({...ch,s:2+i}));
  if(slotIdx[n]){for(const [node,idx,tf] of slotIdx[n])(pend[node]=pend[node]||[]).push([idx,mine.map(ch=>({...ch,m:mul(tf,ch.m)}))])}
  else geo[n]=mine}});
 for(const [node,L] of Object.entries(pend)){const g=(geo[node]||[]).slice();L.sort((a,b)=>b[0]-a[0]);for(const [idx,ins] of L)g.splice(Math.min(g.length,idx),0,...ins);geo[node]=g}
 return {geo,tint};
}
function rtTri(ctx,img,x0,y0,x1,y1,x2,y2,u0,v0,u1,v1,u2,v2){
 const cx0=(x0+x1+x2)/3,cy0=(y0+y1+y2)/3,ex=(x,y)=>{const dx=x-cx0,dy=y-cy0,l=Math.hypot(dx,dy)||1;return[x+dx/l*.6,y+dy/l*.6]};
 const [a0,b0]=ex(x0,y0),[a1,b1]=ex(x1,y1),[a2,b2]=ex(x2,y2);
 const d=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);if(Math.abs(d)<1e-9)return;
 ctx.save();ctx.beginPath();ctx.moveTo(a0,b0);ctx.lineTo(a1,b1);ctx.lineTo(a2,b2);ctx.closePath();ctx.clip();
 const A=(x0*(v1-v2)+x1*(v2-v0)+x2*(v0-v1))/d,B=(y0*(v1-v2)+y1*(v2-v0)+y2*(v0-v1))/d,
  C=(x0*(u2-u1)+x1*(u0-u2)+x2*(u1-u0))/d,D=(y0*(u2-u1)+y1*(u0-u2)+y2*(u1-u0))/d,
  E=(x0*(u1*v2-u2*v1)+x1*(u2*v0-u0*v2)+x2*(u0*v1-u1*v0))/d,F=(y0*(u1*v2-u2*v1)+y1*(u2*v0-u0*v2)+y2*(u0*v1-u1*v0))/d;
 ctx.transform(A,B,C,D,E,F);ctx.drawImage(img,0,0);ctx.restore()}
/* rendu GPU des triangles (WebGL) : remplace le découpage triangle par triangle du canvas 2D, très coûteux */
const RTGL={ok:null};
function rtGLInit(){if(RTGL.ok!==null)return RTGL.ok;try{
 const c=document.createElement('canvas');c.width=c.height=16;const gl=c.getContext('webgl',{premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:true,alpha:true});if(!gl)return RTGL.ok=false;
 const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o};
 const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 t;attribute float a;uniform vec2 R;varying vec2 vt;varying float va;void main(){vt=t;va=a;gl_Position=vec4(p.x/R.x*2.0-1.0,1.0-p.y/R.y*2.0,0.0,1.0);}'));
 gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D T;varying vec2 vt;varying float va;void main(){gl_FragColor=texture2D(T,vt)*va;}'));
 gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))return RTGL.ok=false;gl.useProgram(pr);
 const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
 const lp=gl.getAttribLocation(pr,'p'),lt=gl.getAttribLocation(pr,'t'),la=gl.getAttribLocation(pr,'a');
 gl.enableVertexAttribArray(lp);gl.enableVertexAttribArray(lt);gl.enableVertexAttribArray(la);
 gl.vertexAttribPointer(lp,2,gl.FLOAT,false,20,0);gl.vertexAttribPointer(lt,2,gl.FLOAT,false,20,8);gl.vertexAttribPointer(la,1,gl.FLOAT,false,20,16);
 gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
 Object.assign(RTGL,{c,gl,R:gl.getUniformLocation(pr,'R'),tex:new WeakMap(),arr:new Float32Array(30000*5)});
 c.addEventListener('webglcontextlost',e=>{e.preventDefault();RTGL.ok=false});
 return RTGL.ok=true}catch(e){console.warn('WebGL indisponible',e);return RTGL.ok=false}}
function rtTexGL(img){const {gl,tex}=RTGL;let t=tex.get(img);if(t)return t;t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);tex.set(img,t);return t}
function rtGLBegin(W,H){const {gl,c}=RTGL;if(c.width!==W||c.height!==H){c.width=W;c.height=H}gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(RTGL.R,W,H)}
function rtFrameGL(ctx,P,names,fr,ox,oy,sc,noBlit){
 const {gl,c}=RTGL;if(ctx)rtGLBegin(ctx.canvas.width,ctx.canvas.height);
 let arr=RTGL.arr,n=0,cur=null;
 const flush=()=>{if(!n||!cur)return;gl.bindTexture(gl.TEXTURE_2D,rtTexGL(cur));gl.bufferData(gl.ARRAY_BUFFER,arr.subarray(0,n*5),gl.STREAM_DRAW);gl.drawArrays(gl.TRIANGLES,0,n);n=0};
 for(const r of fr){const Gg=P.geo[names[r[0]]];if(!Gg)continue;const al=r.length>7?Math.min(1,r[7]/127):1;if(al<=0)continue;
  const m0=r[1],m1=r[2],m2=r[3],m3=r[4],m4=r[5],m5=r[6];
  for(const ch of Gg){const M=ch.m;const T=P.tint[ch.s]&&P.tint[ch.s][ch.tex];if(!T||!T.length)continue;
   for(let k=0;k<ch.t.length;k+=3){const p0=ch.v[ch.t[k]];const img=T[p0[2]]||T[0];if(!img)continue;
    if(img!==cur){flush();cur=img}
    if((n+3)*5>arr.length){flush();if((n+3)*5>arr.length){arr=RTGL.arr=new Float32Array(arr.length*2)}}
    for(let q=0;q<3;q++){const v=ch.v[ch.t[k+q]];const x1=M[0]*v[0]+M[2]*v[1]+M[4],y1=M[1]*v[0]+M[3]*v[1]+M[5];
     const o=n*5;arr[o]=ox+(m0*x1+m1*y1+m2)*sc;arr[o+1]=oy-(m3*x1+m4*y1+m5)*sc;arr[o+2]=v[3];arr[o+3]=1-v[4];arr[o+4]=al;n++}}}}
 flush();if(ctx&&!noBlit)ctx.drawImage(c,0,0)}
/* une image d'animation : rec = [nœud, m0..m5, alpha?] */
function rtFrame(ctx,P,names,fr,ox,oy,sc){
 if(rtGLInit()){try{rtFrameGL(ctx,P,names,fr,ox,oy,sc);return}catch(e){console.warn(e);RTGL.ok=false}}
 for(const r of fr){const G=P.geo[names[r[0]]];if(!G)continue;const al=r.length>7?r[7]/127:1;if(al<=0)continue;ctx.globalAlpha=Math.min(1,al);
  const m0=r[1],m1=r[2],m2=r[3],m3=r[4],m4=r[5],m5=r[6];
  for(const ch of G){const M=ch.m;const T=P.tint[ch.s]&&P.tint[ch.s][ch.tex];if(!T||!T.length)continue;
   for(let k=0;k<ch.t.length;k+=3){const p0=ch.v[ch.t[k]],p1=ch.v[ch.t[k+1]],p2=ch.v[ch.t[k+2]];const img=T[p0[2]]||T[0];const W=img.width,H=img.height;
    const S=[p0,p1,p2].map(v=>{const x1=M[0]*v[0]+M[2]*v[1]+M[4],y1=M[1]*v[0]+M[3]*v[1]+M[5];const X=m0*x1+m1*y1+m2,Y=m3*x1+m4*y1+m5;return[ox+X*sc,oy-Y*sc,v[3]*W,(1-v[4])*H]});
    rtTri(ctx,img,S[0][0],S[0][1],S[1][0],S[1][1],S[2][0],S[2][1],S[0][2],S[0][3],S[1][2],S[1][3],S[2][2],S[2][3])}}
  ctx.globalAlpha=1}}
function rtBBox(P,names,FR,clampSp){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
 for(const fr of FR)for(const r of fr){const G=P.geo[names[r[0]]];if(!G)continue;for(const ch of G){const M=ch.m;for(const v of ch.v){const xx=M[0]*v[0]+M[2]*v[1]+M[4],yy=M[1]*v[0]+M[3]*v[1]+M[5];const X=r[1]*xx+r[2]*yy+r[3],Y=-(r[4]*xx+r[5]*yy+r[6]);if(X<x0)x0=X;if(X>x1)x1=X;if(Y<y0)y0=Y;if(Y>y1)y1=Y}}}
 x0-=3;y0-=3;x1+=3;y1+=3;if(clampSp){x0=Math.max(-340,x0);y0=Math.max(-340,y0);x1=Math.min(340,x1);y1=Math.min(80,y1)}
 if(!(x1>x0))return null;return{x0,y0,x1,y1}}
const rtYield=()=>new Promise(r=>setTimeout(r,0));
/* projectile propre au sort : petits objets intégrés à l'animation (pièces, flèches, boules…) visibles devant le lanceur juste avant le tir */
function rtMissile(P,names,FR,shot){
 const nb=(r)=>{const G=P.geo[names[r[0]]];if(!G)return null;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const ch of G){const M=ch.m;for(const v of ch.v){const xx=M[0]*v[0]+M[2]*v[1]+M[4],yy=M[1]*v[0]+M[3]*v[1]+M[5];const X=r[1]*xx+r[2]*yy+r[3],Y=-(r[4]*xx+r[5]*yy+r[6]);if(X<x0)x0=X;if(X>x1)x1=X;if(Y<y0)y0=Y;if(Y>y1)y1=Y}}
  return {x0,y0,x1,y1}};
 let best=null;
 for(let i=Math.max(0,Math.floor(shot)-3);i<=Math.min(FR.length-1,Math.ceil(shot));i++){
  const keep=[];let u=null;
  for(const r of FR[i]){if(!/^sprite_/.test(names[r[0]]))continue;if(r.length>7&&r[7]<40)continue;const b=nb(r);if(!b)continue;const w=b.x1-b.x0,h=b.y1-b.y0;
   if(Math.max(w,h)>90||(b.x0+b.x1)/2<30)continue;keep.push(r);u=u?{x0:Math.min(u.x0,b.x0),y0:Math.min(u.y0,b.y0),x1:Math.max(u.x1,b.x1),y1:Math.max(u.y1,b.y1)}:b}
  if(keep.length&&(u.x1-u.x0)<130&&(u.y1-u.y0)<130&&(!best||keep.length>=best.keep.length))best={keep,u}}
 if(!best)return null;const S=RT_S,u=best.u;const w=Math.ceil((u.x1-u.x0)*S)+4,h=Math.ceil((u.y1-u.y0)*S)+4;if(w<4||h<4)return null;
 const c=document.createElement('canvas');c.width=w;c.height=h;rtFrame(c.getContext('2d'),P,names,best.keep,-u.x0*S+2,-u.y0*S+2,S);
 return c}
/* ───── images intermédiaires ─────
   Les animations de Dofus sont stockées à 15 (ou 7,5) images par seconde. On calcule une image
   entre chaque paire : chaque pièce du squelette est interpolée (matrice et opacité) si elle
   existe dans les deux images et ne fait pas de saut ; sinon on garde la pose de départ. */
function rtMid(a,b){
 const seen={},idx={};
 for(let i=0;i<b.length;i++){const k=b[i][0];const o=seen[k]=(seen[k]||0)+1;idx[k+'#'+o]=b[i]}
 const cnt={},out=[];
 for(const r of a){const k=r[0];const o=cnt[k]=(cnt[k]||0)+1;const q=idx[k+'#'+o];
  if(!q||q.length!==r.length){out.push(r);continue}
  const detA=r[1]*r[5]-r[2]*r[4],detB=q[1]*q[5]-q[2]*q[4];
  const lin=Math.abs(r[1]-q[1])+Math.abs(r[2]-q[2])+Math.abs(r[4]-q[4])+Math.abs(r[5]-q[5]);
  const mv=Math.hypot(r[3]-q[3],r[6]-q[6]);
  if(detA*detB<=0||lin>1.2||mv>90){out.push(r);continue}
  const m=r.slice();for(let j=1;j<r.length;j++)m[j]=(r[j]+q[j])/2;out.push(m)}
 return out}
function rtTween(A){
 const d={};
 for(const [dir,FR] of Object.entries(A.d)){
  const o=[];for(let i=0;i<FR.length;i++){o.push(FR[i]);const nx=i+1<FR.length?FR[i+1]:(A.loop?FR[0]:null);if(nx)o.push(rtMid(FR[i],nx))}
  d[dir]=o}
 return {...A,d,fps:A.fps*2,shot:A.shot==null?null:A.shot*2}}

/* cuisson : chaque animation reçoit sa propre planche ; méta compatible avec drawAnim.
   opt.dirs : directions à garder (le jeu n'affiche que la direction 1). opt.tween : doubler les images. */
async function rtBake(P,pack,opt={}){
 const S=RT_S,SS=opt.ss||1.25,meta={S,a:{}};
 for(let [an,A] of Object.entries(pack.anims)){
  if(opt.only&&!opt.only.includes(an))continue;
  if(opt.dirs){const d={};for(const k of opt.dirs)if(A.d[k])d[k]=A.d[k];if(Object.keys(d).length)A={...A,d}}
  if(opt.tween)A=rtTween(A);
  if(rtGLInit()){try{
   const gs=[];for(const [dir,FR] of Object.entries(A.d)){const bb=rtBBox(P,pack.names,FR,opt.sp);if(!bb)continue;gs.push({dir,FR,bb,w:Math.ceil((bb.x1-bb.x0)*S),h:Math.ceil((bb.y1-bb.y0)*S)})}
   if(gs.length){const MAXW=4096;let X=0,Y=0,rowH=0;const pos=[];
    for(const g of gs)for(let i=0;i<g.FR.length;i++){if(X+g.w>MAXW){X=0;Y+=rowH;rowH=0}pos.push([g,i,X,Y]);X+=g.w+1;rowH=Math.max(rowH,g.h+1)}
    const SW=Math.min(MAXW,Math.max(...pos.map(p=>p[2]+p[0].w))),SH=Y+rowH;
    if(SH<=4096){rtGLBegin(SW,SH);const d={};
     for(const [g,i,x,y] of pos){rtFrameGL(null,P,pack.names,g.FR[i],x-g.bb.x0*S,y-g.bb.y0*S,S,true);const e=d[g.dir]||(d[g.dir]={w:g.w,h:g.h,ax:Math.round(-g.bb.x0*S*100)/100,ay:Math.round(-g.bb.y0*S*100)/100,n:g.FR.length,f:[]});e.f[i]=[x,y]}
     const sheet=document.createElement('canvas');sheet.width=SW;sheet.height=SH;sheet.getContext('2d').drawImage(RTGL.c,0,0);
     meta.a[an]={fps:A.fps,loop:A.loop,d,img:sheet,shot:A.shot};
     if(opt.sp&&A.d[1]){try{meta.a[an].mis=rtMissile(P,pack.names,A.d[1],A.shot==null?A.d[1].length/2:A.shot)}catch(e){}}
     if(opt.onAnim)opt.onAnim(an);await rtYield();continue}}
  }catch(e){console.warn(e);RTGL.ok=false}}
  const groups=[];
  for(const [dir,FR] of Object.entries(A.d)){const bb=rtBBox(P,pack.names,FR,opt.sp);if(!bb)continue;
   const w=Math.ceil((bb.x1-bb.x0)*S),h=Math.ceil((bb.y1-bb.y0)*S);const big=document.createElement('canvas');big.width=Math.ceil(w*SS);big.height=Math.ceil(h*SS);const bx=big.getContext('2d');
   const list=[];for(const fr of FR){bx.clearRect(0,0,big.width,big.height);rtFrame(bx,P,pack.names,fr,-bb.x0*S*SS,-bb.y0*S*SS,S*SS);
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(big,0,0,w,h);list.push(c)}
   groups.push({dir,list,w,h,ax:-bb.x0*S,ay:-bb.y0*S});await rtYield()}
  if(!groups.length)continue;
  const MAXW=4096;let X=0,Y=0,rowH=0;const pos=[];
  for(const g of groups)for(let i=0;i<g.list.length;i++){if(X+g.w>MAXW){X=0;Y+=rowH;rowH=0}pos.push([g,i,X,Y]);X+=g.w;rowH=Math.max(rowH,g.h)}
  const sheet=document.createElement('canvas');sheet.width=Math.min(MAXW,Math.max(...pos.map(p=>p[2]+p[0].w)));sheet.height=Y+rowH;const sx=sheet.getContext('2d');
  const d={};for(const [g,i,x,y] of pos){sx.drawImage(g.list[i],x,y);const e=d[g.dir]||(d[g.dir]={w:g.w,h:g.h,ax:Math.round(g.ax*100)/100,ay:Math.round(g.ay*100)/100,n:g.list.length,f:[]});e.f[i]=[x,y]}
  meta.a[an]={fps:A.fps,loop:A.loop,d,img:sheet,shot:A.shot};
  if(opt.sp&&A.d[1]){try{meta.a[an].mis=rtMissile(P,pack.names,A.d[1],A.shot==null?A.d[1].length/2:A.shot)}catch(e){}}
  if(opt.onAnim)opt.onAnim(an);
 }
 return meta;
}
async function rtSprites(P,sp){
 if(!sp.sgeo||!sp.satlas)return P;const si=P.tint.length;const tl=[];
 for(let t=0;t<sp.satlas.length;t++){const im=await rtImg(sp.satlas[t]);if(!im){tl[t]=[];continue}const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);tl[t]=[c]}
 const geo=Object.assign({},P.geo);for(const [n,chs] of Object.entries(sp.sgeo))geo[n]=chs.map(ch=>({...ch,s:si}));
 return {geo,tint:[...P.tint,tl]};
}
/* ───── fin du code d'origine ───── */

const BASE_ANIMS = ['idle', 'hit', 'death', 'cast', 'strike'];
const built = {};
const spells = {};

/**
 * Construit un personnage (animations de base : attente, coup reçu, mort, lancer, frappe).
 * @param {number} breed 8 = Iop, 9 = Crâ
 * @param {'m'|'f'} gender
 */
export function buildCharacter(breed, gender) {
  const key = `${breed}${gender}`;
  if (built[key]) return built[key];
  built[key] = (async () => {
    const [look, base] = await Promise.all([rtLoad(`look_${key}`), rtLoad('base')]);
    if (!look || !base) return null;
    const P = await rtPrepare(look, [], look.cols || []);
    const meta = await rtBake(await rtSprites(P, base), base, { only: BASE_ANIMS, dirs: ['1'], tween: true });
    meta.ref = Math.round(meta.a.idle.d[1].ay);
    return { key, meta, sp: null, _P: P, _breed: breed };
  })();
  return built[key];
}

/** Ajoute au personnage les animations de sorts demandées (chargées une seule fois). */
export function buildSpells(breed, gender, names) {
  const key = `${breed}${gender}`;
  if (spells[key]) return spells[key];
  spells[key] = (async () => {
    const ch = await buildCharacter(breed, gender);
    const sp = await rtLoad(`sp_${breed}`);
    if (!ch || !sp) return ch;
    ch.sp = await rtBake(await rtSprites(ch._P, sp), sp, { sp: true, only: names, dirs: ['1'], tween: true });
    return ch;
  })();
  return spells[key];
}

/** Animation disponible : base, sinon animations de sorts. */
export function animOf(ch, name) {
  if (!ch) return null;
  if (ch.meta.a[name]) return ch.meta.a[name];
  if (ch.sp && ch.sp.a[name]) return ch.sp.a[name];
  return null;
}

export function animLength(ch, name) {
  const A = animOf(ch, name); if (!A) return 0;
  const D = A.d[1] || Object.values(A.d)[0]; return D.n / A.fps;
}

/**
 * Dessine une image d'animation (direction 1 = vers la droite, vue de trois quarts).
 * h = hauteur à l'écran du personnage au repos. Renvoie false si l'animation manque.
 */
export function drawAnim(ctx, ch, name, t, x, y, h, flip = false) {
  const A = animOf(ch, name) || animOf(ch, 'idle'); if (!A) return false;
  const D = A.d[1] || Object.values(A.d)[0]; if (!D) return false;
  let i = Math.floor(t * A.fps); i = A.loop ? i % D.n : Math.min(D.n - 1, i);
  const [fx, fy] = D.f[i];
  const k = h / ch.meta.ref;
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(A.img, fx, fy, D.w, D.h, -D.ax * k, -D.ay * k, D.w * k, D.h * k);
  ctx.restore(); return true;
}

/** Instant (en secondes) où le sort part : image « shot » de l'animation, sinon la moitié. */
export function shotTime(ch, name) {
  const A = animOf(ch, name); if (!A) return 0.25;
  const D = A.d[1] || Object.values(A.d)[0];
  const raw = (A.shot != null && A.shot > 0 ? A.shot : D.n * 0.4) / A.fps;
  return Math.min(0.6, Math.max(0.22, raw));
}
