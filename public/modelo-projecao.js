// GERADO por scripts/gerar-modelo-projecao.mjs a partir de lib/central/central.html. Não editar à mão.
globalThis.modeloProjecao = (function () {
const $ = () => null; const S = { agentes: [] };
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const brl=n=>Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const int=n=>Number(n||0).toLocaleString('pt-BR');
const pct=(n,d=1)=>Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mesLabel=c=>{if(!c)return '—';const [a,m]=c.split('-');return MES[+m-1]+'/'+a.slice(2)};
const kfmt=v=>{const a=Math.abs(v);return a>=1e6?(v/1e6).toFixed(2).replace('.',',')+' mi':a>=1e3?Math.round(v/1000)+' mil':String(Math.round(v))};
const isAg=i=>i.tipo?i.tipo==='AN':+i.taxa>50;
const nomeAg=k=>(S.agentes.find(a=>a.id===k)||{}).nome||k;
const sum=(a,f)=>a.reduce((s,x)=>s+(+f(x)||0),0);
const uniq=a=>[...new Set(a)];
const pdate=s=>{if(!s)return null;const p=String(s).split('/');return p.length===3?new Date(Date.UTC(+p[2],+p[1]-1,+p[0])):null};
const today=()=>{const d=new Date();return new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))};
const addMonth=(c,k)=>{let [a,m]=c.split('-').map(Number);m+=k;while(m>12){m-=12;a++}while(m<1){m+=12;a--}return a+'-'+String(m).padStart(2,'0')};
const ckey=d=>d.toISOString().slice(0,7);

// seguradoras: ordem e cor fixas (a cor segue a seguradora, nunca a posição)
const FAMS=['Porto','Bradesco','Amil','Santa Helena','Hapvida','SulAmérica'];
const FCOL={Porto:'var(--s1)',Bradesco:'var(--s2)',Amil:'var(--s3)','Santa Helena':'var(--s4)',Hapvida:'var(--s5)','SulAmérica':'var(--s6)',Outras:'var(--faint)','Vitalício':'var(--accent)','Agenciamento':'var(--s4)','Outros':'var(--faint)','A cair':'var(--faint)'};
const fam=op=>{op=String(op||'');return /porto/i.test(op)?'Porto':/bradesco/i.test(op)?'Bradesco':/amil/i.test(op)?'Amil':/santa/i.test(op)?'Santa Helena':/hapvida/i.test(op)?'Hapvida':/sul/i.test(op)?'SulAmérica':'Outras'};
const famsIn=list=>FAMS.filter(f=>list.includes(f));
const norm=s=>{s=String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ');
  const w=s.split(/\s+/).filter(x=>x&&!/^\d+$/.test(x)&&!['LTDA','ME','EPP','EIRELI','DE','DO','DA','DOS','E','S','A','CIA','SA','LIMITADA','MEI'].includes(x));return w.slice(0,2).join(' ')};

function mergeCom(list){const g={};list.forEach(c=>{const m=g[c.comp]=g[c.comp]||{comp:c.comp,ops:[],ordens:[],itens:[],extras:[],pendentes:[],faturasMes:0,obs:[],atualizadoEm:''};
  m.ops.push(c.operadora);m.ordens.push(...(c.ordens||[]).map(o=>Object.assign({operadora:c.operadora},o)));m.itens.push(...(c.itens||[]).map(i=>Object.assign({operadora:c.operadora},i)));m.extras.push(...(c.extras||[]));m.pendentes.push(...(c.pendentes||[]));
  m.faturasMes+=(+c.faturasMes||0);if(c.obs)m.obs.push(c.obs);if(String(c.atualizadoEm)>m.atualizadoEm)m.atualizadoEm=c.atualizadoEm});
  return Object.values(g).map(m=>Object.assign(m,{operadora:m.ops.join(', '),obs:m.obs.join(' ')}))}
