/* ============================================================
   入口与协调：标签页切换、启动初始化、轻量事件总线（跨模块刷新）
   ============================================================ */
(function () {
  'use strict';
  var NS = (window.App = window.App || {});

  /* ---------- 事件总线：模块间解耦通知 ---------- */
  var handlers = {};

  NS.Events = {
    on: function (name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    emit: function (name, data) {
      (handlers[name] || []).forEach(function (fn) {
        try {
          fn(data);
        } catch (e) {
          console.error('[events] ' + name + ':', e);
        }
      });
    }
  };

  /* ---------- 标签页切换 ---------- */
  function switchView(name) {
    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === name);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('active', v.id === 'view-' + name);
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    NS.Storage.init();

    /* 各模块初始化（绑定按钮、监听事件）；未来模块加入后自动生效 */
    [NS.Courses, NS.Homework, NS.Plan, NS.AI].forEach(function (mod) {
      if (mod && mod.init) mod.init();
    });
    /* 初始渲染 */
    [NS.Courses, NS.Homework, NS.Plan, NS.AI].forEach(function (mod) {
      if (mod && mod.render) mod.render();
    });

    document.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchView(btn.dataset.view);
      });
    });

    /* 支持 #homework、#plan 等锚点直达对应视图 */
    var initial = window.location.hash.replace('#', '');
    if (['courses', 'homework', 'plan', 'ai'].indexOf(initial) !== -1) {
      switchView(initial);
    }
  }

  NS.init = init;
  NS.switchView = switchView;
})();
