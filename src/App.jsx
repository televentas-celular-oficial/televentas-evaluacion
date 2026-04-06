import { useState, useEffect } from "react";

const VENDEDORAS_DEFAULT = [
  { id:1,  nombre:"Lorena Castrillón",  ciudad:"MED", activa:true, fechaIngreso:"2026-04-01" },
  { id:2,  nombre:"Dayana Restrepo",    ciudad:"MED", activa:true, fechaIngreso:"2026-04-01" },
  { id:3,  nombre:"Jennifer Gómez",     ciudad:"MED", activa:true, fechaIngreso:"2026-04-01" },
  { id:4,  nombre:"Durley Castaño",     ciudad:"MED", activa:true, fechaIngreso:"2026-04-01" },
  { id:5,  nombre:"Manuela Arenas",     ciudad:"MED", activa:true, fechaIngreso:"2026-04-01" },
  { id:6,  nombre:"Xiomara Neuta",      ciudad:"BOG", activa:true, fechaIngreso:"2026-04-01" },
  { id:7,  nombre:"Luisa Chavarría",    ciudad:"MED", activa:true, fechaIngreso:"2026-04-01" },
  { id:8,  nombre:"Elena Ricardo",      ciudad:"MED", activa:true, fechaIngreso:"2026-04-01" },
  { id:9,  nombre:"Leydy Sánchez",      ciudad:"BOG", activa:true, fechaIngreso:"2026-04-01" },
  { id:10, nombre:"Jackeline Solorza",  ciudad:"BOG", activa:true, fechaIngreso:"2026-04-01" },
  { id:11, nombre:"Yessica Acevedo",    ciudad:"BOG", activa:true, fechaIngreso:"2026-04-01" },
  { id:12, nombre:"Vanessa González",   ciudad:"BOG", activa:true, fechaIngreso:"2026-04-01" },
  { id:13, nombre:"Alisson González",   ciudad:"BOG", activa:true, fechaIngreso:"2026-04-01" },
  { id:14, nombre:"Betzabeth Leal",     ciudad:"MED", activa:true, fechaIngreso:"2026-04-01" },
];

const COLOR_CIUDAD={BOG:"#f59e0b",MED:"#10b981"};
const LABEL_CIUDAD={BOG:"Bogotá",MED:"Medellín"};
const INDICADORES=[
  {id:"puntualidad",label:"Puntualidad",emoji:"⏰",peso:15},
  {id:"resenas",label:"Reseñas",emoji:"⭐",peso:10},
  {id:"celular",label:"Celular",emoji:"📱",peso:10},
  {id:"uniforme",label:"Uniforme",emoji:"👔",peso:10},
  {id:"tienda_e",label:"Tienda",emoji:"🏪",peso:10},
  {id:"planilla",label:"Planilla",emoji:"📋",peso:15},
];

const CLAVE_INGRESO="01546";
const CLAVE_EDITAR="1717";
const CLAVE_VENTAS="01546";
const CLAVE_ADMIN="1717";

function trimestreActual(){return Math.ceil((new Date().getMonth()+1)/3);}
function mesesTrimestre(q){const b=(q-1)*3+1;return[b,b+1,b+2];}
function notaIndicador(reg,indId){
  if(!reg||reg.descanso)return null;
  if(indId==="puntualidad")return reg.minutos>=10?1:Math.round((5-reg.minutos*(4/10))*100)/100;
  if(indId==="resenas")return reg.resenas>=1?5:1;
  if(indId==="celular")return reg.celular==="bien"?5:1;
  if(indId==="uniforme")return reg.uniforme==="bien"?5:1;
  if(indId==="tienda_e")return reg.tienda_e==="bien"?5:1;
  if(indId==="planilla")return reg.planilla==="bien"?5:1;
  return null;
}
function notaDia(reg){
  if(!reg||reg.descanso)return null;
  return Math.round(INDICADORES.reduce((s,i)=>s+notaIndicador(reg,i.id)*i.peso,0)/70*100)/100;
}
function calcMes(registros,vid,año,mes){
  const pref=vid+"_"+año+"-"+String(mes).padStart(2,"0");
  const dias=Object.entries(registros).filter(([k,r])=>k.startsWith(pref)&&!r.descanso).map(([,r])=>r);
  if(!dias.length)return{nota:null,dias:0,porInd:{}};
  const porInd={};
  INDICADORES.forEach(ind=>{
    const ns=dias.map(r=>notaIndicador(r,ind.id)).filter(n=>n!==null);
    porInd[ind.id]=ns.length?Math.round(ns.reduce((a,b)=>a+b,0)/ns.length*100)/100:null;
  });
  const notaBase=Math.round(INDICADORES.reduce((s,i)=>s+(porInd[i.id]??0)*i.peso,0)/70*100)/100;
  return{nota:notaBase,dias:dias.length,porInd};
}
function calcRanking(registros,metas,año,mes,vendedoras){
  const metaInfo=metas[año+"_"+String(mes).padStart(2,"0")]||{meta:0,vendidas:{}};
  const activas=vendedoras.filter(v=>v.activa!==false);
  const datos=activas.map(v=>{
    const{nota:notaBase,dias,porInd}=calcMes(registros,v.id,año,mes);
    const real=metaInfo.vendidas?.[v.id]??0;
    const nV=metaInfo.meta>0?Math.min(Math.round((1+real/metaInfo.meta*4)*100)/100,5):null;
    let nota=notaBase;
    if(notaBase!==null&&nV!==null)nota=Math.round((notaBase*70+nV*30)/100*100)/100;
    return{...v,nota,notaBase,notaVentas:nV,real,meta:metaInfo.meta,dias,porInd};
  });
  const sorted=[...datos].sort((a,b)=>((b.nota??-1)-(a.nota??-1))||((b.real??0)-(a.real??0)));
  sorted.forEach((v,i)=>{v.rankGen=v.nota!==null?i+1:null;});
  INDICADORES.forEach(ind=>{
    [...datos].sort((a,b)=>((b.porInd?.[ind.id]??-1)-(a.porInd?.[ind.id]??-1)))
      .forEach((v,i)=>{const o=sorted.find(x=>x.id===v.id);if(o)o["rank_"+ind.id]=v.porInd?.[ind.id]!=null?i+1:null;});
  });
  return sorted;
}

const colorN=n=>n===null?"#475569":n>=4.5?"#059669":n>=3.5?"#d97706":n>=2.5?"#ea580c":"#dc2626";
const bgN=n=>n===null?"#f1f5f9":n>=4.5?"#d1fae5":n>=3.5?"#fef3c7":n>=2.5?"#ffedd5":"#fee2e2";
const fmtN=n=>n===null?"—":Number(n).toFixed(2);
const hoyStr=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
const diaV=vid=>({vid,descanso:false,minutos:0,resenas:0,celular:"bien",uniforme:"bien",tienda_e:"bien",planilla:"bien"});
const mesNames=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function PantallaClave({emoji,titulo,clave,onOk}){
  const [pin,setPin]=useState("");
  const [err,setErr]=useState(false);
  const intentar=()=>{if(pin===clave)onOk();else setErr(true);};
  return(
    <div style={{fontFamily:"'DM Sans',sans-serif",maxWidth:300,margin:"60px auto",textAlign:"center",padding:20}}>
      <div style={{fontSize:40,marginBottom:12}}>{emoji}</div>
      <div style={{fontWeight:800,fontSize:16,marginBottom:20,color:"#0f172a"}}>{titulo}</div>
      <input type="password" placeholder="Clave" value={pin} autoFocus
        onChange={e=>{setPin(e.target.value);setErr(false);}}
        onKeyDown={e=>{if(e.key==="Enter")intentar();}}
        style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px",color:"#0f172a",fontSize:16,width:"100%",boxSizing:"border-box",textAlign:"center",letterSpacing:10,marginBottom:8}}
        inputMode="numeric" pattern="[0-9]*"/>
      {err&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>Clave incorrecta</div>}
      <button style={{padding:"13px 0",width:"100%",borderRadius:10,border:"none",cursor:"pointer",fontWeight:800,fontSize:14,background:"linear-gradient(135deg,#ea580c,#f97316)",color:"#fff"}}
        onClick={intentar}>Entrar</button>
    </div>
  );
}