function projModel(faturas,comissoes,hoje,agcfg,imps){
  agcfg=agcfg||{};imps=(imps||[]).filter(i=>i&&i.status!=='Cancelada'&&i.inicio);
  const impBy={};imps.forEach(i=>{if(i.eid)impBy[i.eid]=i});
  const impN=im=>im&&+im.agPct>0?Math.ceil(+im.agPct/100-1e-9):0;
  const impFr=(im,k)=>{const n=impN(im);if(!n||k<1||k>n)return 0;return k<n?1:Math.round((+im.agPct-100*(n-1)))/100};
  const pctTx=v=>String(+v).replace('.',',')+'%';
  const pd=s=>{const [d,m,a]=String(s).split('/');return new Date(Date.UTC(+a,+m-1,+d))};
  const iso=d=>d.toISOString().slice(0,10);
  const addD=(d,n)=>new Date(d.getTime()+n*864e5);
  const addM=(c,k)=>{let [a,m]=c.split('-').map(Number);m+=k;while(m>12){m-=12;a++}while(m<1){m+=12;a--}return a+'-'+String(m).padStart(2,'0')};
  const mdiff=(a,b)=>{const [y1,m1]=a.split('-').map(Number),[y2,m2]=b.split('-').map(Number);return (y2-y1)*12+(m2-m1)};
  const shiftM=(d,k)=>{const y=d.getUTCFullYear(),m=d.getUTCMonth()+k,day=d.getUTCDate();const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return new Date(Date.UTC(y,m,Math.min(day,last)))};
  const T=new Date(Date.UTC(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()));
  const util=d=>{const w=d.getUTCDay();return w===6?addD(d,2):w===0?addD(d,1):d};
  const kindOf=i=>isAg(i)?'ag':'vit';
  const PROX=util(addD(T,1)); // o que já devia ter caído e não caiu: atraso, vai para o próximo dia útil (nunca fim de semana)
  const fat=faturas.flatMap(d=>(d.itens||[]).map(r=>Object.assign({comp:d.comp,operadora:d.operadora},r)));
  if(!fat.length)return null;
  // histórico de comissões por empresa
  const hist={},pagos=new Set(),real=[];
  comissoes.forEach(c=>{const od={};(c.ordens||[]).forEach(o=>od[o.op]=o.dataISO);
    (c.itens||[]).forEach(i=>{pagos.add(String(i.titulo)+'|'+i.compFat);const dt=od[i.op]?new Date(od[i.op]+'T00:00:00Z'):null;
      (hist[i.eid]=hist[i.eid]||[]).push(Object.assign({dt},i));
      if(dt)real.push({tipo:'real',op:i.operadora,kind:kindOf(i),eid:i.eid,empresa:i.empresa,titulo:i.titulo,data:dt,valor:+i.comissao||0,parc:i.parcela,comp:i.compFat,taxa:+i.taxa,obs:i.parcela+'ª parcela · '+String(i.taxa).replace('.',',')+'%',base:{fat:i.titulo,comp:i.compFat,valor:+i.valorFat||0,venc:i.venc},how:'Já creditada: ordem '+i.op+' · '+String(i.taxa).replace('.',',')+'% sobre prêmio de R$ '+brl(i.premio),quando:'pago em '+(od[i.op]?od[i.op].split('-').reverse().join('/'):'')})});
    const oo={};(c.ordens||[]).forEach(o=>oo[o.op]=o.operadora);
    // lançamentos sem fatura na base (bônus, odonto, seguros gerais) também são crédito: entram no "já caiu"
    (c.extras||[]).forEach(e=>{if(e.titulo)pagos.add(String(e.titulo));const dt=od[e.op]?new Date(od[e.op]+'T00:00:00Z'):null;if(!dt||!(+e.comissao))return;
      real.push({tipo:'real',extra:true,op:oo[e.op]||'',kind:'outro',eid:e.eid||'',empresa:String(e.hist||e.tipo||'Lançamento').split(' / ')[0].split(' · ')[0],titulo:e.titulo||null,data:dt,valor:+e.comissao||0,parc:null,comp:c.comp,taxa:+e.taxa,obs:e.tipo||'Outro',base:{fat:e.titulo||null,comp:c.comp,valor:+e.premio||0},how:'Já creditada: ordem '+e.op+' · '+(e.tipo||'lançamento')+' (sem fatura na base)',quando:'pago em '+od[e.op].split('-').reverse().join('/')})})});
  const lagL=eid=>(hist[eid]||[]).filter(i=>i.dt&&i.venc).map(i=>({x:Math.round((i.dt-pd(i.venc))/864e5),lim:/hapvida/i.test(i.operadora||'')?45:20})).filter(o=>o.x>-15&&o.x<o.lim).map(o=>o.x).sort((a,b)=>a-b); // a Hapvida paga cerca de 1 mês depois do vencimento
  const lag=eid=>{const l=lagL(eid);return l.length?l[Math.floor(l.length/2)]:4};
  const lagTxt=eid=>{const l=lagL(eid),n=lag(eid),dias=Math.abs(n)+(Math.abs(n)===1?' dia':' dias');return (n===0?'no dia do vencimento':n>0?dias+' depois do vencimento':dias+' antes do vencimento')+(l.length?' (é quando essa empresa costuma ser paga: mediana de '+l.length+' comissões)':' (sem histórico: prazo padrão)')};
  const dm=d=>String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0');
  const ref=r=>{const h=(hist[r.eid]||[]).slice().sort((a,b)=>a.compFat.localeCompare(b.compFat));if(!h.length)return null;
    const lastC=h[h.length-1].compFat;const cand=h.filter(i=>i.compFat===lastC);return cand.sort((a,b)=>((+b.parcela>0)-(+a.parcela>0))||Math.abs(a.valorFat-r.valor)-Math.abs(b.valorFat-r.valor))[0]};
  // situação do agenciamento de cada empresa
  const agMemo={};
  const agInfo=eid=>{if(agMemo[eid])return agMemo[eid];const cfg=agcfg[eid],im=impBy[eid]||null,imN=impN(im);
    const h=(hist[eid]||[]).slice();const byP={};h.forEach(i=>{if(+i.parcela>0)(byP[i.parcela]=byP[i.parcela]||[]).push(i)});
    const ps=Object.keys(byP).map(Number).sort((a,b)=>a-b);
    const kP=p=>byP[p].some(isAg)?'ag':'vit';
    const rec=ps.filter(p=>kP(p)==='ag').map(p=>({parcela:p,taxa:Math.max(...byP[p].map(i=>+i.taxa)),valor:byP[p].reduce((s,i)=>s+(+i.comissao||0),0),comp:byP[p][0].compFat}));
    const last=ps.length?ps[ps.length-1]:0, lastComp=ps.length?byP[last][0].compFat:null;
    const assum=ps.length&&kP(ps[0])==='ag'?ps[0]-1:0;
    // taxa vitalícia: só dos meses em que a empresa NÃO recebeu agenciamento (a linha de 0,01% que o Bradesco paga junto com o agenciamento não é o vitalício de depois)
    const agComps=new Set(h.filter(isAg).map(i=>i.compFat));
    const vits=h.filter(i=>!isAg(i)&&!agComps.has(i.compFat)).sort((a,b)=>a.compFat.localeCompare(b.compFat)||a.parcela-b.parcela);
    let vitRate=vits.length?+vits[vits.length-1].taxa:2, vitSrc=vits.length?'hist':'padrao';
    if(im&&+im.vitPct>0&&!vits.length){vitRate=+im.vitPct;vitSrc='imp'}
    let restantes,apos=last,auto=!cfg;
    if(cfg){restantes=Math.max(0,+cfg.restantes||0);apos=+cfg.aposParcela||last}
    else if(imN)restantes=ps.length&&kP(last)==='vit'?0:Math.max(0,imN-(assum+rec.length));
    else restantes=!ps.length||kP(last)==='vit'?0:Math.max(0,3-(assum+rec.length));
    const frac=k=>imN?(impFr(im,assum+rec.length+k)||1):1;
    return agMemo[eid]={eid,restantes,apos,auto,rec,assum,vitRate,vitSrc,last,lastComp,cfg:cfg||null,im,imN,frac}};
  const comFor=(r,comp)=>{const L=ref(r),A=agInfo(r.eid),val=+r.valor||0;
    if(!L&&A.im){const q=mdiff(A.im.inicio,comp)+1,fr=impFr(A.im,q);
      if(fr>0)return {v:val/1.0238*fr,taxa:100,parc:q,kind:'ag',ultima:q===A.imN,how:'Agenciamento da implantação ('+pctTx(A.im.agPct)+'): '+q+'ª fatura × '+pctTx(fr*100)+' sem IOF'};
      const tv=+A.im.vitPct||2;return {v:val/1.0238*tv/100,taxa:tv,parc:q,kind:'vit',how:'Vitalício da implantação: fatura sem IOF × '+pctTx(tv)}}
    if(!L)return {v:val*0.0195,taxa:2,parc:null,kind:'vit',semHist:true,how:'Empresa sem comissão na base: estimado 2% da fatura sem IOF. Fica fora da soma até a primeira comissão cair'};
    const q=L.parcela+mdiff(L.compFat,comp);
    if(q>A.apos&&q-A.apos<=A.restantes){const H_=(hist[r.eid]||[]).filter(isAg),La=H_.sort((a,b)=>b.parcela-a.parcela)[0];
      // repete a última parcela paga: a desta mesma fatura/subfatura, senão a da última competência com valor de fatura mais parecido
      const same_=H_.find(i=>String(i.titulo)===String(r.titulo)), lc=La&&La.compFat, near=H_.filter(i=>i.compFat===lc).sort((a,b)=>Math.abs((+a.valorFat||0)-(+r.valor0||val))-Math.abs((+b.valorFat||0)-(+r.valor0||val)))[0], Lb=same_||near||La;
      const fr=A.frac(q-A.apos);
      if(Lb)return {v:(+Lb.comissao||0)*fr,taxa:100,parc:q,kind:'ag',ultima:q-A.apos===A.restantes,how:'Agenciamento ('+q+'ª parcela, '+(!A.auto?'informado pela equipe: faltam '+A.restantes:A.im?'implantação de '+pctTx(A.im.agPct):'regra padrão de 3 parcelas')+'): repete a última parcela paga, R$ '+brl(Lb.comissao)+' ('+Lb.parcela+'ª, fatura de '+mesLabel(Lb.compFat)+')'+(fr<1?' × '+pctTx(fr*100)+' (parcela parcial)':'')};
      const ra=1/1.0238;
      return {v:val*ra*fr,taxa:100,parc:q,kind:'ag',ultima:q-A.apos===A.restantes,how:'Agenciamento ('+q+'ª parcela, '+(!A.auto?'informado pela equipe: faltam '+A.restantes:A.im?'implantação de '+pctTx(A.im.agPct):'regra padrão de 3 parcelas')+'): valor da fatura × '+(ra*100).toFixed(1).replace('.',',')+'%'+(fr<1?' × '+pctTx(fr*100)+' (parcela parcial)':'')+' — mesma proporção do último agenciamento pago'+(La?' (R$ '+brl(La.comissao)+' sobre fatura de R$ '+brl(La.valorFat)+')':'')}}
    const taxa=A.vitRate, padrao=A.vitSrc==='padrao'&&isAg(L);
    const same=+L.taxa===taxa&&L.valorFat;const v=same?val*(L.comissao/L.valorFat):val/1.0238*taxa/100;
    return {v,taxa,parc:q,kind:'vit',vira:isAg(L),how:'Vitalício '+String(taxa).replace('.',',')+'%'+(padrao?' (taxa padrão: sem histórico de vitalício fora do agenciamento; confirme e informe na Implantação)':'')+': '+(same?'valor da fatura × '+(L.comissao/L.valorFat*100).toFixed(2).replace('.',',')+'% — mesma proporção da última comissão (R$ '+brl(L.comissao)+' sobre fatura de R$ '+brl(L.valorFat)+', '+mesLabel(L.compFat)+')':'fatura sem IOF × '+String(taxa).replace('.',',')+'%')};
  };
  const comOps=new Set(comissoes.flatMap(c=>c.ops||[c.operadora]));
  const ultComp=fat.map(r=>r.comp).sort().pop();
  const ultCom=comissoes.map(c=>c.comp).sort().pop()||ultComp;
  const H=3;
  const emp=[],com=[];
  const cobs=c=>(c.parc?c.parc+'ª parcela · ':'')+c.taxa+'%'+(c.kind==='ag'&&c.ultima?' (último agenciamento)':'')+(c.kind==='vit'&&c.vira?' (já vitalício)':'');
  // faturas emitidas
  fat.forEach(r=>{const v=util(pd(r.venc));const pago=!/aberto|Boleto OK/i.test(r.boleto||'');
    emp.push({tipo:pago?'real':'prev',op:r.operadora,eid:r.eid,empresa:r.empresa,titulo:r.titulo,data:v,valor:+r.valor||0,obs:pago?'boleto pago':'boleto em aberto'});
    if(comOps.has(r.operadora)&&r.comp>=addM(ultCom,-1)&&!pagos.has(String(r.titulo)+'|'+r.comp)&&!pagos.has(String(r.titulo))){
      const c=comFor(r,r.comp);let d=util(addD(pd(r.venc),lag(r.eid)));const atras=d<T,dPrev=d;if(atras)d=PROX;
      com.push({tipo:'prev',semHist:!!c.semHist,atraso:atras,op:r.operadora,kind:c.kind,eid:r.eid,empresa:r.empresa,titulo:r.titulo,data:d,valor:c.v,parc:c.parc,comp:r.comp,taxa:c.taxa,how:c.how,base:{fat:r.titulo,comp:r.comp,valor:+r.valor||0,venc:r.venc},quando:atras?'previsto para '+dm(dPrev)+' e ainda não caiu: em atraso, jogado para '+dm(PROX):'vencimento '+r.venc.slice(0,5)+' + '+lagTxt(r.eid),obs:(atras?'em atraso (previsão era '+String(dPrev.getUTCDate()).padStart(2,'0')+'/'+String(dPrev.getUTCMonth()+1).padStart(2,'0')+') · ':'')+'fatura '+r.titulo+' · '+cobs(c)})}});
  com.push(...real);
  // projeção a partir das faturas da última competência
  // proteção: se a última fatura da empresa veio mais de 30% abaixo da média dos 3 meses anteriores, projeta pela média
  const totE={};fat.forEach(r=>{const o=totE[r.eid]=totE[r.eid]||{};o[r.comp]=(o[r.comp]||0)+(+r.valor||0)});
  const fatorE={};Object.entries(totE).forEach(([e,o])=>{const cur=o[ultComp];if(!cur)return;const prev=[1,2,3].map(k=>o[addM(ultComp,-k)]).filter(x=>x>0);if(prev.length<2)return;const med=prev.reduce((a,b)=>a+b,0)/prev.length;if(cur<0.7*med)fatorE[e]={f:med/cur,cur,med}});
  const base=fat.filter(r=>r.comp===ultComp).map(r=>{const F=fatorE[r.eid];return F?Object.assign({},r,{valor:(+r.valor||0)*F.f,valor0:+r.valor||0,fora:F}):r});
  for(let k=1;k<=H;k++){const comp=addM(ultComp,k);
    base.forEach(r=>{const v0=shiftM(pd(r.venc),k),v=util(v0);
      emp.push({tipo:'proj',op:r.operadora,eid:r.eid,empresa:r.empresa,titulo:null,data:v,valor:+r.valor||0,comp,obs:r.fora?'fatura fora do normal em '+mesLabel(ultComp)+': usa a média dos 3 meses anteriores':'repete a fatura de '+ultComp.slice(5)+'/'+ultComp.slice(2,4)});
      if(!comOps.has(r.operadora))return;const c=comFor(r,comp);com.push({tipo:'proj',semHist:!!c.semHist,fora:!!r.fora,op:r.operadora,kind:c.kind,eid:r.eid,empresa:r.empresa,data:util(addD(v0,lag(r.eid))),valor:c.v,parc:c.parc,comp,taxa:c.taxa,obs:cobs(c),how:c.how+(r.fora&&c.kind==='vit'?' · fatura fora do normal em '+mesLabel(ultComp)+' (R$ '+brl(r.fora.cur)+' contra média de R$ '+brl(r.fora.med)+'): projeta pela média; confira':''),base:{fat:null,comp,valor:+r.valor||0,venc:dm(v0)+'/'+v0.getUTCFullYear(),rep:r.titulo},quando:'vencimento previsto '+dm(v0)+' + '+lagTxt(r.eid)})})}
  // implantações que ainda não têm fatura na base
  const fatE=new Set(fat.map(r=>r.eid)), endC=addM(T.toISOString().slice(0,7),3);
  const novas=imps.filter(im=>!(im.eid&&fatE.has(im.eid))&&+im.valor>0);
  novas.forEach(im=>{const n=impN(im),tv=+im.vitPct||2,dia=+im.diaVenc||10,id='IMP:'+(im.id||im.empresa);
    for(let comp=im.inicio,q=1;comp<=endC;comp=addM(comp,1),q++){const [a,m]=comp.split('-').map(Number);const v0=new Date(Date.UTC(a,m-1,Math.min(dia,new Date(Date.UTC(a,m,0)).getUTCDate())));
      const val=+im.valor,fr=impFr(im,q),ag=fr>0,cv=ag?val/1.0238*fr:val/1.0238*tv/100;let d=util(addD(v0,4));const atras=d<T,dPrev=d;if(atras)d=PROX;
      emp.push({tipo:'proj',op:im.operadora,eid:im.eid||'',empresa:im.empresa,titulo:null,data:util(v0),valor:val,comp,obs:'implantação nova · '+q+'ª fatura estimada'});
      com.push({tipo:'proj',atraso:atras,op:im.operadora,kind:ag?'ag':'vit',eid:im.eid||'',imp:id,empresa:im.empresa,data:d,valor:cv,parc:q,comp,taxa:ag?100:tv,
        how:ag?'Implantação nova ('+pctTx(im.agPct)+'): '+q+'ª fatura estimada de R$ '+brl(val)+' sem IOF × '+pctTx(fr*100):'Implantação nova, já vitalício: fatura estimada de R$ '+brl(val)+' sem IOF × '+pctTx(tv),
        quando:atras?'previsto para '+dm(dPrev)+' e a fatura ainda não está na base: em atraso, jogado para '+dm(PROX):'vencimento dia '+dia+' + 4 dias (prazo padrão)',base:{fat:null,comp,valor:val,venc:dm(v0)+'/'+a},obs:'implantação · '+q+'ª fatura · '+(ag?pctTx(fr*100):pctTx(tv))})}});
  // empresas em agenciamento (ou que acabaram de sair)
  const eids=[...new Set(fat.filter(r=>r.comp===ultComp).map(r=>r.eid))];
  const ag=eids.map(agInfo).filter(A=>(A.rec.length||A.im)&&(A.restantes>0||A.cfg||com.some(x=>x.eid===A.eid&&x.kind==='ag'&&x.tipo!=='real')))
    .map(A=>{const nome=(fat.find(r=>r.eid===A.eid)||{}).empresa||A.eid;
      const prox=com.filter(x=>x.eid===A.eid&&x.kind==='ag'&&x.tipo!=='real').sort((a,b)=>a.parc-b.parc);
      const recR=real.filter(x=>x.eid===A.eid&&x.kind==='ag');
      const vit=com.filter(x=>x.eid===A.eid&&x.kind==='vit'&&x.tipo!=='real'&&x.parc>A.apos).sort((a,b)=>a.parc-b.parc)[0];
      return Object.assign({nome,prox,recR,vit},A)});
  return {emp,com,ag,hoje:T,ultComp,iso,novas};
}

