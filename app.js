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
    // 🔹 타이틀
    if (isNewEvent) {
      sheetTitleEl.textContent = "새 일정 추가";
    } else if (isEditEvent) {
      sheetTitleEl.textContent = "일정 수정";
    } else if (isTimeblock) {
      sheetTitleEl.textContent = "새 타임블록 추가";
    } else if (isEditTimeblock) {
      sheetTitleEl.textContent = "타임블록 수정";
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

    // 🔹 삭제 버튼은 "일정 편집"일 때만 노출
    if (sheetDeleteBtn) {
      sheetDeleteBtn.style.display =
        isEditEvent || isEditTimeblock ? "" : "none";
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
      if (mode !== "edit-event") {
        // 편집 모드가 아니면 삭제 버튼은 안 씀
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

    if (dayDetailDateLabel) {
      dayDetailDateLabel.textContent = formatDateLabel(dateYMD);
    }

    if (todaysEvents.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.textContent = "등록된 일정이 없어요.";
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
    const dayEvents = events.filter((ev) => ev.date === cellDate);
    if (dayEvents.length === 0) return;

    const uniqueColorIndices = [];
    dayEvents.forEach((ev) => {
      const idx =
        typeof ev.colorIndex === "number" ? ev.colorIndex : 0;
      if (!uniqueColorIndices.includes(idx)) {
        uniqueColorIndices.push(idx);
      }
    });

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

  function appendEventDotsToDayButton(btn, cellDate) {
    // cellDate 날짜의 이벤트들
    const dayEvents = events.filter((ev) => ev.date === cellDate);
    if (dayEvents.length === 0) return;

    // 색상 인덱스 중복 제거
    const uniqueColorIndices = [];
    dayEvents.forEach((ev) => {
      const idx =
        typeof ev.colorIndex === "number" ? ev.colorIndex : 0;
      if (!uniqueColorIndices.includes(idx)) {
        uniqueColorIndices.push(idx);
      }
    });

    if (uniqueColorIndices.length === 0) return;

    // 점 컨테이너 생성
    const dotsContainer = document.createElement("span");
    dotsContainer.className = "calendar-day__dots";

    // 최대 3개까지만 표시
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

      appendEventDotsToDayButton(btn, cellDate);

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

  let timeBlocks = [];
  let currentTimelineDate = TODAY;
  let timeBlockIdCounter = 1;

  // 하루 범위: 05:00 ~ 다음날 04:59
  const DAY_START_HOUR = 5;
  const DAY_TOTAL_HOURS = 24;
  const SLOT_MINUTES = 5;         // 5분
  const SLOTS_PER_HOUR = 60 / SLOT_MINUTES; // 12

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
    renderTimelineForDate(ymd);
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
        blockEl.style.gridRow = "1 / 2"; // 혹시 없으면 1줄 고정
        
        const colorIndex = getBlockColorIndex(block);
        const borderColor =
          EVENT_COLOR_PALETTE[colorIndex] || EVENT_COLOR_PALETTE[0];
        const bgColor =
          EVENT_COLOR_BG_PALETTE[colorIndex] || "rgba(0,0,0,0.05)";

        // 🔹 테두리 = 일정 색
        blockEl.style.borderLeft = `2px solid ${baseColor}`;
        blockEl.style.borderRight = `2px solid ${baseColor}`;

        // 🔹 배경 = 옅은 색 (투명도)
        blockEl.style.backgroundColor = bgColor; // 🔹 배경만 옅게
        // blockEl.style.opacity = "0.25";      // ❌ 이건 이제 없음

        // 🔹 글자색 = 진하게 (회색 상속 방지)
        blockEl.style.color = "#111827";

        rowGrid.appendChild(blockEl);
      }
    });

    renderTimeblockList(todaysBlocks);
  }

  // 오른쪽: 블록 목록
  function renderTimeblockList(blocksForDate) {
    if (!timeblockListEl) return;
    timeblockListEl.innerHTML = "";

    if (blocksForDate.length === 0) {
      const li = document.createElement("li");
      li.className = "timeblock-list__item";
      li.textContent = "등록된 블록이 없어요.";
      li.style.fontSize = "11px";
      li.style.color = "#6b7280";
      timeblockListEl.appendChild(li);
      return;
    }

    blocksForDate.forEach((block) => {
      const li = document.createElement("li");
      li.className = "timeblock-list__item";
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
      timeEl.className = "timeblock-list__time";
      timeEl.textContent = `${block.start} ~ ${block.end}`;

      content.appendChild(titleEl);
      content.appendChild(timeEl);

      li.appendChild(colorBar);
      li.appendChild(content);

      timeblockListEl.appendChild(li);
    });
  }

  function initTimeBlocks() {
    timeBlocks = loadTimeBlocksFromStorage();
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
        const target = document.querySelector(".day-screen-left");
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

      const mode = sheetModeInput.value;
      const title = sheetTitleInput.value.trim();
      const date = sheetDateInput.value || TODAY;

      const rawStart = sheetStartInput.value;
      const rawEnd = sheetEndInput.value;

      // 🔹 5분 단위로 강제 스냅
      const start = snapTimeTo5Minutes(rawStart);
      const end = snapTimeTo5Minutes(rawEnd);

      // 인풋에도 반영
      sheetStartInput.value = start;
      sheetEndInput.value = end;

      const memo = sheetMemoInput ? sheetMemoInput.value.trim() : "";

      // start >= end인 경우 방어
      if (start >= end) {
        alert("시작 시간이 종료 시간보다 같거나 늦을 수는 없어요.");
        return;
      }

      if (!title || !date || !start || !end) {
        alert("모든 값을 입력해주세요.");
        return;
      }

      // 공통: 색상 인덱스
      let colorIndex = 0;
      if (sheetColorIndexInput) {
        const raw = parseInt(sheetColorIndexInput.value || "0", 10);
        if (
          !isNaN(raw) &&
          raw >= 0 &&
          raw < EVENT_COLOR_PALETTE.length
        ) {
          colorIndex = raw;
        }
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
        const targetId = sheetEventIdInput
          ? sheetEventIdInput.value
          : "";

        const ev = events.find((item) => item.id === targetId);
        if (!ev) {
          alert("수정할 일정을 찾을 수 없어요. 다시 시도해 주세요.");
          closeBottomSheet();
          return;
        }

        ev.title = title;
        ev.date = date;
        ev.startTime = start;
        ev.endTime = end;
        ev.colorIndex = colorIndex;
        ev.memo = memo;

        saveEventsToStorage();
        setSelectedDate(date);
        alert("일정이 수정되었습니다.");
      } else if (mode === "timeblock") {
        // 시간 겹침 검사
        if (hasOverlapTimeBlock(date, start, end)) {
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
          colorIndex, // 🔹 바텀시트에서 고른 색
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

        // 겹침 방어 (자기 자신 제외)
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
        setTimelineDate(date);
        alert("타임블록이 수정되었습니다.");
      }
      
      closeBottomSheet();
    });
  }

  /* ============================================================
     Todo 모듈
  ============================================================ */
  const TODO_STORAGE_KEY = "nemomemo_todos_v1";

  const todoListElement = document.querySelector(".todo-list");
  const todoEmptyMessage = document.querySelector(".todo-empty-message");
  const todoInputForm = document.querySelector(".todo-input-bar__form");
  const todoInput = document.querySelector(".todo-input");
  const importTodoFromCalendarBtn = document.querySelector(
    "[data-action='import-todo-from-calendar']"
  );
  const importTodoFromTimelineBtn = document.querySelector(
    "[data-action='import-todo-from-timeline']"
  );

  let todos = [];
  let todoIdCounter = 1;

  function loadTodosFromStorage() {
    try {
      const raw = localStorage.getItem(TODO_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
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

  function updateTodoEmptyState() {
    if (!todoEmptyMessage || !todoListElement) return;
    const hasItems = todos.length > 0;
    todoEmptyMessage.hidden = hasItems;
  }

  function createTodoElement(todo) {
    const li = document.createElement("li");
    li.className = "todo-item";
    li.dataset.todoId = todo.id;
    li.dataset.done = todo.done ? "true" : "false";
    if (todo.done) {
      li.classList.add("todo-item--done");
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
      li.dataset.done = done ? "true" : "false";
      if (done) {
        li.classList.add("todo-item--done");
      } else {
        li.classList.remove("todo-item--done");
      }
      saveTodosToStorage();
    });

    deleteButton.addEventListener("click", () => {
      todos = todos.filter((t) => t.id !== todo.id);
      li.remove();
      saveTodosToStorage();
      updateTodoEmptyState();
    });

    return li;
  }

  function renderTodoList() {
    if (!todoListElement) return;
    todoListElement.innerHTML = "";
    todos.forEach((todo) => {
      const el = createTodoElement(todo);
      todoListElement.appendChild(el);
    });
    updateTodoEmptyState();
  }

  function initTodos() {
    if (!todoListElement) return;
    todos = loadTodosFromStorage();
    getNextTodoId();
    if (todos.length > 0) {
      renderTodoList();
    } else {
      todoListElement.innerHTML = "";
      updateTodoEmptyState();
    }

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
        };
        todos.push(newTodo);
        saveTodosToStorage();

        const el = createTodoElement(newTodo);
        todoListElement.appendChild(el);
        todoInput.value = "";
        todoInput.focus();
        updateTodoEmptyState();
      });
    }

    if (importTodoFromCalendarBtn) {
      importTodoFromCalendarBtn.addEventListener("click", () => {
        const t = {
          id: getNextTodoId(),
          text: "캘린더에서 가져온 일정",
          done: false,
          source: "calendar",
        };
        todos.push(t);
        saveTodosToStorage();
        const el = createTodoElement(t);
        todoListElement.appendChild(el);
        updateTodoEmptyState();
      });
    }

    if (importTodoFromTimelineBtn) {
      importTodoFromTimelineBtn.addEventListener("click", () => {
        const t = {
          id: getNextTodoId(),
          text: "타임테이블에서 가져온 블록",
          done: false,
          source: "timeline",
        };
        todos.push(t);
        saveTodosToStorage();
        const el = createTodoElement(t);
        todoListElement.appendChild(el);
        updateTodoEmptyState();
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
