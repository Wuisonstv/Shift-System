// ══════════════════════════════════════════
//  SHIFT TYPES
// ══════════════════════════════════════════
const SHIFTS = [
  { code:'吧',   label:'吧台', bg:'#bbdefb', fg:'#0d47a1' },
  { code:'廚',   label:'廚房', bg:'#ffe0b2', fg:'#bf360c' },
  { code:'外',   label:'外場', bg:'#c8e6c9', fg:'#1b5e20' },
  { code:'文書', label:'文書', bg:'#e1bee7', fg:'#4a148c' },
  { code:'備',   label:'備班', bg:'#fff9c4', fg:'#f57f17' },
  { code:'休',   label:'休假', bg:'#ffab91', fg:'#bf360c' },
  { code:'20-2', label:'PT', bg:'#bbdefb', fg:'#0d47a1' },
  { code:'21-2', label:'PT', bg:'#c5cae9', fg:'#1a237e' },
  { code:'',     label:'清空', bg:'#f5f5f5', fg:'#9e9e9e' },
];
let customShifts = [];
let hiddenBuiltins = new Set();
function getShifts(){ return [...SHIFTS.slice(0,-1).filter(s=>!hiddenBuiltins.has(s.code)), ...customShifts, SHIFTS[SHIFTS.length-1]]; }
let SMAP = {};
function updateSMAP(){ SMAP = Object.fromEntries(getShifts().map(s=>[s.code,s])); }
function isRestShift(sh){ return !!sh && (sh==='休' || sh.includes('休')); }
const WDS = ['日','一','二','三','四','五','六'];

// ══════════════════════════════════════════
//  FIXED NOTES (always shown, cannot delete)
// ══════════════════════════════════════════
const FIXED_NOTES = [
  {text:'清冷氣濾網與製冰機',          color:'#2e7d32', dateKey:'green'},
  {text:'清潔油槽',                    color:'#1565c0', dateKey:'red'},
  {text:'月會',                        color:'#6a1b9a', dateKey:'meeting'},
  {text:'禮拜五六為最忙碌時期盡可能全員到齊！', color:'#c62828'},
];

const DEF_EMPS = ['Eric','Teen','Sue','Susan','Sharon','小黃','阿維','子芯'];

// 人員技能（動態，可透過 UI 修改）
const DEF_SKILLS = {
  'Eric':   ['吧'],
  'Teen':   ['廚'],
  'Sue':    ['文書','外'],
  'Susan':  ['外','備','廚'],
  'Sharon': ['外','備'],
  '小黃':   ['外','吧','廚'],
  '阿維':   ['吧','備'],
  '子芯':   ['21-2'],
};
let empSkills = {};
function getSkillOpts(){ return getShifts().filter(s=>s.code&&s.code!=='休'); } // 可選技能班別
const EXEMPT_EMPS = new Set(['Eric','Teen','Sue']); // 不受8天限制
const REST_PER_MONTH = 8;

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
let cy, cm; // current year/month
let data  = {};
let emps  = [];
let editCell = null, selShift = null;
let pubHols = [];      // [{date, localName}] for current month

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
const mkey = (y,m) => `${y||cy}-${String(m||cm).padStart(2,'0')}`;
const daysIn = (y,m) => new Date(y,m,0).getDate();
const dow    = (y,m,d) => new Date(y,m-1,d).getDay();
const pad2   = n => String(n).padStart(2,'0');
const ds     = (y,m,d) => `${y}-${pad2(m)}-${pad2(d)}`;

function ensureMonth(y,m){
  const k=mkey(y,m);
  if(!data[k]) data[k]={schedule:{},notes:[],fixedDates:{},closedDays:[],restOverride:{}};
  emps.forEach(e=>{ if(!data[k].schedule[e]) data[k].schedule[e]={}; });
}
function save(){ localStorage.setItem('tls_data',JSON.stringify(data)); localStorage.setItem('tls_emps',JSON.stringify(emps)); localStorage.setItem('tls_skills',JSON.stringify(empSkills)); localStorage.setItem('tls_custom_shifts',JSON.stringify(customShifts)); localStorage.setItem('tls_hidden_builtins',JSON.stringify([...hiddenBuiltins])); }
function exportData(){
  const payload={data,emps,empSkills,customShifts,hiddenBuiltins:[...hiddenBuiltins]};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='排班資料_'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(a.href);
}
function importData(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const p=JSON.parse(ev.target.result);
      if(!p.data||!p.emps) throw new Error('格式錯誤');
      if(!confirm('確定匯入？目前資料將被覆蓋。')){ e.target.value=''; return; }
      data=p.data; emps=p.emps; empSkills=p.empSkills||{}; customShifts=p.customShifts||[]; hiddenBuiltins=new Set(p.hiddenBuiltins||[]);
      updateSMAP(); save(); renderAll();
    }catch(err){ alert('匯入失敗：'+err.message); }
    e.target.value='';
  };
  reader.readAsText(file);
}
function hexAlpha(hex,a){ const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; }

