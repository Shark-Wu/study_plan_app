/* ============================================================
   模块④：AI 助手（DeepSeek 浏览器直连，无需后端）
   - API Key 仅保存在本机浏览器 localStorage，可随时修改/清除
   - 三个快捷场景：审阅学习规划 / 辅导待办作业 / 推荐教程资料
   - 支持模型（flash / v4-pro）与深度思考开关切换
   - 内容基于模型知识生成（非实时联网搜索），仅供参考
   ============================================================ */
(function () {
  'use strict';
  var NS = (window.App = window.App || {});

  var API_URL = 'https://api.deepseek.com/chat/completions';
  var SYSTEM_PROMPT =
    '你是我的个人学习助手，正在帮助一位大学生管理课程与学习规划。' +
    '回答一律使用中文，条理清晰、简洁实用，多用小标题或分点。' +
    '涉及作业时给出思路与引导，而不是直接代写答案；' +
    '推荐教程与资料时说明适用对象，并提醒内容基于你的知识、可能过时。';

  var history = []; /* [{role, content, error?}] 仅当前会话，不落盘 */
  var busy = false;

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 轻量 Markdown 渲染：先转义，再处理标题/加粗/行内代码/链接 */
  function renderText(t) {
    var s = esc(t);
    s = s.replace(/^#{1,3}\s+(.+)$/gm, '<b>$1</b>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  function getKey() { return NS.Storage.getSetting('deepseekApiKey') || ''; }
  function getModel() { return NS.Storage.getSetting('deepseekModel') || 'deepseek-flash'; }
  function getThinking() { return NS.Storage.getSetting('deepseekThinking') !== false; }

  function statusLabel(key) {
    var map = { todo: '未开始', doing: '进行中', done: '已完成' };
    return map[key] || key;
  }

  /* ---------- 调用 API ---------- */
  async function callDeepSeek(messages) {
    var key = getKey();
    if (!key) throw new Error('尚未配置 API Key，请在上方填写后保存。');

    var body = {
      model: getModel(),
      messages: messages,
      max_tokens: 4096,
      stream: false
    };
    if (!getThinking()) body.thinking = { type: 'disabled' };

    var res;
    try {
      res = await window.fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('无法连接 DeepSeek 服务器，请检查网络后重试。');
    }

    var data = null;
    try { data = await res.json(); } catch (e) { /* 忽略解析失败 */ }

    if (!res.ok) {
      if (res.status === 401) throw new Error('API Key 无效，请检查后重新保存。');
      if (res.status === 402) throw new Error('账户余额不足，请前往 platform.deepseek.com 充值后重试。');
      if (res.status === 429) throw new Error('请求过于频繁或额度受限，请稍等片刻再试。');
      var msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      throw new Error('请求失败（HTTP ' + res.status + '）：' + msg);
    }

    if (!data || !data.choices || !data.choices.length) {
      throw new Error('模型未返回内容，请重试。');
    }
    return data.choices[0].message.content || '（模型未返回内容）';
  }

  /* ---------- 快捷场景上下文 ---------- */
  function planContext() {
    var lines = NS.Storage.all('goals').map(function (g) {
      var c = g.courseId ? NS.Storage.get('courses', g.courseId) : null;
      var pres = (g.prerequisites || []).map(function (p) {
        var x = NS.Storage.get('goals', p);
        return x ? x.title : p;
      });
      return '- 「' + g.title + '」' +
        (g.date && g.endDate ? '（' + g.date + ' ~ ' + g.endDate + '）'
          : g.date ? '（起始 ' + g.date + '）'
          : g.endDate ? '（截止 ' + g.endDate + '）'
          : '（未排期）') +
        ' 状态：' + statusLabel(g.status) +
        (pres.length ? ' 前置：' + pres.join('、') : '') +
        (c ? ' 课程：' + c.name : '');
    });
    return lines.join('\n');
  }

  function homeworkContext() {
    var lines = NS.Storage.all('assignments')
      .filter(function (a) { return !a.done; })
      .map(function (a) {
        var c = NS.Storage.get('courses', a.courseId);
        return '- ' + (c ? c.name : '未知课程') + '：' + a.title +
          (a.week ? '（第' + a.week + '周）' : '') +
          (a.dueDate ? '，截止 ' + a.dueDate : '') +
          (a.detail ? '，要求：' + a.detail : '');
      });
    return lines.join('\n');
  }

  function coursesContext() {
    var lines = NS.Storage.all('courses').map(function (c) {
      return '- ' + c.name +
        (c.teacher ? '（老师：' + String(c.teacher).split('\n')[0] + '）' : '') +
        (c.notes ? '，备注：' + c.notes : '');
    });
    return lines.join('\n');
  }

  /* ---------- 聊天 ---------- */
  function renderChat() {
    var box = document.getElementById('ai-chat');
    box.innerHTML = '';
    history.forEach(function (m) {
      var div = document.createElement('div');
      div.className = 'ai-msg ' + (m.role === 'user' ? 'msg-user' : 'msg-ai') +
        (m.error ? ' msg-err' : '');
      var body = document.createElement('div');
      body.className = 'msg-body';
      body.innerHTML = renderText(m.content);
      div.appendChild(body);
      box.appendChild(div);
    });
    if (busy) {
      var pending = document.createElement('div');
      pending.className = 'ai-msg msg-ai msg-pending';
      pending.textContent = '正在思考…';
      box.appendChild(pending);
    }
    box.scrollTop = box.scrollHeight;
  }

  async function sendMessage(text) {
    if (busy) return;
    text = String(text || '').trim();
    if (!text) return;
    if (!getKey()) {
      window.alert('请先在上方填写 DeepSeek API Key（仅保存在本机浏览器）。');
      return;
    }

    history.push({ role: 'user', content: text });
    busy = true;
    renderChat();

    try {
      var msgs = [{ role: 'system', content: SYSTEM_PROMPT }]
        .concat(history.filter(function (m) { return !m.error; }).slice(-12));
      var reply = await callDeepSeek(msgs);
      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      history.push({ role: 'assistant', content: e.message || '请求失败，请重试。', error: true });
    }

    busy = false;
    renderChat();
  }

  function quickAsk(kind) {
    if (busy) return;
    var ctx, msg;
    if (kind === 'plan') {
      ctx = planContext();
      if (!ctx) { window.alert('请先在「学习规划」中添加学习目标。'); return; }
      msg = '以下是我目前的学习规划（含起止日期、状态与前置依赖）：\n\n' + ctx +
        '\n\n请审阅并给出建议：1) 时间节奏是否合理；2) 前置依赖顺序是否合适；' +
        '3) 还可以补充哪些学习目标；4) 各目标建议的学习方法。';
    } else if (kind === 'homework') {
      ctx = homeworkContext();
      if (!ctx) { window.alert('当前没有待完成的作业。'); return; }
      msg = '以下是我待完成的作业：\n\n' + ctx +
        '\n\n请帮我：1) 按优先级安排完成顺序；2) 对每项给出完成思路与要点（不直接代写）；' +
        '3) 提醒容易踩的坑。';
    } else {
      ctx = coursesContext();
      if (!ctx) { window.alert('请先在「课程简介」中添加课程。'); return; }
      msg = '我在学这些课程：\n\n' + ctx +
        '\n\n请基于你的知识，为每门课推荐高质量学习资源（教程网站、公开课、经典教材、练习平台），' +
        '并注明适合新手还是进阶。';
    }
    sendMessage(msg);
  }

  /* ---------- 初始化 ---------- */
  function updateStatus() {
    var el = document.getElementById('ai-status');
    el.textContent = getKey() ? '已配置 ✓' : '未配置';
    el.className = 'ai-status' + (getKey() ? ' ok' : '');
  }

  function init() {
    var keyInput = document.getElementById('ai-key');
    var modelSel = document.getElementById('ai-model');
    var thinkBox = document.getElementById('ai-thinking');

    keyInput.value = getKey();
    modelSel.value = getModel();
    thinkBox.checked = getThinking();

    document.getElementById('btn-ai-save').addEventListener('click', function () {
      NS.Storage.setSetting('deepseekApiKey', keyInput.value.trim());
      NS.Storage.setSetting('deepseekModel', modelSel.value);
      NS.Storage.setSetting('deepseekThinking', thinkBox.checked);
      updateStatus();
    });

    thinkBox.addEventListener('change', function () {
      NS.Storage.setSetting('deepseekThinking', thinkBox.checked);
    });

    document.querySelectorAll('[data-quick]').forEach(function (btn) {
      btn.addEventListener('click', function () { quickAsk(btn.dataset.quick); });
    });

    var input = document.getElementById('ai-input');
    document.getElementById('btn-ai-send').addEventListener('click', function () {
      sendMessage(input.value);
      input.value = '';
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input.value);
        input.value = '';
      }
    });

    history.push({
      role: 'assistant',
      content: '你好！我是 AI 学习助手。可以点击上方按钮让我审阅规划、辅导作业或推荐教程，' +
        '也可以直接在下面输入任何学习问题。'
    });
    updateStatus();
    renderChat();
  }

  NS.AI = {
    init: init,
    render: function () {}
  };
})();
