(function () {
  'use strict';

  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  if (toggle && header) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('is-open')) {
        header.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  var filterWrap = document.querySelector('[data-filters]');
  if (filterWrap) {
    var buttons = filterWrap.querySelectorAll('[data-filter]');
    var cards = document.querySelectorAll('[data-family]');
    filterWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      var id = btn.getAttribute('data-filter');
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      cards.forEach(function (card) {
        var show = id === 'all' || card.getAttribute('data-family') === id;
        card.hidden = !show;
      });
    });
  }

  var form = document.querySelector('[data-quote-form]');
  if (form) {
  var params = new URLSearchParams(window.location.search);
  var sel = params.get('sel');
  if (sel && form) {
    var select = form.querySelector('[name="selection"]');
    if (select) {
      var want = String(sel).padStart(2, '0');
      Array.prototype.forEach.call(select.options, function (opt) {
        if (opt.value.indexOf(want + ' ') === 0 || opt.value.indexOf(want + '—') === 0 || opt.value.indexOf(want + ' —') === 0) {
          select.value = opt.value;
        }
      });
    }
  }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var to = form.getAttribute('data-email') || '';
      var generic = form.getAttribute('data-subject') || 'DUNA Bath';
      var subjectTpl = form.getAttribute('data-subject-sel') || generic;
      var data = new FormData(form);
      var sel = (data.get('selection') || '').toString().trim();
      var subject = sel ? subjectTpl.replace('{n}', sel) : generic;
      var lines = [];
      function add(label, key) {
        var v = (data.get(key) || '').toString().trim();
        if (v) lines.push(label + ': ' + v);
      }
      add('Selección / Selection', 'selection');
      add('Acabado / Finish', 'finish');
      add('Tipo de instalación / Installation', 'install');
      add('Ancho / Width', 'width');
      add('Alto / Height', 'height');
      add('Cantidad / Quantity', 'qty');
      add('Formato / Format', 'format');
      add('Nombre / Name', 'name');
      add('Correo / Email', 'email');
      var notes = (data.get('message') || '').toString().trim();
      if (notes) lines.push('', notes);
      var body = lines.join('\r\n');
      var url = 'mailto:' + encodeURIComponent(to) +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
      window.location.href = url;
    });
  }
})();