// ══════════════════════════════════════════
//  PUBLIC HOLIDAYS (Taiwan built-in data)
// ══════════════════════════════════════════
// 台灣國定假日（含行政院公告之彈性放假）
const TW_HOLIDAYS = {
  2026: [
    {date:'2026-01-01', localName:'元旦'},
    {date:'2026-02-16', localName:'農曆除夕（彈性放假）'},
    {date:'2026-02-17', localName:'春節'},
    {date:'2026-02-18', localName:'春節'},
    {date:'2026-02-19', localName:'春節'},
    {date:'2026-02-20', localName:'春節'},
    {date:'2026-02-28', localName:'和平紀念日'},
    {date:'2026-04-03', localName:'兒童節'},
    {date:'2026-04-04', localName:'清明節'},
    {date:'2026-04-06', localName:'清明節補假'},
    {date:'2026-05-01', localName:'勞動節'},
    {date:'2026-06-19', localName:'端午節'},
    {date:'2026-09-25', localName:'中秋節'},
    {date:'2026-10-09', localName:'國慶日（彈性放假）'},
    {date:'2026-10-10', localName:'國慶日'},
  ],
  2027: [
    {date:'2027-01-01', localName:'元旦'},
    {date:'2027-02-05', localName:'農曆除夕'},
    {date:'2027-02-06', localName:'春節'},
    {date:'2027-02-07', localName:'春節'},
    {date:'2027-02-08', localName:'春節'},
    {date:'2027-02-09', localName:'春節'},
    {date:'2027-02-10', localName:'春節'},
    {date:'2027-03-01', localName:'和平紀念日補假'},
    {date:'2027-02-28', localName:'和平紀念日'},
    {date:'2027-04-04', localName:'兒童節'},
    {date:'2027-04-05', localName:'清明節'},
    {date:'2027-05-01', localName:'勞動節'},
    {date:'2027-06-09', localName:'端午節'},
    {date:'2027-09-29', localName:'中秋節'},
    {date:'2027-10-10', localName:'國慶日'},
    {date:'2027-10-11', localName:'國慶日補假'},
  ],
};