export default function App(){
  const [pantalla,setPantalla]=useState("ranking");
  const [vendedoras,setVendedoras]=useState([]);
  const [registros,setRegistros]=useState({});
  const [metas,setMetas]=useState({});
  const [cargado,setCargado]=useState(false);
  const [verVid,setVerVid]=useState(null);
  const [tabRank,setTabRank]=useState("general");
  const [mesViendo,setMesViendo]=useState(()=>new Date().getMonth()+1);
  const [fecha,setFecha]=useState(hoyStr());
  const [filas,setFilas]=useState({});
  const [guardado,setGuardado]=useState(false);
  const [editando,setEditando]=useState(false);
  const [pideClave,setPideClave]=useState(false);
  const [claveIn,setClaveIn]=useState("");
  const [claveErr,setClaveErr]=useState(false);
  const [verModoTrim,setVerModoTrim]=useState(false);
  const [ingresoOk,setIngresoOk]=useState(false);
  const [ventasOk,setVentasOk]=useState(false);

  const ahora=new Date();
  const año=ahora.getFullYear();
  const mes=ahora.getMonth()+1;
  const mesNombreV=new Date(año,mesViendo-1).toLocaleDateString("es-CO",{month:"long",year:"numeric"});
  const clavesMesV=año+"_"+String(mesViendo).padStart(2,"0");
  const activas=vendedoras.filter(v=>v.activa!==false);

  useEffect(()=>{
    async function cargar(){
      let regs={},mets={},vends=VENDEDORAS_DEFAULT;
      try{const{getDoc,doc}=await import("firebase/firestore");const{db}=await import("./firebase.js");const r=await getDoc(doc(db,"televentas","registros"));if(r.exists())regs=JSON.parse(r.data().data);}catch(_){}
      try{const{getDoc,doc}=await import("firebase/firestore");const{db}=await import("./firebase.js");const m=await getDoc(doc(db,"televentas","metas"));if(m.exists())mets=JSON.parse(m.data().data);}catch(_){}
      try{const{getDoc,doc}=await import("firebase/firestore");const{db}=await import("./firebase.js");const v=await getDoc(doc(db,"televentas","vendedoras"));if(v.exists()){vends=JSON.parse(v.data().data);vends=vends.map(v=>({...v,fechaIngreso:v.fechaIngreso||"2026-04-01"}));}}catch(_){}
      setRegistros({...regs});setMetas({...mets});setVendedoras([...vends]);setRegistros(regs);setMetas(mets);setVendedoras(vends);
      const añoMes=año+"-"+String(mes).padStart(2,"0");
      let primerSinLlenar=hoyStr();
      const act=vends.filter(v=>v.activa!==false);
      for(let d=1;d<=new Date().getDate();d++){
        const f2=añoMes+"-"+String(d).padStart(2,"0");
        if(!act.some(v=>regs[v.id+"_"+f2])){primerSinLlenar=f2;break;}
      }
      setFecha(primerSinLlenar);
      setCargado(true);
    }
    cargar();
  },[]);

 async function saveRegs(data){setRegistros(data);try{const{setDoc,doc}=await import("firebase/firestore");const{db}=await import("./firebase.js");await setDoc(doc(db,"televentas","registros"),{data:JSON.stringify(data)});}catch(e){console.error(e);}}
async function saveMetas(data){setMetas(data);try{const{setDoc,doc}=await import("firebase/firestore");const{db}=await import("./firebase.js");await setDoc(doc(db,"televentas","metas"),{data:JSON.stringify(data)});}catch(e){console.error(e);}}
async function saveVends(data){setVendedoras(data);try{const{setDoc,doc}=await import("firebase/firestore");const{db}=await import("./firebase.js");await setDoc(doc(db,"televentas","vendedoras"),{data:JSON.stringify(data)});}catch(e){console.error(e);}}
  useEffect(()=>{
    if(!cargado||!activas.length)return;
    const init={};
    activas.forEach(v=>{const k=v.id+"_"+fecha;init[v.id]=registros[k]?{...registros[k]}:diaV(v.id);});
    setFilas(init);
    setGuardado(activas.some(v=>registros[v.id+"_"+fecha]));
    setEditando(false);
  },[fecha,cargado,vendedoras]);

  function setFila(vid,campo,valor){setFilas(f=>({...f,[vid]:{...f[vid],[campo]:valor}}));}
  function guardarDia(){
    const n={...registros};
    activas.forEach(v=>{n[v.id+"_"+fecha]={...filas[v.id],vid:v.id,fecha};});
    saveRegs(n);setGuardado(true);setEditando(false);
  }

  const rank=calcRanking(registros,metas,año,mesViendo,vendedoras);
  const bloqueado=guardado&&!editando;

  const S={
    wrap:{fontFamily:"'DM Sans',sans-serif",background:"#f8fafc",minHeight:"100vh",color:"#0f172a"},
    hdr:{background:"#fff",borderBottom:"2px solid #f1f5f9",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50,boxShadow:"0 1px 8px rgba(0,0,0,0.06)"},
    logo:{fontSize:15,fontWeight:900,color:"#ea580c"},
    nav:{display:"flex",gap:3,background:"#f1f5f9",padding:3,borderRadius:9},
    navB:a=>({padding:"6px 11px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:800,background:a?"#ea580c":"transparent",color:a?"#fff":"#475569"}),
    body:{padding:"14px 14px 50px",maxWidth:560,margin:"0 auto"},
    tit:{fontSize:19,fontWeight:900,marginBottom:3,color:"#0f172a"},
    sub:{fontSize:11,color:"#475569",marginBottom:16},
    card:{background:"#fff",border:"1px solid #e2e8f0",borderRadius:13,padding:14,marginBottom:9,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"},
    lbl:{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".7px",marginBottom:3,display:"block"},
    inp:{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 10px",color:"#0f172a",fontSize:16,width:"100%",boxSizing:"border-box"},
    btnP:{padding:"13px 0",width:"100%",borderRadius:10,border:"none",cursor:"pointer",fontWeight:800,fontSize:14,background:"linear-gradient(135deg,#ea580c,#f97316)",color:"#fff",boxShadow:"0 2px 8px rgba(234,88,12,0.3)"},
    btnS:{padding:"7px 13px",borderRadius:7,border:"1px solid #e2e8f0",cursor:"pointer",fontWeight:700,fontSize:11,background:"#fff",color:"#475569"},
    tab:a=>({padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,whiteSpace:"nowrap",background:a?"#fff":"transparent",color:a?"#ea580c":"#475569",boxShadow:a?"0 1px 4px rgba(0,0,0,0.08)":"none"}),
  };

  function BadgeCiudad({ciudad,full}){
    return <span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:10,background:COLOR_CIUDAD[ciudad]+"20",color:COLOR_CIUDAD[ciudad],border:"1px solid "+COLOR_CIUDAD[ciudad]+"40"}}>{full?LABEL_CIUDAD[ciudad]:ciudad}</span>;
  }
  function NotaBadge({nota,size}){
    const sz=size||18;
    return <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:sz*2.8,padding:"2px 10px",borderRadius:8,background:bgN(nota),color:colorN(nota),fontWeight:900,fontSize:sz}}>{fmtN(nota)}</div>;
  }

  function ModalClave(){
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
        <div style={{background:"#fff",borderRadius:16,padding:24,width:260,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>🔐</div>
          <div style={{fontWeight:800,fontSize:15,marginBottom:16}}>Clave para editar</div>
          <input type="password" placeholder="••••" value={claveIn} autoFocus
            onChange={e=>{setClaveIn(e.target.value);setClaveErr(false);}}
            onKeyDown={e=>{if(e.key==="Enter"){if(claveIn===CLAVE_EDITAR){setEditando(true);setPideClave(false);}else setClaveErr(true);}}}
            inputMode="numeric" pattern="[0-9]*"
            style={{...S.inp,textAlign:"center",letterSpacing:8,marginBottom:8}}/>
          {claveErr&&<div style={{color:"#dc2626",fontSize:12,marginBottom:8}}>Clave incorrecta</div>}
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button style={{...S.btnS,flex:1}} onClick={()=>{setPideClave(false);setClaveIn("");}}>Cancelar</button>
            <button style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",fontWeight:800,fontSize:13,background:"#ea580c",color:"#fff"}}
              onClick={()=>{if(claveIn===CLAVE_EDITAR){setEditando(true);setPideClave(false);}else setClaveErr(true);}}>Entrar</button>
          </div>
        </div>
      </div>
    );
  }

  function PantallaRanking(){
    const conDatos=rank.filter(v=>v.nota!==null);
    const lista=tabRank==="general"
      ?rank.filter(v=>v.nota!==null).map(v=>({...v,nm:v.nota,rm:v.rankGen}))
      :tabRank==="ventas"
        ?rank.filter(v=>v.meta>0).sort((a,b)=>(b.real/Math.max(b.meta,1))-(a.real/Math.max(a.meta,1))).map((v,i)=>({...v,nm:v.notaVentas,rm:i+1}))
        :rank.filter(v=>v.porInd?.[tabRank]!=null).sort((a,b)=>((b.porInd[tabRank]??-1)-(a.porInd[tabRank]??-1))).map((v,i)=>({...v,nm:v.porInd[tabRank],rm:i+1}));
    return(
      <div style={S.body}>
        <div style={S.tit}>🏆 Rankings</div>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].filter(m=>m<=mes).map(m=>(
            <button key={m} onClick={()=>setMesViendo(m)}
              style={{padding:"4px 10px",borderRadius:16,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                background:mesViendo===m?"#ea580c":"#f1f5f9",color:mesViendo===m?"#fff":"#475569"}}>
              {new Date(año,m-1).toLocaleDateString("es-CO",{month:"short"})}
            </button>
          ))}
        </div>
        <div style={S.sub}>{mesNombreV} · {conDatos.length} vendedoras con datos</div>
        <div style={{display:"flex",gap:5,overflowX:"auto",marginBottom:14,background:"#f1f5f9",borderRadius:12,padding:6}}>
          <button style={S.tab(tabRank==="general")} onClick={()=>setTabRank("general")}>🏅 General</button>
          {INDICADORES.map(ind=><button key={ind.id} style={S.tab(tabRank===ind.id)} onClick={()=>setTabRank(ind.id)}>{ind.emoji} {ind.label}</button>)}
          <button style={S.tab(tabRank==="ventas")} onClick={()=>setTabRank("ventas")}>💰 Ventas</button>
        </div>
        {tabRank==="general"&&conDatos.length>=3&&(
          <div style={{...S.card,background:"linear-gradient(135deg,#fff7ed,#fff)",border:"2px solid #fed7aa",marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:800,color:"#ea580c",marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>⚡ Top 3 del mes</div>
            <div style={{display:"flex",justifyContent:"space-around",alignItems:"flex-end",gap:8}}>
              {[{v:conDatos[1],h:60,e:"🥈"},{v:conDatos[0],h:80,e:"🥇"},{v:conDatos[2],h:46,e:"🥉"}].map((item,i)=>{
                const{v,h,e}=item;
                return v?(<div key={v.id} style={{textAlign:"center",flex:1,cursor:"pointer"}} onClick={()=>{setVerVid(v.id);setVerModoTrim(false);setPantalla("boletin");}}>
                  <div style={{fontSize:10,fontWeight:800,marginBottom:2,color:COLOR_CIUDAD[v.ciudad]}}>{v.nombre.split(" ")[0]}</div>
                  <NotaBadge nota={v.nota} size={14}/>
                  <div style={{height:h,background:i===1?"linear-gradient(180deg,#ea580c,#c2410c)":"#f1f5f9",borderRadius:"7px 7px 0 0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,marginTop:5}}>{e}</div>
                </div>):null;
              })}
            </div>
          </div>
        )}
        {lista.length===0?(
          <div style={{...S.card,textAlign:"center",padding:36}}>
            <div style={{fontSize:30,marginBottom:8}}>📋</div>
            <div style={{fontWeight:700,color:"#475569"}}>Sin registros este mes</div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>Ve a ✏️ Ingresar para empezar</div>
          </div>
        ):lista.map(v=>(
          <div key={v.id} style={{...S.card,display:"flex",alignItems:"center",gap:11,cursor:"pointer"}} onClick={()=>{setVerVid(v.id);setVerModoTrim(false);setPantalla("boletin");}}>
            <div style={{width:44,height:44,borderRadius:"50%",flexShrink:0,background:v.rm<=3?"linear-gradient(135deg,#ea580c,#f97316)":"#f1f5f9",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:15,color:v.rm<=3?"#fff":"#475569"}}>#{v.rm}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <div style={{fontWeight:700,fontSize:13}}>{v.nombre}</div>
                <BadgeCiudad ciudad={v.ciudad}/>
              </div>
              <div style={{fontSize:10,color:"#475569",marginTop:1}}>{v.dias} día{v.dias!==1?"s":""} trabajados</div>
            </div>
            <NotaBadge nota={v.nm} size={18}/>
          </div>
        ))}
      </div>
    );
  }

  function PantallaBoletin(){
    const v=vendedoras.find(x=>x.id===verVid);
    if(!v)return null;
    const qActual=trimestreActual();
    const mesesTrim=mesesTrimestre(qActual);
    const pesos=[0.20,0.30,0.50];
    const{nota,dias,porInd}=calcMes(registros,v.id,año,mesViendo);
    const metaInfo=metas[clavesMesV]||{meta:0,vendidas:{}};
    const real=metaInfo.vendidas?.[v.id]??0;
    const nV=metaInfo.meta>0?Math.min(Math.round((1+real/metaInfo.meta*4)*100)/100,5):null;
    const notaFinal=nota!==null&&nV!==null?Math.round((nota*70+nV*30)/100*100)/100:nota;
    const rankV=rank.find(x=>x.id===v.id);
    const total=rank.filter(x=>x.nota!==null).length;
    const datosTrim=mesesTrim.map(m=>{
      const{nota:nm,porInd:pi}=calcMes(registros,v.id,año,m);
      const mi=metas[año+"_"+String(m).padStart(2,"0")]||{meta:0,vendidas:{}};
      const rv=mi.vendidas?.[v.id]??0;
      const nVm=mi.meta>0?Math.min(Math.round((1+rv/mi.meta*4)*100)/100,5):null;
      const nf=nm!==null&&nVm!==null?Math.round((nm*70+nVm*30)/100*100)/100:nm;
      return{mes:m,nota:nf,porInd:pi,real:rv,meta:mi.meta};
    });
    const mesesConDatos=datosTrim.filter(d=>d.nota!==null);
    const sumPesos=mesesConDatos.reduce((s,d)=>s+pesos[datosTrim.indexOf(d)],0);
    const notaTrim=mesesConDatos.length>0?Math.round(datosTrim.reduce((s,d,i)=>d.nota!==null?s+d.nota*pesos[i]:s,0)/sumPesos*100)/100:null;
    const diasTrim=datosTrim.reduce((s,d)=>s+(d.dias||0),0);
    const porIndTrim={};
    INDICADORES.forEach(ind=>{
      const vals=datosTrim.map(d=>d.porInd?.[ind.id]).filter(n=>n!=null);
      porIndTrim[ind.id]=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*100)/100:null;
    });
    const realTrim=datosTrim.reduce((s,d)=>s+(d.real||0),0);
    const metaTrim=datosTrim.reduce((s,d)=>s+(d.meta||0),0);
    const pctTrim=metaTrim>0?Math.round((realTrim/metaTrim)*100):0;
    const nVTrim=metaTrim>0?Math.min(Math.round((1+realTrim/metaTrim*4)*100)/100,5):null;
    const esTrim=verModoTrim;
    const notaMostrar=esTrim?notaTrim:notaFinal;
    const diasMostrar=esTrim?diasTrim:dias;
    const porIndMostrar=esTrim?porIndTrim:(porInd||{});
    const realMostrar=esTrim?realTrim:real;
    const metaMostrar=esTrim?metaTrim:metaInfo.meta;
    const pctMostrar=esTrim?pctTrim:(metaInfo.meta>0?Math.round((real/metaInfo.meta)*100):0);
    const nVMostrar=esTrim?nVTrim:nV;
    const titulo=esTrim?`Q${qActual} · ${mesesTrim.map(m=>mesNames[m-1]).join("-")}`:mesNombreV;
    const diasRegsAll=esTrim
      ?mesesTrim.flatMap(m=>Object.entries(registros).filter(([k,r])=>k.startsWith(v.id+"_"+año+"-"+String(m).padStart(2,"0"))&&!r.descanso).map(([,r])=>r))
      :Object.entries(registros).filter(([k,r])=>k.startsWith(v.id+"_"+año+"-"+String(mesViendo).padStart(2,"0"))&&!r.descanso).map(([,r])=>r);
    const acum={
      minutos:diasRegsAll.reduce((s,r)=>s+(r.minutos||0),0),
      resenas:diasRegsAll.reduce((s,r)=>s+(r.resenas||0),0),
      celular_mal:diasRegsAll.filter(r=>r.celular==="mal").length,
      uniforme_mal:diasRegsAll.filter(r=>r.uniforme==="mal").length,
      tienda_mal:diasRegsAll.filter(r=>r.tienda_e==="mal").length,
      planilla_mal:diasRegsAll.filter(r=>r.planilla==="mal").length,
    };
    return(
      <div style={S.body}>
        <button style={{...S.btnS,marginBottom:14}} onClick={()=>{setPantalla(esTrim?"trimestre":"ranking");setVerModoTrim(false);}}>← Volver</button>
        <div style={{...S.card,background:"linear-gradient(135deg,#fff7ed,#fff)",border:"2px solid #fed7aa",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:13}}>
            <div style={{width:52,height:52,borderRadius:"50%",background:COLOR_CIUDAD[v.ciudad],display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:900,color:"#fff",flexShrink:0}}>{v.nombre[0]}</div>
            <div>
              <div style={{fontSize:17,fontWeight:900}}>{v.nombre}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
                <BadgeCiudad ciudad={v.ciudad} full/>
                <span style={{fontSize:11,color:"#475569"}}>{diasMostrar} días · {titulo}</span>
              </div>
            </div>
          </div>
          <div style={{textAlign:"center",marginTop:16}}>
            <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>
              {esTrim?"Nota trimestral acumulada":"Nota general del mes"}
            </div>
            <div style={{fontSize:56,fontWeight:900,color:colorN(notaMostrar),lineHeight:1}}>{fmtN(notaMostrar)}</div>
            <div style={{fontSize:12,color:"#475569",marginTop:4}}>/5.00 · {titulo}</div>
          </div>
          {!esTrim&&rankV?.rankGen&&(
            <div style={{marginTop:12,background:bgN(notaFinal),borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:12,color:"#475569",fontWeight:700}}>Posición en el ranking</div>
              <div style={{fontSize:22,fontWeight:900,color:colorN(notaFinal)}}>#{rankV.rankGen} <span style={{fontSize:12,color:"#475569",fontWeight:400}}>de {total}</span></div>
            </div>
          )}
          {esTrim&&(
            <div style={{display:"flex",gap:6,marginTop:14,flexWrap:"wrap"}}>
              {datosTrim.map((d,i)=>(
                <div key={d.mes} style={{textAlign:"center",background:"#f8fafc",borderRadius:8,padding:"6px 10px",flex:1}}>
                  <div style={{fontSize:10,color:"#475569",fontWeight:700}}>{mesNames[d.mes-1]} ×{pesos[i]*100}%</div>
                  <div style={{fontSize:15,fontWeight:900,color:colorN(d.nota)}}>{fmtN(d.nota)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{...S.card,borderLeft:"4px solid "+(nVMostrar!==null?colorN(nVMostrar):"#e2e8f0")}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{fontWeight:800,fontSize:13}}>💰 Ventas <span style={{fontSize:10,color:"#475569",fontWeight:400}}>(30%)</span></div>
            <NotaBadge nota={nVMostrar} size={16}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase"}}>Meta</div>
              <div style={{fontSize:15,fontWeight:800,marginTop:2}}>${Number(metaMostrar||0).toLocaleString("es-CO")}</div>
            </div>
            <div style={{background:"#f8fafc",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase"}}>Vendido</div>
              <div style={{fontSize:15,fontWeight:800,color:pctMostrar>=100?"#059669":"#0f172a",marginTop:2}}>${Number(realMostrar).toLocaleString("es-CO")}</div>
            </div>
          </div>
          <div style={{background:"#f1f5f9",borderRadius:6,height:8,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:6,width:Math.min(pctMostrar,100)+"%",background:pctMostrar>=100?"#059669":pctMostrar>=70?"#d97706":"#ea580c"}}/>
          </div>
          <div style={{fontSize:11,color:"#475569",marginTop:5}}>{pctMostrar}% {pctMostrar>=100?"✅":""}</div>
        </div>
        <div style={{fontSize:12,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Detalle por indicador</div>
        {INDICADORES.map(ind=>{
          const ni=porIndMostrar?.[ind.id]??null;
          return(
            <div key={ind.id} style={{...S.card,display:"flex",alignItems:"center",gap:12,padding:"11px 14px"}}>
              <div style={{fontSize:20,flexShrink:0}}>{ind.emoji}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div style={{fontWeight:700,fontSize:13}}>{ind.label}</div>
                  <div style={{fontSize:10,color:"#475569"}}>Peso {ind.peso}%</div>
                </div>
                <div style={{fontSize:10,color:"#475569",marginTop:2}}>
                  {ind.id==="puntualidad"&&<span>⏱ {acum.minutos} min acumulados</span>}
                  {ind.id==="resenas"&&<span>⭐ {acum.resenas} reseñas totales</span>}
                  {ind.id==="celular"&&<span>📱 {acum.celular_mal} días con novedad</span>}
                  {ind.id==="uniforme"&&<span>👔 {acum.uniforme_mal} días con novedad</span>}
                  {ind.id==="tienda_e"&&<span>🏪 {acum.tienda_mal} días con novedad</span>}
                  {ind.id==="planilla"&&<span>📋 {acum.planilla_mal} días con novedad</span>}
                </div>
                <div style={{marginTop:4,background:"#f1f5f9",borderRadius:4,height:5,overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:4,width:(((ni??0)/5)*100)+"%",background:colorN(ni)}}/>
                </div>
              </div>
              <NotaBadge nota={ni} size={16}/>
            </div>
          );
        })}
        <div style={{...S.card,background:"#fffbeb",border:"1px solid #fde68a",marginTop:6}}>
          <div style={{fontSize:11,fontWeight:800,color:"#d97706",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>💬 Observaciones</div>
          {notaMostrar===null?<div style={{fontSize:13,color:"#475569"}}>Sin datos aún.</div>:(
            <>
              {notaMostrar>=4.5&&<div style={{fontSize:13,marginBottom:6}}>🌟 ¡Desempeño sobresaliente!</div>}
              {notaMostrar>=4.0&&notaMostrar<4.5&&<div style={{fontSize:13,marginBottom:6}}>🎯 ¡Muy buen desempeño!</div>}
              {notaMostrar>=3.5&&notaMostrar<4.0&&<div style={{fontSize:13,marginBottom:6}}>✅ Buen desempeño.</div>}
              {notaMostrar>=2.5&&notaMostrar<3.5&&<div style={{fontSize:13,marginBottom:6}}>⚡ ¡Cada día es una oportunidad de mejorar!</div>}
              {notaMostrar<2.5&&<div style={{fontSize:13,marginBottom:6}}>💪 Puedes revertirlo.</div>}
              {INDICADORES.filter(ind=>(porIndMostrar?.[ind.id]??0)>=4.5).map(ind=>(
                <div key={ind.id} style={{fontSize:12,color:"#059669",marginBottom:4}}>{ind.emoji} Excelente en {ind.label}</div>
              ))}
              {INDICADORES.filter(ind=>porIndMostrar?.[ind.id]!=null&&porIndMostrar[ind.id]<3.5).map(ind=>(
                <div key={ind.id} style={{fontSize:12,color:"#ea580c",marginBottom:4}}>{ind.emoji} Mejorar en {ind.label}</div>
              ))}
              <div style={{fontSize:12,color:"#475569",marginTop:6}}>📊 {diasMostrar} días · {titulo}</div>
            </>
          )}
        </div>
      </div>
    );
  }

  function PantallaIngreso(){
    const trabajan=activas.filter(v=>!filas[v.id]?.descanso);
    if(!ingresoOk) return <PantallaClave emoji="✏️" titulo="Ingreso diario" clave={CLAVE_INGRESO} onOk={()=>setIngresoOk(true)}/>;
    return(
      <div style={S.body}>
        <div style={S.tit}>✏️ Ingreso diario</div>
        <div style={{...S.card,marginBottom:14}}>
          <label style={S.lbl}>Fecha</label>
          <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={S.inp}/>
          {guardado&&!editando&&(
            <div style={{marginTop:9,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:12,color:"#059669",fontWeight:700}}>✅ Día guardado</span>
              <button style={S.btnS} onClick={()=>{setPideClave(true);setClaveIn("");setClaveErr(false);}}>Editar</button>
            </div>
          )}
        </div>
        <div style={{...S.card,marginBottom:13}}>
          <div style={{fontSize:13,fontWeight:800,color:"#ea580c",marginBottom:9}}>1️⃣ ¿Quién descansó?</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {activas.map(v=>{
              const desc=filas[v.id]?.descanso;
              return(
                <button key={v.id} disabled={bloqueado} onClick={()=>setFila(v.id,"descanso",!desc)}
                  style={{padding:"5px 11px",borderRadius:20,border:"2px solid "+(desc?"#fca5a5":COLOR_CIUDAD[v.ciudad]+"40"),cursor:bloqueado?"default":"pointer",
                    fontSize:12,fontWeight:700,opacity:bloqueado?0.6:1,
                    background:desc?"#fee2e2":"#fff",color:desc?"#dc2626":COLOR_CIUDAD[v.ciudad],
                    textDecoration:desc?"line-through":"none"}}>
                  {v.nombre.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <div style={{fontSize:11,color:"#475569",marginTop:7}}>✅ {trabajan.length} trabajan · 😴 {activas.length-trabajan.length} descansan</div>
        </div>
        <div style={{fontSize:13,fontWeight:800,color:"#ea580c",marginBottom:9}}>
          2️⃣ Novedades <span style={{fontSize:11,color:"#475569",fontWeight:400}}>(solo lo que NO fue perfecto)</span>
        </div>
        {trabajan.map(v=>{
          const f=filas[v.id]||diaV(v.id);
          const nd=notaDia(f);
          const hayNov=f.minutos>0||f.resenas>0||f.celular==="mal"||f.uniforme==="mal"||f.tienda_e==="mal"||f.planilla==="mal";
          return(
            <div key={v.id} style={{...S.card,borderLeft:"3px solid "+(hayNov?"#ea580c":COLOR_CIUDAD[v.ciudad]),marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:9}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{fontWeight:800,fontSize:13}}>{v.nombre}</div>
                  <BadgeCiudad ciudad={v.ciudad}/>
                </div>
                {nd!==null&&<NotaBadge nota={nd} size={14}/>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                {[["minutos","⏰ Min tarde",1,150],["resenas","⭐ Reseñas",1,50]].map(([campo,etiq,paso,max])=>(
                  <div key={campo}>
                    <label style={S.lbl}>{etiq}</label>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <button disabled={bloqueado||f[campo]<=0} onClick={()=>setFila(v.id,campo,Math.max(0,f[campo]-paso))}
                        style={{width:36,height:36,borderRadius:8,border:"1px solid #e2e8f0",background:"#f1f5f9",fontSize:18,fontWeight:900,cursor:"pointer",flexShrink:0,color:"#475569"}}>−</button>
                      <div style={{flex:1,textAlign:"center",fontWeight:800,fontSize:16,padding:"6px 0",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>{f[campo]}</div>
                      <button disabled={bloqueado||f[campo]>=max} onClick={()=>setFila(v.id,campo,Math.min(max,f[campo]+paso))}
                        style={{width:36,height:36,borderRadius:8,border:"1px solid #e2e8f0",background:"#f1f5f9",fontSize:18,fontWeight:900,cursor:"pointer",flexShrink:0,color:"#475569"}}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                {[["celular","📱 Celular"],["uniforme","👔 Uniforme"],["tienda_e","🏪 Tienda"],["planilla","📋 Planilla"]].map(([campo,etiq])=>(
                  <div key={campo}>
                    <label style={S.lbl}>{etiq}</label>
                    <select disabled={bloqueado} value={f[campo]} onChange={e=>setFila(v.id,campo,e.target.value)}
                      style={{...S.inp,color:f[campo]==="mal"?"#dc2626":"#059669",fontWeight:700,padding:"8px 4px"}}>
                      <option value="bien">✅</option>
                      <option value="mal">❌</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {!bloqueado&&<button style={{...S.btnP,marginTop:6}} onClick={guardarDia}>💾 Guardar día</button>}
        {guardado&&!editando&&<div style={{textAlign:"center",fontSize:12,color:"#475569",marginTop:10}}>Toca "Editar" para corregir</div>}
      </div>
    );
  }

  function PantallaVentas(){
    const [mesVentasV,setMesVentasV]=useState(mes);
    const claveVentas=año+"_"+String(mesVentasV).padStart(2,"0");
    const [metaInput,setMetaInput]=useState("");
    const [vendsInput,setVendsInput]=useState(()=>{const i={};activas.forEach(v=>{i[v.id]="";});return i;});
    const [ok,setOk]=useState(false);
    useEffect(()=>{
      const mi=metas[claveVentas]||{meta:0,vendidas:{}};
      setMetaInput(String(mi.meta||""));
      const i={};activas.forEach(v=>{i[v.id]=String(mi.vendidas?.[v.id]||"");});
      setVendsInput(i);
    },[mesVentasV]);
    function guardar(){
      const vendidas={};
      activas.forEach(v=>{if(vendsInput[v.id])vendidas[v.id]=Number(vendsInput[v.id]);});
      saveMetas({...metas,[claveVentas]:{meta:Number(metaInput)||0,vendidas}});
      setOk(true);setTimeout(()=>setOk(false),2000);
    }
    const mesNombreVentas=new Date(año,mesVentasV-1).toLocaleDateString("es-CO",{month:"long",year:"numeric"});
    if(!ventasOk) return <PantallaClave emoji="💰" titulo="Ventas" clave={CLAVE_VENTAS} onOk={()=>setVentasOk(true)}/>;
    return(
      <div style={S.body}>
        <div style={S.tit}>💰 Ventas</div>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          {[1,2,3,4,5,6,7,8,9,10,11,12].filter(m=>m<=mes).map(m=>(
            <button key={m} onClick={()=>setMesVentasV(m)}
              style={{padding:"4px 10px",borderRadius:16,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                background:mesVentasV===m?"#ea580c":"#f1f5f9",color:mesVentasV===m?"#fff":"#475569"}}>
              {new Date(año,m-1).toLocaleDateString("es-CO",{month:"short"})}
            </button>
          ))}
        </div>
        <div style={S.sub}>{mesNombreVentas}</div>
        <div style={S.card}>
          <label style={S.lbl}>Meta del mes ($)</label>
          <input type="number" value={metaInput} onChange={e=>setMetaInput(e.target.value)} placeholder="Ej: 5000000" style={S.inp}/>
        </div>
        {activas.map(v=>{
          const real=Number(vendsInput[v.id]||0);
          const meta=Number(metaInput||0);
          const pct=meta>0?Math.round((real/meta)*100):0;
          return(
            <div key={v.id} style={{...S.card,padding:"10px 14px",marginBottom:7}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{fontWeight:700,fontSize:13}}>{v.nombre}</div>
                  <BadgeCiudad ciudad={v.ciudad}/>
                </div>
                <div style={{fontSize:11,fontWeight:800,color:pct>=100?"#059669":pct>=70?"#d97706":"#475569"}}>{pct}%</div>
              </div>
              <input type="number" value={vendsInput[v.id]||""} onChange={e=>setVendsInput(i=>({...i,[v.id]:e.target.value}))} placeholder="$ vendido" style={S.inp}/>
              {meta>0&&real>0&&(<div style={{marginTop:6,background:"#f1f5f9",borderRadius:4,height:5,overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,width:Math.min(pct,100)+"%",background:pct>=100?"#059669":pct>=70?"#d97706":"#ea580c"}}/>
              </div>)}
            </div>
          );
        })}
        <button style={{...S.btnP,marginTop:6}} onClick={guardar}>{ok?"✅ Guardado":"💾 Guardar ventas"}</button>
      </div>
    );
  }

  function PantallaTrimestre(){
    const qActual=trimestreActual();
    const [q,setQ]=useState(qActual);
    const meses=mesesTrimestre(q);
    const pesos=[0.20,0.30,0.50];
    const inicioTrim=año+"-"+String((q-1)*3+1).padStart(2,"0")+"-01";
    const elegibles=activas.filter(v=>!v.fechaIngreso||v.fechaIngreso<=inicioTrim);
    const soloMensuales=activas.filter(v=>v.fechaIngreso&&v.fechaIngreso>inicioTrim);
    const datos=elegibles.map(v=>{
      const notasMes=meses.map(m=>{
        const{nota:nm}=calcMes(registros,v.id,año,m);
        const mi=metas[año+"_"+String(m).padStart(2,"0")]||{meta:0,vendidas:{}};
        const real=mi.vendidas?.[v.id]??0;
        const nV=mi.meta>0?Math.min(Math.round((1+real/mi.meta*4)*100)/100,5):null;
        if(nm===null)return null;
        return nV!==null?Math.round((nm*70+nV*30)/100*100)/100:nm;
      });
      const mesesConDatos=notasMes.filter(n=>n!==null).length;
      const completo=notasMes.every(n=>n!==null);
      const sumPesos=notasMes.reduce((s,n,i)=>n!==null?s+pesos[i]:s,0);
      const notaTrim=mesesConDatos>0?Math.round(notasMes.reduce((s,n,i)=>n!==null?s+n*pesos[i]:s,0)/sumPesos*100)/100:null;
      return{...v,notasMes,notaTrim,completo,mesesConDatos};
    });
    const conDatos=datos.filter(v=>v.mesesConDatos>0);
    const sinDatos=datos.filter(v=>v.mesesConDatos===0);
    const ranking=[...conDatos].sort((a,b)=>(b.notaTrim??-1)-(a.notaTrim??-1)).map((v,i)=>({...v,rt:i+1}));
    const rankingFinal=ranking.filter(v=>v.completo);

    // Lógica del premio en tiempo real
    const conNota=ranking.filter(v=>v.notaTrim!==null);
    const ganadoras450=conNota.filter(v=>v.notaTrim>=4.50);
    const hayGanadoras=ganadoras450.length>0;
    const ganadora2M=hayGanadoras?ganadoras450[0]:null;
    const ganadoras1M=hayGanadoras?ganadoras450.slice(1):[];
    const ganadoraSola=!hayGanadoras&&conNota.length>0?conNota[0]:null;

    return(
      <div style={S.body}>
        <div style={S.tit}>📈 Trimestre</div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {[1,2,3,4].filter(n=>n<=qActual).map(n=>(
            <button key={n} onClick={()=>setQ(n)}
              style={{padding:"4px 14px",borderRadius:16,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                background:q===n?"#ea580c":"#f1f5f9",color:q===n?"#fff":"#475569"}}>Q{n}</button>
          ))}
        </div>
        <div style={S.sub}>{meses.map(m=>mesNames[m-1]).join(" · ")} · Pesos: 20% · 30% · 50%</div>

        {/* Bloque premio en tiempo real */}
        {conNota.length>0&&(
          <div style={{...S.card,background:"linear-gradient(135deg,#fff7ed,#fff)",border:"2px solid #fed7aa",marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:800,color:"#ea580c",marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>
              🏆 {rankingFinal.length===ranking.length?"Premio final":"Premio — tiempo real"}
            </div>
            {hayGanadoras?(
              <>
                <div style={{...S.card,background:"linear-gradient(135deg,#fef9c3,#fff)",border:"1px solid #fde047",marginBottom:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#854d0e",marginBottom:4}}>🥇 $2.000.000 — Mejor nota ≥ 4.50</div>
                  <div style={{fontWeight:900,fontSize:15}}>{ganadora2M.nombre}</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
                    <BadgeCiudad ciudad={ganadora2M.ciudad}/>
                    <NotaBadge nota={ganadora2M.notaTrim} size={14}/>
                    <span style={{fontSize:11,color:"#475569"}}>#{ganadora2M.rt} del ranking</span>
                  </div>
                </div>
                {ganadoras1M.length>0&&(
                  <div>
                    <div style={{fontSize:10,fontWeight:800,color:"#475569",marginBottom:6}}>💰 $1.000.000 — Nota ≥ 4.50</div>
                    {ganadoras1M.map(v=>(
                      <div key={v.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
                        <div style={{fontWeight:700,fontSize:13,flex:1}}>{v.nombre}</div>
                        <BadgeCiudad ciudad={v.ciudad}/>
                        <NotaBadge nota={v.notaTrim} size={13}/>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{fontSize:10,color:"#94a3b8",marginTop:8}}>
                  {conNota.filter(v=>v.notaTrim<4.50).length} vendedora{conNota.filter(v=>v.notaTrim<4.50).length!==1?"s":""} aún por debajo de 4.50
                </div>
              </>
            ):(
              <div style={{...S.card,background:"#f8fafc",border:"1px solid #e2e8f0",padding:"10px 14px"}}>
                <div style={{fontSize:10,fontWeight:800,color:"#475569",marginBottom:4}}>💰 $1.000.000 — Mejor ranking (ninguna llega a 4.50 aún)</div>
                {ganadoraSola&&(
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontWeight:900,fontSize:15,flex:1}}>{ganadoraSola.nombre}</div>
                    <BadgeCiudad ciudad={ganadoraSola.ciudad}/>
                    <NotaBadge nota={ganadoraSola.notaTrim} size={14}/>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {ranking.length>0&&(
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:1}}>
                {rankingFinal.length===ranking.length?"Ranking final":"⚡ Ranking en tiempo real"}
              </div>
              {rankingFinal.length<ranking.length&&<div style={{fontSize:10,color:"#94a3b8"}}>Acumulado con meses disponibles</div>}
            </div>
            {ranking.map(v=>{
              const es2M=ganadora2M?.id===v.id;
              const es1M=ganadoras1M.some(x=>x.id===v.id);
              const esSola=ganadoraSola?.id===v.id;
              return(
              <div key={v.id} style={{...S.card,display:"flex",alignItems:"center",gap:11,cursor:"pointer",
                borderLeft:"3px solid "+(es2M?"#eab308":es1M?"#10b981":esSola?"#ea580c":v.completo?"#ea580c":"#cbd5e1")}}
                onClick={()=>{setVerVid(v.id);setVerModoTrim(true);setPantalla("boletin");}}>
                <div style={{width:44,height:44,borderRadius:"50%",flexShrink:0,
                  background:v.rt===1?"linear-gradient(135deg,#eab308,#ca8a04)":v.rt===2?"linear-gradient(135deg,#94a3b8,#64748b)":v.rt===3?"linear-gradient(135deg,#ea580c,#c2410c)":"#f1f5f9",
                  display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:15,
                  color:v.rt<=3?"#fff":"#475569"}}>#{v.rt}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <div style={{fontWeight:700,fontSize:13}}>{v.nombre}</div>
                    <BadgeCiudad ciudad={v.ciudad}/>
                    {es2M&&<span style={{fontSize:9,fontWeight:800,color:"#854d0e",background:"#fef9c3",padding:"1px 6px",borderRadius:8}}>🥇 $2M</span>}
                    {es1M&&<span style={{fontSize:9,fontWeight:800,color:"#065f46",background:"#d1fae5",padding:"1px 6px",borderRadius:8}}>💰 $1M</span>}
                    {esSola&&<span style={{fontSize:9,fontWeight:800,color:"#9a3412",background:"#ffedd5",padding:"1px 6px",borderRadius:8}}>💰 $1M</span>}
                    {!v.completo&&<span style={{fontSize:9,fontWeight:800,color:"#94a3b8",background:"#f1f5f9",padding:"1px 6px",borderRadius:8}}>{v.mesesConDatos}/3 meses</span>}
                    {v.completo&&<span style={{fontSize:9,fontWeight:800,color:"#059669",background:"#d1fae5",padding:"1px 6px",borderRadius:8}}>✅ Completo</span>}
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                    {meses.map((m,i)=>(
                      <div key={m} style={{fontSize:10,color:"#475569",background:"#f8fafc",borderRadius:6,padding:"2px 6px"}}>
                        {mesNames[m-1]}: <span style={{color:v.notasMes[i]!==null?colorN(v.notasMes[i]):"#94a3b8",fontWeight:700}}>{v.notasMes[i]!==null?fmtN(v.notasMes[i]):"—"}</span>
                        <span style={{color:"#cbd5e1"}}> ×{pesos[i]*100}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <NotaBadge nota={v.notaTrim} size={18}/>
              </div>
              );
            })}
          </>
        )}
        {sinDatos.length>0&&(
          <div style={{marginTop:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Sin datos aún</div>
            {sinDatos.map(v=>(
              <div key={v.id} style={{...S.card,padding:"10px 14px",opacity:0.5,display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontWeight:700,fontSize:13,color:"#94a3b8"}}>{v.nombre}</div>
                <BadgeCiudad ciudad={v.ciudad}/>
              </div>
            ))}
          </div>
        )}
        {soloMensuales.length>0&&(
          <div style={{marginTop:12}}>
            <div style={{fontSize:11,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Solo ranking mensual</div>
            {soloMensuales.map(v=>(
              <div key={v.id} style={{...S.card,padding:"10px 14px",borderLeft:"3px solid #e2e8f0"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#475569"}}>{v.nombre}</div>
                  <BadgeCiudad ciudad={v.ciudad}/>
                </div>
                <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>Ingresó {v.fechaIngreso} · No participa en el premio trimestral</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function PantallaAdmin(){
    const [adminOk,setAdminOk]=useState(false);
    const [nuevoNombre,setNuevoNombre]=useState("");
    const [nuevaCiudad,setNuevaCiudad]=useState("BOG");
    const [confirmarBaja,setConfirmarBaja]=useState(null);
    const [confirmarEliminar,setConfirmarEliminar]=useState(null);
    const [msg,setMsg]=useState("");
    const [modalTexto,setModalTexto]=useState(null);
    const [importTexto,setImportTexto]=useState("");
    function flash(txt){setMsg(txt);setTimeout(()=>setMsg(""),2500);}
    function agregar(){
      if(!nuevoNombre.trim())return;
      const nuevas=[...vendedoras,{id:Date.now(),nombre:nuevoNombre.trim(),ciudad:nuevaCiudad,activa:true,fechaIngreso:hoyStr()}];
      saveVends(nuevas);setNuevoNombre("");flash("✅ "+nuevoNombre.trim()+" agregada");
    }
    function cambiarCiudad(id){saveVends(vendedoras.map(v=>v.id===id?{...v,ciudad:v.ciudad==="BOG"?"MED":"BOG"}:v));flash("✅ Ciudad actualizada");}
    function darDeBaja(id){saveVends(vendedoras.map(v=>v.id===id?{...v,activa:false}:v));setConfirmarBaja(null);flash("⬇️ Dada de baja");}
    function reactivar(id){saveVends(vendedoras.map(v=>v.id===id?{...v,activa:true}:v));flash("✅ Reactivada");}
    function eliminarDefinitivo(id){
      saveVends(vendedoras.filter(v=>v.id!==id));
      const nr={};Object.entries(registros).forEach(([k,v])=>{if(!k.startsWith(id+"_"))nr[k]=v;});
      saveRegs(nr);setConfirmarEliminar(null);flash("🗑️ Eliminada");
    }
    function exportarJSON(){
      const data={vendedoras,registros,metas,fecha:new Date().toISOString()};
      setModalTexto({titulo:"📋 Backup JSON",texto:JSON.stringify(data,null,2),modo:"json"});
    }
    function ejecutarImport(){
      try{
        const data=JSON.parse(importTexto);
        if(data.vendedoras)saveVends(data.vendedoras);
        if(data.registros)saveRegs(data.registros);
        if(data.metas)saveMetas(data.metas);
        // Forzar escritura adicional para anclar el storage
        setTimeout(()=>{
          if(data.vendedoras)saveVends(data.vendedoras);
          if(data.registros)saveRegs(data.registros);
          if(data.metas)saveMetas(data.metas);
        },1000);
        setModalTexto(null);setImportTexto("");flash("✅ Backup restaurado");
      }catch(_){flash("❌ JSON inválido");}
    }
    if(!adminOk) return <PantallaClave emoji="⚙️" titulo="Administrador" clave={CLAVE_ADMIN} onOk={()=>setAdminOk(true)}/>;
    const act=vendedoras.filter(v=>v.activa!==false);
    const inact=vendedoras.filter(v=>v.activa===false);
    return(
      <div style={S.body}>
        <div style={S.tit}>⚙️ Administrador</div>
        {msg&&<div style={{background:"#d1fae5",border:"1px solid #6ee7b7",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,fontWeight:700,color:"#065f46"}}>{msg}</div>}
        {modalTexto&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:540,maxHeight:"85vh",display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontWeight:800,fontSize:15,color:"#ea580c"}}>{modalTexto.titulo}</div>
              {modalTexto.modo!=="importar"?(
                <>
                  <textarea readOnly value={modalTexto.texto} onClick={e=>e.target.select()}
                    style={{flex:1,minHeight:260,maxHeight:380,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:10,fontSize:11,fontFamily:"monospace",resize:"none",color:"#0f172a"}}/>
                  <div style={{fontSize:11,color:"#475569"}}>👆 Toca el texto y Cmd+A para seleccionar, luego Cmd+C.</div>
                  <div style={{display:"flex",gap:8}}>
                    <button style={{flex:1,...S.btnP}} onClick={()=>{const ta=document.querySelector("textarea");if(ta){ta.select();document.execCommand("copy");}flash("✅ Copiado");setModalTexto(null);}}>📋 Copiar todo</button>
                    <button style={{...S.btnS,padding:"12px 16px"}} onClick={()=>setModalTexto(null)}>Cerrar</button>
                  </div>
                </>
              ):(
                <>
                  <textarea value={importTexto} onChange={e=>setImportTexto(e.target.value)} placeholder='{"vendedoras":[...]}'
                    style={{flex:1,minHeight:260,maxHeight:380,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:10,fontSize:16,fontFamily:"monospace",resize:"none",color:"#0f172a"}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button style={{flex:1,...S.btnP}} onClick={ejecutarImport}>⬆️ Restaurar</button>
                    <button style={{...S.btnS,padding:"12px 16px"}} onClick={()=>{setModalTexto(null);setImportTexto("");}}>Cancelar</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:800,color:"#ea580c",marginBottom:10}}>➕ Agregar vendedora</div>
          <div style={{marginBottom:8}}>
            <label style={S.lbl}>Nombre completo</label>
            <input value={nuevoNombre} onChange={e=>setNuevoNombre(e.target.value)} placeholder="Nombre y apellido" style={S.inp} onKeyDown={e=>{if(e.key==="Enter")agregar();}}/>
          </div>
          <div style={{marginBottom:10}}>
            <label style={S.lbl}>Ciudad</label>
            <div style={{display:"flex",gap:8}}>
              {["BOG","MED"].map(c=>(
                <button key={c} onClick={()=>setNuevaCiudad(c)}
                  style={{flex:1,padding:"8px 0",borderRadius:8,border:"2px solid "+(nuevaCiudad===c?COLOR_CIUDAD[c]:"#e2e8f0"),cursor:"pointer",fontWeight:800,fontSize:12,
                    background:nuevaCiudad===c?COLOR_CIUDAD[c]+"15":"#fff",color:nuevaCiudad===c?COLOR_CIUDAD[c]:"#64748b"}}>
                  {LABEL_CIUDAD[c]}
                </button>
              ))}
            </div>
          </div>
          <button style={S.btnP} onClick={agregar}>+ Agregar</button>
        </div>
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:800,color:"#ea580c",marginBottom:10}}>👥 Activas ({act.length})</div>
          {act.map(v=>(
            <div key={v.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
              <div style={{flex:1,fontWeight:700,fontSize:13}}>{v.nombre}</div>
              <button onClick={()=>cambiarCiudad(v.id)} style={{padding:"3px 10px",borderRadius:12,border:"1px solid "+COLOR_CIUDAD[v.ciudad]+"40",cursor:"pointer",fontSize:10,fontWeight:800,background:COLOR_CIUDAD[v.ciudad]+"15",color:COLOR_CIUDAD[v.ciudad]}}>{LABEL_CIUDAD[v.ciudad]}</button>
              {confirmarBaja===v.id?(
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>darDeBaja(v.id)} style={{padding:"4px 8px",borderRadius:7,border:"none",cursor:"pointer",fontSize:11,fontWeight:800,background:"#dc2626",color:"#fff"}}>¿Seguro?</button>
                  <button onClick={()=>setConfirmarBaja(null)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #e2e8f0",cursor:"pointer",fontSize:11,background:"#fff",color:"#475569"}}>No</button>
                </div>
              ):(
                <button onClick={()=>setConfirmarBaja(v.id)} style={{padding:"4px 10px",borderRadius:7,border:"1px solid #fca5a5",cursor:"pointer",fontSize:11,fontWeight:700,background:"#fff",color:"#dc2626"}}>Baja</button>
              )}
            </div>
          ))}
        </div>
        {inact.length>0&&(
          <div style={S.card}>
            <div style={{fontSize:13,fontWeight:800,color:"#94a3b8",marginBottom:10}}>💤 Inactivas ({inact.length})</div>
            {inact.map(v=>(
              <div key={v.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f1f5f9"}}>
                <div style={{flex:1,fontWeight:700,fontSize:13,textDecoration:"line-through",color:"#94a3b8"}}>{v.nombre}</div>
                <BadgeCiudad ciudad={v.ciudad}/>
                <button onClick={()=>reactivar(v.id)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #bbf7d0",cursor:"pointer",fontSize:11,fontWeight:700,background:"#fff",color:"#059669"}}>Activar</button>
                {confirmarEliminar===v.id?(
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>eliminarDefinitivo(v.id)} style={{padding:"4px 8px",borderRadius:7,border:"none",cursor:"pointer",fontSize:11,fontWeight:800,background:"#dc2626",color:"#fff"}}>¿Seguro?</button>
                    <button onClick={()=>setConfirmarEliminar(null)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #e2e8f0",cursor:"pointer",fontSize:11,background:"#fff",color:"#475569"}}>No</button>
                  </div>
                ):(
                  <button onClick={()=>setConfirmarEliminar(v.id)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #fca5a5",cursor:"pointer",fontSize:11,fontWeight:700,background:"#fff",color:"#dc2626"}}>🗑️</button>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:800,color:"#ea580c",marginBottom:10}}>💾 Copia de seguridad</div>
          <button style={{...S.btnP,marginBottom:10}} onClick={exportarJSON}>⬇️ Exportar backup (JSON)</button>
          <button style={{...S.btnP,background:"#f1f5f9",color:"#475569",boxShadow:"none"}} onClick={()=>setModalTexto({titulo:"⬆️ Importar backup",texto:"",modo:"importar"})}>⬆️ Importar backup</button>
        </div>
        <button style={{...S.btnP,background:"#f1f5f9",color:"#475569",boxShadow:"none",marginTop:4}} onClick={()=>setAdminOk(false)}>🔒 Cerrar sesión</button>
      </div>
    );
  }

  if(!cargado)return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,minHeight:"100vh",background:"#f8fafc"}}>
      <div style={{fontSize:30}}>⚡</div>
      <div style={{color:"#475569",fontSize:13}}>Cargando...</div>
    </div>
  );

  return(
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
      <div style={S.wrap}>
        {pideClave&&<ModalClave/>}
        <div style={S.hdr}>
          <div style={S.logo}>⚡ Televentas</div>
          <div style={S.nav}>
            <button style={S.navB(pantalla==="ranking"||pantalla==="boletin")} onClick={()=>setPantalla("ranking")}>📊</button>
            <button style={S.navB(pantalla==="ingreso")} onClick={()=>setPantalla("ingreso")}>✏️</button>
            <button style={S.navB(pantalla==="ventas")} onClick={()=>setPantalla("ventas")}>💰</button>
            <button style={S.navB(pantalla==="trimestre")} onClick={()=>setPantalla("trimestre")}>📈</button>
            <button style={S.navB(pantalla==="admin")} onClick={()=>setPantalla("admin")}>⚙️</button>
          </div>
        </div>
        {pantalla==="ranking"&&<PantallaRanking/>}
        {pantalla==="boletin"&&<PantallaBoletin/>}
        {pantalla==="ingreso"&&<PantallaIngreso/>}
        {pantalla==="ventas"&&<PantallaVentas/>}
        {pantalla==="trimestre"&&<PantallaTrimestre/>}
        {pantalla==="admin"&&<PantallaAdmin/>}
      </div>
    </>
  );
}