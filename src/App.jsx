import React, { useState, useEffect } from "react";

// ─── Storage ──────────────────────────────────────────────────────────────────
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  cream:    "#faf6f0", paper:    "#f5ede3", ink:      "#2e2520", inkLight: "#8a7060",
  border:   "#e8ddd4", white:    "#ffffff", sage:     "#7a9e7e", clay:     "#b8796a",
  sand:     "#c4a882", mist:     "#a8b5c8", blush:    "#c4a0b0", teal:     "#7a9ea0",
  serif:    "'Cormorant Garamond', Georgia, serif", sans: "'DM Sans', sans-serif",
};

const BUDGET_COLORS = [T.sage, T.sand, T.clay, T.mist, T.blush, T.teal, "#b5a0c4", "#a0b8b5", "#c4b5a0", "#8a9eb5"];
const WISH_CATS = ["Fashion","Beauty","Tech","Travel","Home","Wellness","Other"];

const DEFAULT_SPEND_CATS = ["Groceries","Transport","Dining","Beauty","Home","Entertainment","Clothing","Health","Travel","Other"];
const DEFAULT_BUDGET = [
  { id:1, label:"Savings",        pct:20, color:T.sage,  cats:[] },
  { id:2, label:"Home & Bills",   pct:30, color:T.sand,  cats:["Home"] },
  { id:3, label:"Transport",      pct:10, color:T.clay,  cats:["Transport"] },
  { id:4, label:"Groceries",      pct:15, color:T.mist,  cats:["Groceries"] },
  { id:5, label:"Personal & Fun", pct:15, color:T.blush, cats:["Beauty","Entertainment","Clothing","Dining"] },
  { id:6, label:"Investments",    pct:10, color:T.teal,  cats:[] },
];

const QUIZ_Q = [
  { q:"Will you use this at least once a week?", w: 3 },
  { q:"Do you already own something similar?",   w:-2 },
  { q:"Will it improve your daily life?",        w: 2 },
  { q:"Is this replacing something broken?",     w: 2 },
  { q:"Would you still want it in 3 months?",   w: 3 },
];

const fmt = n => "€" + Number(n||0).toLocaleString("en", {minimumFractionDigits:0,maximumFractionDigits:0});

function impulseScore(days, quiz) {
  const d = Math.min(days/90,1), q = quiz!=null?quiz/10:0.3;
  return Math.min((d*0.5+q*0.5)*100,100);
}
function impulseLabel(score) {
  if (score<30) return {text:"Impulse buy",   color:T.clay};
  if (score<55) return {text:"Think it over", color:"#c4a060"};
  if (score<75) return {text:"Getting there", color:"#8aab7a"};
  return              {text:"You deserve it", color:T.sage};
}

function getPayPeriods(spending, nextPayday) {
  const pd = new Date(nextPayday);
  const periods = [];
  let end = new Date(pd);
  for (let i=0; i<6; i++) {
    const start = new Date(end); start.setMonth(start.getMonth()-1);
    periods.push({start:new Date(start), end:new Date(end)});
    end = new Date(start);
  }
  return periods.map(p => ({
    label: p.start.toLocaleDateString("en-GB",{day:"numeric",month:"short"}) + " – " + p.end.toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
    start:p.start, end:p.end,
    items: spending.filter(s => { const d=new Date(s.date); return d>=p.start && d<p.end; }),
  }));
}

// ─── UI Atoms ────────────────────────────────────────────────────────────────
const Label = ({children,style}) => (
  <div style={{fontFamily:T.sans,fontSize:10,letterSpacing:2.5,textTransform:"uppercase",color:T.inkLight,marginBottom:6,...style}}>{children}</div>
);
const Field = ({label,children}) => <div style={{display:"grid",gap:0}}>{label&&<Label>{label}</Label>}{children}</div>;

function NumInput({value,onChange,style,...rest}) {
  const [local,setLocal] = useState(String(value??""));
  useEffect(()=>{setLocal(String(value??""));},[value]);
  return (
    <input {...rest} inputMode="decimal" value={local}
      onChange={e=>{
        setLocal(e.target.value);
        const n=parseFloat(e.target.value);
        if(!isNaN(n)) onChange(n);
        else if(e.target.value===""||e.target.value==="-") onChange(0);
      }}
      style={{fontFamily:T.sans,fontSize:15,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"11px 14px",background:T.cream,color:T.ink,outline:"none",width:"100%",WebkitAppearance:"none",...style}}
    />
  );
}
const TextInput = ({style,...p}) => (
  <input {...p} style={{fontFamily:T.sans,fontSize:15,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"11px 14px",background:T.cream,color:T.ink,outline:"none",width:"100%",WebkitAppearance:"none",...style}}/>
);
const Sel = ({children,style,...p}) => (
  <select {...p} style={{fontFamily:T.sans,fontSize:15,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"11px 14px",background:T.cream,color:T.ink,outline:"none",width:"100%",WebkitAppearance:"none",...style}}>
    {children}
  </select>
);
const Btn = ({variant="primary",style,children,icon,...p}) => {
  const base = {fontFamily:T.sans,fontSize:14,fontWeight:500,border:"none",borderRadius:10,padding:"12px 20px",cursor:"pointer",transition:"opacity 0.15s",WebkitTapHighlightColor:"transparent",display:"flex",alignItems:"center",justifyContent:"center",gap:8};
  const v = {
    primary:{...base,background:T.ink,color:T.cream},
    outline:{...base,background:"transparent",color:T.ink,border:`1.5px solid ${T.border}`},
    ghost:  {...base,background:"transparent",color:T.inkLight,padding:"8px 12px"},
    danger: {...base,background:"transparent",color:T.clay,border:`1.5px solid ${T.clay}`},
    sand:   {...base,background:T.paper,color:T.ink,border:`1.5px solid ${T.border}`},
  };
  return <button {...p} style={{...v[variant],...style}}>{icon&&<Icon name={icon} size={16} color={variant==="primary"?T.cream:variant==="danger"?T.clay:T.ink}/>}{children}</button>;
};
const Card = ({style,children,onClick}) => (
  <div onClick={onClick} style={{background:T.white,borderRadius:16,padding:"18px 16px",boxShadow:"0 1px 12px rgba(46,37,32,0.07)",...(onClick?{cursor:"pointer"}:{}),...style}}>{children}</div>
);
const Bar = ({pct,color=T.sand,style}) => (
  <div style={{height:6,borderRadius:100,background:T.paper,overflow:"hidden",...style}}>
    <div style={{height:"100%",width:`${Math.min(pct||0,100)}%`,background:color,borderRadius:100,transition:"width 0.7s ease"}}/>
  </div>
);
const Pill = ({children,color}) => (
  <span style={{fontFamily:T.sans,fontSize:11,fontWeight:500,letterSpacing:0.5,padding:"3px 10px",borderRadius:100,background:color+"22",color,display:"inline-block"}}>{children}</span>
);

const Icon = ({name,size=22,color="currentColor",strokeWidth=1.4}) => {
  const s={width:size,height:size,display:"block"};
  const paths={
    home:    <><path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H15v-5h-6v5H4a1 1 0 01-1-1V10.5z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round"/></>,
    spending:<><circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={strokeWidth}/><path d="M12 6v2m0 8v2M9 9.5h4.5a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3H15" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"/></>,
    budget:  <><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke={color} strokeWidth={strokeWidth}/><path d="M3 9h18M9 3v18" fill="none" stroke={color} strokeWidth={strokeWidth}/></>,
    savings: <><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"/></>,
    wishlist:<><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round"/></>,
    settings:<><circle cx="12" cy="12" r="3" fill="none" stroke={color} strokeWidth={strokeWidth}/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" fill="none" stroke={color} strokeWidth={strokeWidth}/></>,
    plus:    <><path d="M12 5v14M5 12h14" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"/></>,
    close:   <><path d="M18 6L6 18M6 6l12 12" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"/></>,
    chevron: <><path d="M9 18l6-6-6-6" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/></>,
    trash:   <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/></>,
    edit:    <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"/></>,
    repeat:  <><path d="M17 1l4 4-4 4" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/><path d="M21 13v2a4 4 0 01-4 4H3" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"/></>,
  };
  return <svg viewBox="0 0 24 24" style={s}>{paths[name]}</svg>;
};

