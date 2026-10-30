// DADOS MANUAIS: tudo é digitado em editar.html e fica salvo neste navegador (localStorage 'vrhub_manual')
// monta o mesmo objeto REZDY que o sync gerava, para as telas continuarem iguais
const MANUAL_KEY='vrhub_manual';
const MEIOS_PG=[['stripe','Stripe'],['paypal','PayPal'],['rede','Maquininha Rede'],['pix','PIX / transferência'],['dinheiro','Dinheiro'],['ota','OTA (GetYourGuide etc.)'],['outros','Outros'],['cortesia','Cortesia']];
function lerManual(){try{const d=JSON.parse(localStorage.getItem(MANUAL_KEY)||'null');if(d&&Array.isArray(d.voos))return{mes:{},...d}}catch(e){}return{voos:[],mes:{}}}
const hojeRio=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
function agoraRioISO(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),g=t=>p.find(x=>x.type===t).value;return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}-03:00`}
const somaDias=(s,k)=>new Date(new Date(s+'T12:00:00Z').getTime()+k*864e5).toISOString().slice(0,10);
// reserva digitada -> formato do sync (cortesia entra como desconto, fora da receita)
function reservaRezdy(r){const v=+r.valor||0,f=r.forma||'outros',cort=f==='cortesia';
 return{order:r.order||'—',pax:+r.pax||0,status:r.cancelada?'CANCELLED':'CONFIRMED',canal:r.canal||'',pg:v?{[cort?'desconto':f]:v}:{},valor:cort?0:v,comissao:f==='ota'?(+r.comissao||0):0,a_receber:+r.a_receber||0,cortesia:cort}}
function montaRezdy(d,semAjuste){
 const hoje=hojeRio(),agora=agoraRioISO(),agoraS=agora.slice(0,16).replace('T',' ');
 const voos=d.voos.filter(v=>v.data&&v.hora).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora)).map(v=>{
  const rs=(v.reservas||[]).map(reservaRezdy),bookings=rs.filter(r=>r.status!=='CANCELLED'),cancelados=rs.filter(r=>r.status==='CANCELLED'),pax=bookings.reduce((a,r)=>a+r.pax,0),cap=+v.capacidade||null;
  return{data:v.data,hora:v.hora,produtos:[v.produto||'Voo'],min:+v.min||30,pax,bookings,cancelados,receita:+bookings.reduce((a,r)=>a+r.valor,0).toFixed(2),capacidade:cap,livres:cap?Math.max(0,cap-pax):null,
   clima:v.clima_cond||v.clima_vento||v.clima_vis?{cond:v.clima_cond||'',vento:v.clima_vento||'',vis:v.clima_vis||''}:null}});
 // horario so com reservas canceladas nao aparece nas telas (como na Rezdy); voo sem nenhuma reserva aparece
 const todos=voos.filter(v=>v.bookings.length||!v.cancelados.length);
 const w=(new Date(hoje+'T12:00:00Z').getUTCDay()+6)%7,seg=somaDias(hoje,-w),dom=somaDias(seg,6),ate=somaDias(hoje,7);
 const feitos=todos.filter(v=>v.data.slice(0,7)===hoje.slice(0,7)&&`${v.data} ${v.hora}`<=agoraS);
 const auto={voos:feitos.length,horas:+(feitos.reduce((a,v)=>a+v.min,0)/60).toFixed(1),pax:feitos.reduce((a,v)=>a+v.pax,0)};
 const aj=semAjuste?{}:d.mes||{},mes={};for(const k in auto)mes[k]=aj[k]!==''&&aj[k]!=null?+aj[k]:auto[k];
 return{gerado_em:agora,hoje,manual:true,voos_hoje:todos.filter(v=>v.data===hoje),semana:todos.filter(v=>v.data>=seg&&v.data<=dom),proximos:todos.filter(v=>v.data>hoje&&v.data<=ate),periodo:voos,mes}}
const REZDY=montaRezdy(lerManual());
// outra aba deste navegador editou os dados: recarrega a tela
if(!window.EDITOR_MANUAL)window.addEventListener('storage',e=>{if(e.key===MANUAL_KEY)location.reload()});
