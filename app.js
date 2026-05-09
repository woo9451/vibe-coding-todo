/**
 * 백엔드 API 베이스 URL.
 * 라우터가 `app.use("/todos", router)` 처럼 마운트돼 있다고 가정합니다.
 * 다른 경로(예: "/api/todos")이면 아래 한 줄만 바꿔주세요.
 */
const API_BASE = "http://localhost:5000/todos";

/**
 * @typedef {Object} Todo
 * @property {string} _id
 * @property {string} content
 * @property {boolean} [isCompleted]
 * @property {string} [date]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

function ymdFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayYMD() {
  return ymdFromDate(new Date());
}

/** @param {string} ymd */
function shiftYMD(ymd, deltaDays) {
  const [y, mo, da] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, da + deltaDays);
  return ymdFromDate(dt);
}

/** @param {string} ymd */
function formatKoreanLongLabel(ymd) {
  const [y, mo, da] = ymd.split("-").map(Number);
  const dt = new Date(y, mo - 1, da);
  const line = dt.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const w = dt.toLocaleDateString("ko-KR", { weekday: "short" });
  return `${line} (${w})`;
}

/** @param {string} v */
function isYMD(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

/**
 * fetch 응답을 통일된 방식으로 처리합니다.
 * @template T
 * @param {Response} res
 * @returns {Promise<T>}
 */
async function readJsonOrThrow(res) {
  const ct = res.headers.get("content-type") ?? "";
  const isJson = ct.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && typeof body.message === "string" && body.message) ||
      (typeof body === "string" && body) ||
      `요청 실패 (HTTP ${res.status})`;
    const err = new Error(message);
    /** @type {any} */ (err).status = res.status;
    throw err;
  }

  return /** @type {T} */ (body);
}

/**
 * @param {string} [date] YYYY-MM-DD
 * @returns {Promise<Todo[]>}
 */
async function fetchTodos(date) {
  const url = date ? `${API_BASE}?date=${encodeURIComponent(date)}` : API_BASE;
  const res = await fetch(url, { method: "GET" });
  const data = await readJsonOrThrow(res);
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} content
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<Todo>}
 */
async function createTodo(content, date) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, date }),
  });
  return readJsonOrThrow(res);
}

/**
 * @param {string} id
 * @param {Partial<Pick<Todo, "content" | "isCompleted">>} patch
 * @returns {Promise<Todo>}
 */
async function patchTodo(id, patch) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return readJsonOrThrow(res);
}

/** @param {string} id */
async function deleteTodoById(id) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  await readJsonOrThrow(res);
}