const Backdrop = ({open,onClose}) => (
  <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(46,37,32,0.4)",zIndex:200,opacity:open?1:0,pointerEvents:open?"auto":"none",transition:"opacity 0.22s"}}/>
);
const Sheet = ({open,onClose,title,children}) => (
  <>
    <Backdrop open={open} onClose={onClose}/>
    <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:201,background:T.cream,borderRadius:"20px 20px 0 0",padding:"0 20px 44px",transform:open?"translateY(0)":"translateY(105%)",transition:"transform 0.28s cubic-bezier(0.32,0.72,0,1)",maxHeight:"88dvh",overflowY:"auto"}}>
      <div style={{width:36,height:4,background:T.border,borderRadius:100,margin:"14px auto 18px"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        {title&&<h3 style={{fontFamily:T.serif,fontStyle:"italic",fontWeight:300,fontSize:22,color:T.ink}}>{title}</h3>}
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4,marginLeft:"auto"}}>
          <Icon name="close" size={20} color={T.inkLight}/>
        </button>
      </div>
      {children}
    </div>
  </>
);
const Popup = ({open,onClose,title,children}) => (
  <>
    <Backdrop open={open} onClose={onClose}/>
    <div style={{position:"fixed",left:"50%",top:"50%",zIndex:301,transform:open?"translate(-50%,-50%) scale(1)":"translate(-50%,-50%) scale(0.96)",opacity:open?1:0,pointerEvents:open?"auto":"none",transition:"all 0.2s ease",background:T.cream,borderRadius:18,padding:"24px 20px",width:"calc(100% - 40px)",maxWidth:400}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        {title&&<h3 style={{fontFamily:T.serif,fontStyle:"italic",fontWeight:300,fontSize:22}}>{title}</h3>}
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon name="close" size={20} color={T.inkLight}/></button>
      </div>
      {children}
    </div>
  </>
);

// ─── SwipeableRow — swipe left to reveal Edit + Delete ───────────────────────
function SwipeableRow({ onEdit, onDelete, children, hintOnMount=false }) {
  const [offset, setOffset]   = useState(0);
  const [swiped, setSwiped]   = useState(false);
  const [hinted, setHinted]   = useState(false);
  const startX = React.useRef(null);
  const ACTION_W = 130;

  // Hint animation: nudge left then snap back on first transaction
  useEffect(() => {
    if (!hintOnMount || hinted) return;
    const t1 = setTimeout(() => setOffset(-48), 600);
    const t2 = setTimeout(() => setOffset(0),   1100);
    setHinted(true);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [hintOnMount]);

  function onTouchStart(e) { startX.current = e.touches[0].clientX; }
  function onTouchMove(e) {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -ACTION_W));
  }
  function onTouchEnd() {
    if (offset < -ACTION_W / 2) { setOffset(-ACTION_W); setSwiped(true); }
    else { setOffset(0); setSwiped(false); }
    startX.current = null;
  }
  function close() { setOffset(0); setSwiped(false); }

  return (
    <div style={{ position:"relative", overflow:"hidden", borderRadius:14 }}>
      <div style={{ position:"absolute", right:0, top:0, bottom:0, width:ACTION_W, display:"flex" }}>
        <button onClick={()=>{ close(); onEdit(); }} style={{ flex:1, background:T.sand, border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4 }}>
          <Icon name="edit" size={16} color={T.white}/>
          <span style={{ fontFamily:T.sans, fontSize:10, color:T.white, fontWeight:500 }}>Edit</span>
        </button>
        <button onClick={()=>{ close(); onDelete(); }} style={{ flex:1, background:T.clay, border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4, borderRadius:"0 14px 14px 0" }}>
          <Icon name="trash" size={16} color={T.white}/>
          <span style={{ fontFamily:T.sans, fontSize:10, color:T.white, fontWeight:500 }}>Delete</span>
        </button>
      </div>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={swiped ? close : undefined}
        style={{ transform:`translateX(${offset}px)`, transition:startX.current?'none':'transform 0.35s ease', position:"relative", zIndex:1 }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── EmptyState — guides new users ───────────────────────────────────────────
function EmptyState({ emoji, title, subtitle, action, onAction }) {
  return (
    <div style={{ textAlign:"center", padding:"48px 20px", display:"grid", gap:12 }}>
      <div style={{ fontSize:40 }}>{emoji}</div>
      <div style={{ fontFamily:T.serif, fontStyle:"italic", fontSize:20, color:T.ink }}>{title}</div>
      <div style={{ fontFamily:T.sans, fontSize:13, color:T.inkLight, lineHeight:1.6 }}>{subtitle}</div>
      {action && <Btn variant="primary" style={{ margin:"8px auto 0" }} icon="plus" onClick={onAction}>{action}</Btn>}
    </div>
  );
}

// ─── Toast — brief save confirmation ─────────────────────────────────────────
function Toast({ message, visible }) {
  return (
    <div style={{
      position:"fixed", bottom:90, left:"50%", transform:`translateX(-50%) translateY(${visible?0:16}px)`,
      opacity:visible?1:0, transition:"all 0.25s ease", zIndex:500, pointerEvents:"none",
      background:T.ink, color:T.cream, borderRadius:100, padding:"10px 20px",
      fontFamily:T.sans, fontSize:13, fontWeight:500, whiteSpace:"nowrap",
      boxShadow:"0 4px 20px rgba(46,37,32,0.25)", display:"flex", alignItems:"center", gap:8,
    }}>
      <span style={{color:T.sage}}>✓</span> {message}
    </div>
  );
}

export default function MeFirst() {
  const [tab,   setTab]   = useState("home");
  const [ready, setReady] = useState(false);

  const [monthlyPay,   setMonthlyPay]   = useState(3200);
  const [monthlyHours, setMonthlyHours] = useState(160);
  const [nextPayday,   setNextPayday]   = useState("2026-03-01");
  const hourlyRate = monthlyHours>0 ? monthlyPay/monthlyHours : 0;

  const [spendCats, setSpendCats] = useState(DEFAULT_SPEND_CATS);
  const [goals,     setGoals]     = useState([{id:1,name:"Emergency Fund",target:3000,current:640},{id:2,name:"Paris Trip ✈️",target:800,current:120}]);
  const [wishlist,  setWishlist]  = useState([{id:1,name:"Loewe Puzzle Bag",price:1850,daysWanted:45,category:"Fashion",quizScore:null},{id:2,name:"Dyson Airwrap",price:530,daysWanted:12,category:"Beauty",quizScore:null}]);
  const [spending,  setSpending]  = useState([
    {id:1,category:"Groceries",    amount:180,date:"2026-02-01",recurring:false},
    {id:2,category:"Transport",    amount:65, date:"2026-02-03",recurring:false},
    {id:3,category:"Dining",       amount:95, date:"2026-02-07",recurring:false},
    {id:4,category:"Beauty",       amount:45, date:"2026-02-10",recurring:false},
    {id:5,category:"Home",         amount:120,date:"2026-02-14",recurring:false},
    {id:6,category:"Entertainment",amount:30, date:"2026-02-17",recurring:false},
    {id:7,category:"Clothing",     amount:210,date:"2026-02-20",recurring:false},
  ]);
  const [recurring,  setRecurring]  = useState([]);
  const [budget,     setBudget]     = useState(DEFAULT_BUDGET);

  // UI state
  const [sheet,        setSheet]        = useState(null);
  const [quizItem,     setQuizItem]     = useState(null);
  const [quizAns,      setQuizAns]      = useState({});
  const [editGoal,     setEditGoal]     = useState(null);
  const [editSpend,    setEditSpend]    = useState(null);
  const [editRecurr,   setEditRecurr]   = useState(null);
  const [editBudgetLine,setEditBudgetLine]=useState(null);
  const [periodIdx,    setPeriodIdx]    = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [newCatName,   setNewCatName]   = useState("");
  const [toast,        setToast]        = useState({visible:false,message:""});

  function showToast(msg) {
    setToast({visible:true,message:msg});
    setTimeout(()=>setToast(t=>({...t,visible:false})),2000);
  }

  // form drafts
  const today = new Date().toISOString().split("T")[0];
  const [draftSpend,   setDraftSpend]   = useState({category:"Groceries",amount:"",date:today,recurring:false});
  const [draftWish,    setDraftWish]    = useState({name:"",price:"",category:"Fashion"});
  const [draftGoal,    setDraftGoal]    = useState({name:"",target:"",current:""});
  const [draftRecurr,  setDraftRecurr]  = useState({name:"",category:"Groceries",amount:"",dayOfMonth:1});

  // ── Persistence ──
  useEffect(()=>{
    setMonthlyPay(  load("mf:pay",      3200));
    setMonthlyHours(load("mf:hours",    160));
    setNextPayday(  load("mf:payday",   "2026-03-01"));
    setSpendCats(   load("mf:spendcats",DEFAULT_SPEND_CATS));
    setGoals(       load("mf:goals",    goals));
    setWishlist(    load("mf:wishlist", wishlist));
    setSpending(    load("mf:spending", spending));
    setRecurring(   load("mf:recurring",[]));
    setBudget(      load("mf:budget",   DEFAULT_BUDGET));
    setReady(true);
  },[]);

  useEffect(()=>{ if(ready) save("mf:pay",      monthlyPay);  },[monthlyPay,  ready]);
  useEffect(()=>{ if(ready) save("mf:hours",    monthlyHours);},[monthlyHours,ready]);
  useEffect(()=>{ if(ready) save("mf:payday",   nextPayday);  },[nextPayday,  ready]);
  useEffect(()=>{ if(ready) save("mf:spendcats",spendCats);   },[spendCats,  ready]);
  useEffect(()=>{ if(ready) save("mf:goals",    goals);       },[goals,      ready]);
  useEffect(()=>{ if(ready) save("mf:wishlist", wishlist);    },[wishlist,   ready]);
  useEffect(()=>{ if(ready) save("mf:spending", spending);    },[spending,   ready]);
  useEffect(()=>{ if(ready) save("mf:recurring",recurring);   },[recurring,  ready]);
  useEffect(()=>{ if(ready) save("mf:budget",   budget);      },[budget,     ready]);

  // ── Computed ──
  const payday      = new Date(nextPayday);
  const daysLeft    = Math.max(Math.ceil((payday-new Date())/86400000),0);
  const periods     = getPayPeriods(spending, nextPayday);
  const curPeriod   = periods[periodIdx]||{items:spending,label:"All time"};
  const periodSpend = curPeriod.items.reduce((a,b)=>a+b.amount,0);
  const remaining   = monthlyPay - periodSpend;
  const spentByCat  = curPeriod.items.reduce((acc,s)=>{acc[s.category]=(acc[s.category]||0)+s.amount;return acc;},{});
  const maxCat      = Math.max(...Object.values(spentByCat),1);

  // ── Actions ──
  function addSpend() {
    if (!draftSpend.amount) return;
    setSpending(s=>[...s,{id:Date.now(),...draftSpend,amount:parseFloat(draftSpend.amount)}]);
    setDraftSpend({category:spendCats[0]||"Other",amount:"",date:today,recurring:false});
    setSheet(null); showToast("Expense saved");
  }
  function saveSpend() {
    setSpending(s=>s.map(x=>x.id===editSpend.id?editSpend:x));
    setEditSpend(null); setSheet(null); showToast("Expense updated");
  }
  function addWish() {
    if (!draftWish.name||!draftWish.price) return;
    setWishlist(w=>[...w,{id:Date.now(),...draftWish,price:parseFloat(draftWish.price),daysWanted:0,quizScore:null}]);
    setDraftWish({name:"",price:"",category:"Fashion"}); setSheet(null); showToast("Added to wishlist");
  }
  function addGoal() {
    if (!draftGoal.name||!draftGoal.target) return;
    setGoals(g=>[...g,{id:Date.now(),name:draftGoal.name,target:parseFloat(draftGoal.target),current:parseFloat(draftGoal.current)||0}]);
    setDraftGoal({name:"",target:"",current:""}); setSheet(null); showToast("Goal created");
  }
  function saveGoal() { setGoals(g=>g.map(x=>x.id===editGoal.id?editGoal:x)); setEditGoal(null); setSheet(null); showToast("Goal updated"); }
  function deleteGoal() { setGoals(g=>g.filter(x=>x.id!==editGoal.id)); setEditGoal(null); setSheet(null); showToast("Goal deleted"); }

  function addRecurring() {
    if (!draftRecurr.name||!draftRecurr.amount) return;
    setRecurring(r=>[...r,{id:Date.now(),...draftRecurr,amount:parseFloat(draftRecurr.amount)}]);
    setDraftRecurr({name:"",category:spendCats[0]||"Other",amount:"",dayOfMonth:1}); setSheet(null); showToast("Recurring expense added");
  }
  function saveRecurring() { setRecurring(r=>r.map(x=>x.id===editRecurr.id?editRecurr:x)); setEditRecurr(null); setSheet(null); showToast("Recurring updated"); }
  function deleteRecurring() { setRecurring(r=>r.filter(x=>x.id!==editRecurr.id)); setEditRecurr(null); setSheet(null); showToast("Recurring deleted"); }

  function addSpendCat() {
    if (!newCatName.trim()||spendCats.includes(newCatName.trim())) return;
    setSpendCats(c=>[...c,newCatName.trim()]); setNewCatName("");
  }
  function removeSpendCat(cat) { setSpendCats(c=>c.filter(x=>x!==cat)); }

  function submitQuiz() {
    let score=5;
    QUIZ_Q.forEach((q,i)=>{ if(quizAns[i]==="yes") score+=q.w; });
    const norm=Math.max(0,Math.min(score,10));
    setWishlist(w=>w.map(x=>x.id===quizItem.id?{...x,quizScore:norm}:x));
    setQuizItem(null); setQuizAns({});
  }

  function clearAllData() {
    setGoals([]); setWishlist([]); setSpending([]); setRecurring([]);
    setBudget(DEFAULT_BUDGET); setSpendCats(DEFAULT_SPEND_CATS);
    setMonthlyPay(0); setMonthlyHours(160);
    setNextPayday(new Date(Date.now()+14*86400000).toISOString().split("T")[0]);
    ["mf:goals","mf:wishlist","mf:spending","mf:recurring","mf:budget","mf:pay","mf:hours","mf:payday","mf:spendcats"].forEach(k=>{
      try{localStorage.removeItem(k);}catch{}
    });
    setConfirmClear(false); setSheet(null);
  }

  if (!ready) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",fontFamily:T.serif,fontSize:22,fontStyle:"italic",color:T.inkLight,background:T.cream}}>
      loading your world…
    </div>
  );

  const TABS = [
    {id:"spending",label:"Spending",icon:"spending"},
    {id:"budget",  label:"Budget",  icon:"budget"  },
    {id:"home",    label:"Home",    icon:"home"     },
    {id:"savings", label:"Savings", icon:"savings"  },
    {id:"wishlist",label:"Wishlist",icon:"wishlist" },
  ];

  return (
    <div style={{fontFamily:T.serif,background:T.cream,minHeight:"100dvh",paddingBottom:72,color:T.ink}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{display:none;}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        button:active{opacity:0.7;}
      `}</style>

      {/* Header */}
      <div style={{background:T.ink,color:T.cream,padding:"44px 20px 14px",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",maxWidth:480,margin:"0 auto"}}>
          <div>
            <div style={{fontSize:22,fontWeight:300,fontStyle:"italic",letterSpacing:1}}>me, first.</div>
            <div style={{fontFamily:T.sans,fontSize:9,letterSpacing:3,opacity:0.45,textTransform:"uppercase"}}>your money, your rules</div>
          </div>
          <button onClick={()=>setSheet("settings")} style={{background:"none",border:`1px solid rgba(255,255,255,0.2)`,borderRadius:10,width:38,height:38,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="settings" size={18} color={T.cream} strokeWidth={1.3}/>
          </button>
        </div>
      </div>

      <div style={{padding:"20px 16px",maxWidth:480,margin:"0 auto"}}>

        {/* ════ HOME ════ */}
        {tab==="home" && (
          <div style={{display:"grid",gap:12}}>
            <Card style={{background:T.ink,color:T.cream}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <Label style={{color:"rgba(250,246,240,0.4)"}}>Next payday</Label>
                  <div style={{fontSize:52,fontWeight:300,lineHeight:1,fontFamily:T.serif}}>{daysLeft}</div>
                  <div style={{fontStyle:"italic",fontSize:16,opacity:0.55,marginTop:2}}>days to go</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:T.sans,fontSize:12,opacity:0.4}}>{payday.toLocaleDateString("en-GB",{day:"numeric",month:"long"})}</div>
                  <div style={{marginTop:6,fontFamily:T.sans,fontSize:13}}>
                    <span style={{opacity:0.45}}>left to spend </span>
                    <span style={{color:remaining>=0?"#8EB9FF":"#902124",fontWeight:500}}>{fmt(remaining)}</span>
                  </div>
                  <div style={{marginTop:4,fontFamily:T.sans,fontSize:11,opacity:0.35}}>
                    if you save €15/day<br/>
                    <span style={{color:"#8EB9FF"}}>+{fmt(15*daysLeft)} by payday</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Recurring summary */}
            {recurring.length>0 && (
              <>
                <div style={{fontStyle:"italic",fontSize:18,marginTop:4}}>Recurring this month</div>
                <Card style={{background:T.paper,padding:"12px 16px"}}>
                  {recurring.map(r=>(
                    <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontFamily:T.sans,fontSize:13}}>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <Icon name="repeat" size={14} color={T.inkLight}/>
                        <span>{r.name}</span>
                        <span style={{fontSize:11,color:T.inkLight}}>day {r.dayOfMonth}</span>
                      </div>
                      <span style={{fontWeight:500,color:T.clay}}>{fmt(r.amount)}</span>
                    </div>
                  ))}
                  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8,marginTop:4,display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13}}>
                    <span style={{color:T.inkLight}}>Total recurring</span>
                    <span style={{fontWeight:600}}>{fmt(recurring.reduce((a,r)=>a+r.amount,0))}</span>
                  </div>
                </Card>
              </>
            )}

            {/* Welcome state — brand new user */}
            {spending.length===0 && goals.length===0 && (
              <Card style={{background:T.paper}}>
                <div style={{fontFamily:T.sans,fontSize:13,color:T.inkLight,lineHeight:1.7}}>
                  <strong style={{fontFamily:T.serif,fontStyle:"italic",fontSize:16,color:T.ink,display:"block",marginBottom:6}}>Welcome to me, first.</strong>
                  Here's how to get started:<br/>
                  <span style={{display:"block",marginTop:6}}>① Tap <strong>⚙ Settings</strong> — add your income, hours and payday</span>
                  <span style={{display:"block",marginTop:4}}>② Go to <strong>Savings</strong> — create your first goal</span>
                  <span style={{display:"block",marginTop:4}}>③ Go to <strong>Spending</strong> — log your first expense</span>
                </div>
              </Card>
            )}

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
              <div style={{fontStyle:"italic",fontSize:18}}>This Period</div>
              <span style={{fontFamily:T.sans,fontSize:18,fontWeight:500,color:T.clay}}>{fmt(periodSpend)}</span>
            </div>
            <Card>
              {Object.entries(spentByCat).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([cat,amt])=>(
                <div key={cat} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13,marginBottom:5}}>
                    <span style={{color:T.inkLight}}>{cat}</span><span style={{fontWeight:500}}>{fmt(amt)}</span>
                  </div>
                  <Bar pct={amt/maxCat*100}/>
                </div>
              ))}
              <Btn variant="outline" style={{width:"100%",marginTop:6}} onClick={()=>setTab("spending")}>View full spending log</Btn>
            </Card>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
              <div style={{fontStyle:"italic",fontSize:18}}>Savings</div>
              <button onClick={()=>setTab("savings")} style={{background:"none",border:"none",cursor:"pointer",fontFamily:T.sans,fontSize:12,color:T.inkLight}}>See all</button>
            </div>
            {goals.slice(0,2).map(g=>{
              const pct=Math.min(g.current/g.target*100,100);
              return (
                <Card key={g.id}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontStyle:"italic",fontSize:16}}>{g.name}</div>
                    <div style={{fontFamily:T.sans,fontSize:12,color:T.sage,fontWeight:500}}>{Math.round(pct)}%</div>
                  </div>
                  <Bar pct={pct} color={T.sage} style={{marginBottom:6}}/>
                  <div style={{display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:12}}>
                    <span style={{color:T.sage,fontWeight:500}}>{fmt(g.current)}</span>
                    <span style={{color:T.inkLight}}>{fmt(g.target)}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ════ SPENDING ════ */}
        {tab==="spending" && (
          <div style={{display:"grid",gap:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 style={{fontStyle:"italic",fontWeight:300,fontSize:26}}>Spending</h2>
              <Btn variant="primary" icon="plus" onClick={()=>setSheet("addSpend")}>Add</Btn>
            </div>

            {/* Period selector */}
            <Card style={{background:T.paper,padding:"12px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                <button onClick={()=>setPeriodIdx(i=>Math.min(i+1,periods.length-1))} style={{background:"none",border:"none",cursor:"pointer",padding:6,opacity:periodIdx>=periods.length-1?0.3:1}}>
                  <Icon name="chevron" size={18} color={T.ink} strokeWidth={1.5} style={{transform:"rotate(180deg)"}}/>
                </button>
                <div style={{textAlign:"center"}}>
                  <div style={{fontFamily:T.sans,fontSize:12,color:T.inkLight}}>{curPeriod.label}</div>
                  <div style={{fontSize:24,fontWeight:300,fontStyle:"italic"}}>{fmt(periodSpend)}</div>
                </div>
                <button onClick={()=>setPeriodIdx(i=>Math.max(i-1,0))} style={{background:"none",border:"none",cursor:"pointer",padding:6,opacity:periodIdx<=0?0.3:1}}>
                  <Icon name="chevron" size={18} color={T.ink} strokeWidth={1.5}/>
                </button>
              </div>
              <Bar pct={periodSpend/monthlyPay*100} color={periodSpend>monthlyPay?T.clay:T.sand} style={{marginTop:8}}/>
              <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,textAlign:"center",marginTop:5}}>
                {remaining>=0?`${fmt(remaining)} remaining of ${fmt(monthlyPay)}`:`${fmt(Math.abs(remaining))} over budget`}
              </div>
            </Card>

            {/* Recurring — visible in main flow */}
            {recurring.length>0 && (
              <Card style={{background:T.paper,padding:"14px 16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <Icon name="repeat" size={16} color={T.inkLight}/>
                    <Label style={{marginBottom:0}}>Recurring this month</Label>
                  </div>
                  <button onClick={()=>setSheet("settings")} style={{background:"none",border:"none",cursor:"pointer",fontFamily:T.sans,fontSize:11,color:T.inkLight}}>Manage</button>
                </div>
                {recurring.map(r=>(
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontFamily:T.sans,fontSize:13}}>{r.name}
                      <span style={{fontSize:11,color:T.inkLight,marginLeft:6}}>· day {r.dayOfMonth}</span>
                    </div>
                    <span style={{fontFamily:T.sans,fontSize:13,fontWeight:500,color:T.clay}}>{fmt(r.amount)}</span>
                  </div>
                ))}
                <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8,marginTop:4,display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13}}>
                  <span style={{color:T.inkLight}}>Monthly total</span>
                  <span style={{fontWeight:600}}>{fmt(recurring.reduce((a,r)=>a+r.amount,0))}</span>
                </div>
              </Card>
            )}

            {/* Add first recurring nudge — only when no recurring yet */}
            {recurring.length===0 && spending.length>0 && (
              <button onClick={()=>setSheet("settings")} style={{background:"none",border:`1.5px dashed ${T.border}`,borderRadius:14,padding:"12px 16px",cursor:"pointer",display:"flex",gap:10,alignItems:"center",width:"100%"}}>
                <Icon name="repeat" size={16} color={T.inkLight}/>
                <span style={{fontFamily:T.sans,fontSize:13,color:T.inkLight}}>Add recurring expenses like rent or subscriptions</span>
                <Icon name="chevron" size={16} color={T.inkLight} style={{marginLeft:"auto"}}/>
              </button>
            )}

            {/* Category breakdown */}
            {Object.entries(spentByCat).length>0 && (
              <Card>
                <Label>By category</Label>
                {Object.entries(spentByCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
                  <div key={cat} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13,marginBottom:4}}>
                      <span style={{color:T.inkLight}}>{cat}</span><span style={{fontWeight:500}}>{fmt(amt)}</span>
                    </div>
                    <Bar pct={amt/maxCat*100}/>
                  </div>
                ))}
              </Card>
            )}

            {/* Transactions — swipe left to edit/delete */}
            {curPeriod.items.length>0 && (
              <>
                <div style={{fontStyle:"italic",fontSize:16,opacity:0.6,marginTop:4}}>Transactions</div>
                {[...curPeriod.items].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((s,idx)=>(
                  <SwipeableRow key={s.id}
                    hintOnMount={idx===0}
                    onEdit={()=>{setEditSpend({...s});setSheet("editSpend");}}
                    onDelete={()=>setSpending(sp=>sp.filter(x=>x.id!==s.id))}
                  >
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:T.white,padding:"12px 14px",boxShadow:`0 1px 8px rgba(46,37,32,0.06)`}}>
                      <div style={{display:"flex",gap:12,alignItems:"center",flex:1}}>
                        <div style={{background:T.paper,borderRadius:10,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.sans,fontSize:10,color:T.inkLight,fontWeight:500,textAlign:"center",lineHeight:1.2,padding:4,flexShrink:0}}>
                          {s.category.slice(0,5)}
                        </div>
                        <div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <div style={{fontFamily:T.sans,fontSize:14,fontWeight:500}}>{s.category}</div>
                            {s.recurring&&<Icon name="repeat" size={12} color={T.inkLight}/>}
                          </div>
                          <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight}}>
                            {new Date(s.date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
                          </div>
                        </div>
                      </div>
                      <div style={{fontFamily:T.sans,fontSize:15,fontWeight:500,color:T.clay}}>{fmt(s.amount)}</div>
                    </div>
                  </SwipeableRow>
                ))}
              </>
            )}

            {/* Empty state */}
            {curPeriod.items.length===0 && spending.length===0 && (
              <EmptyState
                emoji="💸"
                title="No expenses yet"
                subtitle={"Log your first expense to start tracking.\nEven a coffee counts."}
                action="Log first expense"
                onAction={()=>setSheet("addSpend")}
              />
            )}
            {curPeriod.items.length===0 && spending.length>0 && (
              <Card style={{textAlign:"center",padding:32}}>
                <div style={{fontStyle:"italic",fontSize:16,opacity:0.4,marginBottom:8}}>Nothing logged this period</div>
                <Btn variant="outline" style={{margin:"0 auto"}} icon="plus" onClick={()=>setSheet("addSpend")}>Add expense</Btn>
              </Card>
            )}
          </div>
        )}

        {/* ════ SAVINGS ════ */}
        {tab==="savings" && (
          <div style={{display:"grid",gap:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 style={{fontStyle:"italic",fontWeight:300,fontSize:26}}>Savings Goals</h2>
              <Btn variant="primary" icon="plus" onClick={()=>setSheet("addGoal")}>Add</Btn>
            </div>
            {goals.length>0 && (() => {
              const totalSaved  = goals.reduce((a,g)=>a+g.current,0);
              const totalTarget = goals.reduce((a,g)=>a+g.target,0);
              const overallPct  = totalTarget>0 ? Math.min(totalSaved/totalTarget*100,100) : 0;
              return (
                <Card style={{background:T.ink,color:T.cream}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:12}}>
                    <div>
                      <Label style={{color:"rgba(250,246,240,0.4)"}}>Total saved</Label>
                      <div style={{fontSize:28,fontWeight:300,fontStyle:"italic",color:T.sage}}>{fmt(totalSaved)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <Label style={{color:"rgba(250,246,240,0.4)"}}>Target</Label>
                      <div style={{fontSize:18,fontWeight:300,fontStyle:"italic",opacity:0.6}}>{fmt(totalTarget)}</div>
                    </div>
                  </div>
                  <div style={{height:8,borderRadius:100,background:"rgba(255,255,255,0.15)",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${overallPct}%`,background:T.sage,borderRadius:100,transition:"width 0.8s ease"}}/>
                  </div>
                  <div style={{fontFamily:T.sans,fontSize:11,opacity:0.4,marginTop:6,textAlign:"right"}}>{Math.round(overallPct)}% of all goals</div>
                </Card>
              );
            })()}
            {goals.length===0&&(
              <EmptyState
                emoji="🌱"
                title="No goals yet"
                subtitle="What are you saving towards? A trip, an emergency fund, something you've been dreaming of?"
                action="Create first goal"
                onAction={()=>setSheet("addGoal")}
              />
            )}
            {goals.map(g=>{
              const pct=Math.min(g.current/g.target*100,100);
              const daysTo=g.current>=g.target?0:Math.ceil((g.target-g.current)/15);
              return (
                <Card key={g.id} onClick={()=>{setEditGoal({...g});setSheet("editGoal");}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div style={{fontStyle:"italic",fontSize:20}}>{g.name}</div>
                    <Icon name="chevron" size={18} color={T.inkLight}/>
                  </div>
                  <Bar pct={pct} color={T.sage} style={{marginBottom:8}}/>
                  <div style={{display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13}}>
                    <span style={{color:T.sage,fontWeight:500}}>{fmt(g.current)}</span>
                    <span style={{color:T.inkLight}}>{fmt(g.target)}</span>
                  </div>
                  <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,marginTop:5}}>
                    {daysTo===0?"🎉 Goal reached!":`~${daysTo} days at €15/day`}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ════ WISHLIST ════ */}
        {tab==="wishlist" && (
          <div style={{display:"grid",gap:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 style={{fontStyle:"italic",fontWeight:300,fontSize:26}}>Wishlist</h2>
              <Btn variant="primary" icon="plus" onClick={()=>setSheet("addWish")}>Add</Btn>
            </div>
            <Card style={{background:T.paper,padding:"12px 16px"}}>
              <div style={{fontFamily:T.sans,fontSize:13,color:T.inkLight}}>
                Your hourly rate: <strong style={{color:T.ink}}>€{hourlyRate.toFixed(2)}</strong>
                <span style={{fontSize:11,opacity:0.6}}> · {fmt(monthlyPay)} / {monthlyHours}h</span>
              </div>
            </Card>
            {wishlist.length===0&&(
              <EmptyState
                emoji="✨"
                title="Your wishlist is empty"
                subtitle="Add things you're tempted to buy. The impulse quiz will tell you if you really need it — or if you're just having a moment."
                action="Add first item"
                onAction={()=>setSheet("addWish")}
              />
            )}
            {wishlist.map(item=>{
              const score=impulseScore(item.daysWanted,item.quizScore);
              const {text,color}=impulseLabel(score);
              const hours=(item.price/hourlyRate).toFixed(1);
              return (
                <Card key={item.id}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontFamily:T.sans,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:T.inkLight,marginBottom:4}}>{item.category}</div>
                      <div style={{fontStyle:"italic",fontSize:20,marginBottom:6}}>{item.name}</div>
                    </div>
                    <button onClick={()=>setWishlist(w=>w.filter(x=>x.id!==item.id))} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.3,flexShrink:0}}>
                      <Icon name="trash" size={16} color={T.ink}/>
                    </button>
                  </div>
                  <div style={{display:"flex",gap:16,fontFamily:T.sans,fontSize:13,color:T.inkLight,marginBottom:14}}>
                    <span style={{color:T.ink,fontWeight:500,fontSize:15}}>{fmt(item.price)}</span>
                    <span>⏱ {hours}h work</span>
                    <span>🗓 {item.daysWanted}d wanted</span>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:10,color:T.inkLight,marginBottom:6}}>
                      <span>Impulse</span><Pill color={color}>{text}</Pill><span>Go for it</span>
                    </div>
                    <div style={{height:8,borderRadius:100,background:`linear-gradient(to right,#902124,#C2858C,#8EB9FF,#4D0011)`,position:"relative"}}>
                      <div style={{position:"absolute",top:-5,left:`${score}%`,transform:"translateX(-50%)",width:18,height:18,borderRadius:"50%",background:T.white,border:`2.5px solid ${T.ink}`,boxShadow:"0 2px 6px rgba(0,0,0,0.18)",transition:"left 0.7s ease"}}/>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label="Days wanted">
                      <NumInput value={item.daysWanted} onChange={v=>setWishlist(w=>w.map(x=>x.id===item.id?{...x,daysWanted:Math.round(v)}:x))}/>
                    </Field>
                    <div style={{display:"flex",alignItems:"flex-end"}}>
                      <Btn variant="outline" style={{width:"100%",fontSize:13}} onClick={()=>{setQuizItem(item);setQuizAns({});}}>
                        {item.quizScore!=null?"Retake quiz":"Take quiz"}
                      </Btn>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* ════ BUDGET ════ */}
        {tab==="budget" && (
          <div style={{display:"grid",gap:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 style={{fontStyle:"italic",fontWeight:300,fontSize:26}}>Budget Plan</h2>
              <Btn variant="ghost" onClick={()=>setSheet("editBudget")}>Edit %</Btn>
            </div>
            <Card style={{background:T.ink,color:T.cream}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                <div>
                  <Label style={{color:"rgba(250,246,240,0.4)"}}>Monthly income</Label>
                  <div style={{fontSize:28,fontWeight:300,fontStyle:"italic"}}>{fmt(monthlyPay)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <Label style={{color:"rgba(250,246,240,0.4)"}}>Period spent</Label>
                  <div style={{fontSize:28,fontWeight:300,fontStyle:"italic",color:periodSpend>monthlyPay?"#902124":"#8EB9FF"}}>{fmt(periodSpend)}</div>
                </div>
              </div>
              <div style={{fontFamily:T.sans,fontSize:10,opacity:0.3,marginTop:8}}>{curPeriod.label||"current period"}</div>
            </Card>

            <Card style={{padding:"14px 16px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 72px 72px 20px",gap:8,marginBottom:10,paddingBottom:8,borderBottom:`1px solid ${T.border}`}}>
                <div style={{fontFamily:T.sans,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:T.inkLight}}>Category</div>
                <div style={{fontFamily:T.sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:T.inkLight,textAlign:"right"}}>Budget</div>
                <div style={{fontFamily:T.sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:T.inkLight,textAlign:"right"}}>Actual</div>
                <div/>
              </div>
              {budget.map(b=>{
                const ideal=monthlyPay*b.pct/100;
                const actual=curPeriod.items.filter(s=>(b.cats||[]).includes(s.category)).reduce((a,x)=>a+x.amount,0);
                const over=actual>ideal;
                const pct=ideal>0?Math.min(actual/ideal*100,100):0;
                return (
                  <div key={b.id||b.label} style={{marginBottom:14}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 72px 72px 20px",gap:8,alignItems:"center",marginBottom:5}}>
                      <div style={{fontStyle:"italic",fontSize:15}}>{b.label}</div>
                      <div style={{fontFamily:T.sans,fontSize:13,color:T.inkLight,textAlign:"right"}}>{fmt(ideal)}</div>
                      <div style={{fontFamily:T.sans,fontSize:13,fontWeight:500,color:over?T.clay:actual>0?T.sage:T.inkLight,textAlign:"right"}}>{fmt(actual)}</div>
                      <div style={{fontSize:12,textAlign:"center"}}>{over?"↑":actual>0?"✓":"–"}</div>
                    </div>
                    <div style={{height:5,borderRadius:100,background:T.paper,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:over?T.clay:b.color,borderRadius:100,transition:"width 0.7s ease"}}/>
                    </div>
                  </div>
                );
              })}
            </Card>
            <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,textAlign:"center",marginTop:4}}>
              Total: {budget.reduce((a,b)=>a+b.pct,0)}%
              {budget.reduce((a,b)=>a+b.pct,0)!==100&&<span style={{color:T.clay}}> — should add up to 100%</span>}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(250,246,240,0.96)",backdropFilter:"blur(14px)",borderTop:`1px solid ${T.border}`,paddingBottom:20,paddingTop:8,zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-around",maxWidth:480,margin:"0 auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:"4px 12px",color:tab===t.id?T.ink:T.border,transition:"color 0.18s"}}>
              <Icon name={t.icon} size={22} color={tab===t.id?T.ink:T.border} strokeWidth={tab===t.id?1.6:1.2}/>
              <div style={{fontFamily:T.sans,fontSize:9,fontWeight:tab===t.id?500:400,letterSpacing:0.8,textTransform:"uppercase"}}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ══ Sheets ══ */}

      {/* Add Spend */}
      <Sheet open={sheet==="addSpend"} onClose={()=>setSheet(null)} title="Add expense">
        <div style={{display:"grid",gap:14}}>
          <Field label="Category"><Sel value={draftSpend.category} onChange={e=>setDraftSpend({...draftSpend,category:e.target.value})}>{spendCats.map(c=><option key={c}>{c}</option>)}</Sel></Field>
          <Field label="Amount (€)"><NumInput value={draftSpend.amount||""} onChange={v=>setDraftSpend({...draftSpend,amount:v})} placeholder="0"/></Field>
          <Field label="Date"><TextInput type="date" value={draftSpend.date} onChange={e=>setDraftSpend({...draftSpend,date:e.target.value})}/></Field>
          <Btn variant="primary" style={{width:"100%"}} onClick={addSpend}>Save expense</Btn>
        </div>
      </Sheet>

      {/* Edit Spend */}
      <Sheet open={sheet==="editSpend"&&!!editSpend} onClose={()=>setSheet(null)} title="Edit expense">
        {editSpend&&(
          <div style={{display:"grid",gap:14}}>
            <Field label="Category"><Sel value={editSpend.category} onChange={e=>setEditSpend({...editSpend,category:e.target.value})}>{spendCats.map(c=><option key={c}>{c}</option>)}</Sel></Field>
            <Field label="Amount (€)"><NumInput value={editSpend.amount} onChange={v=>setEditSpend({...editSpend,amount:v})}/></Field>
            <Field label="Date"><TextInput type="date" value={editSpend.date} onChange={e=>setEditSpend({...editSpend,date:e.target.value})}/></Field>
            <Btn variant="primary" style={{width:"100%"}} onClick={saveSpend}>Save changes</Btn>
            <Btn variant="danger" style={{width:"100%"}} icon="trash" onClick={()=>{setSpending(s=>s.filter(x=>x.id!==editSpend.id));setEditSpend(null);setSheet(null);}}>Delete</Btn>
          </div>
        )}
      </Sheet>

      {/* Add Wish */}
      <Sheet open={sheet==="addWish"} onClose={()=>setSheet(null)} title="Add to wishlist">
        <div style={{display:"grid",gap:14}}>
          <Field label="Item name"><TextInput placeholder="e.g. Dyson Airwrap" value={draftWish.name} onChange={e=>setDraftWish({...draftWish,name:e.target.value})}/></Field>
          <Field label="Price (€)"><NumInput value={draftWish.price||""} onChange={v=>setDraftWish({...draftWish,price:v})} placeholder="0"/></Field>
          <Field label="Category"><Sel value={draftWish.category} onChange={e=>setDraftWish({...draftWish,category:e.target.value})}>{WISH_CATS.map(c=><option key={c}>{c}</option>)}</Sel></Field>
          <Btn variant="primary" style={{width:"100%"}} onClick={addWish}>Add to wishlist</Btn>
        </div>
      </Sheet>

      {/* Add Goal */}
      <Sheet open={sheet==="addGoal"} onClose={()=>setSheet(null)} title="New savings goal">
        <div style={{display:"grid",gap:14}}>
          <Field label="Goal name"><TextInput placeholder="e.g. Dream holiday ✈️" value={draftGoal.name} onChange={e=>setDraftGoal({...draftGoal,name:e.target.value})}/></Field>
          <Field label="Target amount (€)"><NumInput value={draftGoal.target||""} onChange={v=>setDraftGoal({...draftGoal,target:v})} placeholder="0"/></Field>
          <Field label="Already saved (€)"><NumInput value={draftGoal.current||""} onChange={v=>setDraftGoal({...draftGoal,current:v})} placeholder="0"/></Field>
          <Btn variant="primary" style={{width:"100%"}} onClick={addGoal}>Create goal</Btn>
        </div>
      </Sheet>

      {/* Edit Goal */}
      <Sheet open={sheet==="editGoal"&&!!editGoal} onClose={()=>setSheet(null)} title={editGoal?.name}>
        {editGoal&&(
          <div style={{display:"grid",gap:14}}>
            <Field label="Goal name"><TextInput value={editGoal.name} onChange={e=>setEditGoal({...editGoal,name:e.target.value})}/></Field>
            <Field label="Target (€)"><NumInput value={editGoal.target} onChange={v=>setEditGoal({...editGoal,target:v})}/></Field>
            <Field label="Currently saved (€)"><NumInput value={editGoal.current} onChange={v=>setEditGoal({...editGoal,current:v})}/></Field>
            <Btn variant="primary" style={{width:"100%"}} onClick={saveGoal}>Save changes</Btn>
            <Btn variant="danger" style={{width:"100%"}} icon="trash" onClick={deleteGoal}>Delete goal</Btn>
          </div>
        )}
      </Sheet>

      {/* Settings */}
      <Sheet open={sheet==="settings"} onClose={()=>{setSheet(null);setConfirmClear(false);}} title="Settings">
        <div style={{display:"grid",gap:14}}>
          <Field label="Monthly income (€)"><NumInput value={monthlyPay} onChange={setMonthlyPay}/></Field>
          <Field label="Monthly working hours"><NumInput value={monthlyHours} onChange={setMonthlyHours} placeholder="e.g. 160"/></Field>
          <div style={{background:T.paper,borderRadius:10,padding:"10px 14px",fontFamily:T.sans,fontSize:13,color:T.inkLight}}>
            Hourly rate: <strong style={{color:T.ink}}>€{hourlyRate.toFixed(2)}</strong>
            <span style={{fontSize:11,opacity:0.6}}> (calculated automatically)</span>
          </div>
          <Field label="Next payday"><TextInput type="date" value={nextPayday} onChange={e=>setNextPayday(e.target.value)}/></Field>

          {/* Spending categories */}
          <div style={{paddingTop:8,borderTop:`1px solid ${T.border}`}}>
            <Label>Spending categories</Label>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
              {spendCats.map(cat=>(
                <div key={cat} style={{display:"flex",alignItems:"center",gap:4,background:T.paper,borderRadius:100,padding:"5px 12px"}}>
                  <span style={{fontFamily:T.sans,fontSize:13}}>{cat}</span>
                  <button onClick={()=>removeSpendCat(cat)} style={{background:"none",border:"none",cursor:"pointer",padding:0,lineHeight:1,opacity:0.4,display:"flex"}}>
                    <Icon name="close" size={14} color={T.ink}/>
                  </button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <TextInput placeholder="New category…" value={newCatName} onChange={e=>setNewCatName(e.target.value)} style={{fontSize:13}}/>
              <Btn variant="outline" style={{flexShrink:0,padding:"11px 16px"}} onClick={addSpendCat}>Add</Btn>
            </div>
          </div>

          {/* Recurring expenses */}
          <div style={{paddingTop:8,borderTop:`1px solid ${T.border}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <Label style={{marginBottom:0}}>Recurring expenses</Label>
              <Btn variant="ghost" style={{padding:"4px 8px",fontSize:12}} onClick={()=>setSheet("addRecurring")}>+ Add</Btn>
            </div>
            {recurring.length===0&&<div style={{fontFamily:T.sans,fontSize:13,color:T.inkLight,opacity:0.6}}>No recurring expenses yet</div>}
            {recurring.map(r=>(
              <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,background:T.paper,borderRadius:10,padding:"10px 12px"}}>
                <div>
                  <div style={{fontFamily:T.sans,fontSize:14,fontWeight:500}}>{r.name}</div>
                  <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight}}>{r.category} · day {r.dayOfMonth} of month</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontFamily:T.sans,fontSize:14,fontWeight:500,color:T.clay}}>{fmt(r.amount)}</span>
                  <button onClick={()=>{setEditRecurr({...r});setSheet("editRecurring");}} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.4}}>
                    <Icon name="edit" size={16} color={T.ink}/>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Btn variant="primary" style={{width:"100%"}} onClick={()=>{setSheet(null);setConfirmClear(false);}}>Done</Btn>

          {/* Danger zone */}
          <div style={{marginTop:8,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
            <Label>Danger zone</Label>
            {!confirmClear?(
              <Btn variant="danger" style={{width:"100%"}} icon="trash" onClick={()=>setConfirmClear(true)}>Clear all data</Btn>
            ):(
              <div style={{background:"#fff0ee",borderRadius:12,padding:16,display:"grid",gap:10}}>
                <div style={{fontFamily:T.sans,fontSize:13,color:T.clay,lineHeight:1.5}}>
                  This will permanently delete everything. <strong>Cannot be undone.</strong>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Btn variant="outline" style={{width:"100%"}} onClick={()=>setConfirmClear(false)}>Cancel</Btn>
                  <Btn variant="danger" style={{width:"100%",background:"#902124",color:T.cream}} onClick={clearAllData}>Yes, clear</Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      </Sheet>

      {/* Add Recurring */}
      <Sheet open={sheet==="addRecurring"} onClose={()=>setSheet("settings")} title="New recurring expense">
        <div style={{display:"grid",gap:14}}>
          <Field label="Name"><TextInput placeholder="e.g. Rent, Netflix, Horse livery" value={draftRecurr.name} onChange={e=>setDraftRecurr({...draftRecurr,name:e.target.value})}/></Field>
          <Field label="Category"><Sel value={draftRecurr.category} onChange={e=>setDraftRecurr({...draftRecurr,category:e.target.value})}>{spendCats.map(c=><option key={c}>{c}</option>)}</Sel></Field>
          <Field label="Amount (€)"><NumInput value={draftRecurr.amount||""} onChange={v=>setDraftRecurr({...draftRecurr,amount:v})} placeholder="0"/></Field>
          <Field label="Day of month"><NumInput value={draftRecurr.dayOfMonth} onChange={v=>setDraftRecurr({...draftRecurr,dayOfMonth:Math.min(28,Math.max(1,Math.round(v)))})} placeholder="1"/></Field>
          <Btn variant="primary" style={{width:"100%"}} onClick={addRecurring}>Add recurring</Btn>
        </div>
      </Sheet>

      {/* Edit Recurring */}
      <Sheet open={sheet==="editRecurring"&&!!editRecurr} onClose={()=>setSheet("settings")} title="Edit recurring">
        {editRecurr&&(
          <div style={{display:"grid",gap:14}}>
            <Field label="Name"><TextInput value={editRecurr.name} onChange={e=>setEditRecurr({...editRecurr,name:e.target.value})}/></Field>
            <Field label="Category"><Sel value={editRecurr.category} onChange={e=>setEditRecurr({...editRecurr,category:e.target.value})}>{spendCats.map(c=><option key={c}>{c}</option>)}</Sel></Field>
            <Field label="Amount (€)"><NumInput value={editRecurr.amount} onChange={v=>setEditRecurr({...editRecurr,amount:v})}/></Field>
            <Field label="Day of month"><NumInput value={editRecurr.dayOfMonth} onChange={v=>setEditRecurr({...editRecurr,dayOfMonth:Math.min(28,Math.max(1,Math.round(v)))})} /></Field>
            <Btn variant="primary" style={{width:"100%"}} onClick={saveRecurring}>Save changes</Btn>
            <Btn variant="danger" style={{width:"100%"}} icon="trash" onClick={deleteRecurring}>Delete</Btn>
          </div>
        )}
      </Sheet>

      {/* Edit Budget % */}
      <Sheet open={sheet==="editBudget"} onClose={()=>setSheet(null)} title="Budget allocation">
        <div style={{display:"grid",gap:16}}>
          <div style={{fontFamily:T.sans,fontSize:12,color:budget.reduce((a,b)=>a+b.pct,0)===100?T.sage:T.clay}}>
            Total: {budget.reduce((a,b)=>a+b.pct,0)}% {budget.reduce((a,b)=>a+b.pct,0)!==100?"— needs to equal 100%":"✓"}
          </div>
          {budget.map((b,i)=>(
            <div key={b.id||b.label} style={{background:T.paper,borderRadius:12,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,alignItems:"center"}}>
                <div style={{fontStyle:"italic",fontSize:16}}>{b.label}</div>
                <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight}}>{fmt(monthlyPay*b.pct/100)}</div>
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                <NumInput value={b.pct} onChange={v=>setBudget(bg=>bg.map((x,j)=>j===i?{...x,pct:v}:x))} style={{width:70,flex:"none",textAlign:"center"}}/>
                <div style={{flex:1}}><Bar pct={b.pct*5} color={b.color}/></div>
                <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight}}>%</div>
              </div>
              {/* Category mapping — with guidance */}
              <div style={{background:`${b.color}11`,borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,lineHeight:1.5}}>
                  <strong style={{color:T.ink}}>Which spending categories count towards {b.label}?</strong><br/>
                  Tap a category to include or exclude it from this budget line's reality check.
                </div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {spendCats.map(cat=>{
                  const included=(b.cats||[]).includes(cat);
                  return (
                    <button key={cat} onClick={()=>setBudget(bg=>bg.map((x,j)=>j===i?{...x,cats:included?(x.cats||[]).filter(c=>c!==cat):[...(x.cats||[]),cat]}:x))}
                      style={{fontFamily:T.sans,fontSize:11,padding:"4px 10px",borderRadius:100,border:`1.5px solid ${included?b.color:T.border}`,background:included?b.color+"22":"transparent",color:included?b.color:T.inkLight,cursor:"pointer"}}>
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <Btn variant="primary" style={{width:"100%",marginTop:4}} onClick={()=>setSheet(null)}>Save</Btn>
        </div>
      </Sheet>

      {/* Wishlist Quiz */}
      <Popup open={!!quizItem} onClose={()=>{setQuizItem(null);setQuizAns({});}} title="Do you really need it?">
        {quizItem&&(
          <div>
            <div style={{fontFamily:T.sans,fontSize:12,color:T.inkLight,marginBottom:20}}>For: <strong style={{color:T.ink}}>{quizItem.name}</strong></div>
            <div style={{display:"grid",gap:16,marginBottom:20}}>
              {QUIZ_Q.map((q,i)=>(
                <div key={i}>
                  <div style={{fontFamily:T.sans,fontSize:14,marginBottom:8,lineHeight:1.4}}>{q.q}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {["yes","no"].map(ans=>(
                      <button key={ans} onClick={()=>setQuizAns(a=>({...a,[i]:ans}))} style={{padding:"10px 0",fontFamily:T.sans,fontSize:14,borderRadius:10,cursor:"pointer",transition:"all 0.15s",border:`1.5px solid ${quizAns[i]===ans?T.ink:T.border}`,background:quizAns[i]===ans?T.ink:"transparent",color:quizAns[i]===ans?T.cream:T.ink}}>{ans}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Btn variant="primary" style={{width:"100%",opacity:Object.keys(quizAns).length<QUIZ_Q.length?0.45:1}} disabled={Object.keys(quizAns).length<QUIZ_Q.length} onClick={submitQuiz}>Get my verdict</Btn>
          </div>
        )}
      </Popup>

      {/* Toast notification */}
      <Toast message={toast.message} visible={toast.visible}/>
    </div>
  );
}
