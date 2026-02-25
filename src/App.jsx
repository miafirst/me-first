import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Storage ──────────────────────────────────────────────────────────────────
// Tries window.storage (Claude artifact API), falls back to localStorage, then to null
const hasWindowStorage = typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";

async function storageGet(key) {
  if (hasWindowStorage) {
    try {
      const result = await window.storage.get(key);
      return result && result.value != null ? JSON.parse(result.value) : null;
    } catch { /* key not found or parse error */ }
  }
  // localStorage fallback (works outside artifact sandbox)
  try {
    const v = localStorage.getItem(key);
    return v != null ? JSON.parse(v) : null;
  } catch { return null; }
}

async function storageSet(key, value) {
  if (hasWindowStorage) {
    try { await window.storage.set(key, JSON.stringify(value)); return; } catch {}
  }
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

async function storageDelete(key) {
  if (hasWindowStorage) {
    try { await window.storage.delete(key); return; } catch {}
  }
  try { localStorage.removeItem(key); } catch {}
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  cream:    "#faf6f0",
  paper:    "#f5ede3",
  ink:      "#2e2520",
  inkLight: "#8a7060",
  border:   "#e8ddd4",
  white:    "#ffffff",
  sage:     "#7a9e7e",
  clay:     "#b8796a",
  sand:     "#c4a882",
  mist:     "#a8b5c8",
  blush:    "#c4a0b0",
  teal:     "#7a9ea0",
  serif:    "'Cormorant Garamond', Georgia, serif",
  sans:     "'DM Sans', sans-serif",
};

const WISH_CATS  = ["Fashion","Beauty","Tech","Travel","Home","Wellness","Other"];
const DEFAULT_SPEND_CATS = ["Groceries","Transport","Dining","Beauty","Home","Entertainment","Clothing","Health","Travel","Other"];
const TRANSACTION_TYPES  = ["Expense","Transfer to Savings","Investment"];

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

// FIX #1: getNextPayday — cap dayOfMonth BEFORE constructing Date to avoid JS overflow
function getNextPayday(dayOfMonth) {
  const today = new Date(); today.setHours(0,0,0,0);
  for (let offset = 0; offset <= 1; offset++) {
    const rawMonth = today.getMonth() + offset;
    const year = today.getFullYear() + Math.floor(rawMonth / 12);
    const month = rawMonth % 12;
    const lastDay = new Date(year, month + 1, 0).getDate(); // last day of that month
    const safeDay = Math.min(dayOfMonth, lastDay);          // cap BEFORE constructing
    const d = new Date(year, month, safeDay);
    if (d.getDay() === 6) d.setDate(d.getDate()-1);
    if (d.getDay() === 0) d.setDate(d.getDate()-2);
    if (d >= today) return d.toISOString().split("T")[0];
  }
  const rawMonth = today.getMonth() + 1;
  const year = today.getFullYear() + Math.floor(rawMonth / 12);
  const month = rawMonth % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(dayOfMonth, lastDay);
  const d = new Date(year, month, safeDay);
  if (d.getDay() === 6) d.setDate(d.getDate()-1);
  if (d.getDay() === 0) d.setDate(d.getDate()-2);
  return d.toISOString().split("T")[0];
}

function getCatColor(cat, budget) {
  const bucket = budget.find(b=>(b.cats||[]).includes(cat));
  return bucket ? bucket.color : T.sand;
}

function impulseScore(days, quiz) {
  const d = Math.min(days/90,1), q = quiz!=null?quiz/10:0.3;
  return Math.min((d*0.5+q*0.5)*100,100);
}
function impulseLabel(score) {
  if (score<30) return {text:"Impulse buy",   color:T.clay,    bg:T.clay+"22"};
  if (score<55) return {text:"Think it over", color:"#c4a060", bg:"#c4a06022"};
  if (score<75) return {text:"Getting there", color:"#8aab7a", bg:"#8aab7a22"};
  return              {text:"You deserve it", color:T.sage,    bg:T.sage+"22"};
}

// FIX #2: getPayPeriods — make end boundary INCLUSIVE by bumping end by 1ms
// so transactions on exact payday date are not lost between periods
// Parse a YYYY-MM-DD date string as LOCAL midnight (not UTC midnight)
// This prevents dates shifting a day backwards in UTC+ timezones
function localDate(str) {
  return new Date(str + "T00:00:00");
}

function getPayPeriods(spending, nextPayday) {
  const pd = localDate(nextPayday); // FIX: local midnight, not UTC
  const periods = [];
  let end = new Date(pd);
  for (let i=0; i<6; i++) {
    const start = new Date(end); start.setMonth(start.getMonth()-1);
    periods.push({start:new Date(start), end:new Date(end)});
    end = new Date(start);
  }
  return periods.map(p => {
    // Inclusive end: treat end date as end-of-day by using < next-day
    const endInclusive = new Date(p.end); endInclusive.setDate(endInclusive.getDate()+1);
    return {
      label: p.start.toLocaleDateString("en-GB",{day:"numeric",month:"short"}) + " – " + p.end.toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
      start: p.start, end: p.end,
      items: spending.filter(s => {
        const d = localDate(s.date); // FIX: local midnight, not UTC
        return d >= p.start && d < endInclusive;
      }),
    };
  });
}

const CAT_EMOJI = {
  "Groceries":"🛒","Transport":"🚌","Dining":"🍽️","Beauty":"💅","Home":"🏠",
  "Entertainment":"🎬","Clothing":"👗","Health":"💊","Travel":"✈️","Other":"📦",
  "Savings":"🐷","Investments":"📈","Home & Bills":"🏠","Personal & Fun":"✨",
};
function CatEmoji({cat, size=18}) {
  return <span style={{fontSize:size,lineHeight:1,display:"inline-block"}}>{CAT_EMOJI[cat]||"💰"}</span>;
}
const Label = ({children,style}) => (
  <div style={{fontFamily:T.sans,fontSize:10,letterSpacing:2.5,textTransform:"uppercase",color:T.inkLight,marginBottom:6,...style}}>{children}</div>
);
const Field = ({label,children}) => <div style={{display:"grid",gap:4}}>{label&&<Label>{label}</Label>}{children}</div>;

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
      style={{fontFamily:T.sans,fontSize:16,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"11px 14px",background:T.cream,color:T.ink,outline:"none",width:"100%",WebkitAppearance:"none",...style}}
    />
  );
}
const TextInput = ({style,...p}) => (
  <input {...p} style={{fontFamily:T.sans,fontSize:16,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"11px 14px",background:T.cream,color:T.ink,outline:"none",width:"100%",WebkitAppearance:"none",...style}}/>
);
const Sel = ({children,style,...p}) => (
  <select {...p} style={{fontFamily:T.sans,fontSize:16,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"11px 14px",background:T.cream,color:T.ink,outline:"none",width:"100%",WebkitAppearance:"none",...style}}>
    {children}
  </select>
);
const Btn = ({variant="primary",style,children,icon,...p}) => {
  const base = {fontFamily:T.sans,fontSize:14,fontWeight:500,border:"none",borderRadius:10,padding:"12px 20px",cursor:"pointer",transition:"opacity 0.15s",WebkitTapHighlightColor:"transparent",display:"flex",alignItems:"center",justifyContent:"center",gap:8};
  const v = {
    primary:{...base,background:T.ink,   color:T.cream},
    outline:{...base,background:"transparent",color:T.ink,border:`1.5px solid ${T.border}`},
    ghost:  {...base,background:"transparent",color:T.inkLight,padding:"8px 12px"},
    danger: {...base,background:"transparent",color:T.clay,border:`1.5px solid ${T.clay}`},
    sand:   {...base,background:T.paper,color:T.ink,border:`1.5px solid ${T.border}`},
  };
  return <button {...p} style={{...v[variant]||v.primary,...style}}>{icon&&<Icon name={icon} size={16} color={variant==="primary"?T.cream:variant==="danger"?T.clay:T.ink}/>}{children}</button>;
};
const Card = ({style,children,onClick}) => (
  <div onClick={onClick} style={{background:T.white,borderRadius:16,padding:"18px 16px",boxShadow:"0 1px 12px rgba(46,37,32,0.07)",...(onClick?{cursor:"pointer"}:{}),...style}}>{children}</div>
);
const Bar = ({pct,color=T.sand,style}) => (
  <div style={{height:6,borderRadius:100,background:T.paper,overflow:"hidden",...style}}>
    <div style={{height:"100%",width:`${Math.min(pct||0,100)}%`,background:color,borderRadius:100,transition:"width 0.7s ease"}}/>
  </div>
);
const Pill = ({children,color,bg}) => (
  <span style={{fontFamily:T.sans,fontSize:11,fontWeight:500,letterSpacing:0.3,padding:"4px 10px",borderRadius:100,background:bg||color+"22",color,display:"inline-block"}}>{children}</span>
);
const TypeBadge = ({type}) => {
  const map = {
    "Expense":             {color:T.clay, bg:T.clay+"22", label:"Expense"},
    "Transfer to Savings": {color:T.sage, bg:T.sage+"22", label:"→ Savings"},
    "Investment":          {color:T.teal, bg:T.teal+"22", label:"Investment"},
  };
  const s = map[type]||map["Expense"];
  return <Pill color={s.color} bg={s.bg}>{s.label}</Pill>;
};

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
    transfer:<><path d="M5 12h14M15 6l6 6-6 6" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/></>,
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
        {title&&<h3 style={{fontFamily:T.serif,fontStyle:"italic",fontWeight:300,fontSize:22,color:T.ink}}>{title}</h3>}
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon name="close" size={20} color={T.inkLight}/></button>
      </div>
      {children}
    </div>
  </>
);