(() => {
  const SELECTED_DATE_KEY = "todo-app-selected-date";

  const form = document.getElementById("todo-form");
  const input = /** @type {HTMLInputElement} */ (document.getElementById("todo-input"));
  const list = document.getElementById("todo-list");
  const emptyHint = document.getElementById("todo-empty");
  const loadingEl = document.getElementById("todo-loading");
  const errorEl = document.getElementById("api-error");

  const dateInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("todo-calendar-input")
  );
  const calendarLabelEl = document.getElementById("calendar-label");
  const calendarPrev = document.getElementById("calendar-prev");
  const calendarNext = document.getElementById("calendar-next");

  /** @type {Todo[]} */
  let todos = [];

  function readStoredDateOrToday() {
    const raw = localStorage.getItem(SELECTED_DATE_KEY);
    if (raw && isYMD(raw)) return raw.trim();
    return todayYMD();
  }

  let selectedDate = readStoredDateOrToday();

  function persistSelectedDate() {
    localStorage.setItem(SELECTED_DATE_KEY, selectedDate);
  }

  function syncCalendarUI() {
    if (dateInput) dateInput.value = selectedDate;
    if (calendarLabelEl) calendarLabelEl.textContent = formatKoreanLongLabel(selectedDate);
  }

  function setSelectedDate(next) {
    if (!isYMD(next) || next === selectedDate) return;
    selectedDate = next;
    persistSelectedDate();
    syncCalendarUI();
    loadTodos();
  }

  calendarPrev?.addEventListener("click", () => setSelectedDate(shiftYMD(selectedDate, -1)));
  calendarNext?.addEventListener("click", () => setSelectedDate(shiftYMD(selectedDate, 1)));
  dateInput?.addEventListener("change", () => {
    if (!dateInput.value || !isYMD(dateInput.value)) return;
    setSelectedDate(dateInput.value.trim());
  });

  syncCalendarUI();

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function clearError() {
    showError("");
  }

  function updateEmptyMessage() {
    emptyHint.hidden = todos.length > 0;
    list.hidden = todos.length === 0;
  }

  /** @param {HTMLElement} container */
  function focusEditInput(container) {
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const btn = container.querySelector(".todo-item__edit-cancel");
      if (btn instanceof HTMLButtonElement) btn.click();
    });
    queueMicrotask(() => {
      const el = container.querySelector(".todo-item__edit-input");
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      }
    });
  }

  function render() {
    list.replaceChildren();

    todos.forEach((todo) => {
      const li = document.createElement("li");
      li.className = "todo-item";
      if (todo.isCompleted) li.classList.add("todo-item--done");
      li.dataset.id = todo._id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "todo-item__checkbox";
      checkbox.checked = !!todo.isCompleted;
      checkbox.setAttribute("aria-label", `${todo.content} 완료 여부`);
      checkbox.addEventListener("change", () => toggleCompleted(todo._id, checkbox.checked));

      const textSpan = document.createElement("span");
      textSpan.className = "todo-item__text";
      textSpan.textContent = todo.content;

      const actions = document.createElement("div");
      actions.className = "todo-item__actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--ghost todo-item__edit-btn";
      editBtn.textContent = "수정";
      editBtn.setAttribute("aria-label", `${todo.content} 수정`);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--danger todo-item__delete-btn";
      delBtn.textContent = "삭제";
      delBtn.setAttribute("aria-label", `${todo.content} 삭제`);

      editBtn.addEventListener("click", () => enterEdit(li, todo._id));
      delBtn.addEventListener("click", () => removeTodo(todo._id));

      actions.append(editBtn, delBtn);
      li.append(checkbox, textSpan, actions);
      list.append(li);
    });

    updateEmptyMessage();
  }

  /**
   * @param {HTMLLIElement} li
   * @param {string} id
   */
  function enterEdit(li, id) {
    const todo = todos.find((t) => t._id === id);
    if (!todo) return;

    const row = document.createElement("div");
    row.className = "todo-item__edit-row";

    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "todo-item__edit-input";
    inp.value = todo.content;
    inp.maxLength = 280;

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn todo-item__edit-save";
    saveBtn.textContent = "저장";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost todo-item__edit-cancel";
    cancelBtn.textContent = "취소";

    row.append(inp, saveBtn, cancelBtn);
    li.replaceChildren(row);

    function exitEdit(refocusBtn) {
      render();
      if (refocusBtn) {
        const again = list.querySelector(`li[data-id="${CSS.escape(id)}"] .todo-item__edit-btn`);
        if (again instanceof HTMLElement) again.focus();
      }
    }

    async function commit() {
      const next = inp.value.trim();
      if (!next) {
        inp.focus();
        return;
      }
      if (!todos.some((t) => t._id === id)) return;

      saveBtn.disabled = true;
      cancelBtn.disabled = true;

      try {
        const updated = await patchTodo(id, { content: next });
        const idx = todos.findIndex((t) => t._id === id);
        if (idx !== -1) todos[idx] = { ...todos[idx], ...updated };
        clearError();
        exitEdit(true);
      } catch (e) {
        console.error("[API] 수정 실패:", e);
        showError(`수정 실패: ${e?.message ?? e}`);
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        inp.focus();
      }
    }

    saveBtn.addEventListener("click", () => commit());
    cancelBtn.addEventListener("click", () => exitEdit(true));

    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    });

    focusEditInput(li);
  }

  /**
   * @param {string} id
   * @param {boolean} isCompleted
   */
  async function toggleCompleted(id, isCompleted) {
    const idx = todos.findIndex((t) => t._id === id);
    if (idx === -1) return;
    const previous = todos[idx];

    todos[idx] = { ...previous, isCompleted };
    render();

    try {
      const updated = await patchTodo(id, { isCompleted });
      const i2 = todos.findIndex((t) => t._id === id);
      if (i2 !== -1) todos[i2] = { ...todos[i2], ...updated };
      render();
      clearError();
    } catch (e) {
      console.error("[API] 완료 상태 변경 실패:", e);
      showError(`완료 상태 변경 실패: ${e?.message ?? e}`);
      const i2 = todos.findIndex((t) => t._id === id);
      if (i2 !== -1) todos[i2] = previous;
      render();
    }
  }

  /** @param {string} id */
  async function removeTodo(id) {
    try {
      await deleteTodoById(id);
      todos = todos.filter((t) => t._id !== id);
      render();
      clearError();
    } catch (e) {
      console.error("[API] 삭제 실패:", e);
      showError(`삭제 실패: ${e?.message ?? e}`);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

    try {
      const created = await createTodo(text, selectedDate);
      if (
        created &&
        typeof created._id === "string" &&
        (!created.date || created.date === selectedDate)
      ) {
        todos = [created, ...todos];
        render();
      } else {
        await loadTodos();
      }
      input.value = "";
      input.focus();
      clearError();
    } catch (err) {
      console.error("[API] 추가 실패:", err);
      showError(`추가 실패: ${err?.message ?? err}`);
    } finally {
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    }
  });

  async function loadTodos() {
    loadingEl.hidden = false;
    list.hidden = true;
    emptyHint.hidden = true;
    try {
      todos = await fetchTodos(selectedDate);
      clearError();
    } catch (e) {
      console.error("[API] 목록 가져오기 실패:", e);
      showError(
        `목록을 불러오지 못했습니다 (${e?.message ?? e}). 백엔드 서버(${API_BASE})가 실행 중이고 CORS가 허용되어 있는지 확인하세요.`
      );
      todos = [];
    } finally {
      loadingEl.hidden = true;
      render();
    }
  }

  loadTodos();
})();
