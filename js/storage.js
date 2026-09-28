/* ============================================================
   数据层：localStorage 持久化（版本化键）、首次运行种子注入、
   数据版本迁移、通用增删改查、删除课程时级联清理名下作业与学习目标
   ============================================================ */
(function () {
  'use strict';
  var NS = (window.App = window.App || {});

  var KEY = 'studyplan.data.v1';
  var COLLECTIONS = ['courses', 'assignments', 'goals'];

  var DB = null;

  function deepCopy(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(DB));
    } catch (e) {
      console.warn('[storage] 保存失败：', e);
    }
  }

  /* 数据版本迁移：DB.version 落后于种子版本时按步骤补齐，保留用户已有改动 */
  function mondayBefore(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }

  function weekOfDate(dateStr, semesterStart) {
    if (!dateStr || !semesterStart) return '';
    var diff = Math.floor((mondayBefore(dateStr) - mondayBefore(semesterStart)) / 86400000 / 7);
    return diff < 0 ? '' : (diff + 1);
  }

  function migrate() {
    var seed = NS.SEED || { version: 1, courses: [], assignments: [], goals: [] };
    var v = DB.version || 1;

    if (v < 2) {
      /* v2：作业模块上线
         - 按课程名补齐种子中新增的课程（不覆盖用户已改过的同名课程）
         - 注入种子作业（旧版本还没有作业 UI，无用户数据可丢） */
      var names = {};
      DB.courses.forEach(function (c) { names[c.name] = true; });
      seed.courses.forEach(function (c) {
        if (!names[c.name]) {
          DB.courses.push(deepCopy(c));
          names[c.name] = true;
        }
      });
      DB.assignments = deepCopy(seed.assignments || []);
    }

    if (v < 3) {
      /* v3：作业周次筛选上线
         - 合并学期设置（默认 2025-09-01）
         - 种子作业补 week 字段、清理 detail 中的周次占位文本
         - 用户自建作业：无 week 但有截止日期的，按截止日期推算周次 */
      DB.settings = (DB.settings && typeof DB.settings === 'object') ? DB.settings : {};
      if (!DB.settings.semesterStart && seed.settings && seed.settings.semesterStart) {
        DB.settings.semesterStart = seed.settings.semesterStart;
      }

      var byId = {};
      DB.assignments.forEach(function (a) { byId[a.id] = a; });
      seed.assignments.forEach(function (s) {
        if (byId[s.id]) {
          if (!byId[s.id].week && s.week) byId[s.id].week = s.week;
          if (typeof byId[s.id].detail === 'string' &&
              /^第\s*\d+\s*周作业$/.test(byId[s.id].detail)) {
            byId[s.id].detail = '';
          }
        } else {
          DB.assignments.push(deepCopy(s));
        }
      });
      DB.assignments.forEach(function (a) {
        if (!a.week && a.dueDate) {
          var w = weekOfDate(a.dueDate, DB.settings.semesterStart);
          if (w) a.week = w;
        }
      });
    }

    DB.version = seed.version;
    persist();
  }

  /* 初始化：读取本地数据；不存在或损坏时注入种子 */
  function init() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (e) {
      /* 隐私模式等无法访问 localStorage 时降级为内存数据 */
    }

    if (raw) {
      try {
        DB = JSON.parse(raw);
      } catch (e) {
        DB = null;
      }
    }

    if (!DB || typeof DB !== 'object') {
      DB = deepCopy(NS.SEED || { version: 1, courses: [], assignments: [], goals: [] });
      DB.version = (NS.SEED && NS.SEED.version) || 1;
      persist();
    } else {
      migrate();
    }

    COLLECTIONS.forEach(function (k) {
      if (!Array.isArray(DB[k])) DB[k] = [];
    });

    if (!DB.settings || typeof DB.settings !== 'object') DB.settings = {};

    return DB;
  }

  /* ---------- 设置 ---------- */
  function getSetting(key) {
    return DB.settings ? DB.settings[key] : undefined;
  }

  function setSetting(key, value) {
    DB.settings = DB.settings || {};
    DB.settings[key] = value;
    persist();
  }

  /* ---------- 通用 CRUD ---------- */

  function all(name) {
    return DB[name];
  }

  function get(name, id) {
    var list = DB[name];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return undefined;
  }

  function upsert(name, item) {
    var list = DB[name];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === item.id) {
        list[i] = item;
        persist();
        return item;
      }
    }
    list.push(item);
    persist();
    return item;
  }

  function remove(name, id) {
    DB[name] = DB[name].filter(function (x) { return x.id !== id; });
    persist();
  }

  /* ---------- 课程级联 ---------- */

  /* 统计某课程名下作业与目标数量（用于删除确认提示） */
  function countsForCourse(courseId) {
    return {
      a: DB.assignments.filter(function (x) { return x.courseId === courseId; }).length,
      g: DB.goals.filter(function (x) { return x.courseId === courseId; }).length
    };
  }

  /* 删除课程，并级联删除其名下作业与学习目标 */
  function removeCourse(courseId) {
    DB.courses = DB.courses.filter(function (x) { return x.id !== courseId; });
    DB.assignments = DB.assignments.filter(function (x) { return x.courseId !== courseId; });
    DB.goals = DB.goals.filter(function (x) { return x.courseId !== courseId; });
    persist();
  }

  NS.Storage = {
    KEY: KEY,
    init: init,
    all: all,
    get: get,
    upsert: upsert,
    remove: remove,
    getSetting: getSetting,
    setSetting: setSetting,
    countsForCourse: countsForCourse,
    removeCourse: removeCourse
  };
})();
