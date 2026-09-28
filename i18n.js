// Idioma do app: português (padrão) ou inglês.
//
// O app é escrito em português. Quando a pessoa escolhe inglês, este arquivo traduz
// na hora tudo que aparece na tela (textos, botões, avisos, placeholders, confirm/alert)
// usando o dicionário em i18n-en.js. Não precisa mexer na lógica de cada tela: um
// MutationObserver pega todo texto novo que entra no DOM.
//
// Chaves do dicionário podem ter marcadores:
//   {R} = valor em R$ (ex: "R$ 1.537")   {N} = número   {X} = qualquer texto
// No valor em inglês, {0}, {1}… são os marcadores capturados, na ordem da chave.
(function(){
  var LANG_KEY='aya_lang';
  var lang='pt';
  try{ lang=localStorage.getItem(LANG_KEY)==='en'?'en':'pt'; }catch(e){}
  window.AYA_LANG=lang;
  window.AYA_LOCALE=lang==='en'?'en-US':'pt-BR';
  document.documentElement.lang=lang==='en'?'en':'pt-BR';

  // Troca de idioma: salva e recarrega (o DOM começa sempre em português).
  window.setAyaLang=function(novo,semRecarregar){
    novo=novo==='en'?'en':'pt';
    try{ localStorage.setItem(LANG_KEY,novo); }catch(e){}
    if(!semRecarregar&&novo!==lang)location.reload();
  };
  // Pra textos montados no JS que não passam pelo DOM (ex: fala da Aya em voz alta).
  window.tr=function(s){ return lang==='en'?traduzir(String(s)):s; };
  if(lang!=='en')return;

  var DICT=window.AYA_EN||{};
  var exatos=Object.create(null);
  var padroes=[];
  function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  Object.keys(DICT).forEach(function(k){
    var chave=k.replace(/\s+/g,' ').trim();
    if(!/\{[RNX]\}/.test(chave)){ exatos[chave]=DICT[k]; return; }
    var re=esc(chave)
      .replace(/\\\{R\\\}/g,'(R\\$\\s?[−-]?[\\d.,]+)')
      .replace(/\\\{N\\\}/g,'([−-]?\\d[\\d.,:/]*)')
      .replace(/\\\{X\\\}/g,'([\\s\\S]*?)');
    padroes.push({re:new RegExp('^'+re+'$'),en:DICT[k],fixo:chave.replace(/\{[RNX]\}/g,'').length});
  });
  // Padrões mais específicos (com mais texto fixo) primeiro.
  padroes.sort(function(a,b){ return b.fixo-a.fixo; });

  function preencher(en,grupos){
    var i=0;
    return en.replace(/\{(\d+)\}/g,function(_,n){ var g=grupos[+n]; return g==null?'':traduzirParte(g); })
             .replace(/\{\}/g,function(){ return traduzirParte(grupos[i++]||''); });
  }
  var cache=new Map();
  function traduzirParte(s){
    var t=s.trim();
    if(!t)return s;
    var r=buscar(t);
    return r==null?s:s.replace(t,r);
  }
  function buscar(t){
    if(t in exatos)return exatos[t];
    for(var i=0;i<padroes.length;i++){
      var m=padroes[i].re.exec(t);
      if(m)return preencher(padroes[i].en,m.slice(1));
    }
    return null;
  }
  function traduzir(s){
    if(cache.has(s))return cache.get(s);
    var inicio=s.match(/^\s*/)[0], fim=s.match(/\s*$/)[0];
    var t=s.replace(/\s+/g,' ').trim();
    var r=null;
    if(t&&/[A-Za-zÀ-ú]/.test(t)){
      r=buscar(t);
      // Frases compostas: tenta traduzir frase por frase.
      if(r==null){
        var partes=t.split(/(?<=[.!?…🌿😕])\s+|\s+(?=·\s)|(?<=\s·)\s+/);
        if(partes.length>1){
          var mudou=false;
          var out=partes.map(function(p){ var x=buscar(p); if(x!=null){mudou=true;return x;} return p; });
          if(mudou)r=out.join(' ');
        }
      }
    }
    var res=r==null?s:inicio+r+fim;
    if(cache.size>5000)cache.clear();
    cache.set(s,res);
    return res;
  }

  var ATRIBUTOS=['placeholder','title','aria-label','alt'];
  var feito=new WeakMap();
  function pular(el){
    for(var n=el;n&&n.nodeType===1;n=n.parentNode){
      if(n.tagName==='SCRIPT'||n.tagName==='STYLE'||n.tagName==='TEXTAREA')return true;
      if(n.hasAttribute('data-noi18n'))return true;
    }
    return false;
  }
  function traduzirTexto(node){
    var v=node.nodeValue;
    if(!v||feito.get(node)===v)return;
    if(pular(node.parentNode))return;
    var t=traduzir(v);
    feito.set(node,t);
    if(t!==v)node.nodeValue=t;
  }
  function traduzirAtributos(el){
    if(pular(el))return;
    for(var i=0;i<ATRIBUTOS.length;i++){
      var a=ATRIBUTOS[i];
      if(el.hasAttribute(a)){
        var v=el.getAttribute(a), t=traduzir(v);
        if(t!==v)el.setAttribute(a,t);
      }
    }
  }
  function traduzirArvore(raiz){
    if(raiz.nodeType===3){ traduzirTexto(raiz); return; }
    if(raiz.nodeType!==1&&raiz.nodeType!==11)return;
    if(raiz.nodeType===1){ if(pular(raiz))return; traduzirAtributos(raiz); }
    var w=document.createTreeWalker(raiz,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,null);
    var n;
    while((n=w.nextNode())){
      if(n.nodeType===3)traduzirTexto(n);
      else traduzirAtributos(n);
    }
  }
  var obs=new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){
      var m=muts[i];
      if(m.type==='characterData')traduzirTexto(m.target);
      else if(m.type==='attributes')traduzirAtributos(m.target);
      else for(var j=0;j<m.addedNodes.length;j++)traduzirArvore(m.addedNodes[j]);
    }
  });
  obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATRIBUTOS});
  document.addEventListener('DOMContentLoaded',function(){ traduzirArvore(document.body); document.title=traduzir(document.title); });

  var _confirm=window.confirm.bind(window), _alert=window.alert.bind(window), _prompt=window.prompt.bind(window);
  window.confirm=function(m){ return _confirm(traduzir(String(m))); };
  window.alert=function(m){ return _alert(traduzir(String(m))); };
  window.prompt=function(m,d){ return _prompt(traduzir(String(m)),d); };
})();