const fatItems=list=>list.flatMap(d=>(d.itens||[]).map(r=>Object.assign({comp:d.comp,operadora:d.operadora},r)));

function projAll(fat,comMerged,o){o=o||{};
  // comissões sem código de empresa (ex.: Hapvida) ganham o código da fatura de mesmo nome e seguradora, para usar o histórico da própria empresa
  // e passam a apontar para a fatura daquela competência (título e vencimento), para não contar de novo como "a receber" e para medir o prazo real de pagamento
  const nIdx={},tIdx={};fatItems(fat).forEach(r=>{const k=fam(r.operadora)+'|'+norm(r.empresa);if(!nIdx[k])nIdx[k]=r.eid;const t=r.eid+'|'+r.comp;if(!tIdx[t]||(+r.valor||0)>tIdx[t].v)tIdx[t]={t:r.titulo,v:+r.valor||0,venc:r.venc}});
  comMerged=comMerged.map(c=>Object.assign({},c,{itens:(c.itens||[]).map(i=>{if(i.eid)return i;const e=nIdx[fam(i.operadora)+'|'+norm(i.empresa)];if(!e)return i;const f=tIdx[e+'|'+i.compFat];return Object.assign({},i,{eid:e},f?{titulo:f.t,venc:i.venc||f.venc}:{})})}));
  const M=projModel(fat,comMerged,o.hoje||new Date(),o.agcfg,o.imps); if(!M)return null;
  const T=M.hoje, util=d=>{const w=d.getUTCDay();return w===6?new Date(d.getTime()+2*864e5):w===0?new Date(d.getTime()+864e5):d};
  const fatNames=new Set(fatItems(fat).map(r=>fam(r.operadora)+'|'+norm(r.empresa)));
  const last={};
  comMerged.forEach(c=>{const od={};(c.ordens||[]).forEach(o=>od[o.op]=o.dataISO);
    (c.itens||[]).forEach(i=>{const k=fam(i.operadora)+'|'+norm(i.empresa);if(i.eid||fatNames.has(k))return;
      const L=last[k]=last[k]||{comp:'',itens:[],op:i.operadora,empresa:i.empresa,dt:null};
      if(c.comp>L.comp){L.comp=c.comp;L.itens=[];L.dt=null}
      if(c.comp===L.comp){L.itens.push(i);if(od[i.op])L.dt=od[i.op]}})});
  const extra=[], endM=addMonth(ckey(T),3);
  const cmT=ckey(T);
  Object.values(last).forEach(L=>{const vit=L.itens.filter(i=>!isAg(i));const v=sum(vit,i=>i.comissao);if(v<=0)return;
    if(L.comp<addMonth(cmT,-2))return; // parou de pagar há mais de 2 meses: não projeta
    const day=L.dt?+L.dt.slice(8,10):10;
    for(let m=addMonth(L.comp,1)>cmT?addMonth(L.comp,1):cmT;m<=endM;m=addMonth(m,1)){const [a,mm]=m.split('-').map(Number);const last_=new Date(Date.UTC(a,mm,0)).getUTCDate();
      let d=util(new Date(Date.UTC(a,mm-1,Math.min(day,last_))));const atras=d<T;if(atras)d=util(new Date(T.getTime()+864e5));
      extra.push({tipo:'proj',atraso:atras,op:L.op,kind:'vit',empresa:L.empresa,eid:'',data:d,valor:v,comp:m,taxa:vit[0].taxa,parc:null,
        how:`Repete a última comissão vitalícia paga (${mesLabel(L.comp)}, R$ ${brl(v)}). Empresa sem fatura na base`,quando:atras?'deveria ter caído e ainda não caiu: em atraso, jogado para o próximo dia útil':'mesmo dia do último pagamento',base:{fat:null,comp:m,valor:sum(vit,i=>i.valorFat),rep:vit[0].titulo}})}});
  M.semHist=M.com.filter(x=>x.semHist); M.com=M.com.filter(x=>!x.semHist).concat(extra); M.extraN=Object.keys(last).length; return M;
}

return { projAll, mergeCom, fam, famsIn, uniq, sum, addMonth, ckey, isAg };
})();