const hasHinted = { current: false };
function SwipeableRow({ onEdit, onDelete, children, hintOnMount=false }) {
  const [offset, setOffset] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const startX = useRef(null);
  const ACTION_W = 130;

  useEffect(() => {
    if (!hintOnMount || hasHinted.current) return;
    hasHinted.current = true;
    const t1 = setTimeout(() => setOffset(-52), 700);
    const t2 = setTimeout(() => setOffset(0),   1250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [hintOnMount]);

  function onTouchStart(e) { startX.current = e.touches[0].clientX; }
  function onTouchMove(e) {
    if (startX.current===null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx<0) setOffset(Math.max(dx,-ACTION_W));
  }
  function onTouchEnd() {
    if (offset < -ACTION_W/2) { setOffset(-ACTION_W); setSwiped(true); }
    else { setOffset(0); setSwiped(false); }
    startX.current = null;
  }
  function close() { setOffset(0); setSwiped(false); }

  return (
    <div style={{position:"relative",overflow:"hidden",borderRadius:14}}>
      <div style={{position:"absolute",right:0,top:0,bottom:0,width:ACTION_W,display:"flex"}}>
        <button onClick={()=>{close();onEdit();}} style={{flex:1,background:T.sand,border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
          <Icon name="edit" size={16} color={T.ink}/>
          <span style={{fontFamily:T.sans,fontSize:10,color:T.ink,fontWeight:500}}>Edit</span>
        </button>
        <button onClick={()=>{close();onDelete();}} style={{flex:1,background:T.clay,border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,borderRadius:"0 14px 14px 0"}}>
          <Icon name="trash" size={16} color={T.white}/>
          <span style={{fontFamily:T.sans,fontSize:10,color:T.white,fontWeight:500}}>Delete</span>
        </button>
      </div>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={swiped?close:undefined}
        style={{transform:`translateX(${offset}px)`,transition:startX.current?'none':'transform 0.32s ease',position:"relative",zIndex:1}}
      >
        {children}
      </div>
    </div>
  );
}

function EmptyState({emoji,title,subtitle,action,onAction}) {
  return (
    <div style={{textAlign:"center",padding:"48px 20px",display:"grid",gap:12}}>
      <div style={{fontSize:40}}>{emoji}</div>
      <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:20,color:T.ink}}>{title}</div>
      <div style={{fontFamily:T.sans,fontSize:13,color:T.inkLight,lineHeight:1.6}}>{subtitle}</div>
      {action&&<Btn variant="primary" style={{margin:"8px auto 0"}} icon="plus" onClick={onAction}>{action}</Btn>}
    </div>
  );
}

function Toast({message,visible}) {
  return (
    <div style={{
      position:"fixed",bottom:90,left:"50%",transform:`translateX(-50%) translateY(${visible?0:16}px)`,
      opacity:visible?1:0,transition:"all 0.25s ease",zIndex:500,pointerEvents:"none",
      background:T.ink,color:T.white,borderRadius:100,padding:"10px 20px",
      fontFamily:T.sans,fontSize:13,fontWeight:500,whiteSpace:"nowrap",
      boxShadow:"0 4px 20px rgba(70,49,38,0.25)",display:"flex",alignItems:"center",gap:8,
    }}>
      <span style={{color:T.sage}}>✓</span> {message}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function MeFirst() {
  const [tab,   setTab]   = useState("home");
  const [ready, setReady] = useState(false);

  const [monthlyPay,   setMonthlyPay]   = useState(3200);
  const [monthlyHours, setMonthlyHours] = useState(160);
  const [paydayDay,    setPaydayDay]    = useState(6);
  const hourlyRate = monthlyHours>0 ? monthlyPay/monthlyHours : 0;
  const nextPayday = getNextPayday(paydayDay);

  const [spendCats, setSpendCats] = useState(DEFAULT_SPEND_CATS);
  const [goals,     setGoals]     = useState([]);
  const [wishlist,  setWishlist]  = useState([]);
  const [spending,  setSpending]  = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [budget,    setBudget]    = useState(DEFAULT_BUDGET);

  const [sheet,          setSheet]          = useState(null);
  const [settingsPage,   setSettingsPage]   = useState("general");
  const [expandedBucket, setExpandedBucket] = useState(null);
  const [quizItem,       setQuizItem]       = useState(null);
  const [quizAns,        setQuizAns]        = useState({});
  const [editGoal,       setEditGoal]       = useState(null);
  const [editSpend,      setEditSpend]      = useState(null);
  const [editRecurr,     setEditRecurr]     = useState(null);
  const [periodIdx,      setPeriodIdx]      = useState(0);
  const [confirmClear,   setConfirmClear]   = useState(false);
  const [newCatName,     setNewCatName]     = useState("");
  const [toast,          setToast]          = useState({visible:false,message:""});

  const today = new Date().toISOString().split("T")[0];
  const freshSpend = useCallback(() => ({name:"",category:"Groceries",amount:"",date:today,type:"Expense",goalId:""}), [today]);
  const [draftSpend,  setDraftSpend]  = useState(freshSpend());
  const [draftWish,   setDraftWish]   = useState({name:"",price:"",category:"Fashion"});
  const [draftGoal,   setDraftGoal]   = useState({name:"",target:"",current:""});
  const [draftRecurr, setDraftRecurr] = useState({name:"",category:"Groceries",amount:"",dayOfMonth:1});

  function showToast(msg) {
    setToast({visible:true,message:msg});
    setTimeout(()=>setToast(t=>({...t,visible:false})),2000);
  }

  // ── Persistence: load from storage on mount ──
  useEffect(()=>{
    let cancelled = false;
    // Safety net: if storage takes >2s (or fails entirely), show the app anyway
    const fallbackTimer = setTimeout(() => { if (!cancelled) setReady(true); }, 2000);
    async function loadAll() {
      try {
        const [pay, hours, pday, scats, gs, wl, sp, rec, bud] = await Promise.all([
          storageGet("mf:pay"),
          storageGet("mf:hours"),
          storageGet("mf:paydayday"),
          storageGet("mf:spendcats"),
          storageGet("mf:goals"),
          storageGet("mf:wishlist"),
          storageGet("mf:spending"),
          storageGet("mf:recurring"),
          storageGet("mf:budget"),
        ]);
        if (cancelled) return;
        if (pay    != null) setMonthlyPay(pay);
        if (hours  != null) setMonthlyHours(hours);
        if (pday   != null) setPaydayDay(pday);
        if (scats  != null) setSpendCats(scats);
        if (gs     != null) setGoals(gs);
        if (wl     != null) setWishlist(wl);
        if (sp     != null) setSpending(sp);
        if (rec    != null) setRecurring(rec);
        if (bud    != null) setBudget(bud);
      } catch(e) {
        console.warn("Storage load failed:", e);
      } finally {
        clearTimeout(fallbackTimer);
        if (!cancelled) setReady(true);
      }
    }
    loadAll();
    return () => { cancelled = true; clearTimeout(fallbackTimer); };
  },[]);

  useEffect(()=>{ if(ready) storageSet("mf:pay",       monthlyPay);   },[monthlyPay,  ready]);
  useEffect(()=>{ if(ready) storageSet("mf:hours",     monthlyHours); },[monthlyHours,ready]);
  useEffect(()=>{ if(ready) storageSet("mf:paydayday", paydayDay);    },[paydayDay,   ready]);
  useEffect(()=>{ if(ready) storageSet("mf:spendcats", spendCats);    },[spendCats,   ready]);
  useEffect(()=>{ if(ready) storageSet("mf:goals",     goals);        },[goals,       ready]);
  useEffect(()=>{ if(ready) storageSet("mf:wishlist",  wishlist);     },[wishlist,    ready]);
  useEffect(()=>{ if(ready) storageSet("mf:spending",  spending);     },[spending,    ready]);
  useEffect(()=>{ if(ready) storageSet("mf:recurring", recurring);    },[recurring,   ready]);
  useEffect(()=>{ if(ready) storageSet("mf:budget",    budget);       },[budget,      ready]);

  // ── Computed ──
  // FIX: parse as LOCAL midnight — new Date("YYYY-MM-DD") parses UTC midnight,
  // which in UTC+ zones shifts the date backwards by hours, showing the wrong day
  const payday      = localDate(nextPayday);
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
  const daysLeft    = Math.max(Math.ceil((payday - todayMidnight) / 86400000), 0);
  const periods     = getPayPeriods(spending,nextPayday);
  const curPeriod   = periods[periodIdx]||{items:spending,label:"All time"};
  const periodItems = curPeriod.items.filter(s=>s.type==="Expense"||!s.type);
  const periodSpend = periodItems.reduce((a,b)=>a+b.amount,0);
  const recurringTotal = recurring.reduce((a,r)=>a+r.amount,0);
  const freeToSpend = monthlyPay - recurringTotal;
  const remaining   = freeToSpend - periodSpend;
  const spentByCat  = periodItems.reduce((acc,s)=>{acc[s.category]=(acc[s.category]||0)+s.amount;return acc;},{});
  const maxCat      = Math.max(...Object.values(spentByCat),1);

  // ── Financial Actions ──

  // FIX #3: Validate amount is a positive number (blocks negatives)
  function addSpend() {
    const amt = parseFloat(draftSpend.amount);
    if (!amt || amt <= 0) return; // blocks 0, negatives, empty
    const name = draftSpend.name.trim() || draftSpend.category;
    const entry = {id:Date.now(),...draftSpend,name,amount:amt};
    setSpending(s=>[...s,entry]);
    if (entry.type==="Transfer to Savings" && entry.goalId) {
      setGoals(g=>g.map(x=>x.id===parseInt(entry.goalId)?{...x,current:x.current+entry.amount}:x));
    }
    if (entry.type==="Investment" && entry.goalId) {
      setGoals(g=>g.map(x=>x.id===parseInt(entry.goalId)?{...x,current:x.current+entry.amount}:x));
    }
    setDraftSpend(freshSpend());
    setSheet(null); showToast("Saved ✓");
  }

  function saveSpend() {
    setSpending(s=>s.map(x=>x.id===editSpend.id?editSpend:x));
    setEditSpend(null); setSheet(null); showToast("Updated ✓");
  }

  // FIX #4: Validate positive price in addWish
  function addWish() {
    const price = parseFloat(draftWish.price);
    if (!draftWish.name || !price || price <= 0) return;
    setWishlist(w=>[...w,{id:Date.now(),...draftWish,price,daysWanted:0,quizScore:null,savedAnswers:{}}]);
    setDraftWish({name:"",price:"",category:"Fashion"}); setSheet(null); showToast("Added to wishlist ✓");
  }

  function addGoal() {
    if (!draftGoal.name||!draftGoal.target) return;
    setGoals(g=>[...g,{id:Date.now(),name:draftGoal.name,target:parseFloat(draftGoal.target),current:parseFloat(draftGoal.current)||0}]);
    setDraftGoal({name:"",target:"",current:""}); setSheet(null); showToast("Goal created ✓");
  }
  function saveGoal() { setGoals(g=>g.map(x=>x.id===editGoal.id?editGoal:x)); setEditGoal(null); setSheet(null); showToast("Goal updated ✓"); }
  function deleteGoal() { setGoals(g=>g.filter(x=>x.id!==editGoal.id)); setEditGoal(null); setSheet(null); showToast("Goal deleted"); }

  function addRecurring() {
    if (!draftRecurr.name||!draftRecurr.amount) return;
    setRecurring(r=>[...r,{id:Date.now(),...draftRecurr,amount:parseFloat(draftRecurr.amount)}]);
    setDraftRecurr({name:"",category:spendCats[0]||"Other",amount:"",dayOfMonth:1});
    setSettingsPage("spending"); setSheet("settings"); showToast("Recurring added ✓");
  }
  function saveRecurring() { setRecurring(r=>r.map(x=>x.id===editRecurr.id?editRecurr:x)); setEditRecurr(null); setSettingsPage("spending"); setSheet("settings"); showToast("Updated ✓"); }
  function deleteRecurring() { setRecurring(r=>r.filter(x=>x.id!==editRecurr.id)); setEditRecurr(null); setSettingsPage("spending"); setSheet("settings"); showToast("Deleted"); }

  function addSpendCat() {
    const name = newCatName.trim();
    if (!name||spendCats.includes(name)) return;
    setSpendCats(c=>[...c,name]); setNewCatName("");
  }

  function submitQuiz() {
    let score=5;
    QUIZ_Q.forEach((q,i)=>{ if(quizAns[i]==="yes") score+=q.w; });
    const norm=Math.max(0,Math.min(score,10));
    setWishlist(w=>w.map(x=>x.id===quizItem.id?{...x,quizScore:norm,savedAnswers:quizAns}:x));
    setQuizItem(null); setQuizAns({});
  }

  // FIX #5: clearAllData resets ALL state including stale edit refs
  function clearAllData() {
    setGoals([]); setWishlist([]); setSpending([]); setRecurring([]);
    setBudget(DEFAULT_BUDGET); setSpendCats(DEFAULT_SPEND_CATS);
    setMonthlyPay(0); setMonthlyHours(160); setPaydayDay(6);
    // Reset all edit/UI state to prevent stale data
    setEditGoal(null); setEditSpend(null); setEditRecurr(null);
    setQuizItem(null); setQuizAns({});
    setPeriodIdx(0); setExpandedBucket(null);
    // Clear persisted storage
    ["mf:goals","mf:wishlist","mf:spending","mf:recurring","mf:budget",
     "mf:pay","mf:hours","mf:paydayday","mf:spendcats"].forEach(k=>storageDelete(k));
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

  const freeRatio = freeToSpend/monthlyPay;

  return (
    <div style={{fontFamily:T.serif,background:T.cream,minHeight:"100dvh",paddingBottom:72,color:T.ink}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{display:none;}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        button:active{opacity:0.75;}
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
            {spending.length===0 && goals.length===0 && (
              <Card style={{background:T.cream}}>
                <div style={{fontFamily:T.sans,fontSize:14,color:T.inkLight,lineHeight:1.7}}>
                  <div style={{fontFamily:T.serif,fontStyle:"italic",fontSize:18,color:T.ink,marginBottom:10}}>Welcome. Let's get you set up. 🌿</div>
                  <span style={{display:"block",marginTop:4}}>① Tap <strong>⚙</strong> to add your income, hours &amp; payday</span>
                  <span style={{display:"block",marginTop:4}}>② Head to <strong>Savings</strong> and create your first goal</span>
                  <span style={{display:"block",marginTop:4}}>③ Log your first expense in <strong>Spending</strong></span>
                </div>
              </Card>
            )}

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
                    <span style={{color:remaining>=0?"#a8d4a0":"#d4a0a0",fontWeight:500}}>{fmt(remaining)}</span>
                  </div>
                  <div style={{marginTop:4,fontFamily:T.sans,fontSize:11,opacity:0.35}}>
                    if you save €15/day<br/>
                    <span style={{color:"#a8d4a0"}}>+{fmt(15*daysLeft)} by payday</span>
                  </div>
                </div>
              </div>
            </Card>

            {recurring.length>0 && (
              <>
                <div style={{fontStyle:"italic",fontSize:18,marginTop:4}}>Recurring this month</div>
                <Card style={{background:T.paper,padding:"12px 16px"}}>
                  {recurring.map(r=>(
                    <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,fontFamily:T.sans,fontSize:13}}>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <Icon name="repeat" size={14} color={T.clay}/>
                        <span>{r.name}</span>
                        <span style={{fontSize:11,color:T.inkLight}}>day {r.dayOfMonth}</span>
                      </div>
                      <span style={{fontWeight:500,color:T.clay}}>{fmt(r.amount)}</span>
                    </div>
                  ))}
                  <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8,marginTop:4,display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13}}>
                    <span style={{color:T.inkLight}}>Total recurring</span>
                    <span style={{fontWeight:600,color:T.clay}}>{fmt(recurringTotal)}</span>
                  </div>
                </Card>
              </>
            )}

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
              <div style={{fontStyle:"italic",fontSize:18}}>This Period</div>
              <span style={{fontFamily:T.sans,fontSize:18,fontWeight:500,color:T.clay}}>{fmt(periodSpend)}</span>
            </div>
            <Card>
              {Object.entries(spentByCat).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([cat,amt])=>(
                <div key={cat} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13,marginBottom:5}}>
                    <span style={{color:getCatColor(cat,budget),fontWeight:500}}>{cat}</span><span style={{fontWeight:500}}>{fmt(amt)}</span>
                  </div>
                  <Bar pct={amt/maxCat*100} color={getCatColor(cat,budget)}/>
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
              <Bar pct={freeToSpend>0?periodSpend/freeToSpend*100:0} color={periodSpend>freeToSpend?T.clay:T.sand} style={{marginTop:8}}/>
              <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,textAlign:"center",marginTop:5}}>
                {remaining>=0?`${fmt(remaining)} free to spend · ${fmt(recurringTotal)} reserved for bills`:`${fmt(Math.abs(remaining))} over your free budget`}
              </div>
            </Card>

            {recurring.length>0 && (
              <Card style={{background:T.paper,padding:"14px 16px",borderLeft:`3px solid ${T.clay}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <Icon name="repeat" size={16} color={T.clay}/>
                    <Label style={{marginBottom:0,color:T.clay}}>Recurring this month</Label>
                  </div>
                  <button onClick={()=>setSheet("settings")} style={{background:"none",border:"none",cursor:"pointer",fontFamily:T.sans,fontSize:11,color:T.inkLight}}>Manage</button>
                </div>
                {recurring.map(r=>(
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontFamily:T.sans,fontSize:13}}>
                    <span>{r.name} <span style={{fontSize:11,color:T.inkLight}}>· day {r.dayOfMonth}</span></span>
                    <span style={{fontWeight:500,color:T.clay}}>{fmt(r.amount)}</span>
                  </div>
                ))}
                <div style={{borderTop:`1px solid ${T.border}`,paddingTop:8,display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13}}>
                  <span style={{color:T.inkLight}}>Monthly total</span>
                  <span style={{fontWeight:600,color:T.clay}}>{fmt(recurringTotal)}</span>
                </div>
              </Card>
            )}

            {recurring.length===0 && spending.length>0 && (
              <button onClick={()=>setSheet("settings")} style={{background:"none",border:`1.5px dashed ${T.border}`,borderRadius:14,padding:"12px 16px",cursor:"pointer",display:"flex",gap:10,alignItems:"center",width:"100%",textAlign:"left"}}>
                <Icon name="repeat" size={16} color={T.inkLight}/>
                <span style={{fontFamily:T.sans,fontSize:13,color:T.inkLight,flex:1}}>Add recurring bills like rent or subscriptions</span>
                <Icon name="chevron" size={16} color={T.inkLight}/>
              </button>
            )}

            {Object.entries(spentByCat).length>0 && (
              <Card>
                <Label>By category</Label>
                {Object.entries(spentByCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
                  <div key={cat} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:T.sans,fontSize:13,marginBottom:4}}>
                      <span style={{color:getCatColor(cat,budget),fontWeight:500}}>{cat}</span><span style={{fontWeight:500}}>{fmt(amt)}</span>
                    </div>
                    <Bar pct={amt/maxCat*100} color={getCatColor(cat,budget)}/>
                  </div>
                ))}
              </Card>
            )}

            {curPeriod.items.length>0 && (
              <>
                <div style={{fontStyle:"italic",fontSize:16,opacity:0.6,marginTop:4}}>Transactions</div>
                {[...curPeriod.items].sort((a,b)=>localDate(b.date)-localDate(a.date)).map((s,idx)=>{
                  const catColor = getCatColor(s.category, budget);
                  return (
                  <SwipeableRow key={s.id} hintOnMount={idx===0}
                    onEdit={()=>{setEditSpend({...s});setSheet("editSpend");}}
                    onDelete={()=>setSpending(sp=>sp.filter(x=>x.id!==s.id))}
                  >
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:T.white,padding:"12px 14px",boxShadow:`0 1px 8px rgba(70,49,38,0.06)`}}>
                      <div style={{display:"flex",gap:12,alignItems:"center",flex:1}}>
                        <div style={{background:catColor+"18",border:`1.5px solid ${catColor}30`,borderRadius:12,width:42,height:42,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <CatEmoji cat={s.category} size={20}/>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:T.sans,fontSize:14,fontWeight:500,marginBottom:2}}>{s.name||s.category}</div>
                          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                            <span style={{fontFamily:T.sans,fontSize:11,color:T.inkLight}}>
                              {localDate(s.date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
                            </span>
                            <span style={{fontFamily:T.sans,fontSize:11,color:catColor,fontWeight:500}}>{s.category}</span>
                            {s.type&&s.type!=="Expense"&&<TypeBadge type={s.type}/>}
                          </div>
                        </div>
                      </div>
                      <div style={{fontFamily:T.sans,fontSize:15,fontWeight:500,color:s.type==="Transfer to Savings"?T.sage:s.type==="Investment"?T.teal:T.clay,flexShrink:0}}>{fmt(s.amount)}</div>
                    </div>
                  </SwipeableRow>
                  );
                })}
              </>
            )}

            {curPeriod.items.length===0 && spending.length===0 && (
              <EmptyState emoji="💸" title="No expenses yet"
                subtitle={"Log your first expense to start tracking.\nEven a coffee counts."}
                action="Log first expense" onAction={()=>setSheet("addSpend")}/>
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
            {goals.length>0 && (()=>{
              const totalSaved  = goals.reduce((a,g)=>a+g.current,0);
              const totalTarget = goals.reduce((a,g)=>a+g.target,0);
              const overallPct  = totalTarget>0?Math.min(totalSaved/totalTarget*100,100):0;
              return (
                <Card style={{background:T.ink,color:T.white}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:12}}>
                    <div>
                      <Label style={{color:"rgba(250,246,240,0.4)"}}>Total saved</Label>
                      <div style={{fontSize:28,fontWeight:300,fontStyle:"italic",color:T.sage}}>{fmt(totalSaved)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <Label style={{color:"rgba(250,246,240,0.4)"}}>Target</Label>
                      <div style={{fontSize:18,fontWeight:300,fontStyle:"italic",opacity:0.5}}>{fmt(totalTarget)}</div>
                    </div>
                  </div>
                  <div style={{height:8,borderRadius:100,background:"rgba(255,255,255,0.12)",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${overallPct}%`,background:T.sage,borderRadius:100,transition:"width 0.8s ease"}}/>
                  </div>
                  <div style={{fontFamily:T.sans,fontSize:11,opacity:0.35,marginTop:6,textAlign:"right"}}>{Math.round(overallPct)}% of all goals</div>
                </Card>
              );
            })()}
            {goals.length===0 && (
              <EmptyState emoji="🌱" title="No goals yet"
                subtitle="What are you saving towards? A trip, an emergency fund, something you've been dreaming of?"
                action="Create first goal" onAction={()=>setSheet("addGoal")}/>
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
            {hourlyRate>0 && (
              <div style={{background:T.cream,borderRadius:10,padding:"10px 14px",display:"flex",gap:8,alignItems:"center",border:`1px solid ${T.border}`}}>
                <span style={{fontFamily:T.sans,fontSize:12,color:T.inkLight}}>Your time is worth</span>
                <span style={{fontFamily:T.sans,fontSize:14,fontWeight:600,color:T.ink}}>€{hourlyRate.toFixed(2)}/hr</span>
                <span style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,marginLeft:"auto"}}>{fmt(monthlyPay)} · {monthlyHours}h</span>
              </div>
            )}
            {wishlist.length===0 && (
              <EmptyState emoji="✨" title="Your wishlist is empty"
                subtitle="Add things you're tempted to buy. The impulse quiz will help you decide if it's worth it — or just a moment."
                action="Add first item" onAction={()=>setSheet("addWish")}/>
            )}
            {wishlist.map(item=>{
              const score = impulseScore(item.daysWanted, item.quizScore);
              const {text, color, bg} = impulseLabel(score);
              const hours = hourlyRate>0 ? (item.price/hourlyRate).toFixed(1) : "—";
              const steps = [15,35,55,75,90];
              const activeStep = steps.findIndex(s=>score<s);
              const filledSteps = activeStep===-1 ? 5 : activeStep;
              return (
                <Card key={item.id} style={{padding:"16px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                    <div style={{flex:1,minWidth:0,paddingRight:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <CatEmoji cat={item.category} size={14}/>
                        <span style={{fontFamily:T.sans,fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:T.inkLight}}>{item.category}</span>
                      </div>
                      <div style={{fontStyle:"italic",fontSize:19,color:T.ink,lineHeight:1.2}}>{item.name}</div>
                    </div>
                    <button onClick={()=>setWishlist(w=>w.filter(x=>x.id!==item.id))} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.25,flexShrink:0}}>
                      <Icon name="trash" size={15} color={T.ink}/>
                    </button>
                  </div>
                  <div style={{display:"flex",gap:0,marginBottom:14}}>
                    <div style={{flex:1,background:T.paper,borderRadius:"10px 0 0 10px",padding:"8px 12px"}}>
                      <div style={{fontFamily:T.sans,fontSize:10,color:T.inkLight,marginBottom:2}}>PRICE</div>
                      <div style={{fontFamily:T.sans,fontSize:16,fontWeight:600,color:T.ink}}>{fmt(item.price)}</div>
                    </div>
                    <div style={{flex:1,background:T.paper,borderRadius:"0 10px 10px 0",padding:"8px 12px",borderLeft:`1px solid ${T.border}`}}>
                      <div style={{fontFamily:T.sans,fontSize:10,color:T.inkLight,marginBottom:2}}>HOURS OF WORK</div>
                      <div style={{fontFamily:T.sans,fontSize:16,fontWeight:600,color:T.inkLight}}>{hours}h</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                    <Pill color={color} bg={bg}>{text}</Pill>
                    <div style={{display:"flex",gap:5,alignItems:"center"}}>
                      {[0,1,2,3,4].map(i=>(
                        <div key={i} style={{width:i<filledSteps?10:8,height:i<filledSteps?10:8,borderRadius:"50%",background:i<filledSteps?color:T.border,transition:"all 0.4s ease"}}/>
                      ))}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label="Days wanted">
                      <NumInput value={item.daysWanted} onChange={v=>setWishlist(w=>w.map(x=>x.id===item.id?{...x,daysWanted:Math.round(v)}:x))}/>
                    </Field>
                    <div style={{display:"flex",alignItems:"flex-end"}}>
                      <Btn variant={item.quizScore!=null?"outline":"primary"} style={{width:"100%",fontSize:13}} onClick={()=>{
                        setQuizItem(item);
                        setQuizAns(item.savedAnswers||{});
                      }}>
                        {item.quizScore!=null?"Retake quiz":"Take the quiz"}
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
              <Btn variant="ghost" onClick={()=>{setSettingsPage("budget");setSheet("settings");}}>Edit %</Btn>
            </div>
            <Card style={{background:T.ink,color:T.white}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                <div>
                  <Label style={{color:"rgba(250,246,240,0.4)"}}>Monthly income</Label>
                  <div style={{fontSize:28,fontWeight:300,fontStyle:"italic"}}>{fmt(monthlyPay)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <Label style={{color:"rgba(250,246,240,0.4)"}}>Free to spend</Label>
                  <div style={{fontSize:28,fontWeight:300,fontStyle:"italic",color:"#a8d4a0"}}>{fmt(freeToSpend)}</div>
                </div>
              </div>
              <div style={{fontFamily:T.sans,fontSize:10,opacity:0.3,marginTop:8}}>{curPeriod.label||"current period"} · {fmt(recurringTotal)} reserved for bills</div>
            </Card>

            {budget.map(b=>{
              // FIX #6: Only count each expense ONCE per bucket (no double-counting across buckets)
              // Categories are unique per bucket by design; this is enforced in the UI.
              // We still guard against it here by ensuring we only use this bucket's cats.
              const bucketCats = b.cats || [];
              const ideal = monthlyPay * b.pct / 100;
              const actual = curPeriod.items
                .filter(s => bucketCats.includes(s.category) && (s.type==="Expense"||!s.type))
                .reduce((a,x)=>a+x.amount,0);
              const over = actual > ideal;
              const pct = ideal > 0 ? Math.min(actual/ideal*100,100) : 0;
              const noCats = bucketCats.length === 0;
              return (
                <Card key={b.id||b.label} style={{padding:"14px 16px",borderLeft:`3px solid ${over?T.clay:b.color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontStyle:"italic",fontSize:17,marginBottom:2}}>{b.label}</div>
                      <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight}}>{b.pct}% of income · {fmt(ideal)} budget</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:T.sans,fontSize:18,fontWeight:500,color:over?T.clay:actual>0?T.sage:T.inkLight}}>{fmt(actual)}</div>
                      {over && <div style={{fontFamily:T.sans,fontSize:11,color:T.clay}}>+{fmt(actual-ideal)} over</div>}
                      {!over && actual>0 && <div style={{fontFamily:T.sans,fontSize:11,color:T.sage}}>{fmt(ideal-actual)} left</div>}
                      {actual===0 && <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,opacity:0.5}}>nothing yet</div>}
                    </div>
                  </div>
                  <div style={{height:6,borderRadius:100,background:T.paper,overflow:"hidden",marginBottom:6}}>
                    <div style={{height:"100%",width:`${pct}%`,background:over?T.clay:b.color,borderRadius:100,transition:"width 0.7s"}}/>
                  </div>
                  {noCats && (
                    <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,opacity:0.6,fontStyle:"italic"}}>
                      No categories linked — tap "Edit %" to connect spending
                    </div>
                  )}
                  {!noCats && (
                    <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight}}>
                      {bucketCats.join(", ")}
                    </div>
                  )}
                </Card>
              );
            })}
            <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,textAlign:"center"}}>
              Total: {budget.reduce((a,b)=>a+b.pct,0)}%
              {budget.reduce((a,b)=>a+b.pct,0)!==100&&<span style={{color:T.clay}}> — should add up to 100%</span>}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:`rgba(250,246,240,0.96)`,backdropFilter:"blur(14px)",borderTop:`1px solid ${T.border}`,paddingBottom:20,paddingTop:8,zIndex:100}}>
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
      <Sheet open={sheet==="addSpend"} onClose={()=>setSheet(null)} title="Add transaction">
        <div style={{display:"grid",gap:14}}>
          {draftSpend.type==="Expense" && parseFloat(draftSpend.amount)>0 && (()=>{
            const amt = parseFloat(draftSpend.amount)||0;
            const afterSpend = remaining - amt;
            const hoursEq = hourlyRate>0?(amt/hourlyRate).toFixed(1):"—";
            const isOver = afterSpend < 0;
            const bucketMatch = budget.find(b=>(b.cats||[]).includes(draftSpend.category));
            const bucketIdeal = bucketMatch ? monthlyPay*bucketMatch.pct/100 : 0;
            const bucketActual = bucketMatch
              ? curPeriod.items.filter(s=>(bucketMatch.cats||[]).includes(s.category)&&(s.type==="Expense"||!s.type)).reduce((a,x)=>a+x.amount,0)
              : 0;
            const bucketAfter = bucketIdeal - bucketActual - amt;
            const bucketOver = bucketAfter < 0;
            return (
              <div style={{background:isOver?"#fff0ee":T.paper,borderRadius:12,padding:"12px 14px",display:"grid",gap:8}}>
                <div style={{fontFamily:T.sans,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:isOver?T.clay:T.inkLight}}>Reality check</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontFamily:T.sans,fontSize:13,color:T.inkLight}}>After this spend</span>
                  <span style={{fontFamily:T.sans,fontSize:15,fontWeight:600,color:isOver?T.clay:T.sage}}>
                    {isOver?"–":""}{fmt(Math.abs(afterSpend))} {isOver?"over budget":"left this period"}
                  </span>
                </div>
                {hourlyRate>0 && (
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:T.sans,fontSize:13,color:T.inkLight}}>That's</span>
                    <span style={{fontFamily:T.sans,fontSize:13,color:T.ink,fontWeight:500}}>{hoursEq}h of your work</span>
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontFamily:T.sans,fontSize:13,color:T.inkLight}}>Days to payday</span>
                  <span style={{fontFamily:T.sans,fontSize:13,color:T.ink,fontWeight:500}}>{daysLeft} days</span>
                </div>
                {bucketMatch && (
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:T.sans,fontSize:13,color:T.inkLight}}>{bucketMatch.label} bucket</span>
                    <span style={{fontFamily:T.sans,fontSize:13,fontWeight:500,color:bucketOver?T.clay:T.sage}}>
                      {bucketOver?`${fmt(Math.abs(bucketAfter))} over`:`${fmt(bucketAfter)} left`}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
          <Field label="Amount (€)">
            <NumInput value={draftSpend.amount||""} onChange={v=>setDraftSpend(d=>({...d,amount:v}))} placeholder="0"/>
          </Field>
          <Field label="Type">
            <Sel value={draftSpend.type} onChange={e=>setDraftSpend(d=>({...d,type:e.target.value,goalId:""}))}>
              {TRANSACTION_TYPES.map(t=><option key={t}>{t}</option>)}
            </Sel>
          </Field>
          {/* FIX: Transfer to Savings requires a goal — Save button disabled until one is chosen */}
          {(draftSpend.type==="Transfer to Savings"||draftSpend.type==="Investment") && goals.length>0 && (
            <Field label="Which goal?">
              <Sel value={draftSpend.goalId} onChange={e=>setDraftSpend(d=>({...d,goalId:e.target.value}))}>
                <option value="">Select a goal…</option>
                {goals.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
              </Sel>
            </Field>
          )}
          {(draftSpend.type==="Transfer to Savings"||draftSpend.type==="Investment") && goals.length===0 && (
            <div style={{background:T.sand+"22",borderRadius:10,padding:"10px 14px",fontFamily:T.sans,fontSize:13,color:T.inkLight}}>
              Create a savings goal first to log transfers.
            </div>
          )}
          <Field label="Name (optional)">
            <TextInput placeholder={draftSpend.category} value={draftSpend.name} onChange={e=>setDraftSpend(d=>({...d,name:e.target.value}))}/>
          </Field>
          {draftSpend.type==="Expense" && (
            <Field label="Category">
              <Sel value={draftSpend.category} onChange={e=>setDraftSpend(d=>({...d,category:e.target.value}))}>
                {spendCats.map(c=><option key={c}>{c}</option>)}
              </Sel>
            </Field>
          )}
          <Field label="Date">
            <TextInput type="date" value={draftSpend.date} onChange={e=>setDraftSpend(d=>({...d,date:e.target.value}))}/>
          </Field>
          {/* FIX: Disable save for transfers without a goal selected */}
          <Btn variant="primary" style={{width:"100%",opacity:(
            (draftSpend.type==="Transfer to Savings"||draftSpend.type==="Investment") && !draftSpend.goalId && goals.length>0
          )?0.4:1}}
            disabled={(draftSpend.type==="Transfer to Savings"||draftSpend.type==="Investment") && !draftSpend.goalId && goals.length>0}
            onClick={addSpend}>Save</Btn>
        </div>
      </Sheet>

      {/* Edit Spend */}
      <Sheet open={sheet==="editSpend"&&!!editSpend} onClose={()=>setSheet(null)} title="Edit transaction">
        {editSpend&&(
          <div style={{display:"grid",gap:14}}>
            <Field label="Name">
              <TextInput value={editSpend.name||""} onChange={e=>setEditSpend({...editSpend,name:e.target.value})} placeholder={editSpend.category}/>
            </Field>
            <Field label="Category">
              <Sel value={editSpend.category} onChange={e=>setEditSpend({...editSpend,category:e.target.value})}>
                {spendCats.map(c=><option key={c}>{c}</option>)}
              </Sel>
            </Field>
            <Field label="Amount (€)"><NumInput value={editSpend.amount} onChange={v=>setEditSpend({...editSpend,amount:v})}/></Field>
            <Field label="Date"><TextInput type="date" value={editSpend.date} onChange={e=>setEditSpend({...editSpend,date:e.target.value})}/></Field>
            <Btn variant="primary" style={{width:"100%"}} onClick={saveSpend}>Save changes</Btn>
            <Btn variant="danger" style={{width:"100%"}} icon="trash" onClick={()=>{setSpending(s=>s.filter(x=>x.id!==editSpend.id));setEditSpend(null);setSheet(null);showToast("Deleted");}}>Delete</Btn>
          </div>
        )}
      </Sheet>

      {/* Add Wish */}
      <Sheet open={sheet==="addWish"} onClose={()=>setSheet(null)} title="Add to wishlist">
        <div style={{display:"grid",gap:14}}>
          <Field label="Item name"><TextInput placeholder="e.g. Dyson Airwrap" value={draftWish.name} onChange={e=>setDraftWish({...draftWish,name:e.target.value})}/></Field>
          <Field label="Price (€)"><NumInput value={draftWish.price||""} onChange={v=>setDraftWish({...draftWish,price:v})} placeholder="0"/></Field>
          <Field label="Category">
            <Sel value={draftWish.category} onChange={e=>setDraftWish({...draftWish,category:e.target.value})}>
              {spendCats.map(c=><option key={c}>{c}</option>)}
            </Sel>
          </Field>
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
      <Sheet open={sheet==="settings"} onClose={()=>{setSheet(null);setConfirmClear(false);setSettingsPage("general");}} title="Settings">
        <div style={{display:"flex",gap:4,background:T.paper,borderRadius:12,padding:4,marginBottom:20}}>
          {[["general","General"],["spending","Spending"],["budget","Budget"]].map(([id,label])=>(
            <button key={id} onClick={()=>setSettingsPage(id)} style={{flex:1,fontFamily:T.sans,fontSize:12,fontWeight:500,padding:"8px 4px",borderRadius:9,border:"none",cursor:"pointer",transition:"all 0.18s",
              background:settingsPage===id?T.cream:"transparent",
              color:settingsPage===id?T.ink:T.inkLight,
              boxShadow:settingsPage===id?"0 1px 4px rgba(70,49,38,0.12)":"none"}}>
              {label}
            </button>
          ))}
        </div>

        {settingsPage==="general" && (
          <div style={{display:"grid",gap:14}}>
            <Field label="Monthly income (€)"><NumInput value={monthlyPay} onChange={setMonthlyPay}/></Field>
            <Field label="Monthly working hours"><NumInput value={monthlyHours} onChange={setMonthlyHours} placeholder="e.g. 160"/></Field>
            <div style={{background:T.clay+"22",borderRadius:10,padding:"10px 14px",fontFamily:T.sans,fontSize:13,color:T.clay,border:`1px solid ${T.clay}44`}}>
              Hourly rate: <strong>€{hourlyRate.toFixed(2)}</strong>
              <span style={{fontSize:11,opacity:0.7}}> (calculated automatically)</span>
            </div>
            <Field label="Payday — day of month">
              <NumInput value={paydayDay} onChange={v=>setPaydayDay(Math.min(28,Math.max(1,Math.round(v||1))))} placeholder="e.g. 6"/>
            </Field>
            <div style={{background:T.paper,borderRadius:10,padding:"10px 14px",fontFamily:T.sans,fontSize:13,color:T.inkLight}}>
              Next payday: <strong style={{color:T.ink}}>{localDate(nextPayday).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"long"})}</strong>
              <div style={{fontSize:11,marginTop:3,opacity:0.7}}>Weekend → moved to previous Friday automatically</div>
            </div>
            <Btn variant="primary" style={{width:"100%",marginTop:4}} onClick={()=>{setSheet(null);setConfirmClear(false);setSettingsPage("general");}}>Done</Btn>
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
                    <Btn variant="danger" style={{width:"100%",background:T.clay,color:T.cream}} onClick={clearAllData}>Yes, clear</Btn>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {settingsPage==="spending" && (
          <div style={{display:"grid",gap:16}}>
            <div>
              <Label>Spending categories</Label>
              <div style={{display:"grid",gap:6,marginBottom:12}}>
                {spendCats.map(cat=>{
                  const bucket = budget.find(b=>(b.cats||[]).includes(cat));
                  const color = bucket ? bucket.color : T.border;
                  return (
                    <div key={cat} style={{display:"flex",alignItems:"center",gap:10,background:T.cream,borderRadius:10,padding:"8px 12px"}}>
                      <CatEmoji cat={cat} size={18}/>
                      <span style={{fontFamily:T.sans,fontSize:13,flex:1}}>{cat}</span>
                      <span style={{fontFamily:T.sans,fontSize:11,color:bucket?color:T.inkLight,opacity:bucket?1:0.5}}>
                        {bucket ? bucket.label : "unassigned"}
                      </span>
                      <button onClick={()=>setSpendCats(c=>c.filter(x=>x!==cat))} style={{background:"none",border:"none",cursor:"pointer",padding:0,lineHeight:1,opacity:0.3,display:"flex"}}>
                        <Icon name="close" size={14} color={T.ink}/>
                      </button>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:8}}>
                <TextInput placeholder="New category…" value={newCatName} onChange={e=>setNewCatName(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") addSpendCat(); }}/>
                <Btn variant="primary" style={{flexShrink:0,padding:"11px 18px"}} onClick={addSpendCat}>Add</Btn>
              </div>
            </div>
            <div style={{paddingTop:8,borderTop:`1px solid ${T.border}`}}>
              <Label style={{marginBottom:10}}>Recurring expenses</Label>
              {recurring.length===0&&<div style={{fontFamily:T.sans,fontSize:13,color:T.inkLight,opacity:0.6,marginBottom:12}}>No recurring expenses yet</div>}
              {recurring.map(r=>{
                const color = getCatColor(r.category, budget);
                return (
                  <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,background:T.cream,borderRadius:10,padding:"10px 12px",borderLeft:`3px solid ${color}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <CatEmoji cat={r.category} size={16}/>
                      <div>
                        <div style={{fontFamily:T.sans,fontSize:14,fontWeight:500}}>{r.name}</div>
                        <div style={{fontFamily:T.sans,fontSize:11,color}}>
                          {r.category} · day {r.dayOfMonth}
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontFamily:T.sans,fontSize:14,fontWeight:500,color:T.clay}}>{fmt(r.amount)}</span>
                      <button onClick={()=>{setEditRecurr({...r});setSheet("editRecurring");}} style={{background:"none",border:"none",cursor:"pointer",padding:4,opacity:0.4}}>
                        <Icon name="edit" size={16} color={T.ink}/>
                      </button>
                    </div>
                  </div>
                );
              })}
              <Btn variant="primary" style={{width:"100%",marginTop:4}} icon="plus" onClick={()=>setSheet("addRecurring")}>Add recurring expense</Btn>
            </div>
          </div>
        )}

        {settingsPage==="budget" && (
          <div style={{display:"grid",gap:10}}>
            {(()=>{
              const total = budget.reduce((a,b)=>a+b.pct,0);
              const ok = total===100;
              return (
                <div style={{fontFamily:T.sans,fontSize:12,color:ok?T.sage:T.clay,padding:"10px 14px",borderRadius:10,background:ok?T.sage+"18":"#fff0ee",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Total allocation</span>
                  <strong>{total}% {ok?"✓":"— needs 100%"}</strong>
                </div>
              );
            })()}
            {budget.map((b,i)=>{
              const isOpen = expandedBucket === (b.id||b.label);
              // FIX #6: Show visual warning when category is assigned to multiple buckets
              const assignedCats = b.cats||[];
              const otherBuckets = budget.filter((_,j)=>j!==i);
              const ideal = monthlyPay*b.pct/100;
              return (
                <div key={b.id||b.label} style={{background:T.cream,borderRadius:14,overflow:"hidden",border:`1.5px solid ${isOpen?b.color:T.border}`}}>
                  <button onClick={()=>setExpandedBucket(isOpen?null:(b.id||b.label))}
                    style={{width:"100%",background:"none",border:"none",cursor:"pointer",padding:"12px 14px",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:b.color,flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontStyle:"italic",fontSize:15,color:T.ink}}>{b.label}</div>
                      <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,marginTop:1}}>
                        {b.pct}% · {fmt(ideal)}
                        {assignedCats.length>0
                          ? ` · ${assignedCats.length} categor${assignedCats.length===1?"y":"ies"}`
                          : " · no categories yet"}
                      </div>
                    </div>
                    <div style={{width:48,height:4,borderRadius:100,background:T.paper,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.min(b.pct,100)}%`,background:b.color,borderRadius:100}}/>
                    </div>
                    <Icon name="chevron" size={16} color={T.inkLight} style={{transform:isOpen?"rotate(-90deg)":"rotate(90deg)",transition:"transform 0.2s"}}/>
                  </button>
                  {isOpen && (
                    <div style={{padding:"0 14px 14px",borderTop:`1px solid ${T.border}`}}>
                      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,paddingTop:12}}>
                        <Label style={{marginBottom:0,flex:1}}>Percentage</Label>
                        <NumInput value={b.pct} onChange={v=>setBudget(bg=>bg.map((x,j)=>j===i?{...x,pct:v}:x))} style={{width:70,flex:"none",textAlign:"center"}}/>
                        <div style={{fontFamily:T.sans,fontSize:13,color:T.inkLight}}>%</div>
                      </div>
                      <Bar pct={b.pct*5} color={b.color} style={{marginBottom:14}}/>
                      <div style={{fontFamily:T.sans,fontSize:11,color:T.inkLight,marginBottom:8}}>Assign categories:</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {spendCats.map(cat=>{
                          const included = assignedCats.includes(cat);
                          const takenBy = otherBuckets.find(x=>(x.cats||[]).includes(cat));
                          return (
                            <button key={cat}
                              onClick={()=>{
                                // FIX #6: Auto-remove from other bucket when assigning here
                                if (!included && takenBy) {
                                  setBudget(bg=>bg.map(x=>
                                    x.id===takenBy.id ? {...x,cats:(x.cats||[]).filter(c=>c!==cat)} :
                                    x.id===b.id      ? {...x,cats:[...(x.cats||[]),cat]} : x
                                  ));
                                } else {
                                  setBudget(bg=>bg.map((x,j)=>j===i?{...x,cats:included?assignedCats.filter(c=>c!==cat):[...assignedCats,cat]}:x));
                                }
                              }}
                              style={{fontFamily:T.sans,fontSize:12,padding:"7px 12px",borderRadius:100,minHeight:34,cursor:"pointer",display:"flex",alignItems:"center",gap:5,
                                border:`1.5px solid ${included?b.color:takenBy?takenBy.color+"66":T.border}`,
                                background:included?b.color+"25":takenBy?takenBy.color+"10":"transparent",
                                color:included?T.ink:takenBy?takenBy.color:T.inkLight}}>
                              <CatEmoji cat={cat} size={13}/>
                              <span>{cat}</span>
                              {takenBy&&!included&&<span style={{fontSize:9,opacity:0.6}}>({takenBy.label})</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Btn variant="outline" style={{width:"100%",marginTop:4}} onClick={()=>setSettingsPage("general")}>← Back to General</Btn>
          </div>
        )}
      </Sheet>

      {/* Add Recurring */}
      <Sheet open={sheet==="addRecurring"} onClose={()=>{setSettingsPage("spending");setSheet("settings");}} title="New recurring expense">
        <div style={{display:"grid",gap:14}}>
          <Field label="Name"><TextInput placeholder="e.g. Rent, Netflix, Horse livery" value={draftRecurr.name} onChange={e=>setDraftRecurr({...draftRecurr,name:e.target.value})}/></Field>
          <Field label="Category"><Sel value={draftRecurr.category} onChange={e=>setDraftRecurr({...draftRecurr,category:e.target.value})}>{spendCats.map(c=><option key={c}>{c}</option>)}</Sel></Field>
          <Field label="Amount (€)"><NumInput value={draftRecurr.amount||""} onChange={v=>setDraftRecurr({...draftRecurr,amount:v})} placeholder="0"/></Field>
          <Field label="Day of month"><NumInput value={draftRecurr.dayOfMonth} onChange={v=>setDraftRecurr({...draftRecurr,dayOfMonth:Math.min(28,Math.max(1,Math.round(v)))})} placeholder="1"/></Field>
          <Btn variant="primary" style={{width:"100%"}} onClick={addRecurring}>Add recurring</Btn>
          <Btn variant="outline" style={{width:"100%"}} onClick={()=>{setSettingsPage("spending");setSheet("settings");}}>Back</Btn>
        </div>
      </Sheet>

      {/* Edit Recurring */}
      <Sheet open={sheet==="editRecurring"&&!!editRecurr} onClose={()=>{setSettingsPage("spending");setSheet("settings");}} title="Edit recurring">
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

      {/* Wishlist Quiz */}
      <Popup open={!!quizItem} onClose={()=>{setQuizItem(null);setQuizAns({});}} title="Do you really need it?">
        {quizItem&&(
          <div>
            <div style={{fontFamily:T.sans,fontSize:12,color:T.inkLight,marginBottom:20}}>
              For: <strong style={{color:T.ink}}>{quizItem.name}</strong>
              {quizItem.quizScore!=null&&<span style={{marginLeft:8,opacity:0.5}}>(previous answers loaded)</span>}
            </div>
            <div style={{display:"grid",gap:16,marginBottom:20}}>
              {QUIZ_Q.map((q,i)=>(
                <div key={i}>
                  <div style={{fontFamily:T.sans,fontSize:14,marginBottom:8,lineHeight:1.4}}>{q.q}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {["yes","no"].map(ans=>(
                      <button key={ans} onClick={()=>setQuizAns(a=>({...a,[i]:ans}))}
                        style={{padding:"10px 0",fontFamily:T.sans,fontSize:14,borderRadius:10,cursor:"pointer",transition:"all 0.15s",
                          border:`1.5px solid ${quizAns[i]===ans?T.ink:T.border}`,
                          background:quizAns[i]===ans?T.ink:"transparent",
                          color:quizAns[i]===ans?T.cream:T.ink}}>
                        {ans}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Btn variant="primary" style={{width:"100%",opacity:Object.keys(quizAns).length<QUIZ_Q.length?0.45:1}}
              disabled={Object.keys(quizAns).length<QUIZ_Q.length} onClick={submitQuiz}>
              Get my verdict
            </Btn>
          </div>
        )}
      </Popup>

      <Toast message={toast.message} visible={toast.visible}/>
    </div>
  );
}
