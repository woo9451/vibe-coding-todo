import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  push,
  set,
  onValue,
  remove,
  update,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_UGBxN6qJDM8GTbBRyVXmVxTz7jmgaMQ",
  authDomain: "seunghoon-todo-backend.firebaseapp.com",
  projectId: "seunghoon-todo-backend",
  storageBucket: "seunghoon-todo-backend.firebasestorage.app",
  messagingSenderId: "588409588951",
  appId: "1:588409588951:web:940cc000938f14b6883492",
  databaseURL: "https://seunghoon-todo-backend-default-rtdb.firebaseio.com",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const todosRef = ref(db, "todos");

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

/** @param {string} id */
function todoItemRef(id) {
  return ref(db, `todos/${id}`);
}

/**
 * Realtime Database에서 할 일 텍스트를 수정합니다.
 * @param {string} id
 * @param {string} text
 */
async function saveTodoTextToFirebase(id, text) {
  await update(todoItemRef(id), { text });
}

/**
 * Realtime Database에서 할 일을 삭제합니다.
 * @param {string} id
 */
async function deleteTodoFromFirebase(id) {
  await remove(todoItemRef(id));
}

(() => {
  const SELECTED_DATE_KEY = "todo-app-selected-date";

  const form = document.getElementById("todo-form");
  const input = document.getElementById("todo-input");
  const list = document.getElementById("todo-list");
  const emptyHint = document.getElementById("todo-empty");
  const loadingEl = document.getElementById("todo-loading");

  const dateInput = /** @type {HTMLInputElement} */ (
    document.getElementById("todo-calendar-input")
  );
  const calendarLabelEl = document.getElementById("calendar-label");
  const calendarPrev = document.getElementById("calendar-prev");
  const calendarNext = document.getElementById("calendar-next");

  /** @type {{ id: string, text: string, date?: string }[]} */
  let allTodos = [];

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
    selectedDate = next;
    persistSelectedDate();
    syncCalendarUI();
    render();
  }

  calendarPrev?.addEventListener("click", () => setSelectedDate(shiftYMD(selectedDate, -1)));
  calendarNext?.addEventListener("click", () => setSelectedDate(shiftYMD(selectedDate, 1)));
  dateInput?.addEventListener("change", () => {
    if (!dateInput.value || !isYMD(dateInput.value)) return;
    setSelectedDate(dateInput.value.trim());
  });

  syncCalendarUI();

  /** Firebase 스냅샷 → 할 일 배열 */
  function todosFromSnapshot(snapshot) {
    const raw = snapshot.val();
    const next = [];
    if (raw && typeof raw === "object") {
      for (const [id, v] of Object.entries(raw)) {
        if (!(v && typeof v === "object" && typeof v.text === "string" && v.text.trim()))
          continue;
        /** @type {string | undefined} */
        let date;
        const d = /** @type {{ text?: string; date?: unknown }} */ (v).date;
        if (typeof d === "string" && isYMD(d)) date = d.trim();
        next.push({ id, text: v.text.trim(), date });
      }
      next.sort((a, b) => a.id.localeCompare(b.id));
    }
    return next;
  }

  /** 선택한 날짜와 일치하거나 과거 형식(date 없음)인 항목만 표시 */
  function todosForSelectedDate() {
    return allTodos.filter((t) => !t.date || t.date === selectedDate);
  }

  async function fetchTodoListFromFirebase() {
    const snapshot = await get(todosRef);
    return todosFromSnapshot(snapshot);
  }

  async function bootstrapTodoListFromFirebase() {
    try {
      allTodos = await fetchTodoListFromFirebase();
    } catch (e) {
      console.error("[Realtime Database] 목록 가져오기 실패:", e?.code ?? e, e?.message ?? e);
      allTodos = [];
    }

    loadingEl.hidden = true;
    render();

    onValue(
      todosRef,
      (snapshot) => {
        allTodos = todosFromSnapshot(snapshot);
        loadingEl.hidden = true;
        render();
      },
      (err) => {
        console.error("[Realtime Database]", err?.code ?? err, err?.message ?? err);
        allTodos = [];
        loadingEl.hidden = true;
        render();
      }
    );
  }

  function updateEmptyMessage(visibleCount) {
    emptyHint.hidden = visibleCount > 0;
    list.hidden = visibleCount === 0;
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
    const todos = todosForSelectedDate();

    todos.forEach((todo) => {
      const li = document.createElement("li");
      li.className = "todo-item";
      li.dataset.id = todo.id;

      const textSpan = document.createElement("span");
      textSpan.className = "todo-item__text";
      textSpan.textContent = todo.text;

      const actions = document.createElement("div");
      actions.className = "todo-item__actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--ghost todo-item__edit-btn";
      editBtn.textContent = "수정";
      editBtn.setAttribute("aria-label", `${todo.text} 수정`);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--danger todo-item__delete-btn";
      delBtn.textContent = "삭제";
      delBtn.setAttribute("aria-label", `${todo.text} 삭제`);

      editBtn.addEventListener("click", () => enterEdit(li, todo.id));
      delBtn.addEventListener("click", () => removeTodo(todo.id));

      actions.append(editBtn, delBtn);
      li.append(textSpan, actions);
      list.append(li);
    });

    updateEmptyMessage(todos.length);
  }

  /**
   * @param {HTMLLIElement} li
   * @param {string} id
   */
  function enterEdit(li, id) {
    const todo = allTodos.find((t) => t.id === id);
    if (!todo) return;

    const row = document.createElement("div");
    row.className = "todo-item__edit-row";

    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "todo-item__edit-input";
    inp.value = todo.text;
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
      if (!allTodos.some((t) => t.id === id)) return;

      saveBtn.disabled = true;
      cancelBtn.disabled = true;

      try {
        await saveTodoTextToFirebase(id, next);
        exitEdit(true);
      } catch (e) {
        console.error("[Realtime Database] 수정 실패:", e?.code ?? e, e?.message ?? e);
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

  async function removeTodo(id) {
    try {
      await deleteTodoFromFirebase(id);
    } catch (e) {
      console.error("[Realtime Database] 삭제 실패:", e?.code ?? e, e?.message ?? e);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;

    try {
      await set(push(todosRef), { text, date: selectedDate });
      input.value = "";
      input.focus();
    } catch (err) {
      console.error(err);
    } finally {
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
    }
  });

  bootstrapTodoListFromFirebase();
})();

export { app };