function loadPubHols(){
  pubHols = (TW_HOLIDAYS[cy]||[]).filter(h=>h.date.startsWith(`${cy}-${pad2(cm)}`));
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
function init(){
  const sd=localStorage.getItem('tls_data'), se=localStorage.getItem('tls_emps'), ss=localStorage.getItem('tls_skills'), sc=localStorage.getItem('tls_custom_shifts'), sh=localStorage.getItem('tls_hidden_builtins');
  if(sd) try{ data=JSON.parse(sd); }catch(e){}
  if(se) try{ emps=JSON.parse(se); }catch(e){}
  if(ss) try{ empSkills=JSON.parse(ss); }catch(e){}
  if(sc) try{ customShifts=JSON.parse(sc); }catch(e){}
  if(sh) try{ hiddenBuiltins=new Set(JSON.parse(sh)); }catch(e){}
  updateSMAP();
  if(!emps.length) emps=[...DEF_EMPS];
  // 預設技能補齊（未曾設定過的員工）
  emps.forEach(e=>{ if(!empSkills[e]) empSkills[e]=DEF_SKILLS[e]||[]; });

  // Remove any fixed notes or legacy holiday notes that were previously stored
  const fixedTexts=new Set(FIXED_NOTES.map(n=>n.text));
  const legacyRe=/清明連假|\d+\/\d+.*連假/;
  Object.values(data).forEach(md=>{
    if(md.notes) md.notes=md.notes.filter(n=>!fixedTexts.has(n.text)&&!legacyRe.test(n.text));
  });

  const t=new Date(); cy=t.getFullYear(); cm=t.getMonth()+1;
  ensureMonth(cy,cm);
  loadPubHols();
  renderAll();
}

// ══════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════
function renderAll(){ renderLabel(); renderLegend(); renderTable(); renderNotes(); renderStats(); renderRestOverride(); }

function renderLabel(){ document.getElementById('monthLabel').textContent=`${cy} 年 ${cm} 月`; }

function renderLegend(){
  document.getElementById('legend').innerHTML=
    getShifts().filter(s=>s.code).map(s=>
      `<div class="leg-item"><div class="leg-clr" style="background:${s.bg};color:${s.fg}">${s.code.substring(0,2)}</div><span>${s.label}</span></div>`
    ).join('');
}

function extractNoteDays(notes){
  const map={};
  const maxD=daysIn(cy,cm);
  const fill=(d1,d2,color)=>{ for(let d=Math.max(1,d1);d<=Math.min(maxD,d2);d++) map[d]=color; };
  notes.forEach(n=>{
    const t=n.text;
    let m;
    // Range: "X/Y~X/Z" or "X月Y日~X月Z日" or "X/Y~Z" (end month optional)
    const reRange=/(\d{1,2})[月\/](\d{1,2})[日號]?\s*[~～]\s*(?:(\d{1,2})[月\/])?(\d{1,2})[日號]?/g;
    while((m=reRange.exec(t))!==null){
      if(parseInt(m[1])!==cm) continue;
      const d1=parseInt(m[2]), d2=parseInt(m[4]);
      if(d1<=d2) fill(d1,d2,n.color);
    }
    // Range: "Y日~Z日" standalone
    const reDayRange=/(?:^|[^\/\d])(\d{1,2})[日號]\s*[~～]\s*(\d{1,2})[日號]/g;
    while((m=reDayRange.exec(t))!==null){
      const d1=parseInt(m[1]), d2=parseInt(m[2]);
      if(d1<=d2) fill(d1,d2,n.color);
    }
    // Single: "X月Y日" or "X/Y"
    const re1=/(\d{1,2})[月\/](\d{1,2})[日號]?/g;
    while((m=re1.exec(t))!==null){
      if(parseInt(m[1])===cm){ const d=parseInt(m[2]); if(d>=1&&d<=maxD) map[d]=n.color; }
    }
    // Standalone "Y日" or "Y號"
    const re2=/(?:^|[^\/\d])(\d{1,2})[日號]/g;
    while((m=re2.exec(t))!==null){
      const d=parseInt(m[1]); if(d>=1&&d<=maxD) map[d]=n.color;
    }
  });
  return map;
}
function renderTable(){
  const k=mkey(); const md=data[k]||{}; const days=daysIn(cy,cm);
  const fd=md.fixedDates||{};
  const closedDays=new Set(md.closedDays||[]);
  const DATED_KEYS=FIXED_NOTES.filter(n=>n.dateKey).map(n=>({key:n.dateKey,color:n.color}));
  const colBorder={};
  Object.assign(colBorder, extractNoteDays(md.notes||[]));
  DATED_KEYS.forEach(({key,color})=>{ if(fd[key]) colBorder[parseInt(fd[key])]=color; });
  let h='<thead><tr><th class="th-name">姓名</th>';
  for(let d=1;d<=days;d++){
    const dstr=ds(cy,cm,d); const dw=dow(cy,cm,d);
    const isHol=pubHols.some(h=>h.date===dstr);
    const isClosed=closedDays.has(d);
    let cl='th-day';
    if(isClosed) cl+=' closed-day';
    else if(isHol) cl+=' hol';
    else if(dw===6) cl+=' sat';
    else if(dw===0) cl+=' sun';
    else if(dw===5) cl+=' fri';
    const hoverTitle=isClosed?'公休日（店休）':isHol?'國定假日':dw>=1&&dw<=4?'平日':dw===5?'星期五':dw===6?'星期六':'星期日';
    const closedLabel=isClosed?'<div class="closed-lbl">公休</div>':'';
    h+=`<th class="${cl}" title="${hoverTitle}"><div class="wd">${WDS[dw]}</div><div class="dn">${d}</div>${closedLabel}</th>`;
  }
  h+='</tr></thead><tbody>';
  emps.forEach(e=>{
    const esch=((md.schedule||{})[e]||{});
    h+=`<tr><td class="td-name">${e}</td>`;
    for(let d=1;d<=days;d++){
      const dstr=ds(cy,cm,d);
      const stored=esch[dstr]||'';
      const sh=closedDays.has(d)?(stored||'休'):stored; const s=SMAP[sh];
      const fg=s?s.fg:'#bbb'; const bc=colBorder[d];
      const hasBg=s&&(sh==='休'||customShifts.some(cs=>cs.code===sh));
      const bgStyle=hasBg?`background:${s.bg};`:bc?`background:${hexAlpha(bc,.13)};`:'';
      h+=`<td class="sc" style="${bgStyle}color:${fg};" onclick="openShiftModal('${e}','${dstr}')" title="${e} ${cm}/${d}">${sh||'—'}</td>`;
    }
    h+='</tr>';
  });
  // Daily unfilled count row (hidden on print)
  h+='<tr class="day-count-row"><td class="td-name day-count-label">未填入</td>';
  for(let d=1;d<=days;d++){
    const dstr=ds(cy,cm,d);
    const bc=colBorder[d];
    const bgStyle=closedDays.has(d)?`background:#ffcdd2;`:bc?`background:${hexAlpha(bc,.13)};`:'';
    if(closedDays.has(d)){
      h+=`<td class="sc day-count-cell" style="${bgStyle}">—</td>`;
    } else {
      const empty=emps.filter(e=>!((md.schedule||{})[e]||{})[dstr]).length;
      const cellStyle=empty>0?`${bgStyle}color:#c0392b;`:`${bgStyle}color:#27ae60;`;
      h+=`<td class="sc day-count-cell" style="${cellStyle}">${empty}</td>`;
    }
  }
  h+='</tr>';
  // Daily operating count row (hidden on print)
  h+='<tr class="day-count-row"><td class="td-name day-count-label">營業人數</td>';
  for(let d=1;d<=days;d++){
    const dstr=ds(cy,cm,d);
    const bc=colBorder[d];
    const bgStyle=closedDays.has(d)?`background:#ffcdd2;`:bc?`background:${hexAlpha(bc,.13)};`:'';
    if(closedDays.has(d)){
      h+=`<td class="sc day-count-cell" style="${bgStyle}">—</td>`;
    } else {
      const op=emps.filter(e=>{ const sh=((md.schedule||{})[e]||{})[dstr]||''; return sh&&!isRestShift(sh)&&sh!=='備'&&sh!=='文書'; }).length;
      h+=`<td class="sc day-count-cell" style="${bgStyle}color:#1565c0;font-weight:700">${op}</td>`;
    }
  }
  h+='</tr>';
  h+='</tbody>';
  document.getElementById('schTable').innerHTML=h;
}

function renderNotes(){
  const k=mkey(); const notes=(data[k]||{}).notes||[];
  const el=document.getElementById('notesList');
  let idx=1;
  const fixedDates=(data[k]||{}).fixedDates||{};
  const fixedHtml=FIXED_NOTES.map(n=>{
    if(n.dateKey){
      const day=fixedDates[n.dateKey]||'';
      return `<li style="background:${hexAlpha(n.color,.09)}">
        <span class="nt" style="color:${n.color}">${idx++}. ${cm}月<input type="text" inputmode="numeric" value="${day}" placeholder="" style="width:2.8em;margin:0 2px;text-align:center;border:1px solid ${n.color};border-radius:3px;color:${n.color};font-weight:700" onchange="saveFixedDate('${n.dateKey}',this.value)">日 ${n.text}</span>
      </li>`;
    }
    return `<li style="background:${hexAlpha(n.color,.09)}">
      <span class="nt" style="color:${n.color}">${idx++}. ${n.text}</span>
    </li>`;
  }).join('');
  const pubHolHtml=pubHols.length
    ? `<li style="background:${hexAlpha('#c62828',.07)}">
      <span class="nt" style="color:#c62828">${idx++}. 國定假日 ${pubHols.map(h=>{const[,mo,d]=h.date.split('-');return `${+mo}/${+d} ${h.localName}`;}).join('、')}</span>
    </li>`
    : '';
  const userHtml=notes.map((n,i)=>
    `<li style="background:${hexAlpha(n.color,.09)}">
      <span class="nt" style="color:${n.color}">${idx++}. ${n.text}</span>
      <button class="nd" onclick="delNote(${i})" title="刪除">✕</button>
    </li>`
  ).join('');
  el.innerHTML=fixedHtml+pubHolHtml+userHtml;
}

function renderStats(){
  const k=mkey(); const md=data[k]||{}; const codes=getShifts().filter(s=>s.code).map(s=>s.code);
  const st={};
  const days2=daysIn(cy,cm);
  const closedDaysSt=new Set(md.closedDays||[]);
  emps.forEach(e=>{
    st[e]={}; codes.forEach(c=>{st[e][c]=0;}); st[e]._w=0;
    const esch=(md.schedule||{})[e]||{};
    for(let d=1;d<=days2;d++){
      const stored=esch[ds(cy,cm,d)]||'';
      const sh=closedDaysSt.has(d)?(stored||'休'):stored;
      if(sh && st[e][sh]!==undefined){ st[e][sh]++; if(!isRestShift(sh)) st[e]._w++; }
    }
  });
  let h='<div style="overflow-x:auto"><table class="stbl"><thead><tr><th>姓名</th>';
  codes.forEach(c=>{ const s=SMAP[c]; h+=`<th><span class="sbadge" style="background:${s.bg};color:${s.fg}">${c}</span></th>`; });
  h+='<th class="tot">工作天</th></tr></thead><tbody>';
  emps.forEach(e=>{
    h+=`<tr><td>${e}</td>`;
    codes.forEach(c=>{ const v=st[e][c]; const s=SMAP[c]; h+=`<td style="${v?`background:${s.bg};color:${s.fg};font-weight:700`:''}">${v||'—'}</td>`; });
    h+=`<td class="tot">${st[e]._w}</td></tr>`;
  });
  h+='</tbody></table></div>';
  document.getElementById('statsContent').innerHTML=h;
}

function renderRestOverride(){
  const k=mkey(); const md=data[k]||{};
  const ov=md.restOverride||{};
  document.getElementById('restOverrideList').innerHTML=
    emps.map(e=>`<div class="ro-row">
      <span class="ro-name">${e}</span>
      <input type="number" min="0" max="31" class="ro-input" value="${e in ov?ov[e]:REST_PER_MONTH}" onchange="setRestOverride('${e}',this.value)">
      <span class="ro-unit">天</span>
    </div>`).join('');
}
function setRestOverride(e,val){
  const k=mkey(); ensureMonth(cy,cm);
  if(!data[k].restOverride) data[k].restOverride={};
  const n=parseInt(val);
  if(val===''||isNaN(n)) delete data[k].restOverride[e];
  else data[k].restOverride[e]=Math.max(0,Math.min(31,n));
  save();
}

// ══════════════════════════════════════════
//  NOTES
// ══════════════════════════════════════════
function saveFixedDate(key,val){
  const k=mkey(); ensureMonth(cy,cm);
  const d=parseInt(val);
  data[k].fixedDates[key]=(d>=1&&d<=daysIn(cy,cm))?d:'';
  save(); renderTable();
}
function addNote(){
  const inp=document.getElementById('noteInput'); const text=inp.value.trim(); if(!text) return;
  const k=mkey(); ensureMonth(cy,cm);
  data[k].notes.push({text,color:document.getElementById('noteColor').value});
  inp.value=''; clearDraft('noteInput'); save(); renderNotes(); renderTable();
}
function delNote(i){ const k=mkey(); data[k].notes.splice(i,1); save(); renderNotes(); renderTable(); }

// ══════════════════════════════════════════
//  SHIFT MODAL
// ══════════════════════════════════════════
function openShiftModal(e,dstr){
  editCell={e,dstr};
  const k=mkey(); selShift=(((data[k]||{}).schedule||{})[e]||{})[dstr]||'';
  const [y,mo,d]=dstr.split('-');
  document.getElementById('shiftModalTitle').textContent=`${e} — ${+mo}/${+d} (${WDS[dow(+y,+mo,+d)]})`;
  renderPicker();
  document.getElementById('shiftModal').classList.add('open');
}
function renderPicker(){
  const skills=new Set(empSkills[editCell.e]||[]);
  // 固定可選：休假、清空；其餘依員工技能過濾（含自訂班別）
  const allowed=getShifts().filter(s=>!s.code||s.code==='休'||skills.has(s.code));
  document.getElementById('shiftPicker').innerHTML=
    allowed.map(s=>`<div class="sopt${selShift===s.code?' sel':''}" style="background:${s.bg};color:${s.fg};border-color:${selShift===s.code?s.fg:'transparent'}" onclick="pickShift('${s.code}')">${s.code||'清空'}</div>`
  ).join('');
}
function pickShift(c){ selShift=c; renderPicker(); }
function saveShift(){
  if(!editCell) return;
  const {e,dstr}=editCell; const k=mkey(); ensureMonth(cy,cm);
  data[k].schedule[e][dstr]=selShift;
  save(); renderTable(); renderStats(); closeShiftModal();
  const allV=[];
  if(selShift&&!isRestShift(selShift)){
    const [y2,m2,d2]=dstr.split('-').map(Number);
    const streak=consecWorkStreak(e,y2,m2,d2);
    if(streak>=7) allV.push(`${e} 連續工作 ${streak} 天（上限 6 天）`);
  }
  allV.push(...getStaffingViolations(dstr));
  if(allV.length) showStaffWarn(allV,dstr);
}
function getStaffingViolations(dstr){
  const k=mkey(); const sch=(data[k]||{}).schedule||{};
  const isStandby=e=>(sch[e]||{})[dstr]==='備';
  const workers=emps.filter(e=>!isRestShift((sch[e]||{})[dstr]));
  const operationalWorkers=workers.filter(e=>!isStandby(e));
  const violations=[];
  if(operationalWorkers.length<4){ violations.push(`營業時間人數不足 4 人（目前 ${operationalWorkers.length} 人，備班不計）`); return violations; }
  const hasSk=activeHasSk; const rem=new Set(operationalWorkers);
  // 備班需 5 人以上才可排
  if(workers.length<5 && workers.some(isStandby))
    violations.push(`在班人數不足 5 人，不應排備班（目前 ${workers.length} 人）`);
  // 廚房（備班不計）
  const chef=emps.find(e=>rem.has(e)&&hasSk(e,'廚'));
  if(!chef){ violations.push('缺少廚房人員（廚）'); } else { rem.delete(chef); }
  // 吧台
  const bar=emps.find(e=>rem.has(e)&&hasSk(e,'吧'));
  if(!bar){ violations.push('缺少吧台人員（吧）'); } else { rem.delete(bar); }
  // 外場（備班不計入）
  let fc=0;
  for(const e of emps){
    if(rem.has(e)&&(hasSk(e,'外')||hasSk(e,'21-2')||hasSk(e,'20-2'))){ rem.delete(e); fc++; }
    if(fc>=2) break;
  }
  if(fc<2) violations.push(`外場人數不足 2 人（外／PT，目前 ${fc} 人）`);
  return violations;
}
function showStaffWarn(violations,dstr){
  const [y,mo,d]=dstr.split('-').map(Number);
  document.getElementById('staffWarnDate').textContent=`${y} 年 ${mo} 月 ${d} 日`;
  document.getElementById('staffWarnList').innerHTML=violations.map(v=>`<li>${v}</li>`).join('');
  document.getElementById('staffWarnModal').classList.add('open');
}
function closeStaffWarnModal(){ document.getElementById('staffWarnModal').classList.remove('open'); }
function closeShiftModal(){
  document.getElementById('shiftModal').classList.remove('open');
  editCell=null; selShift=null;
}

// ══════════════════════════════════════════
//  EMPLOYEE MODAL
// ══════════════════════════════════════════
function openEmpModal(){ renderEmpList(); document.getElementById('empModal').classList.add('open'); }
function renderEmpList(){
  document.getElementById('empList').innerHTML=
    emps.map((e,i)=>{
      const sk=empSkills[e]||[];
      const badges=getSkillOpts().map(o=>
        `<span class="sk-badge${sk.includes(o.code)?' on':''}" style="background:${o.bg};color:${o.fg}" onclick="toggleEmpSkill(${i},'${o.code}')">${o.code||o.label}</span>`
      ).join('');
      return `<li>
        <div class="er">
          <span class="en">${e}</span>
          <div class="ea">
            <button class="ebtn" onclick="moveEmp(${i},-1)" ${i===0?'disabled':''}>↑</button>
            <button class="ebtn" onclick="moveEmp(${i},1)" ${i===emps.length-1?'disabled':''}>↓</button>
            <button class="ebtn del" onclick="removeEmp(${i})">刪除</button>
          </div>
        </div>
        <div class="eskills">${badges}</div>
      </li>`;
    }).join('');
}
function toggleEmpSkill(i,code){
  const e=emps[i]; if(!empSkills[e]) empSkills[e]=[];
  const idx=empSkills[e].indexOf(code);
  if(idx>=0) empSkills[e].splice(idx,1); else empSkills[e].push(code);
  save(); renderEmpList();
}
function addEmployee(){
  const inp=document.getElementById('newEmpInput'); const n=inp.value.trim();
  if(!n||emps.includes(n)) return;
  emps.push(n); inp.value=''; clearDraft('newEmpInput'); ensureMonth(cy,cm); save(); renderEmpList(); renderTable(); renderStats();
}
function removeEmp(i){
  if(!confirm(`確定刪除員工「${emps[i]}」？`)) return;
  emps.splice(i,1); save(); renderEmpList(); renderTable(); renderStats();
}
function moveEmp(i,d){
  const j=i+d; if(j<0||j>=emps.length) return;
  [emps[i],emps[j]]=[emps[j],emps[i]]; save(); renderEmpList(); renderTable();
}
function closeEmpModal(){ document.getElementById('empModal').classList.remove('open'); }

// ══════════════════════════════════════════
//  MONTH NAV
// ══════════════════════════════════════════
function chMonth(d){
  cm+=d; if(cm>12){cm=1;cy++;} if(cm<1){cm=12;cy--;}
  ensureMonth(cy,cm);
  loadPubHols();
  renderAll();
}
function goToday(){
  const t=new Date(); cy=t.getFullYear(); cm=t.getMonth()+1;
  ensureMonth(cy,cm);
  loadPubHols();
  renderAll();
}
function clearMonthConfirm(){
  if(!confirm(`確定清空 ${cy} 年 ${cm} 月 所有班表？`)) return;
  const k=mkey();
  data[k]={schedule:{},notes:[],fixedDates:{},closedDays:[],restOverride:{}};
  ensureMonth(cy,cm); save(); renderAll();
}
function activeHasSk(e,sk){ return getShifts().some(s=>s.code===sk)&&(empSkills[e]||[]).includes(sk); }
function canStaff(workers){
  if(workers.length<4) return false;
  const rem=new Set(workers);
  const hasSk=activeHasSk;
  const chef=emps.find(e=>rem.has(e)&&hasSk(e,'廚'));
  if(!chef) return false;
  rem.delete(chef);
  const bar=emps.find(e=>rem.has(e)&&hasSk(e,'吧'));
  if(!bar) return false;
  rem.delete(bar);
  let fc=0;
  for(const e of emps){
    if(rem.has(e)&&(hasSk(e,'外')||hasSk(e,'21-2')||hasSk(e,'20-2'))){ rem.delete(e); fc++; }
    if(fc>=2) break;
  }
  return fc>=2;
}

function consecWorkStreak(e,year,month,day){
  const getOff=(y2,m2,d2)=>{
    const k2=mkey(y2,m2);
    const cd=new Set((data[k2]||{}).closedDays||[]);
    if(cd.has(d2)) return true;
    const sh=((data[k2]||{}).schedule||{})[e]?.[ds(y2,m2,d2)]||'';
    return !sh||isRestShift(sh);
  };
  let before=0,ty=year,tm=month,td=day-1;
  while(before<31){if(td<1){tm--;if(tm<1){tm=12;ty--;}td=daysIn(ty,tm);}if(getOff(ty,tm,td))break;before++;td--;}
  let after=0;ty=year;tm=month;td=day+1;
  while(after<31){if(td>daysIn(ty,tm)){tm++;if(tm>12){tm=1;ty++;}td=1;}if(getOff(ty,tm,td))break;after++;td++;}
  return before+1+after;
}

function assignDayShifts(workers, esch, d){
  const dstr=ds(cy,cm,d);
  const done=new Set();
  const set=(e,sh)=>{ if(!esch[e]) esch[e]={}; esch[e][dstr]=sh; done.add(e); };
  const avail=e=>workers.includes(e)&&!done.has(e)&&!(esch[e]&&esch[e][dstr]);
  const hasSk=activeHasSk;

  const dw=dow(cy,cm,d);
  const isHoliday=pubHols.some(h=>h.date===dstr);
  // 一周最多一個備班
  const daysSinceMon=(dw+6)%7;
  const weekStart=d-daysSinceMon;
  let weekBeiCount=0;
  for(let wd=Math.max(1,weekStart);wd<d;wd++){
    const wdstr=ds(cy,cm,wd);
    for(const e2 of emps){if((esch[e2]||{})[wdstr]==='備')weekBeiCount++;}
  }
  if(weekStart<1){
    const py=cm===1?cy-1:cy,pm=cm===1?12:cm-1,pk=mkey(py,pm),pd=daysIn(py,pm);
    for(let wd=pd+weekStart;wd<=pd;wd++){
      const wdstr=ds(py,pm,wd);
      for(const e2 of emps){if(((data[pk]||{}).schedule||{})[e2]?.[wdstr]==='備')weekBeiCount++;}
    }
  }
  const useBei=workers.length>=5 && dw!==5 && dw!==6 && !isHoliday && weekBeiCount===0;

  // 吧台候選：主技能為吧的人優先（如阿維），其次依 emps 順序
  const barSorted=[...emps].sort((a,b)=>{
    const ap=(empSkills[a]||[])[0]==='吧'?0:1;
    const bp=(empSkills[b]||[])[0]==='吧'?0:1;
    return ap-bp;
  });
  // 廚房
  for(const e of emps){ if(avail(e)&&hasSk(e,'廚')){ set(e,'廚'); break; } }
  // 吧台第1人
  for(const e of barSorted){ if(avail(e)&&hasSk(e,'吧')){ set(e,'吧'); break; } }
  // PT 外場
  let floorN=0;
  emps.filter(e=>workers.includes(e)&&hasSk(e,'20-2')).forEach(e=>{ if(avail(e)){set(e,'20-2');floorN++;} });
  emps.filter(e=>workers.includes(e)&&hasSk(e,'21-2')).forEach(e=>{ if(avail(e)){set(e,'21-2');floorN++;} });
  // 外場（備班不補位）
  for(const e of emps){
    if(floorN>=2) break;
    if(avail(e)&&hasSk(e,'外')){ set(e,'外'); floorN++; }
  }
  // 吧台第2人（外場>=2後才排）
  if(floorN>=2){
    for(const e of barSorted){ if(avail(e)&&hasSk(e,'吧')){ set(e,'吧'); break; } }
  }
  // 備班（5人以上，每天最多一人）
  if(useBei){
    for(const e of emps){ if(avail(e)&&hasSk(e,'備')){ set(e,'備'); break; } }
  }
  // 剩餘人員填入第一個技能
  workers.forEach(e=>{
    const sk=(empSkills[e]||[]).filter(c=>activeHasSk(e,c));
    if(avail(e)&&sk.length&&!hasSk(e,'21-2')&&!hasSk(e,'20-2')){
      set(e,sk[0]);
    }
  });
}

function autoSchedule(){
  if(!confirm(`自動排班將填入 ${cy} 年 ${cm} 月 所有空白格，已手動填寫的班別不受影響，確定繼續？`)) return;
  const k=mkey(); ensureMonth(cy,cm);
  const md=data[k]; const days=daysIn(cy,cm);
  const MAX_CLOSED=4;

  // 重置公休日（排班結束後依分布重新決定）
  data[k].closedDays=[];

  // 每天確認休假名單（從已手動設定中建立）
  const offSet={};
  for(let d=1;d<=days;d++){
    offSet[d]=new Set();
    emps.forEach(e=>{ if(isRestShift(md.schedule[e][ds(cy,cm,d)])) offSet[d].add(e); });
  }

  // ── Phase 1：分配休假日 ──
  const overrides=md.restOverride||{};
  const restQuota={};
  // 配額扣除公休日預估數，避免統計顯示超出目標
  emps.forEach(e=>{
    const manualRest=Object.values(md.schedule[e]).filter(v=>isRestShift(v)).length;
    if(e in overrides){
      restQuota[e]=Math.max(0,(overrides[e]||0)-manualRest-MAX_CLOSED);
    } else {
      if(EXEMPT_EMPS.has(e)||(empSkills[e]||[]).includes('21-2')||(empSkills[e]||[]).includes('20-2')||(empSkills[e]||[]).length===0){ restQuota[e]=0; return; }
      restQuota[e]=Math.max(0,REST_PER_MONTH-manualRest-MAX_CLOSED);
    }
  });

  emps.forEach(e=>{
    if(!restQuota[e]) return;
    const candidates=[];
    for(let d=1;d<=days;d++){
      if(md.schedule[e][ds(cy,cm,d)]) continue;
      candidates.push(d);
    }
    let assigned=0;
    const needed=Math.min(restQuota[e], candidates.length);
    if(!needed) return;
    const step=candidates.length/needed;
    // 依均勻間距選定優先候選日，失敗時繼續往後找補
    const tried=new Set();
    const primary=Array.from({length:needed},(_,i)=>candidates[Math.min(Math.round(i*step),candidates.length-1)]);
    for(const d of primary){
      if(tried.has(d)) continue;
      tried.add(d);
      const workers=emps.filter(w=>!offSet[d].has(w)&&w!==e);
      if(canStaff(workers)){
        md.schedule[e][ds(cy,cm,d)]='休';
        offSet[d].add(e);
        assigned++;
      }
    }
    // 補足未達配額的休假日
    if(assigned<needed){
      for(const d of candidates){
        if(assigned>=needed) break;
        if(tried.has(d)||md.schedule[e][ds(cy,cm,d)]) continue;
        const workers=emps.filter(w=>!offSet[d].has(w)&&w!==e);
        if(canStaff(workers)){
          md.schedule[e][ds(cy,cm,d)]='休';
          offSet[d].add(e);
          assigned++;
        }
      }
    }
  });

  // ── Phase 1.5：防止連續工作 7 天 ──
  const prevY=cm===1?cy-1:cy,prevM=cm===1?12:cm-1;
  const prevMd=data[mkey(prevY,prevM)]||{};
  const prevClosed=new Set((prevMd.closedDays)||[]);
  const prevDaysCount=daysIn(prevY,prevM);
  emps.forEach(e=>{
    let initStreak=0;
    for(let pd=prevDaysCount;pd>=1;pd--){
      const psh=prevClosed.has(pd)?'休':((prevMd.schedule||{})[e]?.[ds(prevY,prevM,pd)]||'');
      if(!psh||isRestShift(psh)) break;
      initStreak++; if(initStreak>=6) break;
    }
    let streak=initStreak;
    for(let d=1;d<=days;d++){
      if(offSet[d].has(e)){streak=0;continue;}
      streak++;
      if(streak===7){
        const dstr2=ds(cy,cm,d);
        if(!md.schedule[e][dstr2]){
          md.schedule[e][dstr2]='休';offSet[d].add(e);streak=0;
        }
      }
    }
  });

  // ── 確定公休日：取休假人數最多之日（上限 MAX_CLOSED 天）──
  const restCountAfter={};
  for(let d=1;d<=days;d++){
    restCountAfter[d]=emps.filter(e=>offSet[d].has(e)).length;
  }
  const newClosedDays=Array.from({length:days},(_,i)=>i+1)
    .sort((a,b)=>restCountAfter[b]-restCountAfter[a])
    .slice(0,MAX_CLOSED)
    .sort((a,b)=>a-b);
  data[k].closedDays=newClosedDays;
  const closedSet=new Set(newClosedDays);

  // ── Phase 2：填入班別 ──
  for(let d=1;d<=days;d++){
    if(closedSet.has(d)) continue;
    const workers=emps.filter(e=>!offSet[d].has(e));
    const eSchMap={};
    workers.forEach(e=>{ eSchMap[e]=md.schedule[e]; });
    assignDayShifts(workers, eSchMap, d);
  }

  save(); renderAll();
}

// ══════════════════════════════════════════
//  SHIFT TYPE MODAL
// ══════════════════════════════════════════
function openShiftTypeModal(){
  renderBuiltinShiftList();
  renderCustomShiftList();
  document.getElementById('shiftTypeModal').classList.add('open');
}
function closeShiftTypeModal(){ document.getElementById('shiftTypeModal').classList.remove('open'); }

function renderBuiltinShiftList(){
  document.getElementById('builtinShiftList').innerHTML =
    SHIFTS.filter(s=>s.code).map(s=>{
      const hidden=hiddenBuiltins.has(s.code);
      return `<li class="stm-item${hidden?' stm-hidden':''}">
        <span class="stm-badge" style="background:${s.bg};color:${s.fg}">${s.code}</span>
        <span class="stm-lbl">${s.label}</span>
        ${hidden
          ? `<button class="ebtn" onclick="restoreBuiltin('${s.code}')">還原</button>`
          : `<button class="ebtn del" onclick="hideBuiltin('${s.code}')">刪除</button>`}
      </li>`;
    }).join('');
}
function hideBuiltin(code){
  hiddenBuiltins.add(code);
  updateSMAP(); save();
  renderBuiltinShiftList(); renderLegend(); renderTable(); renderStats();
}
function restoreBuiltin(code){
  hiddenBuiltins.delete(code);
  updateSMAP(); save();
  renderBuiltinShiftList(); renderLegend(); renderTable(); renderStats();
}
function renderCustomShiftList(){
  const el=document.getElementById('customShiftList');
  if(!customShifts.length){
    el.innerHTML='<li style="color:#aaa;font-size:.82rem;padding:4px 0">尚無自訂班別</li>';
    return;
  }
  el.innerHTML=customShifts.map((s,i)=>
    `<li class="stm-item">
      <span class="stm-badge" style="background:${s.bg};color:${s.fg}">${s.code}</span>
      <span class="stm-lbl">${s.label}</span>
      <button class="ebtn del" onclick="removeCustomShift(${i})">刪除</button>
    </li>`
  ).join('');
}
function randomShiftColor(){
  const usedHues = getShifts().filter(s=>s.bg&&s.bg.startsWith('hsl')).map(s=>parseInt(s.bg.match(/\d+/)[0]));
  const candidates = Array.from({length:36},(_,i)=>i*10).filter(h=>usedHues.every(u=>Math.min(Math.abs(h-u),360-Math.abs(h-u))>=20));
  const hue = candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : Math.floor(Math.random()*36)*10;
  return { bg:`hsl(${hue},62%,90%)`, fg:`hsl(${hue},68%,24%)` };
}
function addCustomShift(){
  const code=document.getElementById('csCode').value.trim();
  const label=document.getElementById('csLabel').value.trim();
  if(!code||!label){ alert('請填寫代碼與名稱'); return; }
  if(getShifts().some(s=>s.code===code)){ alert(`班別代碼「${code}」已存在`); return; }
  const {bg,fg}=randomShiftColor();
  customShifts.push({code,label,bg,fg});
  updateSMAP();
  save();
  renderCustomShiftList();
  renderLegend();
  renderTable();
  renderStats();
  document.getElementById('csCode').value=''; clearDraft('csCode');
  document.getElementById('csLabel').value=''; clearDraft('csLabel');
}
function removeCustomShift(i){
  if(!confirm(`確定刪除自訂班別「${customShifts[i].label}」？已排入的班表代碼將保留但不顯示顏色。`)) return;
  const code=customShifts[i].code;
  Object.keys(empSkills).forEach(e=>{ const idx=empSkills[e].indexOf(code); if(idx>=0) empSkills[e].splice(idx,1); });
  customShifts.splice(i,1);
  updateSMAP();
  save();
  renderCustomShiftList();
  renderLegend();
  renderTable();
  renderStats();
}

// ══════════════════════════════════════════
//  CLOSE ON OUTSIDE CLICK / ESC
// ══════════════════════════════════════════
document.getElementById('shiftModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeShiftModal(); });
document.getElementById('empModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeEmpModal(); });
document.getElementById('shiftTypeModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeShiftTypeModal(); });
document.getElementById('staffWarnModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeStaffWarnModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeShiftModal(); closeEmpModal(); closeShiftTypeModal(); closeStaffWarnModal(); } });

// ══════════════════════════════════════════
//  DRAFT & AUTO-SAVE
// ══════════════════════════════════════════
const DRAFT_IDS = ['noteInput','newEmpInput','csCode','csLabel'];
function clearDraft(id){ localStorage.removeItem('tls_draft_'+id); }
function initDrafts(){
  DRAFT_IDS.forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const saved=localStorage.getItem('tls_draft_'+id);
    if(saved) el.value=saved;
    el.addEventListener('input',()=>localStorage.setItem('tls_draft_'+id,el.value));
  });
}
// 切換分頁或關閉視窗前強制存檔
document.addEventListener('visibilitychange',()=>{ if(document.hidden) save(); });
window.addEventListener('beforeunload',()=> save());

init();
initDrafts();
