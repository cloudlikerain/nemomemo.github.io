/* ============================================================
   nemomemo – SPA + Calendar/Timeline/Todo + localStorage
   - 달력 월 생성 & 월 넘기기 (← / → / 오늘)
   - Event: 날짜별 일정
   - TimeBlock: 하루 타임테이블
   - Todo: 할 일
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  /* ----------------------------------------
     유틸: 오늘 날짜 YYYY-MM-DD
  ---------------------------------------- */
  function formatDateToYMD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDateLabel(ymd) {
    const [y, m, d] = ymd.split("-");
    return `${y}년 ${Number(m)}월 ${Number(d)}일`;
  }

  // "HH:MM" → 가장 가까운 5분 단위로 스냅해서 "HH:MM"
  function snapTimeTo5Minutes(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return timeStr;

    let total = h * 60 + m;
    let snapped = Math.round(total / 5) * 5;

    if (snapped < 0) snapped = 0;
    const maxMinutes = 23 * 60 + 55;
    if (snapped > maxMinutes) snapped = maxMinutes;

    const hh = Math.floor(snapped / 60);
    const mm = snapped % 60;

    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  const TODAY = formatDateToYMD(new Date());

  const EVENT_COLOR_PALETTE = [
    "rgb(242, 145, 145)", // 0 - 빨강
    "rgb(242, 200, 145)", // 1 - 주황
    "rgb(242, 231, 145)", // 2 - 노랑
    "rgb(203, 236, 133)", // 3 - 연두
    "rgb(141, 227, 158)", // 4 - 초록
    "rgb(116, 193, 232)", // 5 - 하늘
    "rgb(116, 155, 232)", // 6 - 파랑
    "rgb(183, 131, 235)", // 7 - 보라
    "rgb(255, 204, 238)", // 8 - 분홍
    "rgb(188, 188, 188)", // 9 - 회색
  ];
  // 이벤트 색상 팔레트 (인덱스로만 저장)
  const EVENT_COLOR_BG_PALETTE = [
    "rgba(242, 145, 145, 0.33)", // 0 - 빨강
    "rgba(242, 200, 145, 0.33)", // 1 - 주황
    "rgba(242, 231, 145, 0.33)", // 2 - 노랑
    "rgba(203, 236, 133, 0.33)", // 3 - 연두
    "rgba(141, 227, 158, 0.33)", // 4 - 초록
    "rgba(116, 193, 232, 0.33)", // 5 - 하늘
    "rgba(116, 155, 232, 0.33)", // 6 - 파랑
    "rgba(183, 131, 235, 0.33)", // 7 - 보라
    "rgba(255, 204, 238, 0.33)", // 8 - 분홍
    "rgba(188, 188, 188, 0.33)", // 9 - 회색
  ];

  /* ----------------------------------------
     공통: 화면 전환 로직 (탭바)
  ---------------------------------------- */
  const tabs = document.querySelectorAll(".bottom-nav__item");
  const screens = document.querySelectorAll(".screen");

  function showScreen(target) {
    screens.forEach((screen) => {
      if (screen.dataset.screen === target) {
        screen.dataset.active = "true";
        screen.style.display = "";
      } else {
        screen.dataset.active = "false";
        screen.style.display = "none";
      }
    });

    tabs.forEach((tab) => {
      if (tab.dataset.screenTarget === target) {
        tab.classList.add("bottom-nav__item--active");
        tab.setAttribute("aria-current", "page");
      } else {
        tab.classList.remove("bottom-nav__item--active");
        tab.removeAttribute("aria-current");
      }
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.screenTarget;
      showScreen(target);
    });
  });

  // 첫 화면: 달력
  showScreen("calendar");

  /* ----------------------------------------
     바텀시트 공용 로직 (event / timeblock)
  ---------------------------------------- */
  const sheet = document.querySelector(".bottom-sheet");
  const sheetOverlay = document.querySelector(".bottom-sheet__overlay");
  const sheetForm = document.querySelector(".bottom-sheet__form");
  const sheetTitleEl = document.querySelector(".bottom-sheet__title");
  const sheetModeInput = document.querySelector(".bottom-sheet__mode");
  const sheetTitleInput = document.querySelector(
    ".bottom-sheet__input--title"
  );
  const sheetDateInput = document.querySelector(".bottom-sheet__input--date");
  const sheetStartInput = document.querySelector(
    ".bottom-sheet__input--start"
  );
  const sheetEndInput = document.querySelector(".bottom-sheet__input--end");
  const sheetMemoInput = document.querySelector(".bottom-sheet__input--memo");
  const sheetMemoField = sheetMemoInput
    ? sheetMemoInput.closest(".bottom-sheet__field")
    : null;

  // 시간 인풋을 항상 5분 단위로 정리해주기
  if (sheetStartInput) {
    sheetStartInput.addEventListener("change", () => {
      sheetStartInput.value = snapTimeTo5Minutes(sheetStartInput.value);
    });
  }

  if (sheetEndInput) {
    sheetEndInput.addEventListener("change", () => {
      sheetEndInput.value = snapTimeTo5Minutes(sheetEndInput.value);
    });
  }

  const sheetCloseBtn = document.querySelector(".bottom-sheet__close");
  const sheetCancelBtn = document.querySelector(
    "[data-sheet-action='cancel']"
  );
  const sheetColorIndexInput = document.querySelector(
    ".bottom-sheet__color-index"
  );
  const sheetColorOptions = document.querySelectorAll(
    ".bottom-sheet__color-option"
  );
  // ✅ 편집할 일정 id 저장용 + 삭제 버튼
  const sheetEventIdInput = document.querySelector(
    ".bottom-sheet__event-id"
  );
  const sheetDeleteBtn = document.querySelector(
    "[data-sheet-action='delete-event']"
  );
  const sheetBlockIdInput = document.querySelector(
    ".bottom-sheet__input--block-id"
  );
  const sheetTaskIdInput = document.querySelector(
    ".bottom-sheet__input--task-id"
  );

  function setSheetColorIndex(index) {
    if (!sheetColorIndexInput) return;
    sheetColorIndexInput.value = String(index);

    sheetColorOptions.forEach((opt) => {
      const optIndex = parseInt(opt.dataset.colorIndex || "0", 10);
      if (optIndex === index) {
        opt.classList.add("bottom-sheet__color-option--selected");
      } else {
        opt.classList.remove("bottom-sheet__color-option--selected");
      }
    });
  }

  // 색 버튼 클릭하면 선택
  sheetColorOptions.forEach((opt) => {
    opt.addEventListener("click", () => {
      const idx = parseInt(opt.dataset.colorIndex || "0", 10);
      if (isNaN(idx)) return;
      setSheetColorIndex(idx);
    });
  });

  function openBottomSheet(mode, options = {}) {
    if (!sheet) return;

    sheetModeInput.value = mode;

    const isNewEvent = mode === "event";
    const isEditEvent = mode === "edit-event";
    const isTimeblock = mode === "timeblock";
    const isEditTimeblock = mode === "edit-timeblock";
    const isTask = mode === "task";
    const isEditTask = mode === "edit-task";

    const isTaskMode = isTask || isEditTask;

    // 🔹 시간 필드 required 제어 (할 일은 시간 선택사항)
    if (sheetStartInput) {
      sheetStartInput.required = !isTaskMode;
    }
    if (sheetEndInput) {
      sheetEndInput.required = !isTaskMode;
    }

    // 🔹 종료 시간 필드 숨기기 + 한 칸만 쓰는 레이아웃 적용
    const timeRow = sheetStartInput
      ? sheetStartInput.closest(".bottom-sheet__row")
      : null;
    const endField = sheetEndInput
      ? sheetEndInput.closest(".bottom-sheet__field")
      : null;

    if (timeRow && endField) {
      if (isTaskMode) {
        timeRow.classList.add("bottom-sheet__row--single");
        endField.style.display = "none";
      } else {
        timeRow.classList.remove("bottom-sheet__row--single");
        endField.style.display = "";
      }
    }

    // 🔹 타이틀
    if (isNewEvent) {
      sheetTitleEl.textContent = "새 일정 추가";
    } else if (isEditEvent) {
      sheetTitleEl.textContent = "일정 수정";
    } else if (isTimeblock) {
      sheetTitleEl.textContent = "새 타임블록 추가";
    } else if (isEditTimeblock) {
      sheetTitleEl.textContent = "타임블록 수정";
    } else if (isTask) {
      sheetTitleEl.textContent = "새 할 일 추가";
    } else if (isEditTask) {
      sheetTitleEl.textContent = "할 일 수정";
    } else {
      sheetTitleEl.textContent = "입력";
    }

    // 🔹 eventId 세팅 (편집 모드일 때만)
    if (sheetEventIdInput) {
      sheetEventIdInput.value = isEditEvent ? (options.eventId || "") : "";
    }

    if (sheetBlockIdInput) {
      sheetBlockIdInput.value = isEditTimeblock ? (options.blockId || "") : "";
    }

    // 🔹 taskId 세팅 (편집 모드일 때만)
    if (sheetTaskIdInput) {
      sheetTaskIdInput.value = isEditTask ? (options.taskId || "") : "";
    }

    // 🔹 기본값 채우기
    const defaultDate = options.date || TODAY;
    const defaultStart = options.start || "10:00";
    const defaultEnd = options.end || "11:00";
    const defaultTitle = options.title || "";
    const defaultMemo = options.memo || "";
    
    sheetTitleInput.value = defaultTitle;
    sheetDateInput.value = defaultDate;
    sheetStartInput.value = defaultStart;
    sheetEndInput.value = defaultEnd;

    if (sheetMemoInput) {
      sheetMemoInput.value = defaultMemo;
    }

    const defaultColorIndex =
      typeof options.colorIndex === "number" ? options.colorIndex : 0;
    setSheetColorIndex(defaultColorIndex);

    // 🔹 삭제 버튼은 편집 모드일 때만 노출 (일정 / 타임블록 / 할 일)
    if (sheetDeleteBtn) {
      sheetDeleteBtn.style.display =
        isEditEvent || isEditTimeblock || isEditTask ? "" : "none";
    }

    sheet.classList.add("bottom-sheet--visible");
    sheet.setAttribute("aria-hidden", "false");

    setTimeout(() => {
      sheetTitleInput.focus();
    }, 50);
  }


  function closeBottomSheet() {
    if (!sheet) return;
    sheet.classList.remove("bottom-sheet--visible");
    sheet.setAttribute("aria-hidden", "true");
  }

  if (sheetOverlay) {
    sheetOverlay.addEventListener("click", closeBottomSheet);
  }
  if (sheetCloseBtn) {
    sheetCloseBtn.addEventListener("click", closeBottomSheet);
  }
  if (sheetCancelBtn) {
    sheetCancelBtn.addEventListener("click", closeBottomSheet);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (sheet && sheet.classList.contains("bottom-sheet--visible")) {
        closeBottomSheet();
      }
    }
  });

  if (sheetDeleteBtn) {
    sheetDeleteBtn.addEventListener("click", () => {
      const mode = sheetModeInput.value;
      // 편집 모드가 아니면 삭제 안 함
      if (
        mode !== "edit-event" &&
        mode !== "edit-timeblock" &&
        mode !== "edit-task"
      ) {
        return;
      }
      if (mode === "edit-event") {
        const targetId = sheetEventIdInput
          ? sheetEventIdInput.value
          : "";
        if (!targetId) {
          alert("삭제할 일정을 찾을 수 없어요.");
          return;
        }

        const ev = events.find((item) => item.id === targetId);
        if (!ev) {
          alert("이미 삭제되었거나 찾을 수 없는 일정입니다.");
          closeBottomSheet();
          return;
        }

        const confirmDelete = window.confirm(
          `정말 이 일정을 삭제할까요?\n\n제목: ${ev.title}\n시간: ${ev.startTime} ~ ${ev.endTime}`
        );
        if (!confirmDelete) return;

        events = events.filter((item) => item.id !== targetId);
        saveEventsToStorage();
        setSelectedDate(currentSelectedDate);

        // 🔹 일정 삭제 후에도 하루 탭/달력 상태 동기화
        if (currentTimelineDate) {
          renderTasksForDate(currentTimelineDate);
          renderDayRightList(currentTimelineDate);
        }
        renderCalendar();

        closeBottomSheet();
        alert("일정을 삭제했습니다.");
        
      } else if (mode === "edit-timeblock") {
        const blockId = sheetBlockIdInput ? sheetBlockIdInput.value : "";
        if (!blockId) return;

        const ok = window.confirm("이 타임블록을 삭제할까요?");
        if (!ok) return;

        timeBlocks = timeBlocks.filter((b) => b.id !== blockId);
        saveTimeBlocksToStorage();
        setTimelineDate(currentTimelineDate);
        closeBottomSheet();
      } else if (mode === "edit-task") {
        // 🔹 할 일 삭제 로직 (todos에서 제거)
        const taskId = sheetTaskIdInput ? sheetTaskIdInput.value : "";
        if (!taskId) {
          alert("삭제할 할 일을 찾을 수 없어요.");
          return;
        }

        const target = todos.find((t) => t.id === taskId);
        if (!target) {
          alert("이미 삭제되었거나 찾을 수 없는 할 일입니다.");
          closeBottomSheet();
          return;
        }

        const ok = window.confirm(
          `정말 이 할 일을 삭제할까요?\n\n제목: ${target.text}`
        );
        if (!ok) return;

        todos = todos.filter((t) => t.id !== taskId);
        saveTodosToStorage();

        // 🔹 이 할 일이 속해 있던 날짜 (달력/하루 화면용)
        const targetDate = target.dueDate || currentSelectedDate;

        // 투두 탭 리스트 다시 그리기
        if (typeof renderTodoLists === "function") {
          renderTodoLists();
        } else if (typeof renderTodoList === "function") {
          renderTodoList();
        }

        // 하루 탭 "오늘의 할 일" 다시 그리기
        if (currentTimelineDate) {
          renderTasksForDate(currentTimelineDate);
        }

        // 🔹 달력 탭 & 하루 탭 오른쪽 리스트도 동기화
        renderEventListForDate(targetDate);    // 달력 탭 오른쪽
        renderDayRightList(targetDate);        // 하루 탭 오른쪽
        renderCalendar();                      // 날짜 아래 점들

        closeBottomSheet();
        alert("할 일을 삭제했습니다.");
      }
    });
  }

  /* ============================================================
     Event 모듈 (달력 & 날짜별 일정 리스트)
  ============================================================ */
  const EVENT_STORAGE_KEY = "nemomemo_events_v1";

  // 🔹 달력 DOM
  const calendarGrid = document.querySelector(".calendar-grid--month");
  const calendarMonthLabel = document.querySelector(
    ".calendar-header__current-month"
  );
  const prevMonthBtn = document.querySelector(
    ".calendar-header__nav-button--prev"
  );
  const nextMonthBtn = document.querySelector(
    ".calendar-header__nav-button--next"
  );
  const viewToggleButtons = document.querySelectorAll(
    ".calendar-header__view-button"
  );

  // 🔹 달력 뷰 모드 상태 변수
  let calendarViewMode = "month"; // "month" | "week"

  const eventListElement = document.querySelector(".event-list");
  const dayDetailDateLabel = document.querySelector(".day-detail__date-label");
  const addEventButton = document.querySelector(".day-detail__add-button");
  const addEventFab = document.querySelector(".fab--add-event");
  const addTaskButton = document.querySelector(".day-detail__add-task-button");

  let events = [];
  let currentSelectedDate = TODAY;
  let eventIdCounter = 1;
  let currentMonthDate = new Date(); // 현재 보고 있는 달 (1일 기준)

  // 🔹 달력 페이지 이동: 월/주 모드 공용
  function goToPrevCalendarPage() {
    if (calendarViewMode === "month") {
      // 이전 달
      currentMonthDate = new Date(
        currentMonthDate.getFullYear(),
        currentMonthDate.getMonth() - 1,
        1
      );
      renderCalendar();
    } else {
      // (주간 모드 쓸 거면 남겨두고, 안 쓰면 이 else는 그냥 안 타게 됨)
      const [yy, mm, dd] = currentSelectedDate.split("-").map(Number);
      const d = new Date(yy, mm - 1, dd);
      d.setDate(d.getDate() - 7);
      const newYMD = formatDateToYMD(d);
      setSelectedDate(newYMD);
    }
  }

  function goToNextCalendarPage() {
    if (calendarViewMode === "month") {
      // 다음 달
      currentMonthDate = new Date(
        currentMonthDate.getFullYear(),
        currentMonthDate.getMonth() + 1,
        1
      );
      renderCalendar();
    } else {
      const [yy, mm, dd] = currentSelectedDate.split("-").map(Number);
      const d = new Date(yy, mm - 1, dd);
      d.setDate(d.getDate() + 7);
      const newYMD = formatDateToYMD(d);
      setSelectedDate(newYMD);
    }
  }


  function loadEventsFromStorage() {
    try {
      const raw = localStorage.getItem(EVENT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // 🔥 colorIndex가 없는 예전 데이터들도 기본값 0을 채워줌
      return parsed.map((ev) => {
        let colorIndex = 0;
        if (
          typeof ev.colorIndex === "number" &&
          ev.colorIndex >= 0 &&
          ev.colorIndex < EVENT_COLOR_PALETTE.length
        ) {
          colorIndex = ev.colorIndex;
        }
        return { ...ev, colorIndex };
      });
    } catch (e) {
      console.warn("⚠️ 이벤트 로딩 중 오류 (초기화):", e);
      return [];
    }
  }

  function saveEventsToStorage() {
    try {
      localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
      console.warn("⚠️ 이벤트 저장 중 오류:", e);
    }
  }

  function getNextEventId() {
    const currentMax = events.reduce((max, ev) => {
      if (typeof ev.id === "string" && ev.id.startsWith("event-")) {
        const n = parseInt(ev.id.replace("event-", ""), 10);
        if (!isNaN(n) && n > max) return n;
      }
      return max;
    }, 0);
    eventIdCounter = Math.max(eventIdCounter, currentMax + 1);
    const id = `event-${eventIdCounter++}`;
    return id;
  }

  function renderEventListForDate(dateYMD) {
    if (!eventListElement) return;
    eventListElement.innerHTML = "";

    const todaysEvents = events
      .filter((ev) => ev.date === dateYMD)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
      
    // 🔹 해당 날짜의 "기한 있는 할 일" (deadline todo)
    const todaysDeadlineTodos = Array.isArray(todos)
      ? todos
          .filter(
            (t) =>
              !t.done &&
              t.type === "deadline" &&
              t.dueDate === dateYMD
          )
          .sort((a, b) => {
            // dueTime 기준으로 정렬 (없으면 뒤로)
            if (!a.dueTime && !b.dueTime) return 0;
            if (!a.dueTime) return 1;
            if (!b.dueTime) return -1;
            return a.dueTime.localeCompare(b.dueTime);
          })
      : [];

    if (dayDetailDateLabel) {
      dayDetailDateLabel.textContent = formatDateLabel(dateYMD);
    }

    // 🔹 일정도 없고, 기한 있는 할 일도 없으면 공백 메시지
    if (todaysEvents.length === 0 && todaysDeadlineTodos.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.textContent = "등록된 일정이나 할 일이 없어요.";
      emptyLi.style.fontSize = "12px";
      emptyLi.style.color = "#777";
      eventListElement.appendChild(emptyLi);
      return;
    }

    todaysEvents.forEach((ev) => {
      const li = document.createElement("li");
      li.className = "event-list__item";
      li.dataset.eventId = ev.id;

      const btn = document.createElement("button");
      btn.className = "event-list__button";
      btn.type = "button";

      // 🔥 색 막대
      const colorIndex =
        typeof ev.colorIndex === "number" ? ev.colorIndex : 0;
      const barColor =
        EVENT_COLOR_PALETTE[colorIndex] || EVENT_COLOR_PALETTE[0];

      const colorBar = document.createElement("div");
      colorBar.className = "event-list__color-bar";
      colorBar.style.backgroundColor = barColor;

      const timeDiv = document.createElement("div");
      timeDiv.className = "event-list__time";
      timeDiv.innerHTML = `
        <span class="event-list__time-start">${ev.startTime}</span>
        <span class="event-list__time-separator">–</span>
        <span class="event-list__time-end">${ev.endTime}</span>
      `;

      const contentDiv = document.createElement("div");
      contentDiv.className = "event-list__content";

      const titleDiv = document.createElement("div");
      titleDiv.className = "event-list__title";
      titleDiv.textContent = ev.title;

      const metaDiv = document.createElement("div");
      metaDiv.className = "event-list__meta";

      if (ev.memo && ev.memo.trim()) {
        const memoSpan = document.createElement("span");
        memoSpan.className =
          "event-list__meta-item event-list__meta-item--memo";
        memoSpan.textContent = ev.memo;
        metaDiv.appendChild(memoSpan);
      }

      contentDiv.appendChild(titleDiv);
      contentDiv.appendChild(metaDiv);

      btn.appendChild(colorBar);
      btn.appendChild(timeDiv);
      btn.appendChild(contentDiv);
      li.appendChild(btn);

      eventListElement.appendChild(li);

      btn.addEventListener("click", () => {
        // 🔹 이 이벤트를 편집하기 위한 바텀시트 열기
        openBottomSheet("edit-event", {
          eventId: ev.id,
          date: ev.date,
          start: ev.startTime,
          end: ev.endTime,
          title: ev.title,
          memo: ev.memo || "",
          colorIndex:
            typeof ev.colorIndex === "number" ? ev.colorIndex : 0,
        });
      });
    });

    // 🔹 이어서 기한 있는 할 일 렌더
    todaysDeadlineTodos.forEach((todo) => {
      const li = document.createElement("li");
      li.className = "event-list__item event-list__item--task";
      li.dataset.todoId = todo.id;

      const btn = document.createElement("button");
      btn.className = "event-list__button event-list__button--task";
      btn.type = "button";

      const colorIndex =
        typeof todo.colorIndex === "number" ? todo.colorIndex : 0;
      const barColor =
        EVENT_COLOR_PALETTE[colorIndex] || EVENT_COLOR_PALETTE[0];
      const bgColor =
        EVENT_COLOR_BG_PALETTE[colorIndex] || "rgba(0,0,0,0.03)"; // 🔹 추가

      const colorBar = document.createElement("div");
      colorBar.className = "event-list__color-bar";
      colorBar.style.backgroundColor = barColor;

      btn.style.backgroundColor = bgColor;
      btn.style.borderColor = "transparent";

      const timeDiv = document.createElement("div");
      timeDiv.className = "event-list__time";

      if (todo.dueTime) {
        timeDiv.textContent = todo.dueTime;
      } else {
        timeDiv.textContent = ""; // 시간 없으면 비워두기 (기한만 있는 할 일)
      }

      const contentDiv = document.createElement("div");
      contentDiv.className = "event-list__content";

      const titleDiv = document.createElement("div");
      titleDiv.className = "event-list__title";
      titleDiv.textContent = todo.text;

      const metaDiv = document.createElement("div");
      metaDiv.className = "event-list__meta";

      if (todo.memo && todo.memo.trim()) {
        const memoSpan = document.createElement("span");
        memoSpan.className =
          "event-list__meta-item event-list__meta-item--memo";
        memoSpan.textContent = todo.memo;
        metaDiv.appendChild(memoSpan);
      }

      contentDiv.appendChild(titleDiv);
      contentDiv.appendChild(metaDiv);

      btn.appendChild(colorBar);
      btn.appendChild(timeDiv);
      btn.appendChild(contentDiv);
      li.appendChild(btn);

      eventListElement.appendChild(li);

      // 🔹 클릭하면 "할 일 수정" 바텀시트 열기
      btn.addEventListener("click", () => {
        openBottomSheet("edit-task", {
          taskId: todo.id,
          date: todo.dueDate,
          start: todo.dueTime || "",
          title: todo.text,
          memo: todo.memo || "",
          colorIndex:
            typeof todo.colorIndex === "number" ? todo.colorIndex : 0,
        });
      });
    });
  }

  function makeDateMeta(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    const ymd = `${y}-${m}-${d}`;
    const dayNum = dateObj.getDate();
    return { ymd, dayNum };
  }

  function appendEventDotsToDayButton(btn, cellDate) {
    const uniqueColorIndices = [];

    // 🔹 cellDate 날짜의 이벤트들
    const dayEvents = events.filter((ev) => ev.date === cellDate);
    dayEvents.forEach((ev) => {
      const idx =
        typeof ev.colorIndex === "number" ? ev.colorIndex : 0;
      if (!uniqueColorIndices.includes(idx)) {
        uniqueColorIndices.push(idx);
      }
    });

    // 🔹 cellDate 날짜의 "기한 있는 할 일" (완료되지 않은 것만)
    if (Array.isArray(todos)) {
      const dayTodos = todos.filter(
        (t) =>
          !t.done &&
          t.type === "deadline" &&
          t.dueDate === cellDate
      );
      dayTodos.forEach((t) => {
        const idx =
          typeof t.colorIndex === "number" ? t.colorIndex : 0;
        if (!uniqueColorIndices.includes(idx)) {
          uniqueColorIndices.push(idx);
        }
      });
    }

    if (uniqueColorIndices.length === 0) return;

    const dotsContainer = document.createElement("span");
    dotsContainer.className = "calendar-day__dots";

    uniqueColorIndices.slice(0, 3).forEach((idx) => {
      const dot = document.createElement("span");
      dot.className = "calendar-day__dot";
      const color =
        EVENT_COLOR_PALETTE[idx] || EVENT_COLOR_PALETTE[0];
      dot.style.backgroundColor = color;
      dotsContainer.appendChild(dot);
    });

    btn.appendChild(dotsContainer);
  }

  function renderCalendar() {
    if (calendarViewMode === "month") {
      renderCalendarMonth(
        currentMonthDate.getFullYear(),
        currentMonthDate.getMonth()
      );
    } else {
      renderCalendarWeek(currentSelectedDate);
    }
  }

  function renderCalendarMonth(year, monthIndex) {
    if (!calendarGrid) return;

    calendarGrid.innerHTML = "";

    const firstOfMonth = new Date(year, monthIndex, 1);
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0(월)~6(일)
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const prevMonthDays = new Date(year, monthIndex, 0).getDate();

    // 상단에 "YYYY년 M월"
    if (calendarMonthLabel) {
      calendarMonthLabel.textContent = `${year}년 ${monthIndex + 1}월`;
    }

    // 이번 달이 차지하는 칸 수 = "앞에 비는 칸" + "그 달의 날짜 수"
    const usedCells = firstWeekday + daysInMonth;

    // 필요한 주 수 (4, 5, 6주 중 하나) - 7칸씩 끊어서 올림
    const totalWeeks = Math.ceil(usedCells / 7);

    // 실제로 그릴 칸 수 = 주 수 × 7
    const totalCells = totalWeeks * 7;

    for (let i = 0; i < totalCells; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendar-day";

      let cellDate;
      let labelText;

      if (i < firstWeekday) {
        // 이전 달
        const day = prevMonthDays - firstWeekday + 1 + i;
        const dateObj = new Date(year, monthIndex - 1, day);
        const { ymd, dayNum } = makeDateMeta(dateObj);
        cellDate = ymd;
        labelText = `${formatDateLabel(ymd)} (이전 달)`;
        btn.classList.add("calendar-day--outside-month");
        btn.innerHTML = `<span class="calendar-day__number">${dayNum}</span>`;
      } else if (i >= firstWeekday && i < firstWeekday + daysInMonth) {
        // 이번 달
        const day = i - firstWeekday + 1;
        const dateObj = new Date(year, monthIndex, day);
        const { ymd, dayNum } = makeDateMeta(dateObj);
        cellDate = ymd;
        labelText = formatDateLabel(ymd);

        btn.innerHTML = `
          <span class="calendar-day__number">${dayNum}</span>
        `;

        if (ymd === TODAY) {
          btn.classList.add("calendar-day--today");
        }
        if (ymd === currentSelectedDate) {
          btn.classList.add("calendar-day--selected");
        }
      } else {
        // 다음 달
        const day = i - (firstWeekday + daysInMonth) + 1;
        const dateObj = new Date(year, monthIndex + 1, day);
        const { ymd, dayNum } = makeDateMeta(dateObj);
        cellDate = ymd;
        labelText = `${formatDateLabel(ymd)} (다음 달)`;
        btn.classList.add("calendar-day--outside-month");
        btn.innerHTML = `<span class="calendar-day__number">${dayNum}</span>`;
      }

      btn.dataset.date = cellDate;
      appendEventDotsToDayButton(btn, cellDate);

      btn.setAttribute("aria-label", labelText);

      btn.addEventListener("click", () => {
        setSelectedDate(cellDate);
      });

      calendarGrid.appendChild(btn);
    }
  }

  // 🔹 주간 캘린더 렌더링 (월요일 시작, 7일)
  function renderCalendarWeek(baseYMD) {
    if (!calendarGrid) return;

    calendarGrid.innerHTML = "";

    const [y, m, d] = baseYMD.split("-").map(Number);
    const baseDate = new Date(y, m - 1, d);

    // baseDate의 요일 (월=0~일=6)
    const weekdayIndex = (baseDate.getDay() + 6) % 7;
    // 그 주의 월요일
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - weekdayIndex);

    // 레이블: "YYYY년 M월 D일 ~ M월 D일"
    const mondayYMD = formatDateToYMD(monday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayYMD = formatDateToYMD(sunday);

    if (calendarMonthLabel) {
      const [my, mm, md] = mondayYMD.split("-").map(Number);
      const [sy, sm, sd] = sundayYMD.split("-").map(Number);
      calendarMonthLabel.textContent = `${my}년 ${mm}월 ${md}일 ~ ${sm}월 ${sd}일`;
    }

    // currentMonthDate는 "기준이 되는 달" (색상/외부월 구분용)
    //const currentMonth = currentMonthDate.getMonth();
    //const currentYear = currentMonthDate.getFullYear();

    for (let i = 0; i < 7; i++) {
      const dateObj = new Date(monday);
      dateObj.setDate(monday.getDate() + i);

      const { ymd, dayNum } = makeDateMeta(dateObj);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendar-day";

      const labelText = formatDateLabel(ymd);
      btn.innerHTML = `<span class="calendar-day__number">${dayNum}</span>`;

      // 이번 "참조 달"과 달라지면 회색 처리
      //if (
      //  dateObj.getFullYear() !== currentYear ||
      //  dateObj.getMonth() !== currentMonth
      //) {
      //  btn.classList.add("calendar-day--outside-month");
      //}

      if (ymd === TODAY) {
        btn.classList.add("calendar-day--today");
      }
      if (ymd === currentSelectedDate) {
        btn.classList.add("calendar-day--selected");
      }

      btn.dataset.date = ymd;
      btn.setAttribute("aria-label", labelText);

      appendEventDotsToDayButton(btn, ymd);

      btn.addEventListener("click", () => {
        setSelectedDate(ymd);
      });

      calendarGrid.appendChild(btn);
    }
  }

  function setSelectedDate(ymd) {
    currentSelectedDate = ymd;

    // 기준 달 업데이트 (월간/주간 둘 다에서 사용)
    const [y, m] = ymd.split("-").map(Number);
    currentMonthDate = new Date(y, m - 1, 1);

    // 🔁 현재 뷰 모드에 맞게 캘린더 다시 그리기
    renderCalendar();

    // 아래 패널 (일정 리스트 / 타임테이블 동기화)
    renderEventListForDate(ymd);
    setTimelineDate(ymd);
  }

  function initEvents() {
    events = loadEventsFromStorage();

    // 현재 선택 날짜를 TODAY로 맞추고, 그 달로 세팅
    currentSelectedDate = TODAY;
    const [y, m] = currentSelectedDate.split("-").map(Number);
    currentMonthDate = new Date(y, m - 1, 1);

    // 🔁 선택 날짜 기준으로 캘린더/리스트/타임테이블 초기화
    setSelectedDate(currentSelectedDate);

    // 새 일정 추가 버튼 & FAB → 바텀시트
    if (addEventButton) {
      addEventButton.addEventListener("click", () => {
        openBottomSheet("event", { date: currentSelectedDate });
      });
    }
    if (addEventFab) {
      addEventFab.addEventListener("click", () => {
        openBottomSheet("event", { date: currentSelectedDate });
      });
    }
    // 새 할 일 추가 버튼 → 기한 있는 할 일 바텀시트
    if (addTaskButton) {
      addTaskButton.addEventListener("click", () => {
        openBottomSheet("task", {
          date: currentSelectedDate, // 기한 날짜
          start: "",                 // 시간은 선택 사항 (입력 안 해도 됨)
        });
      });
    }

    // 월/주 변경 버튼
    if (prevMonthBtn) {
      prevMonthBtn.addEventListener("click", goToPrevCalendarPage);
    }

    if (nextMonthBtn) {
      nextMonthBtn.addEventListener("click", goToNextCalendarPage);
    }

    // 월/주 뷰 토글 버튼
    if (viewToggleButtons && viewToggleButtons.length > 0) {
      viewToggleButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const view = btn.dataset.view; // "month" or "week"
          if (!view || view === calendarViewMode) return;

          calendarViewMode = view;

          // active 클래스 갱신
          viewToggleButtons.forEach((b) => {
            if (b.dataset.view === view) {
              b.classList.add("calendar-header__view-button--active");
            } else {
              b.classList.remove(
                "calendar-header__view-button--active"
              );
            }
          });

          // 현재 선택 날짜 기준으로 캘린더 다시 그리기
          renderCalendar();
        });
      });  
    }

    // 🔹 달력을 좌우로 스와이프해서 넘기기 (모바일용)
    if (calendarGrid) {
      let touchStartX = 0;
      let touchStartY = 0;
      let isSwiping = false;
      const SWIPE_THRESHOLD = 60; // 이 정도 이상 움직이면 페이지 전환

      calendarGrid.addEventListener("touchstart", (e) => {
        if (!e.touches || e.touches.length === 0) return;
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        isSwiping = true;
      });

      calendarGrid.addEventListener("touchmove", (e) => {
        if (!isSwiping || !e.touches || e.touches.length === 0) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;

        // 세로 스크롤이 더 크면 그냥 스와이프 취소 (스크롤 방해 X)
        if (Math.abs(dy) > Math.abs(dx)) {
          isSwiping = false;
          return;
        }

        // 기준 거리 넘으면 한 번만 반응
        if (Math.abs(dx) > SWIPE_THRESHOLD) {
          if (dx < 0) {
            // 왼쪽으로 밀면 → 다음 달
            goToNextCalendarPage();
          } else {
            // 오른쪽으로 밀면 → 이전 달
            goToPrevCalendarPage();
          }
          isSwiping = false;
        }
      });

      calendarGrid.addEventListener("touchend", () => {
        isSwiping = false;
      });

      calendarGrid.addEventListener("touchcancel", () => {
        isSwiping = false;
      });
    }
  }

  /* ============================================================
     TimeBlock 모듈 (하루 타임테이블 – 05~다음날04, 5분×12칸 가로바)
  ============================================================ */
  const TIMEBLOCK_STORAGE_KEY = "nemomemo_timeblocks_v1";
  const DAY_SETTINGS_STORAGE_KEY = "nemomemo_day_settings_v1"; // 🔹 날짜별 기상/수면 저장 키

  // 하루 탭 DOM
  const timetableEl = document.querySelector("#timetable");
  const dayScreenDateLabel = document.querySelector(".day-screen-date-label");
  const dayScreenDateButton = document.querySelector(".day-screen-date-button");
  const openBlockSheetBtn = document.querySelector(
    "[data-action='open-timeblock-sheet']"
  );
  const exportImageBtn = document.querySelector(
    "[data-action='export-timetable-image']"
  );
  const timeblockListEl = document.querySelector(".timeblock-list");

  // 🔹 기상/수면 입력 DOM
  const wakeInput = document.querySelector(".day-sleep-input--wake");
  const sleepInput = document.querySelector(".day-sleep-input--sleep");

  let timeBlocks = [];
  let currentTimelineDate = TODAY;
  let timeBlockIdCounter = 1;

  // 🔹 날짜별 기상/수면 설정
  let daySettings = {};

  // 기본 기상/수면 시간
  const DEFAULT_WAKE_TIME = "07:00";
  const DEFAULT_SLEEP_TIME = "01:00";

  // 하루 범위: 05:00 ~ 다음날 04:59
  const DAY_START_HOUR = 5;
  const DAY_TOTAL_HOURS = 24;
  const SLOT_MINUTES = 5;
  const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;


  function loadTimeBlocksFromStorage() {
    try {
      const raw = localStorage.getItem(TIMEBLOCK_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.warn("⚠️ 타임블록 로딩 중 오류 (초기화):", e);
      return [];
    }
  }

  function saveTimeBlocksToStorage() {
    try {
      localStorage.setItem(TIMEBLOCK_STORAGE_KEY, JSON.stringify(timeBlocks));
    } catch (e) {
      console.warn("⚠️ 타임블록 저장 중 오류:", e);
    }
  }

  // 🔹 날짜별 기상/수면 설정 로딩/저장
  function loadDaySettingsFromStorage() {
    try {
      const raw = localStorage.getItem(DAY_SETTINGS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      return {};
    } catch (e) {
      console.warn("⚠️ 기상/수면 설정 로딩 중 오류 (초기화):", e);
      return {};
    }
  }

  function saveDaySettingsToStorage() {
    try {
      localStorage.setItem(
        DAY_SETTINGS_STORAGE_KEY,
        JSON.stringify(daySettings)
      );
    } catch (e) {
      console.warn("⚠️ 기상/수면 설정 저장 중 오류:", e);
    }
  }

  // 🔹 특정 날짜 설정 가져오기 (없으면 기본값)
  function getDaySettingsForDate(dateYMD) {
    const s = daySettings[dateYMD] || {};
    return {
      wakeTime: s.wakeTime || DEFAULT_WAKE_TIME,
      sleepTime: s.sleepTime || DEFAULT_SLEEP_TIME,
    };
  }

  // 🔹 특정 날짜 설정 업데이트
  function updateDaySettingsForDate(dateYMD, partial) {
    const prev = daySettings[dateYMD] || {};
    daySettings[dateYMD] = { ...prev, ...partial };
    saveDaySettingsToStorage();
  }

  // 🔹 현재 날짜 설정을 인풋에 반영
  function applyDaySettingsToInputs(dateYMD) {
    if (!wakeInput || !sleepInput) return;
    const { wakeTime, sleepTime } = getDaySettingsForDate(dateYMD);
    wakeInput.value = wakeTime;
    sleepInput.value = sleepTime;
  }

  // 🔹 날짜별 기상/수면 설정 로딩/저장
  function loadDaySettingsFromStorage() {
    try {
      const raw = localStorage.getItem(DAY_SETTINGS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      return {};
    } catch (e) {
      console.warn("⚠️ 기상/수면 설정 로딩 중 오류 (초기화):", e);
      return {};
    }
  }

  function saveDaySettingsToStorage() {
    try {
      localStorage.setItem(
        DAY_SETTINGS_STORAGE_KEY,
        JSON.stringify(daySettings)
      );
    } catch (e) {
      console.warn("⚠️ 기상/수면 설정 저장 중 오류:", e);
    }
  }

  // 🔹 특정 날짜의 설정 가져오기 (없으면 기본값 사용)
  function getDaySettingsForDate(dateYMD) {
    const s = daySettings[dateYMD] || {};
    return {
      wakeTime: s.wakeTime || DEFAULT_WAKE_TIME,
      sleepTime: s.sleepTime || DEFAULT_SLEEP_TIME,
    };
  }

  // 🔹 특정 날짜의 설정 업데이트
  function updateDaySettingsForDate(dateYMD, partial) {
    const prev = daySettings[dateYMD] || {};
    daySettings[dateYMD] = { ...prev, ...partial };
    saveDaySettingsToStorage();
  }

  // 🔹 인풋에 현재 날짜 설정 반영
  function applyDaySettingsToInputs(dateYMD) {
    if (!wakeInput || !sleepInput) return;
    const { wakeTime, sleepTime } = getDaySettingsForDate(dateYMD);
    wakeInput.value = wakeTime;
    sleepInput.value = sleepTime;
  }

  function getNextTimeBlockId() {
    const currentMax = timeBlocks.reduce((max, b) => {
      if (typeof b.id === "string" && b.id.startsWith("timeblock-")) {
        const n = parseInt(b.id.replace("timeblock-", ""), 10);
        if (!isNaN(n) && n > max) return n;
      }
      return max;
    }, 0);
    timeBlockIdCounter = Math.max(timeBlockIdCounter, currentMax + 1);
    const id = `timeblock-${timeBlockIdCounter++}`;
    return id;
  }

  function setTimelineDate(ymd) {
    currentTimelineDate = ymd;
    if (dayScreenDateLabel) {
      dayScreenDateLabel.textContent = formatDateLabel(ymd);
    }
    applyDaySettingsToInputs(ymd);   // 🔹 입력칸에 기상/수면 시간 반영
    renderTimelineForDate(ymd);      // 🔹 해당 설정 기반으로 타임테이블 렌더
    renderDayRightList(ymd);
  }

  // "HH:MM" → 05:00 기준 offset 분(0~1439)
  function timeToOffsetMinutes(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    let total = h * 60 + m;
    // 05:00 이전(새벽)은 다음날로 간주해서 +24h
    if (total < DAY_START_HOUR * 60) {
      total += 24 * 60;
    }
    const offset = total - DAY_START_HOUR * 60; // 05:00을 0으로
    return Math.max(0, Math.min(offset, 24 * 60 - 1));
  }

  // 시간 줄 인덱스(0~23) → 실제 시각(05, 06, ..., 04)
  function hourIndexToHour(hourIndex) {
    return (DAY_START_HOUR + hourIndex) % 24;
  }

  // 블록 색 인덱스 계산
  function getBlockColorIndex(block) {
    if (
      typeof block.colorIndex === "number" &&
      block.colorIndex >= 0 &&
      block.colorIndex < EVENT_COLOR_PALETTE.length
    ) {
      return block.colorIndex;
    }
    if (block.sourceEventId) {
      const ev = events.find((e) => e.id === block.sourceEventId);
      if (
        ev &&
        typeof ev.colorIndex === "number" &&
        ev.colorIndex >= 0 &&
        ev.colorIndex < EVENT_COLOR_PALETTE.length
      ) {
        return ev.colorIndex;
      }
    }
    return 0;
  }

  // 겹치는 블록 있는지 검사 (같은 날짜 내)
  function hasOverlapTimeBlock(dateYMD, startTime, endTime, ignoreBlockId = null) {
    const newStart = timeToOffsetMinutes(startTime);
    const newEnd = timeToOffsetMinutes(endTime);

    return timeBlocks.some((b) => {
      if (b.date !== dateYMD) return false;
      if (ignoreBlockId && b.id === ignoreBlockId) return false;

      const bStart = timeToOffsetMinutes(b.start);
      const bEnd = timeToOffsetMinutes(b.end);

      return newStart < bEnd && newEnd > bStart;
    });
  }

  // 한 날짜의 타임테이블 전체 렌더
  function renderTimelineForDate(dateYMD) {
    if (!timetableEl) return;
    timetableEl.innerHTML = "";

    // 🔹 현재 날짜의 기상/수면 offset 계산
    const { wakeTime, sleepTime } = getDaySettingsForDate(dateYMD);
    const wakeOffset = timeToOffsetMinutes(wakeTime);
    const sleepOffset = timeToOffsetMinutes(sleepTime);

    // 24시간(행) 뼈대 만들기: 05, 06, ..., 23, 00, 01, 02, 03, 04
    const rows = [];
    for (let hourIndex = 0; hourIndex < DAY_TOTAL_HOURS; hourIndex++) {
      const hour = hourIndexToHour(hourIndex);
      const row = document.createElement("div");
      row.className = "timetable-row";

      const label = document.createElement("div");
      label.className = "timetable-row-label";
      label.textContent = String(hour).padStart(2, "0");

      const grid = document.createElement("div");
      grid.className = "timetable-row-grid";
      grid.dataset.hourIndex = String(hourIndex);

      // 기본 12칸(ㅇㅇㅇ...) 회색 칸
      for (let i = 0; i < SLOTS_PER_HOUR; i++) {
        const cell = document.createElement("div");
        cell.className = "timetable-cell";

        // 🔹 이 칸이 담당하는 시간(5분 단위)의 중심 offset 계산
        const slotStartOffset = hourIndex * 60 + i * SLOT_MINUTES;
        const slotEndOffset = slotStartOffset + SLOT_MINUTES;
        const slotCenterOffset = (slotStartOffset + slotEndOffset) / 2;

        const isBeforeWake = slotCenterOffset < wakeOffset;
        const isAfterSleep = slotCenterOffset >= sleepOffset;

        // 🔹 기상 이전/수면 이후 구간이면 진한 회색 칸으로 표시
        if (isBeforeWake || isAfterSleep) {
          cell.classList.add("timetable-cell--sleep");
        }

        grid.appendChild(cell);
      }

      row.appendChild(label);
      row.appendChild(grid);
      timetableEl.appendChild(row);
      rows.push(grid);
    }

    // 이 날짜의 블록들
    const todaysBlocks = timeBlocks
      .filter((b) => b.date === dateYMD)
      .sort((a, b) => a.start.localeCompare(b.start));

    // 각 블록을 시간 줄별로 나눠서 가로바로 그리기
    todaysBlocks.forEach((block) => {
      const startOffset = timeToOffsetMinutes(block.start);
      let endOffset = timeToOffsetMinutes(block.end);

      if (endOffset <= startOffset) {
        endOffset = startOffset + SLOT_MINUTES;
      }

      const colorIndex = getBlockColorIndex(block);
      const baseColor =
        EVENT_COLOR_PALETTE[colorIndex] || EVENT_COLOR_PALETTE[0];

      const firstHourIndex = Math.floor(startOffset / 60);
      const lastHourIndex = Math.floor((endOffset - 1) / 60);

      let isFirstSegment = true;

      for (
        let hourIndex = firstHourIndex;
        hourIndex <= lastHourIndex;
        hourIndex++
      ) {
        const rowIndex =
          ((hourIndex % DAY_TOTAL_HOURS) + DAY_TOTAL_HOURS) %
          DAY_TOTAL_HOURS;
        const rowGrid = rows[rowIndex];
        if (!rowGrid) continue;

        const rowStart = hourIndex * 60;
        const rowEnd = rowStart + 60;

        const sliceStart = Math.max(startOffset, rowStart);
        const sliceEnd = Math.min(endOffset, rowEnd);
        if (sliceEnd <= sliceStart) continue;

        const startSlot = Math.floor(
          (sliceStart - rowStart) / SLOT_MINUTES
        );
        const endSlot = Math.ceil(
          (sliceEnd - rowStart) / SLOT_MINUTES
        );

        const blockEl = document.createElement("div");
        blockEl.className = "timetable-block";

        if (isFirstSegment) {
          blockEl.textContent = block.title;
          isFirstSegment = false;
        }

        // 위치
        blockEl.style.gridColumn = `${startSlot + 1} / ${endSlot + 1}`;
        blockEl.style.gridRow = "1 / 2";

        const colorIndex = getBlockColorIndex(block);
        const borderColor =
          EVENT_COLOR_PALETTE[colorIndex] || EVENT_COLOR_PALETTE[0];
        const bgColor =
          EVENT_COLOR_BG_PALETTE[colorIndex] || "rgba(0,0,0,0.05)";

        // 🔹 타임블록은 항상 자신의 색 유지
        blockEl.style.borderLeft = `2px solid ${baseColor}`;
        blockEl.style.borderRight = `2px solid ${baseColor}`;
        blockEl.style.backgroundColor = bgColor;
        
        // 🔹 클릭 시 해당 타임블록 편집 바텀시트 열기
        blockEl.addEventListener("click", () => {
          openBottomSheet("edit-timeblock", {
            blockId: block.id,
            date: block.date,
            start: block.start,
            end: block.end,
            title: block.title,
            colorIndex: getBlockColorIndex(block),
          });
        });

        // 🔹 글자색 = 진하게 (회색 상속 방지)
        blockEl.style.color = "#111827";

        rowGrid.appendChild(blockEl);
      }
    });
  }

  // 오른쪽: 블록 목록
  function renderDayRightList(dateYMD) {
    const listEl = document.querySelector(".day-right-list");
    const emptyEl = document.querySelector(".day-right-empty");
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = "";

    // 🔹1) 타임블록
    const blocks = timeBlocks.filter((b) => b.date === dateYMD);

    // 🔹2) 기한 있는 할 일
    const tasks = todos.filter(
      (t) =>
        t.type === "deadline" &&
        t.dueDate === dateYMD &&
        !t.done
    );

    // 🔹 합치기
    const combined = [
      ...blocks.map((b) => ({ kind: "block", data: b })),
      ...tasks.map((t) => ({ kind: "task", data: t })),
    ];

    if (combined.length === 0) {
      emptyEl.style.display = "";
      return;
    }
    emptyEl.style.display = "none";

      combined.forEach((item) => {
        if (item.kind === "block") {
          // ✅ 타임블록(일정)용 디자인 ------------------------
          const block = item.data;

          const li = document.createElement("li");
          li.className = "timeblock-list__item";      // ✔ 기존 타임블록 클래스 그대로 사용
          li.dataset.blockId = block.id;

          const colorIndex = getBlockColorIndex(block);
          const color =
            EVENT_COLOR_PALETTE[colorIndex] || EVENT_COLOR_PALETTE[0];

          const colorBar = document.createElement("div");
          colorBar.className = "timeblock-list__color-bar";
          colorBar.style.backgroundColor = color;

          const content = document.createElement("div");
          content.className = "timeblock-list__content";

          const titleEl = document.createElement("div");
          titleEl.className = "timeblock-list__title";
          titleEl.textContent = block.title;

          const timeEl = document.createElement("div");
          timeEl.className = "timeblock-list__time-range";
          timeEl.textContent = `${block.start} ~ ${block.end}`;

          content.appendChild(titleEl);
          content.appendChild(timeEl);

          li.appendChild(colorBar);
          li.appendChild(content);

          li.addEventListener("click", () => {
            openBottomSheet("edit-timeblock", {
              blockId: block.id,
              date: block.date,
              start: block.start,
              end: block.end,
              title: block.title,
              colorIndex,
            });
          });

          listEl.appendChild(li);
        } else if (item.kind === "task") {
          // ✅ 할 일용 디자인 ------------------------
          const todo = item.data;

          const li = document.createElement("li");
          li.className = "day-task-item";           // ✔ 할 일 전용 클래스
          li.dataset.todoId = todo.id;

          const colorIndex =
            typeof todo.colorIndex === "number" ? todo.colorIndex : 0;
          const barColor =
            EVENT_COLOR_PALETTE[colorIndex] || EVENT_COLOR_PALETTE[0];
          const bgColor =
            EVENT_COLOR_BG_PALETTE[colorIndex] || "rgba(0,0,0,0.05)";

          li.style.backgroundColor = bgColor;

          const bar = document.createElement("div");
          bar.className = "day-task-item__colorbar";
          bar.style.backgroundColor = barColor;

          const content = document.createElement("div");
          content.className = "day-task-item__content";

          const titleEl = document.createElement("div");
          titleEl.className = "day-task-item__title";
          titleEl.textContent = todo.text;

          const metaEl = document.createElement("div");
          metaEl.className = "day-task-item__meta";
          metaEl.textContent = todo.dueTime || "종일";

          content.appendChild(titleEl);
          content.appendChild(metaEl);

          li.appendChild(bar);
          li.appendChild(content);

          li.addEventListener("click", () => {
            openBottomSheet("edit-task", {
              taskId: todo.id,
              date: todo.dueDate,
              start: todo.dueTime || "",
              title: todo.text,
              memo: todo.memo || "",
              colorIndex,
            });
          });

          listEl.appendChild(li);
        }
    });
  }


  function initTimeBlocks() {
    timeBlocks = loadTimeBlocksFromStorage();
    daySettings = loadDaySettingsFromStorage(); // 🔹 날짜 설정 로드

    // 🔹 초기 날짜(오늘 또는 선택된 날짜)의 인풋/타임테이블 반영
    setTimelineDate(currentSelectedDate);

    if (dayScreenDateButton) {
      dayScreenDateButton.addEventListener("click", () => {
        alert("날짜 선택 UI는 나중에 추가할 예정이에요 :)");
      });
    }

    if (openBlockSheetBtn) {
      openBlockSheetBtn.addEventListener("click", () => {
        openBottomSheet("timeblock", { date: currentTimelineDate });
      });
    }

    // 🔹 기상/수면 인풋 변경 시 저장 + 현재 날짜 전체 다시 렌더
    if (wakeInput) {
      wakeInput.addEventListener("change", () => {
        if (!currentTimelineDate) return;
        const value = wakeInput.value || DEFAULT_WAKE_TIME;
        updateDaySettingsForDate(currentTimelineDate, { wakeTime: value });
        setTimelineDate(currentTimelineDate);  // ⭐ 타임라인 + 오른쪽 리스트까지 한 번에 다시 그림
      });
    }

    if (sleepInput) {
      sleepInput.addEventListener("change", () => {
        if (!currentTimelineDate) return;
        const value = sleepInput.value || DEFAULT_SLEEP_TIME;
        updateDaySettingsForDate(currentTimelineDate, { sleepTime: value });
        setTimelineDate(currentTimelineDate);  // ⭐ 마찬가지
      });
    }
    
    const clearTimelineBtn = document.querySelector(
      "[data-action='clear-timeline']"
    );
    if (clearTimelineBtn) {
      clearTimelineBtn.addEventListener("click", () => {
        const ok = window.confirm(
          "현재 날짜의 타임테이블을 모두 비울까요?"
        );
        if (!ok) return;
        timeBlocks = timeBlocks.filter(
          (b) => b.date !== currentTimelineDate
        );
        saveTimeBlocksToStorage();
        renderTimelineForDate(currentTimelineDate);
      });
    }

    const importEventsBtn = document.querySelector(
      "[data-action='import-from-calendar']"
    );
    if (importEventsBtn) {
      importEventsBtn.addEventListener("click", () => {
        const todaysEvents = events
          .filter((ev) => ev.date === currentTimelineDate)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        if (todaysEvents.length === 0) {
          alert("이 날짜에는 불러올 달력 일정이 없어요.");
          return;
        }

        let createdCount = 0;

        todaysEvents.forEach((ev) => {
          const alreadyExists = timeBlocks.some(
            (b) =>
              b.date === currentTimelineDate &&
              b.sourceEventId === ev.id
          );
          if (alreadyExists) return;

          const start = ev.startTime;
          const end = ev.endTime;

          if (hasOverlapTimeBlock(currentTimelineDate, start, end)) {
            return;
          }

          const colorIndexFromEvent =
            typeof ev.colorIndex === "number" &&
            ev.colorIndex >= 0 &&
            ev.colorIndex < EVENT_COLOR_PALETTE.length
              ? ev.colorIndex
              : 0;

          const block = {
            id: getNextTimeBlockId(),
            date: currentTimelineDate,
            start,
            end,
            title: ev.title,
            sourceEventId: ev.id,
            colorIndex: colorIndexFromEvent,
          };
          timeBlocks.push(block);
          createdCount++;
        });

        if (createdCount === 0) {
          alert(
            "이미 이 날짜의 달력 일정들이 타임테이블에 모두 추가되어 있거나, 시간대가 겹쳐서 추가할 수 없어요."
          );
          return;
        }

        saveTimeBlocksToStorage();
        setTimelineDate(currentTimelineDate);
        alert(`${createdCount}개의 일정을 타임테이블에 추가했어요.`);
      });
    }

    if (exportImageBtn) {
      exportImageBtn.addEventListener("click", () => {
        if (!window.html2canvas) {
          alert(
            "이미지 저장 기능을 사용할 수 없어요 (html2canvas 미로딩)."
          );
          return;
        }
        const target = document.querySelector("#timetable");
        if (!target) {
          alert("저장할 타임테이블을 찾지 못했어요.");
          return;
        }

        window
          .html2canvas(target, {
            scale: 2,
            backgroundColor: "#ffffff",
          })
          .then((canvas) => {
            const link = document.createElement("a");
            link.href = canvas.toDataURL("image/png");
            link.download = `nemomemo_${currentTimelineDate}.png`;
            link.click();
          })
          .catch((err) => {
            console.error(err);
            alert("이미지 저장 중 오류가 발생했어요.");
          });
      });
    }
  }

  /* ============================================================
     바텀시트 submit → 일정/블록 실제 저장
  ============================================================ */
  if (sheetForm) {
    sheetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!sheetModeInput || !sheetTitleInput) return;

      const mode = sheetModeInput.value;

      const title = sheetTitleInput.value.trim();
      const date = sheetDateInput && sheetDateInput.value
        ? sheetDateInput.value
        : TODAY;

      const rawStart = sheetStartInput ? sheetStartInput.value : "";
      const rawEnd = sheetEndInput ? sheetEndInput.value : "";
      const memo = sheetMemoInput ? sheetMemoInput.value.trim() : "";

      // 공통 색상 index 파싱
      let colorIndex = 0;
      if (sheetColorIndexInput) {
        const raw = parseInt(sheetColorIndexInput.value || "0", 10);
        if (!isNaN(raw) && raw >= 0 && raw < EVENT_COLOR_PALETTE.length) {
          colorIndex = raw;
        }
      }

      /* -------------------------
         1) 할 일(Task) 모드
         - mode: "task" / "edit-task"
         - 기한 있는 할 일: date 필수, 시간은 선택 (start만 사용)
      ------------------------- */
      if (mode === "task" || mode === "edit-task") {
        if (!title) {
          alert("할 일의 제목을 입력해 주세요.");
          return;
        }

        // 기한 있는 할 일만 바텀시트로 만든다고 가정 (date 필수)
        if (!sheetDateInput || !sheetDateInput.value) {
          alert("기한 있는 할 일의 날짜를 선택해 주세요.");
          return;
        }

        const dueDate = sheetDateInput.value;
        const dueTime = rawStart ? snapTimeTo5Minutes(rawStart) : null;

        let targetId = sheetTaskIdInput ? sheetTaskIdInput.value : "";

        if (mode === "task") {
          // 새 할 일 (기한 있는 할 일)
          const newTodo = {
            id: getNextTodoId(),
            text: title,
            done: false,
            source: "calendar", // 달력/하루에서 만든 할 일
            type: "deadline",
            dueDate,
            dueTime,
            colorIndex,
            memo,
          };
          todos.push(newTodo);
        } else {
          // 기존 할 일 수정
          if (!targetId) {
            alert("수정할 할 일을 찾을 수 없어요.");
            return;
          }
          const todo = todos.find((t) => t.id === targetId);
          if (!todo) {
            alert("이미 삭제되었거나 찾을 수 없는 할 일입니다.");
            return;
          }
          todo.text = title;
          todo.type = "deadline";
          todo.dueDate = dueDate;
          todo.dueTime = dueTime;
          todo.colorIndex = colorIndex;
          todo.memo = memo;
        }

        saveTodosToStorage();
        if (typeof renderTodoLists === "function") {
          renderTodoLists();
        }
        // 🔹 캘린더/오른쪽 리스트도 즉시 반영
        setSelectedDate(dueDate);
        closeBottomSheet();
        alert("할 일을 저장했습니다.");
        return;
      }

      /* -------------------------
         2) 기존 event / timeblock 모드
      ------------------------- */
      const start = snapTimeTo5Minutes(rawStart);
      const end = snapTimeTo5Minutes(rawEnd);

      if (sheetStartInput) sheetStartInput.value = start;
      if (sheetEndInput) sheetEndInput.value = end;

      // start >= end인 경우 방어 (event / timeblock 에만 적용)
      if (start >= end) {
        alert("시작 시간이 종료 시간보다 같거나 늦을 수는 없어요.");
        return;
      }

      if (!title || !date || !start || !end) {
        alert("모든 값을 입력해주세요.");
        return;
      }

      if (mode === "event") {
        // ✅ 새 일정 생성
        const newEvent = {
          id: getNextEventId(),
          date,
          startTime: start,
          endTime: end,
          title,
          repeat: null,
          memo,
          colorIndex,
        };
        events.push(newEvent);
        saveEventsToStorage();
        setSelectedDate(date);
        alert("일정이 추가되었습니다.");
      } else if (mode === "edit-event") {
        // ✅ 기존 일정 수정
        const targetId = sheetEventIdInput ? sheetEventIdInput.value : "";
        if (!targetId) {
          alert("수정할 일정을 찾을 수 없어요.");
          return;
        }
        const event = events.find((item) => item.id === targetId);
        if (!event) {
          alert("이미 삭제되었거나 찾을 수 없는 일정입니다.");
          return;
        }
        event.title = title;
        event.date = date;
        event.startTime = start;
        event.endTime = end;
        event.memo = memo;
        event.colorIndex = colorIndex;

        saveEventsToStorage();
        setSelectedDate(event.date);
        alert("일정을 수정했습니다.");
      } else if (mode === "timeblock") {
        // ✅ 새 타임블록
        if (hasOverlapTimeBlock(date, start, end, null)) {
          alert("해당 시간대에 이미 블록이 있어요. 겹치지 않게 조정해 주세요.");
          return;
        }

        const block = {
          id: getNextTimeBlockId(),
          date,
          start,
          end,
          title,
          sourceEventId: null,
          colorIndex,
        };
        timeBlocks.push(block);
        saveTimeBlocksToStorage();
        setTimelineDate(date);
        alert("타임블록이 추가되었습니다.");
      } else if (mode === "edit-timeblock") {
        const blockId = sheetBlockIdInput ? sheetBlockIdInput.value : "";
        const block = timeBlocks.find((b) => b.id === blockId);
        if (!block) {
          alert("해당 타임블록을 찾지 못했습니다.");
          return;
        }

        if (hasOverlapTimeBlock(date, start, end, blockId)) {
          alert("해당 시간대에 이미 다른 블록이 있어요.");
          return;
        }

        block.title = title;
        block.date = date;
        block.start = start;
        block.end = end;
        block.colorIndex = colorIndex;

        saveTimeBlocksToStorage();
        setTimelineDate(block.date);
        alert("타임블록을 수정했습니다.");
      }

      closeBottomSheet();
    });
  }

  /* ============================================================
     Todo 모듈
  ============================================================ */
  const TODO_STORAGE_KEY = "nemomemo_todos_v1";

  // 리스트 3개 (기한 없는 / 기한 있는 / 완료된 할 일)
  const todoNodueListElement = document.querySelector(".todo-list--nodue");
  const todoDeadlineListElement = document.querySelector(".todo-list--deadline");
  const todoDoneListElement = document.querySelector(".todo-list--done");

  // 섹션별 빈 상태 메시지
  const todoEmptyNodueMessage = document.querySelector(
    ".todo-empty-message--nodue"
  );
  const todoEmptyDeadlineMessage = document.querySelector(
    ".todo-empty-message--deadline"
  );
  const todoEmptyDoneMessage = document.querySelector(
    ".todo-empty-message--done"
  );

  // 하단 입력 바 (이미 CSS/JS는 있는데, HTML에서 나중에 붙일 예정)
  const todoInputForm = document.querySelector(".todo-input-bar__form");
  const todoInput = document.querySelector(".todo-input");

  // 외부에서 불러오기 버튼들
  const importTodoFromCalendarBtn = document.querySelector(
    "[data-action='import-todo-from-calendar']"
  );
  const importTodoFromTimelineBtn = document.querySelector(
    "[data-action='import-todo-from-timeline']"
  );

  // 할 일 데이터
  let todos = [];
  let todoIdCounter = 1;


  function loadTodosFromStorage() {
    try {
      const raw = localStorage.getItem(TODO_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item) => {
        const todo = { ...item };
        if (typeof todo.done !== "boolean") {
          todo.done = false;
        }
        // 예전 데이터에는 type / dueDate / dueTime / colorIndex / memo가 없을 수 있음
        if (!todo.type) {
          todo.type = "nodue"; // 기존 순수 텍스트 투두는 기한 없는 할 일로 처리
        }
        if (typeof todo.dueDate === "undefined") {
          todo.dueDate = null;
        }
        if (typeof todo.dueTime === "undefined") {
          todo.dueTime = null;
        }
        if (typeof todo.colorIndex !== "number") {
          todo.colorIndex = 0;
        }
        if (typeof todo.memo !== "string") {
          todo.memo = "";
        }
        return todo;
      });
    } catch (e) {
      console.warn("⚠️ 투두 로딩 중 오류 (초기화):", e);
      return [];
    }
  }


  function saveTodosToStorage() {
    try {
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
    } catch (e) {
      console.warn("⚠️ 투두 저장 중 오류:", e);
    }
  }

  function getNextTodoId() {
    const currentMax = todos.reduce((max, t) => {
      if (typeof t.id === "string" && t.id.startsWith("todo-")) {
        const n = parseInt(t.id.replace("todo-", ""), 10);
        if (!isNaN(n) && n > max) return n;
      }
      return max;
    }, 0);
    todoIdCounter = Math.max(todoIdCounter, currentMax + 1);
    const id = `todo-${todoIdCounter++}`;
    return id;
  }

  function createTodoElement(todo) {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.dataset.todoId = todo.id;
    li.dataset.done = todo.done ? "true" : "false";
    if (todo.done) {
      li.classList.add("todo-item--done");
    }

    // 🔹 기한 있는 할 일은 색 배경/테두리 적용
    const colorIndex =
      typeof todo.colorIndex === "number" ? todo.colorIndex : 0;
    const bgColor =
      EVENT_COLOR_BG_PALETTE[colorIndex] || "rgba(0,0,0,0.03)";
    const borderColor =
      EVENT_COLOR_PALETTE[colorIndex] || "#eee";
 
    if (todo.type === "deadline" && !todo.done) {
      li.style.backgroundColor = bgColor;
      li.style.borderColor = borderColor;
    }

    const label = document.createElement("label");
    label.className = "todo-item__main";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo-item__checkbox";
    checkbox.checked = !!todo.done;
    checkbox.setAttribute("aria-label", todo.text);

    const titleSpan = document.createElement("span");
    titleSpan.className = "todo-item__title";
    titleSpan.textContent = todo.text;

    label.appendChild(checkbox);
    label.appendChild(titleSpan);

    const metaDiv = document.createElement("div");
    metaDiv.className = "todo-item__meta";

    if (todo.source) {
      const tagSpan = document.createElement("span");
      tagSpan.className = "todo-item__tag todo-item__tag--source";
      if (todo.source === "calendar") {
        tagSpan.textContent = "캘린더";
      } else if (todo.source === "timeline") {
        tagSpan.textContent = "타임테이블";
      } else {
        tagSpan.textContent = todo.source;
      }
      metaDiv.appendChild(tagSpan);
    } else {
      const spacer = document.createElement("span");
      spacer.style.flex = "1";
      metaDiv.appendChild(spacer);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "todo-item__delete-button";
    deleteButton.textContent = "삭제";
    deleteButton.setAttribute("aria-label", "할 일 삭제");
    metaDiv.appendChild(deleteButton);

    li.appendChild(label);
    li.appendChild(metaDiv);

    checkbox.addEventListener("change", () => {
      const done = checkbox.checked;
      todo.done = done;
      saveTodosToStorage();
      renderTodoLists();
    });

    deleteButton.addEventListener("click", () => {
      todos = todos.filter((t) => t.id !== todo.id);
      saveTodosToStorage();
      renderTodoLists();
    });

    return li;
  }

  // 기한 있는 할 일을 dueDate / dueTime 기준으로 정렬하는 헬퍼
  function compareDeadlineTodo(a, b) {
    // 둘 다 날짜 없으면 순서 유지
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;

    if (a.dueDate === b.dueDate) {
      // 같은 날이면 시간 있는 것 우선
      if (!a.dueTime && !b.dueTime) return 0;
      if (!a.dueTime) return 1;
      if (!b.dueTime) return -1;
      return a.dueTime.localeCompare(b.dueTime);
    }

    return a.dueDate.localeCompare(b.dueDate);
  }
  /* ============================================================
    하루 탭: 기한 있는 할 일 렌더링
  ============================================================ */

  function renderTasksForDate(dateYMD) {
    const listEl = document.querySelector(".day-task-list");
    const emptyEl = document.querySelector(".day-task-empty");
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = "";

    // 🔹 오늘 날짜의 기한 있는 할 일 필터링
    const todaysTasks = todos.filter(
      (t) =>
        t.type === "deadline" &&
        t.dueDate === dateYMD &&
        !t.done
    );

    if (todaysTasks.length === 0) {
      emptyEl.style.display = "";
      return;
    }

    emptyEl.style.display = "none";

    todaysTasks.forEach((todo) => {
      const li = document.createElement("li");
      li.className = "day-task-item";
      li.dataset.todoId = todo.id;

      const colorIndex =
        typeof todo.colorIndex === "number" ? todo.colorIndex : 0;

      const barColor =
        EVENT_COLOR_PALETTE[colorIndex] || EVENT_COLOR_PALETTE[0];
      const bgColor =
        EVENT_COLOR_BG_PALETTE[colorIndex] || "rgba(0,0,0,0.05)";

      // 🔹 배경 반투명
      li.style.backgroundColor = bgColor;

      // 왼쪽 색 막대
      const bar = document.createElement("div");
      bar.className = "day-task-item__colorbar";
      bar.style.backgroundColor = barColor;

      // 내용
      const content = document.createElement("div");
      content.className = "day-task-item__content";

      const titleEl = document.createElement("div");
      titleEl.className = "day-task-item__title";
      titleEl.textContent = todo.text;

      const metaEl = document.createElement("div");
      metaEl.className = "day-task-item__meta";
      metaEl.textContent = todo.dueTime
        ? `⏰ ${todo.dueTime}`
        : "종일";

      content.appendChild(titleEl);
      content.appendChild(metaEl);

      li.appendChild(bar);
      li.appendChild(content);

      // 🔹 클릭 시 수정 바텀시트 열기
      li.addEventListener("click", () => {
        openBottomSheet("edit-task", {
          taskId: todo.id,
          date: todo.dueDate,
          start: todo.dueTime || "",
          title: todo.text,
          memo: todo.memo || "",
          colorIndex,
        });
      });

      listEl.appendChild(li);
    });
  }

  function renderTodoLists() {
    if (
      !todoNodueListElement &&
      !todoDeadlineListElement &&
      !todoDoneListElement
    ) {
      return;
    }

    // 리스트 초기화
    if (todoNodueListElement) todoNodueListElement.innerHTML = "";
    if (todoDeadlineListElement) todoDeadlineListElement.innerHTML = "";
    if (todoDoneListElement) todoDoneListElement.innerHTML = "";

    // 상태별 분리
    const pending = todos.filter((t) => !t.done);
    const done = todos.filter((t) => t.done);

    const nodue = pending.filter(
      (t) => t.type === "nodue" || !t.type // type 없으면 기한 없는 할 일로 취급
    );
    const deadline = pending.filter((t) => t.type === "deadline");

    // 기한 있는 할 일을 마감 순으로 정렬
    deadline.sort(compareDeadlineTodo);

    // 기한 없는 할 일 렌더
    if (todoNodueListElement) {
      nodue.forEach((todo) => {
        const el = createTodoElement(todo);
        todoNodueListElement.appendChild(el);
      });
    }

    // 기한 있는 할 일 렌더
    if (todoDeadlineListElement) {
      deadline.forEach((todo) => {
        const el = createTodoElement(todo);
        todoDeadlineListElement.appendChild(el);
      });
    }

    // 완료된 할 일 렌더
    if (todoDoneListElement) {
      done.forEach((todo) => {
        const el = createTodoElement(todo);
        todoDoneListElement.appendChild(el);
      });
    }

    // 섹션별 빈 상태 메시지 업데이트
    if (todoEmptyNodueMessage) {
      todoEmptyNodueMessage.hidden = nodue.length > 0;
    }
    if (todoEmptyDeadlineMessage) {
      todoEmptyDeadlineMessage.hidden = deadline.length > 0;
    }
    if (todoEmptyDoneMessage) {
      todoEmptyDoneMessage.hidden = done.length > 0;
    }
  }

  function initTodos() {
    // 리스트 하나라도 없으면 그냥 초기화 스킵
    if (
      !todoNodueListElement &&
      !todoDeadlineListElement &&
      !todoDoneListElement
    ) {
      return;
    }

    todos = loadTodosFromStorage();
    getNextTodoId();
    renderTodoLists();

    // 🔹 새로고침 직후에도 달력/하루 탭에 할 일이 바로 반영되도록 한 번 더 갱신
    renderCalendar();                                  // 날짜 아래 점들 (할 일 포함)
    renderEventListForDate(currentSelectedDate);       // 달력 탭 오른쪽 "일정/할 일" 리스트
    if (currentTimelineDate) {
      renderDayRightList(currentTimelineDate);         // 하루 탭 오른쪽 타임블록+할 일 리스트
      renderTasksForDate(currentTimelineDate);         // 하루 탭 아래쪽 "오늘의 할 일" 리스트
    }

    // 하단 입력 바에서 "기한 없는 할 일" 추가 (nodue)
    if (todoInputForm && todoInput) {
      todoInputForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = todoInput.value.trim();
        if (!text) return;

        const newTodo = {
          id: getNextTodoId(),
          text,
          done: false,
          source: null,
          type: "nodue",   // 🔹 기본은 기한 없는 할 일
          dueDate: null,
          dueTime: null,
          colorIndex: 0,
          memo: "",
        };

        todos.push(newTodo);
        saveTodosToStorage();
        renderTodoLists();

        todoInput.value = "";
        todoInput.focus();
      });
    }

    // TODO: 나중에 "달력에서 불러오기"를 진짜 일정 → deadline task 로 연결할 예정
    if (importTodoFromCalendarBtn) {
      importTodoFromCalendarBtn.addEventListener("click", () => {
        const t = {
          id: getNextTodoId(),
          text: "캘린더에서 가져온 일정",
          done: false,
          source: "calendar",
          type: "nodue", // 일단은 기한 없는 할 일로 취급
        };
        todos.push(t);
        saveTodosToStorage();
        renderTodoLists();
      });
    }

    if (importTodoFromTimelineBtn) {
      importTodoFromTimelineBtn.addEventListener("click", () => {
        const t = {
          id: getNextTodoId(),
          text: "타임테이블에서 가져온 블록",
          done: false,
          source: "timeline",
          type: "nodue", // 일단은 기한 없는 할 일로 취급
        };
        todos.push(t);
        saveTodosToStorage();
        renderTodoLists();
      });
    }
  }


  /* ============================================================
     상단 "오늘" 버튼 – 오늘 날짜로 이동 + 선택
  ============================================================ */
  const todayButton = document.querySelector(".btn-today");
  if (todayButton) {
    todayButton.addEventListener("click", () => {
      showScreen("calendar");
      setSelectedDate(TODAY);
    });
  }

  /* ============================================================
     초기화 호출
  ============================================================ */
  initEvents();
  initTimeBlocks();
  initTodos();
});
