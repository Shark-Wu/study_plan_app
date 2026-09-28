/* ============================================================
   模块②：作业布置与完成状态
   列表（按截止日期排序）、增删改、勾选完成（文字变淡）、
   逾期高亮、按课程筛选 + 按周筛选（默认本周，每周自动更新）
   ============================================================ */
(function () {
  'use strict';
  var NS = (window.App = window.App || {});

  var filterCourse = 'all';
  var filterWeek = 'all';     /* 'all' 或周次数字；启动时设为本周 */
  var lastWeek = null;        /* 用于检测跨周，自动更新默认栏 */
  var editingId = null;

  /* ---------- 文本工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 日期与周次工具 ---------- */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  function fmtDate(s) {
    if (!s) return '';
    var p = s.split('-');
    if (p.length !== 3) return s;
    return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
  }

  /* 距今天数：null = 未设截止；负数 = 已逾期 */
  function daysUntil(s) {
    if (!s) return null;
    return Math.round(
      (new Date(s + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000
    );
  }

  /* 某日期所在周的周一零点（毫秒） */
  function mondayBefore(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }

  function semesterStart() {
    return NS.Storage.getSetting('semesterStart') || '2026-09-01';
  }

  /* 某日期属于第几周（按学期开始日推算）；不在学期内返回 '' */
  function weekOf(dateStr) {
    var start = semesterStart();
    if (!dateStr || !start) return '';
    var diff = Math.floor((mondayBefore(dateStr) - mondayBefore(start)) / 86400000 / 7);
    return diff < 0 ? '' : (diff + 1);
  }

  function currentWeek() {
    var w = weekOf(todayStr());
    return w === '' ? 1 : w;
  }

  /* ---------- 数据 ---------- */
  function courseName(id) {
    var c = NS.Storage.get('courses', id);
    return c ? c.name : '未知课程';
  }

  function courseColor(id) {
    var c = NS.Storage.get('courses', id);
    return c && c.color ? c.color : '#9aa1ab';
  }

  function visible() {
    var list = NS.Storage.all('assignments');
    if (filterWeek !== 'all') {
      list = list.filter(function (a) { return a.week === filterWeek; });
    }
    if (filterCourse !== 'all') {
      list = list.filter(function (a) { return a.courseId === filterCourse; });
    }
    return list.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;      /* 未完成在前 */
      var da = a.dueDate || '9999-12-31';
      var db = b.dueDate || '9999-12-31';
      return da < db ? -1 : da > db ? 1 : 0;
    });
  }

  function stats(list) {
    var total = list.length;
    var done = list.filter(function (a) { return a.done; }).length;
    var overdue = list.filter(function (a) {
      var d = daysUntil(a.dueDate);
      return !a.done && d !== null && d < 0;
    }).length;
    return {
      total: total,
      done: done,
      overdue: overdue,
      pct: total ? Math.round(done / total * 100) : 0
    };
  }

  /* ---------- 渲染 ---------- */
  function dueBadge(a) {
    if (a.done) return '';
    var d = daysUntil(a.dueDate);
    if (d === null) return '<span class="badge neutral">未设截止</span>';
    if (d < 0) return '<span class="badge danger">已逾期 ' + (-d) + ' 天</span>';
    if (d === 0) return '<span class="badge warn">今天截止</span>';
    if (d === 1) return '<span class="badge neutral">明天截止</span>';
    return '<span class="badge neutral">' + fmtDate(a.dueDate) + '</span>';
  }

  function weekBadge(a) {
    return typeof a.week === 'number'
      ? '<span class="badge neutral">第' + a.week + '周</span>'
      : '';
  }

  function buildItem(a) {
    var li = document.createElement('li');
    li.className = 'hw-item' + (a.done ? ' done' : '');
    li.style.setProperty('--course-color', courseColor(a.courseId));

    var chip = NS.Storage.get('courses', a.courseId)
      ? '<span class="hw-course"><span class="course-dot"></span>' + esc(courseName(a.courseId)) + '</span>'
      : '<span class="hw-course unknown"><span class="course-dot"></span>未知课程</span>';

    li.innerHTML =
      '<label class="hw-check" title="' + (a.done ? '标记为未完成' : '标记为已完成') + '">' +
        '<input type="checkbox" ' + (a.done ? 'checked' : '') + '>' +
        '<span class="check-box"></span>' +
      '</label>' +
      '<div class="hw-main">' +
        '<div class="hw-top">' +
          '<span class="hw-title">' + esc(a.title) + '</span>' +
          chip +
          weekBadge(a) +
          dueBadge(a) +
        '</div>' +
        (a.detail ? '<p class="hw-detail">' + esc(a.detail) + '</p>' : '') +
      '</div>' +
      '<div class="hw-actions">' +
        '<button class="card-btn" data-act="edit" title="编辑作业">编辑</button>' +
        '<button class="card-btn danger" data-act="del" title="删除作业">删除</button>' +
      '</div>';

    li.querySelector('input[type="checkbox"]').addEventListener('change', function (e) {
      a.done = e.target.checked;
      NS.Storage.upsert('assignments', a);
      render();
    });
    li.querySelector('[data-act="edit"]').addEventListener('click', function () {
      openForm(a);
    });
    li.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (window.confirm('确定删除作业「' + a.title + '」？')) {
        NS.Storage.remove('assignments', a.id);
        refreshWeekBar();
        render();
      }
    });

    return li;
  }

  function scopeText() {
    var s = '';
    if (filterWeek !== 'all') s += '第' + filterWeek + '周';
    if (filterCourse !== 'all') s += (s ? ' · ' : '') + courseName(filterCourse);
    return s;
  }

  function render() {
    var listEl = document.getElementById('hw-list');
    var emptyEl = document.getElementById('hw-empty');
    var list = visible();
    var st = stats(list);
    var scope = scopeText();

    listEl.innerHTML = '';
    list.forEach(function (a) { listEl.appendChild(buildItem(a)); });

    if (!NS.Storage.all('courses').length) {
      emptyEl.innerHTML = '<p>请先在「课程简介」中添加课程，再布置作业。</p>';
      emptyEl.classList.remove('hidden');
    } else if (!list.length) {
      emptyEl.innerHTML = '<p>' +
        (scope ? esc(scope) + '暂无作业。' : '暂无作业，点击右上角「布置作业」添加。') +
        '</p>';
      emptyEl.classList.remove('hidden');
    } else {
      emptyEl.classList.add('hidden');
    }

    document.getElementById('hw-stats').innerHTML =
      (scope ? esc(scope) + ' · ' : '') +
      '共 ' + st.total + ' 项 · 已完成 ' + st.done + '（' + st.pct + '%）' +
      (st.overdue ? ' · <span class="text-danger">逾期 ' + st.overdue + ' 项</span>' : '');
    document.getElementById('hw-progress').style.width = st.pct + '%';
  }

  /* ---------- 周筛选栏 ---------- */
  function refreshWeekBar() {
    var bar = document.getElementById('hw-weeks');
    var cur = currentWeek();

    /* 标签范围：第 1 周到 max(下周, 数据中的最晚周)，最多 20 周 */
    var maxWeek = cur + 1;
    NS.Storage.all('assignments').forEach(function (a) {
      if (typeof a.week === 'number' && a.week > maxWeek) maxWeek = a.week;
    });
    if (maxWeek > 20) maxWeek = 20;
    if (filterWeek !== 'all' && filterWeek > maxWeek) {
      filterWeek = cur <= maxWeek ? cur : maxWeek;
    }

    var html = '<button class="week-chip' + (filterWeek === 'all' ? ' active' : '') +
      '" data-week="all">全部</button>';
    for (var w = 1; w <= maxWeek; w++) {
      html += '<button class="week-chip' +
        (w === filterWeek ? ' active' : '') +
        (w === cur ? ' cur' : '') +
        '" data-week="' + w + '">第' + w + '周</button>';
    }
    bar.innerHTML = html;
  }

  /* 课程筛选下拉（课程增删后刷新） */
  function refreshFilter() {
    var sel = document.getElementById('hw-filter');
    if (filterCourse !== 'all' && !NS.Storage.get('courses', filterCourse)) {
      filterCourse = 'all';
    }
    var html = '<option value="all">全部课程</option>';
    NS.Storage.all('courses').forEach(function (c) {
      html += '<option value="' + esc(c.id) + '"' +
        (c.id === filterCourse ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    });
    sel.innerHTML = html;
  }

  /* ---------- 模态框 ---------- */
  function showModal() { document.getElementById('modal').classList.remove('hidden'); }
  function closeModal() { document.getElementById('modal').classList.add('hidden'); }

  function openForm(a) {
    editingId = a ? a.id : null;
    var d = a || {
      courseId: filterCourse !== 'all' ? filterCourse : '',
      title: '', detail: '', dueDate: '',
      week: filterWeek !== 'all' ? filterWeek : currentWeek()
    };

    var courseOptions = NS.Storage.all('courses').map(function (c) {
      return '<option value="' + esc(c.id) + '"' +
        (c.id === d.courseId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    var weekOptions = '<option value=""' + (!d.week ? ' selected' : '') + '>不指定周次</option>';
    for (var w = 1; w <= 20; w++) {
      weekOptions += '<option value="' + w + '"' +
        (d.week === w ? ' selected' : '') + '>第' + w + '周</option>';
    }

    var html =
      '<form id="hw-form" novalidate>' +
        '<div class="field">' +
          '<label for="f-hw-course">课程</label>' +
          '<select id="f-hw-course" required>' + courseOptions + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-hw-title">作业内容</label>' +
          '<input type="text" id="f-hw-title" required placeholder="如：完成第 3 章习题" value="' + esc(d.title) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-hw-detail">具体要求（可选）</label>' +
          '<textarea id="f-hw-detail" rows="3">' + esc(d.detail || '') + '</textarea>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-hw-week">周次</label>' +
          '<select id="f-hw-week">' + weekOptions + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-hw-due">截止日期（可选）</label>' +
          '<input type="date" id="f-hw-due" value="' + esc(d.dueDate || '') + '">' +
        '</div>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn-ghost" id="f-hw-cancel">取消</button>' +
          '<button type="submit" class="btn-primary">保存</button>' +
        '</div>' +
      '</form>';

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-title').textContent = editingId ? '编辑作业' : '布置作业';

    document.getElementById('f-hw-cancel').addEventListener('click', closeModal);
    document.getElementById('hw-form').addEventListener('submit', function (e) {
      e.preventDefault();
      saveForm();
    });

    showModal();
  }

  function saveForm() {
    var title = document.getElementById('f-hw-title').value.trim();
    var courseId = document.getElementById('f-hw-course').value;
    if (!title || !courseId) return;

    var prev = editingId ? NS.Storage.get('assignments', editingId) : null;
    var weekVal = document.getElementById('f-hw-week').value;

    var item = {
      id: editingId || ('a' + Date.now()),
      courseId: courseId,
      title: title,
      detail: document.getElementById('f-hw-detail').value.trim(),
      week: weekVal === '' ? '' : parseInt(weekVal, 10),
      dueDate: document.getElementById('f-hw-due').value || '',
      done: prev ? prev.done : false,
      createdAt: (prev && prev.createdAt) || new Date().toISOString()
    };

    NS.Storage.upsert('assignments', item);
    closeModal();
    refreshWeekBar();
    render();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    filterWeek = currentWeek();
    lastWeek = filterWeek;

    document.getElementById('btn-add-hw').addEventListener('click', function () {
      if (!NS.Storage.all('courses').length) {
        window.alert('请先在「课程简介」中添加课程。');
        return;
      }
      openForm(null);
    });

    refreshFilter();
    document.getElementById('hw-filter').addEventListener('change', function () {
      filterCourse = this.value;
      render();
    });

    refreshWeekBar();
    document.getElementById('hw-weeks').addEventListener('click', function (e) {
      var btn = e.target.closest('.week-chip');
      if (!btn) return;
      filterWeek = btn.dataset.week === 'all' ? 'all' : parseInt(btn.dataset.week, 10);
      refreshWeekBar();
      render();
    });

    /* 学期开始日期可调整：改后重新推算本周并重置默认栏 */
    var anchor = document.getElementById('hw-semester-start');
    anchor.value = semesterStart();
    anchor.addEventListener('change', function () {
      if (!this.value) { this.value = semesterStart(); return; }
      NS.Storage.setSetting('semesterStart', this.value);
      filterWeek = currentWeek();
      lastWeek = filterWeek;
      refreshWeekBar();
      render();
    });

    /* 每小时检查一次是否跨周：跨周后默认栏自动跳到新的本周 */
    setInterval(function () {
      var w = currentWeek();
      if (w !== lastWeek) {
        lastWeek = w;
        filterWeek = w;
        refreshWeekBar();
        render();
      }
    }, 60 * 60 * 1000);

    /* 课程增删改后：刷新筛选下拉并重绘列表 */
    NS.Events.on('courses-changed', function () {
      refreshFilter();
      render();
    });
  }

  NS.Homework = {
    render: render,
    init: init,
    refreshWeekBar: refreshWeekBar
  };
})();
