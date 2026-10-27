// Faz a Central de Agentes (a mesma página de hoje) ler e gravar no banco do portal.
// Ela pede window.claude.use('db') e 'user'; aqui essas duas peças conversam com /api/central/<corretora>.
// As coleções são relidas a cada minuto (só as que mudaram) e logo depois de qualquer gravação feita na própria tela.
(function () {
  var C = window.__CENTRAL;
  if (!C) return;
  var base = '/api/central/' + encodeURIComponent(C.corretora);
  var ouvintes = [];

  function api(qs, corpo) {
    var op = corpo ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) } : {};
    return fetch(base + (qs || ''), Object.assign({ credentials: 'same-origin', cache: 'no-store' }, op)).then(function (r) {
      if (r.status === 401) { location.href = '/entrar'; throw new Error('sessão expirada'); }
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.erro || ('erro ' + r.status)); });
      return r.json();
    });
  }
  function docSnap(id, dados) {
    return { id: id, exists: dados != null, data: function () { return dados == null ? undefined : JSON.parse(JSON.stringify(dados)); } };
  }

  function Consulta(col, ordem, lim) { this.col = col; this.ordem = ordem || null; this.lim = lim || null; }
  Consulta.prototype.orderBy = function (campo, dir) { return new Consulta(this.col, { campo: campo, desc: dir === 'desc' }, this.lim); };
  Consulta.prototype.limit = function (n) { return new Consulta(this.col, this.ordem, n); };
  // monta o retrato da coleção com a ordem e o limite que a Central pediu
  Consulta.prototype.snap = function (j) {
    var q = this;
    var docs = j.docs.map(function (d) { return docSnap(d.id, d.dados); });
    if (q.ordem) {
      var c = q.ordem.campo, s = q.ordem.desc ? -1 : 1;
      docs.sort(function (a, b) { var x = a.data()[c], y = b.data()[c]; return x === y ? 0 : (x > y ? s : -s); });
    }
    if (q.lim) docs = docs.slice(0, q.lim);
    return { docs: docs, size: docs.length, empty: docs.length === 0, carimbo: j.carimbo };
  };
  Consulta.prototype.get = function () {
    var q = this;
    return api('?col=' + encodeURIComponent(q.col)).then(function (j) { return q.snap(j); });
  };

  // Todas as coleções vêm num pedido só ao servidor (?lote=), e a conferência de mudança também é uma só por minuto
  // (?carimbos=): a coleção só é baixada de novo quando o carimbo dela mudou.
  var pendentes = {}, agendado = null;
  function baixar(cols) {
    cols.forEach(function (c) { pendentes[c] = true; });
    if (agendado) return;
    agendado = setTimeout(function () {
      var lista = Object.keys(pendentes); pendentes = {}; agendado = null;
      api('?lote=' + encodeURIComponent(lista.join(','))).then(function (j) {
        ouvintes.forEach(function (o) {
          var r = j.cols[o.col];
          if (!r || r.carimbo === o.carimbo) return;
          o.carimbo = r.carimbo;
          o.ok(o.q.snap(r));
        });
      }).catch(function (e) { ouvintes.forEach(function (o) { if (lista.indexOf(o.col) >= 0 && o.erro) o.erro(e); }); });
    }, 0);
  }
  function conferir() {
    var cols = ouvintes.map(function (o) { return o.col; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    if (!cols.length) return;
    api('?carimbos=' + encodeURIComponent(cols.join(','))).then(function (j) {
      baixar(cols.filter(function (c) { return ouvintes.some(function (o) { return o.col === c && o.carimbo !== j.carimbos[c]; }); }));
    }).catch(function () {});
  }
  setInterval(conferir, 60000);

  Consulta.prototype.onSnapshot = function (ok, erro) {
    var o = { col: this.col, q: this, ok: ok, erro: erro, carimbo: null, puxar: function () { baixar([o.col]); } };
    ouvintes.push(o);
    baixar([o.col]);
    return function () { ouvintes = ouvintes.filter(function (x) { return x !== o; }); };
  };

  function Doc(caminho) {
    var p = caminho.split('/');
    this.col = p[0]; this.id = p.slice(1).join('/');
  }
  Doc.prototype.get = function () {
    var d = this;
    return api('?col=' + encodeURIComponent(d.col) + '&doc=' + encodeURIComponent(d.id)).then(function (j) { return docSnap(d.id, j.dados); });
  };
  function gravar(d, op, dados) {
    return api('', { op: op, col: d.col, doc: d.id, dados: dados }).then(function () {
      ouvintes.filter(function (o) { return o.col === d.col; }).forEach(function (o) { o.puxar(); });
    });
  }
  Doc.prototype.set = function (dados) { return gravar(this, 'set', dados); };
  Doc.prototype.update = function (dados) { return gravar(this, 'update', dados); };
  Doc.prototype.delete = function () { return gravar(this, 'delete'); };

  var db = {
    collection: function (nome) { return new Consulta(nome); },
    doc: function (caminho) { return new Doc(caminho); },
  };
  var user = {
    canEdit: function () { return Promise.resolve(!!C.podeEditar); },
    id: function () { return Promise.resolve(C.usuario.id); },
    profiles: function (ids) {
      return api('?pessoas=' + encodeURIComponent(ids.join(','))).then(function (j) { return j.pessoas || {}; });
    },
  };
  window.claude = {
    use: function (cap) {
      if (cap === 'db') return Promise.resolve(db);
      if (cap === 'user') return Promise.resolve(user);
      return Promise.resolve(null);
    },
  };
})();
