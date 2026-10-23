// DADOS REAIS DA REZDY (assets/rezdy_dados.js, gerado a cada 15 min pelo GitHub Actions)
const PULSEIRAS={PRETA:'#1c1c1e',BRANCA:'#f4f2ee',AMARELA:'#f5c400',VERDE:'#2e9d4f'};
const PULS_ORDEM=['PRETA','BRANCA','AMARELA','VERDE']; // pulseira em rodizio pelo hub (nao existe na Rezdy); pode ser trocada na TV escritorio
const _R=(typeof REZDY!=='undefined')?REZDY:{gerado_em:null,hoje:null,voos_hoje:[],semana:[],mes:{voos:0,horas:0,pax:0}};
// roteiro = produto(s) Rezdy do horario; ROTEIROS montado a partir deles para manter a mesma estrutura das telas
const ROTEIROS={};
// nome curto do produto Rezdy: 'Doors off | 30min (GYG)' -> '30 Doors off'
function nomeProduto(n){const m=(n||'').match(/(\d+)\s*min/i),on=/doors[\s-]*on/i.test(n);return m?`${m[1]} Doors ${on?'on':'off'}`:n}
// ajustes manuais (status/pulseira) ficam no navegador; zeram a cada dia porque os codigos VR101... sao refeitos diariamente
try{if(_R.hoje&&localStorage.getItem('vrhub_dia')!==_R.hoje){localStorage.removeItem('vrhub_status');localStorage.removeItem('vrhub_notas');localStorage.removeItem('vrhub_pulseira');localStorage.setItem('vrhub_dia',_R.hoje)}}catch(e){}
const pulsOv=()=>{try{return JSON.parse(localStorage.getItem('vrhub_pulseira')||'{}')}catch(e){return{}}};
function setPulseira(voo,c){try{const o=pulsOv();if(c)o[voo]=c;else delete o[voo];localStorage.setItem('vrhub_pulseira',JSON.stringify(o))}catch(e){}}
window.addEventListener('storage',e=>{if(e.key==='vrhub_pulseira')location.reload()}); // outra tela mudou a pulseira
const VOOS=_R.voos_hoje.map((s,i)=>{const rot=s.produtos.join(' + ');ROTEIROS[rot]={nome:rot,min:s.min};
 return{hora:s.hora,voo:'VR'+(101+i),pulseira:pulsOv()['VR'+(101+i)]||PULS_ORDEM[i%4],pulsManual:!!pulsOv()['VR'+(101+i)],rot,prod:[...new Set(s.produtos.map(nomeProduto))].join(' + '),pax:s.pax,min:s.min,receita:s.receita,bookings:s.bookings,capacidade:s.capacidade,livres:s.livres}});
const hm=s=>{const[a,b]=s.split(':').map(Number);return a*60+b};
const fmtHM=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(Math.floor(m%60)).padStart(2,'0');
const param=k=>new URLSearchParams(location.search).get(k);
// hora atual no Rio (minutos desde 00:00); ?hora=HH:MM simula outro horario
function agoraRio(){if(param('hora'))return hm(param('hora'));const p=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date());const g=t=>+p.find(x=>x.type===t).value;return g('hour')*60+g('minute')+g('second')/60}
const DIA_REF=_R.hoje?new Date(_R.hoje+'T12:00:00-03:00'):new Date();
const dataLonga=()=>{const s=DIA_REF.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).replace('-feira','');return s.charAt(0).toUpperCase()+s.slice(1)};
const dataCurta=()=>DIA_REF.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'}).replace('.','').replace(',','').toUpperCase();
const mesNome=()=>DIA_REF.toLocaleDateString('pt-BR',{month:'long',timeZone:'America/Sao_Paulo'});
const STATUS=['CONFIRMADO','CHECK-IN ABERTO','BRIEFING DE SEGURANÇA','EQUIPANDO','EMBARQUE'];
const STATUS_TODOS=[...STATUS,'DECOLOU']; // opcoes do seletor manual
const STATUS_EN={'CONFIRMADO':'CONFIRMED','DECOLOU':'DEPARTED','CHECK-IN ABERTO':'CHECK-IN OPEN','BRIEFING DE SEGURANÇA':'SAFETY BRIEFING','EQUIPANDO':'GEARING UP','EMBARQUE':'BOARDING'};
// status operacional: automatico pelo horario, sobrescrito pelo iPad (a Rezdy nao tem esse fluxo)
function statusDe(v,agora){const t=hm(v.hora);if(agora>=t)return'DECOLOU';if(agora>=t-15)return'EMBARQUE';if(agora>=t-30)return'EQUIPANDO';if(agora>=t-45)return'BRIEFING DE SEGURANÇA';if(agora>=t-60)return'CHECK-IN ABERTO';return'CONFIRMADO'}
function setStatus(voo,st){try{const o=JSON.parse(localStorage.getItem('vrhub_status')||'{}');if(st)o[voo]=st;else delete o[voo];localStorage.setItem('vrhub_status',JSON.stringify(o))}catch(e){}}
const COR_ST={'CONFIRMADO':'#b7e4c7','CHECK-IN ABERTO':'#f4f2ee','BRIEFING DE SEGURANÇA':'#4fa3ff','EQUIPANDO':'#f07d1a','EMBARQUE':'#f5c400','DECOLOU':'#86dc9b'};
const COR_ST_CLARO={'CONFIRMADO':'#cdeed8','CHECK-IN ABERTO':'#ebeaea','BRIEFING DE SEGURANÇA':'#a9d0ff','EQUIPANDO':'#ffc48f','EMBARQUE':'#f5c400','DECOLOU':'#86dc9b'};
// tabela contratual Helinews (fixa, nao vem da Rezdy)
const HELINEWS=[[0,40,9750,'até 40h'],[41,50,9150,'41 a 50h'],[51,60,8950,'51 a 60h'],[61,70,8500,'61 a 70h'],[71,80,7850,'71 a 80h'],[81,90,7500,'81 a 90h'],[91,100,7400,'91 a 100h'],[101,1e9,7350,'acima de 101h']];
// horas = soma da duracao dos produtos de cada horario ja realizado no mes (estimativa: a Rezdy nao registra o tempo real de voo)
const HORAS_MES=_R.mes.horas, VOOS_MES=_R.mes.voos;
function faixa(h){const hh=Math.ceil(h);return HELINEWS.find(f=>hh>=f[0]&&hh<=f[1])||HELINEWS[0]}
const TAXAS={plataforma:6.5,cartao:3.2}; // % ESTIMADOS: a Rezdy nao informa taxa de plataforma nem de cartao
// clima: a Rezdy nao fornece
const CLIMA_HORA=null, CLIMA_SEMANA=null;
const SEM_COR={verde:'#2e9d4f',amarelo:'#f5c400',vermelho:'#c62828'};
const brl=n=>'R$ '+n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const FALTA=t=>`<b class="falta">${t}</b>`;
// selo de origem dos dados (a lista do que nao vem da Rezdy fica no README)
function marcaOrigem(faltas){const a=document.querySelector('.amostra');if(a){const g=_R.gerado_em?_R.gerado_em.slice(11,16):'--:--';a.textContent=_R.gerado_em?`DADOS REZDY · ATUALIZADO ${g}`:'SEM DADOS DA REZDY';if(!_R.gerado_em)a.classList.add('falta')}}
