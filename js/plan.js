/* ============================================================
   模块③：学习规划 —— 学习目标流程图
   纵轴 = 时间（按起始日期定位，未排期置底），横轴 = 流程层级；
   节点 = 目标卡片（状态色 + 课程色标），连线 = 前置依赖；
   点击节点编辑；保存时环检测；支持按课程筛选
   ============================================================ */
(function () {
  'use strict';
  var NS = (window.App = window.App || {});

  var filterCourse = 'all';
  var editingId = null;

  var STATUS = [
    { key: 'todo',  label: '未开始', color: '#d1d5db' },
    { key: 'doing', label: '进行中', color: '#4f46e5' },
    { key: 'done',  label: '已完成', color: '#059669' }
  ];

  /* 画布几何 */
  var PAD_LEFT = 76, PAD_TOP = 30, PAD_RIGHT = 60, PAD_BOTTOM = 40;
  var ROW_H = 132, COL_W = 264;
  var NODE_W = 212, NODE_H = 88;

  /* ---------- 文本工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  /* 目标的日期区间文本（起始 ~ 结束；缺失时回退） */
  function dateRangeText(g) {
    var s = g.date ? fmtDate(g.date) : '';
    var e = g.endDate ? fmtDate(g.endDate) : '';
    if (s && e && e !== s) return s + ' ~ ' + e;
    if (s) return s;
    if (e) return e;
    return '未排期';
  }

  function statusOf(key) {
    for (var i = 0; i < STATUS.length; i++) {
      if (STATUS[i].key === key) return STATUS[i];
    }
    return STATUS[0];
  }

  function courseColor(id) {
    var c = id ? NS.Storage.get('courses', id) : null;
    return c && c.color ? c.color : '#d1d5db';
  }

  /* ---------- 数据 ---------- */
  function visible() {
    var list = NS.Storage.all('goals');
    if (filterCourse !== 'all') {
      list = list.filter(function (g) { return g.courseId === filterCourse; });
    }
    return list.slice().sort(function (a, b) {
      var da = a.date || '9999-12-31';
      var db = b.date || '9999-12-31';
      if (da !== db) return da < db ? -1 : 1;
      return String(a.title).localeCompare(String(b.title));
    });
  }

  /* ---------- 布局 ---------- */
  /* 层级 = 最长前置链长度；环防护（异常数据不进入死循环） */
  function computeLevels(goals) {
    var byId = {};
    goals.forEach(function (g) { byId[g.id] = g; });
    var levels = {};

    function levelOf(id, stack) {
      if (levels[id] !== undefined) return levels[id];
      if (stack[id]) return 0;
      stack[id] = true;
      var max = -1;
      (byId[id].prerequisites || []).forEach(function (pid) {
        if (byId[pid]) max = Math.max(max, levelOf(pid, stack));
      });
      stack[id] = false;
      levels[id] = max + 1;
      return levels[id];
    }

    goals.forEach(function (g) { levelOf(g.id, {}); });
    return levels;
  }

  function buildLayout(goals) {
    var levels = computeLevels(goals);

    /* 行 = 去重日期（升序），最后一行 = 未排期 */
    var dates = [];
    goals.forEach(function (g) {
      if (g.date && dates.indexOf(g.date) === -1) dates.push(g.date);
    });
    dates.sort();
    var rowOf = {};
    dates.forEach(function (d, i) { rowOf[d] = i; });
    var noneRow = dates.length;

    /* 同一单元格（行 × 层级）内的目标横向排开 */
    var cells = {};
    goals.forEach(function (g) {
      var key = (g.date ? rowOf[g.date] : noneRow) + '|' + levels[g.id];
      (cells[key] = cells[key] || []).push(g);
    });

    var positions = {};
    goals.forEach(function (g) {
      var row = g.date ? rowOf[g.date] : noneRow;
      var level = levels[g.id];
      var key = row + '|' + level;
      var slot = cells[key].indexOf(g);
      positions[g.id] = {
        x: PAD_LEFT + level * COL_W + slot * (NODE_W + 16),
        y: PAD_TOP + row * ROW_H + (ROW_H - NODE_H) / 2,
        row: row,
        level: level
      };
    });

    var maxLevel = 0;
    var maxSlots = 0;
    goals.forEach(function (g) {
      maxLevel = Math.max(maxLevel, levels[g.id]);
    });
    Object.keys(cells).forEach(function (key) {
      maxSlots = Math.max(maxSlots, cells[key].length);
    });

    return {
      goals: goals,
      levels: levels,
      dates: dates,
      noneRow: noneRow,
      rows: dates.length + 1,
      positions: positions,
      width: PAD_LEFT + (maxLevel + 1) * COL_W + (maxSlots - 1) * (NODE_W + 16) + PAD_RIGHT,
      height: PAD_TOP + (dates.length + 1) * ROW_H + PAD_BOTTOM
    };
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var svg = document.getElementById('flow-svg');
    var emptyEl = document.getElementById('plan-empty');
    var scrollEl = document.getElementById('flow-scroll');
    var goals = visible();

    if (!goals.length) {
      svg.innerHTML = '';
      scrollEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    scrollEl.classList.remove('hidden');

    var L = buildLayout(goals);
    svg.setAttribute('width', L.width);
    svg.setAttribute('height', L.height);
    svg.setAttribute('viewBox', '0 0 ' + L.width + ' ' + L.height);

    var html =
      '<defs>' +
        '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
          '<path d="M 0 1 L 9 5 L 0 9 z" fill="#c3c9d1"></path>' +
        '</marker>' +
      '</defs>';

    /* 日期轴标签 */
    L.dates.forEach(function (d, i) {
      html += '<text class="flow-date" x="10" y="' +
        (PAD_TOP + i * ROW_H + ROW_H / 2 + 4) + '">' + esc(fmtDate(d)) + '</text>';
    });
    html += '<text class="flow-date flow-date-none" x="10" y="' +
      (PAD_TOP + L.noneRow * ROW_H + ROW_H / 2 + 4) + '">未排期</text>';

    /* 前置依赖连线（画在节点下层） */
    goals.forEach(function (g) {
      var pos = L.positions[g.id];
      (g.prerequisites || []).forEach(function (pid) {
        var pp = L.positions[pid];
        if (!pp) return;
        var x1 = pp.x + NODE_W;
        var y1 = pp.y + NODE_H / 2;
        var x2 = pos.x;
        var y2 = pos.y + NODE_H / 2;
        var dx = Math.max(28, Math.min(90, (x2 - x1) / 2));
        html += '<path class="flow-edge" d="M ' + x1 + ' ' + y1 +
          ' C ' + (x1 + dx) + ' ' + y1 + ', ' + (x2 - dx) + ' ' + y2 + ', ' + x2 + ' ' + y2 +
          '" marker-end="url(#arrow)"></path>';
      });
    });

    /* 目标节点 */
    goals.forEach(function (g) {
      var pos = L.positions[g.id];
      var st = statusOf(g.status || 'todo');
      html +=
        '<foreignObject x="' + pos.x + '" y="' + pos.y + '" width="' + NODE_W +
          '" height="' + NODE_H + '" data-gid="' + esc(g.id) + '">' +
          '<div xmlns="http://www.w3.org/1999/xhtml" class="g-node s-' + esc(st.key) +
            '" style="--status-color:' + st.color + '">' +
            '<div class="g-node-head">' +
              '<span class="g-dot" style="background:' + courseColor(g.courseId) + '"></span>' +
              '<span class="g-title">' + esc(g.title) + '</span>' +
            '</div>' +
            '<div class="g-node-meta">' +
              '<span>' + esc(dateRangeText(g)) + '</span>' +
              '<span class="g-status">' + esc(st.label) + '</span>' +
            '</div>' +
          '</div>' +
        '</foreignObject>';
    });

    svg.innerHTML = html;

    /* 点击节点 → 编辑 */
    var byId = {};
    goals.forEach(function (g) { byId[g.id] = g; });
    svg.querySelectorAll('[data-gid]').forEach(function (fo) {
      var g = byId[fo.getAttribute('data-gid')];
      fo.addEventListener('click', function () { openForm(g); });
    });
  }

  /* 课程筛选下拉 */
  function refreshFilter() {
    var sel = document.getElementById('plan-filter');
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

  function openForm(g) {
    editingId = g ? g.id : null;
    var d = g || {
      title: '', detail: '', date: todayStr(), endDate: '', status: 'todo',
      courseId: filterCourse !== 'all' ? filterCourse : '',
      prerequisites: []
    };

    var courseOptions = '<option value="">不关联课程</option>' +
      NS.Storage.all('courses').map(function (c) {
        return '<option value="' + esc(c.id) + '"' +
          (c.id === d.courseId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('');

    var statusOptions = STATUS.map(function (s) {
      return '<option value="' + s.key + '"' +
        ((d.status || 'todo') === s.key ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');

    var others = NS.Storage.all('goals').filter(function (x) { return x.id !== editingId; });
    var prereqHtml;
    if (!others.length) {
      prereqHtml = '<p class="prereq-none">暂无其他目标，保存后可互相设为前置。</p>';
    } else {
      prereqHtml = others.map(function (x) {
        var checked = (d.prerequisites || []).indexOf(x.id) !== -1;
        return '<label class="prereq-item">' +
          '<input type="checkbox" value="' + esc(x.id) + '"' + (checked ? ' checked' : '') + '>' +
          '<span class="prereq-title">' + esc(x.title) + '</span>' +
          '<span class="prereq-meta">' + esc(dateRangeText(x)) + '</span>' +
          '</label>';
      }).join('');
    }

    var html =
      '<form id="goal-form" novalidate>' +
        '<div class="field">' +
          '<label for="f-goal-title">目标</label>' +
          '<input type="text" id="f-goal-title" required placeholder="如：掌握链表的插入与删除" value="' + esc(d.title) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-goal-detail">详细描述（可选）</label>' +
          '<textarea id="f-goal-detail" rows="2">' + esc(d.detail || '') + '</textarea>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-goal-date">起始日期</label>' +
          '<input type="date" id="f-goal-date" value="' + esc(d.date || '') + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-goal-end">结束日期（可选）</label>' +
          '<input type="date" id="f-goal-end" value="' + esc(d.endDate || '') + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-goal-status">状态</label>' +
          '<select id="f-goal-status">' + statusOptions + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="f-goal-course">关联课程（可选）</label>' +
          '<select id="f-goal-course">' + courseOptions + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label>前置目标（完成后再开始本目标）</label>' +
          '<div class="prereq-list">' + prereqHtml + '</div>' +
        '</div>' +
        '<div class="form-actions">' +
          (editingId
            ? '<button type="button" class="btn-ghost danger-btn" id="f-goal-del">删除</button>'
            : '') +
          '<span class="form-actions-spacer"></span>' +
          '<button type="button" class="btn-ghost" id="f-goal-cancel">取消</button>' +
          '<button type="submit" class="btn-primary">保存</button>' +
        '</div>' +
      '</form>';

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-title').textContent = editingId ? '编辑目标' : '添加目标';

    document.getElementById('f-goal-cancel').addEventListener('click', closeModal);
    document.getElementById('goal-form').addEventListener('submit', function (e) {
      e.preventDefault();
      saveForm();
    });
    if (editingId) {
      document.getElementById('f-goal-del').addEventListener('click', function () {
        removeGoal(NS.Storage.get('goals', editingId));
      });
    }

    showModal();
  }

  /* 若新增前置后 gid 可经依赖链回到自身 → 成环 */
  function wouldCreateCycle(gid, prereqIds) {
    var adj = {};
    NS.Storage.all('goals').forEach(function (g) {
      adj[g.id] = (g.prerequisites || []).slice();
    });
    adj[gid] = prereqIds.slice();

    var stack = [gid];
    var seen = {};
    while (stack.length) {
      var cur = stack.pop();
      if (seen[cur]) continue;
      seen[cur] = true;
      var next = adj[cur] || [];
      for (var i = 0; i < next.length; i++) {
        if (next[i] === gid) return true;
        stack.push(next[i]);
      }
    }
    return false;
  }

  function saveForm() {
    var title = document.getElementById('f-goal-title').value.trim();
    if (!title) return;

    var prev = editingId ? NS.Storage.get('goals', editingId) : null;
    var prereqIds = Array.prototype.slice.call(
      document.querySelectorAll('#goal-form input[type="checkbox"]:checked')
    ).map(function (el) { return el.value; });

    if (wouldCreateCycle(editingId || ('g' + Date.now()), prereqIds)) {
      window.alert('无法保存：前置依赖形成循环，请调整前置目标。');
      return;
    }

    var startDate = document.getElementById('f-goal-date').value || '';
    var endDate = document.getElementById('f-goal-end').value || '';
    if (startDate && endDate && endDate < startDate) {
      window.alert('结束日期不能早于起始日期。');
      return;
    }

    var item = {
      id: editingId || ('g' + Date.now()),
      title: title,
      detail: document.getElementById('f-goal-detail').value.trim(),
      date: startDate,
      endDate: endDate,
      status: document.getElementById('f-goal-status').value,
      courseId: document.getElementById('f-goal-course').value,
      prerequisites: prereqIds,
      createdAt: (prev && prev.createdAt) || new Date().toISOString()
    };

    NS.Storage.upsert('goals', item);
    closeModal();
    render();
  }

  function removeGoal(g) {
    if (!window.confirm('确定删除目标「' + g.title + '」？其他目标对它的前置引用将一并清除。')) return;
    NS.Storage.remove('goals', g.id);
    NS.Storage.all('goals').forEach(function (x) {
      if ((x.prerequisites || []).indexOf(g.id) !== -1) {
        x.prerequisites = x.prerequisites.filter(function (p) { return p !== g.id; });
        NS.Storage.upsert('goals', x);
      }
    });
    closeModal();
    render();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    document.getElementById('btn-add-goal').addEventListener('click', function () {
      openForm(null);
    });

    refreshFilter();
    document.getElementById('plan-filter').addEventListener('change', function () {
      filterCourse = this.value;
      render();
    });

    NS.Events.on('courses-changed', function () {
      refreshFilter();
      render();
    });
  }

  NS.Plan = {
    render: render,
    init: init,
    refreshFilter: refreshFilter
  };
})();
