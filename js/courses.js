/* ============================================================
   模块①：课程简介
   课程卡片渲染、悬停课程名浮现简介气泡（链接可点）、增删改
   ============================================================ */
(function () {
  'use strict';
  var NS = (window.App = window.App || {});

  /* 低饱和课程色盘（简约）+ 黑 / 白 */
  var COLORS = [
    '#6366f1', '#0d9488', '#d97706', '#e11d48',
    '#0284c7', '#7c3aed', '#0ea5e9', '#059669',
    '#111827', '#ffffff'
  ];

  var editingId = null;

  /* ---------- 文本工具 ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 转义 + 换行转 <br> + http(s) 链接自动可点击 */
  function fmt(text) {
    return esc(text)
      .replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function splitLines(s) {
    return String(s || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  }

  /* ---------- 简介气泡内容 ---------- */

  function tipSection(label, lines) {
    if (!lines || !lines.length) return '';
    var items = lines.map(function (l) {
      return '<div>' + fmt(l) + '</div>';
    }).join('');
    return '<div class="tip-label">' + esc(label) + '</div>' + items;
  }

  function buildTip(c) {
    var html = '<div class="tip-title">' + esc(c.name) + '</div>';
    if (c.teacher) html += tipSection('老师', [c.teacher]);
    if (c.email) html += tipSection('邮箱', [c.email]);
    html += tipSection('作业平台', c.homework || []);
    html += tipSection('资源', c.resources || []);
    if (c.notes) html += tipSection('资料 / 备注', [c.notes]);
    return html;
  }

  /* ---------- 渲染 ---------- */

  function buildCard(c) {
    var el = document.createElement('article');
    el.className = 'course-card';
    el.style.setProperty('--course-color', c.color || COLORS[0]);

    var meta = c.teacher ? String(c.teacher).split('\n')[0] : '';

    el.innerHTML =
      '<div class="card-actions">' +
        '<button class="card-btn" data-act="edit" title="编辑课程">编辑</button>' +
        '<button class="card-btn danger" data-act="del" title="删除课程">删除</button>' +
      '</div>' +
      '<div class="course-name-wrap">' +
        '<span class="course-dot"></span>' +
        '<h3 class="course-name">' + esc(c.name) + '</h3>' +
      '</div>' +
      (meta ? '<p class="course-meta">' + esc(meta) + '</p>' : '') +
      '<div class="tip">' + buildTip(c) + '</div>';

    /* 悬停课程名 → 气泡浮现；允许鼠标移入气泡内点击链接 */
    var wrap = el.querySelector('.course-name-wrap');
    var tipEl = el.querySelector('.tip');
    var hideTimer = null;

    function showTip() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      var rect = el.getBoundingClientRect();
      tipEl.classList.toggle('tip-above', window.innerHeight - rect.bottom < 280);
      tipEl.classList.add('show');
    }
    function hideTipSoon() {
      hideTimer = setTimeout(function () { tipEl.classList.remove('show'); }, 150);
    }

    wrap.addEventListener('mouseenter', showTip);
    wrap.addEventListener('mouseleave', hideTipSoon);
    tipEl.addEventListener('mouseenter', showTip);
    tipEl.addEventListener('mouseleave', hideTipSoon);

    el.querySelector('[data-act="edit"]').addEventListener('click', function () {
      openForm(c);
    });
    el.querySelector('[data-act="del"]').addEventListener('click', function () {
      removeCourse(c);
    });

    return el;
  }

  function render() {
    var grid = document.getElementById('course-grid');
    var emptyEl = document.getElementById('course-empty');
    var courses = NS.Storage.all('courses');

    grid.innerHTML = '';

    if (!courses.length) {
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    courses.forEach(function (c) {
      grid.appendChild(buildCard(c));
    });
  }

  /* ---------- 模态框 ---------- */

  function showModal() {
    document.getElementById('modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal').classList.add('hidden');
  }

  function colorField(selected) {
    if (COLORS.indexOf(selected) === -1) selected = COLORS[0];
    var radios = COLORS.map(function (cl) {
      return '<label class="swatch-label" style="--sw: ' + cl + '">' +
        '<input type="radio" name="f-color" value="' + cl + '"' +
        (cl === selected ? ' checked' : '') + '>' +
        '<span class="swatch"></span>' +
        '</label>';
    }).join('');
    return '<div class="field"><label>课程色</label><div class="swatches">' + radios + '</div></div>';
  }

  function openForm(course) {
    editingId = course ? course.id : null;
    var c = course || {
      name: '', teacher: '', email: '',
      homework: [], resources: [], notes: '', color: COLORS[0]
    };

    var html =
      '<form id="course-form" novalidate>' +
        '<div class="field">' +
          '<label for="f-name">课程名称</label>' +
          '<input type="text" id="f-name" required placeholder="如：高等数学" value="' + esc(c.name) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-teacher">老师</label>' +
          '<textarea id="f-teacher" rows="2" placeholder="可多行，如：主讲老师&#10;助教老师">' + esc(c.teacher) + '</textarea>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-email">邮箱</label>' +
          '<input type="text" id="f-email" placeholder="teacher@example.com" value="' + esc(c.email) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-homework">作业平台（每行一条）</label>' +
          '<textarea id="f-homework" rows="3">' + esc((c.homework || []).join('\n')) + '</textarea>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-resources">资源（每行一条）</label>' +
          '<textarea id="f-resources" rows="3">' + esc((c.resources || []).join('\n')) + '</textarea>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-notes">资料 / 备注</label>' +
          '<textarea id="f-notes" rows="2">' + esc(c.notes || '') + '</textarea>' +
        '</div>' +
        colorField(c.color) +
        '<div class="form-actions">' +
          '<button type="button" class="btn-ghost" id="f-cancel">取消</button>' +
          '<button type="submit" class="btn-primary">保存</button>' +
        '</div>' +
      '</form>';

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-title').textContent = editingId ? '编辑课程' : '添加课程';

    document.getElementById('f-cancel').addEventListener('click', closeModal);
    document.getElementById('course-form').addEventListener('submit', function (e) {
      e.preventDefault();
      saveForm();
    });

    showModal();
  }

  function saveForm() {
    var name = document.getElementById('f-name').value.trim();
    if (!name) return;

    var prev = editingId ? NS.Storage.get('courses', editingId) : null;

    var item = {
      id: editingId || ('c' + Date.now()),
      name: name,
      teacher: document.getElementById('f-teacher').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      homework: splitLines(document.getElementById('f-homework').value),
      resources: splitLines(document.getElementById('f-resources').value),
      notes: document.getElementById('f-notes').value.trim(),
      color: document.querySelector('input[name="f-color"]:checked').value,
      createdAt: (prev && prev.createdAt) || new Date().toISOString()
    };

    NS.Storage.upsert('courses', item);
    closeModal();
    render();
    NS.Events.emit('courses-changed');
  }

  function removeCourse(c) {
    var counts = NS.Storage.countsForCourse(c.id);
    var msg = '确定删除课程「' + c.name + '」？';
    if (counts.a || counts.g) {
      msg += '\n其名下 ' + counts.a + ' 条作业、' + counts.g + ' 个学习目标将一并删除。';
    }
    if (!window.confirm(msg)) return;

    NS.Storage.removeCourse(c.id);
    render();
    NS.Events.emit('courses-changed');
  }

  /* ---------- 初始化：绑定本模块控件 ---------- */

  function init() {
    document.getElementById('btn-add-course').addEventListener('click', function () {
      openForm(null);
    });
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  NS.Courses = {
    render: render,
    openForm: openForm,
    init: init
  };
})();
